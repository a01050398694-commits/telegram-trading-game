# DB Backup & Restore — Operations Runbook

Stage 15.5+. Audience: solo founder (no DBA). Time-to-restore target: < 30 minutes from "data is gone" to "users can trade again."

---

## What we have

- **Workflow**: `.github/workflows/db-backup.yml` (committed at `a309819` / updated `d7090c8`)
- **Schedule**: cron `0 16 * * *` UTC = **01:00 KST every day**
- **Method**: `docker run postgres:17 pg_dump --clean --if-exists --no-owner --no-privileges`
- **Output**: `backup-YYYYMMDD-HHMM.sql.gz`
- **Retention**: 30 days (GitHub Artifacts)
- **Secret**: `SUPABASE_DB_URL` lives in repo Secrets only (never in source)

GitHub artifacts URL pattern: `https://github.com/<owner>/<repo>/actions/runs/<RUN_ID>/artifacts`

---

## Verifying a backup is healthy (no restore drill needed)

Once a quarter, **download** an artifact and **gunzip** it locally. Confirm:

```bash
gunzip -t backup-YYYYMMDD-HHMM.sql.gz   # no output = valid gzip
zcat backup-YYYYMMDD-HHMM.sql.gz | head -30
# Look for `--` PostgreSQL dump headers and the first CREATE / DROP statements
zcat backup-YYYYMMDD-HHMM.sql.gz | wc -l
# Should be in the thousands of lines for a non-empty DB
```

If the file is < 1 KB or the headers are missing, **the backup pipeline is broken** — investigate the workflow run logs immediately.

---

## Full restore procedure (production data lost / corrupted)

### Pre-flight
1. **STOP the bot first** — Render Dashboard → telegram-trading-bot → Suspend. Otherwise live writes happen during restore and you double-credit.
2. **Identify the target backup** — pick the most recent artifact BEFORE the corruption. GitHub Actions tab → DB Backup → list runs → click the run → Artifacts.
3. **Make sure you have the production `DATABASE_URL`** — Supabase Dashboard → Project Settings → Database → Connection String → URI (transaction). Save to `RESTORE_URL` env var locally for these steps.

### Step 1 — Download + verify
```bash
# Download via gh CLI
gh run download <RUN_ID> -n db-backup-<RUN_ID> -D /tmp/restore
cd /tmp/restore
gunzip -k backup-*.sql.gz   # keeps the .gz, produces .sql

# Sanity check
head -20 backup-*.sql
wc -l backup-*.sql
```

### Step 2 — Restore
The dump uses `--clean --if-exists`, so it drops + recreates tables in the right order. It is safe to run against the live (now-suspended) DB:

```bash
export RESTORE_URL='postgresql://postgres:<password>@<host>:5432/postgres'
docker run --rm -e PGURL="$RESTORE_URL" -v /tmp/restore:/dump postgres:17 \
  sh -c 'psql "$PGURL" -v ON_ERROR_STOP=1 -f /dump/backup-YYYYMMDD-HHMM.sql'
```

`ON_ERROR_STOP=1` is critical — without it psql swallows errors and you end up with a half-restored DB.

### Step 3 — Verify row counts
```bash
docker run --rm -e PGURL="$RESTORE_URL" postgres:17 \
  psql "$PGURL" -c "
    SELECT 'users'  AS t, count(*) FROM users
    UNION ALL SELECT 'wallets', count(*) FROM wallets
    UNION ALL SELECT 'positions', count(*) FROM positions
    UNION ALL SELECT 'payment_events', count(*) FROM payment_events
    UNION ALL SELECT 'verifications', count(*) FROM verifications;"
```

Compare against pre-incident counts (Supabase Studio → Table editor → row counter). They must match the backup time, not zero.

### Step 4 — Re-enable bot
1. Render Dashboard → telegram-trading-bot → Resume
2. Watch logs for `[bot] @Tradergames_bot polling started`
3. `/health` endpoint must return `{ok:true}`
4. Run one /start in Telegram → confirm UserStatus loads

### Step 5 — Post-incident
- Note the data lost between the backup time and the incident in `GOTCHAS.md`
- Run a manual GitHub Actions backup right away to lock in the restored state: Actions → DB Backup → Run workflow

---

## What this does NOT cover (out of scope for this runbook)

- **Point-in-time recovery to a granular minute** — that needs Supabase Pro PITR ($25/mo). Today we have daily snapshots at 01:00 KST; worst-case data loss window is 24 hours.
- **Automated restore tests on a Supabase branch** — would catch silent regressions in the dump. Defer until traffic ≥ 100 DAU.
- **Cross-region replication** — single region (ap-northeast-2) sufficient for current scale.

---

## Triggers for an emergency manual backup

Run **Actions → DB Backup → Run workflow** before any of:
- Schema migration that touches user-data tables (positions, wallets, payment_events)
- Bulk admin operation (broadcast, manual premium grant, balance edit)
- Any PR labelled `risky` going to main

The workflow finishes in ~2 minutes and produces a fresh artifact you can roll back to.
