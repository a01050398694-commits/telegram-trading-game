# 🗄️ Supabase 프로덕션 프로젝트 생성 + 스키마 적용 (I-05 / D-05 / D-07)

> 대상: Supabase 대시보드에서 `trading-academy-prod` 라는 **새 프로젝트**를 직접 생성한 뒤, 본 문서의 SQL 을 순서대로 붙여넣어 실행.
> 마지막 검증: 2026-04-23

---

## 1. 프로젝트 생성

1. https://supabase.com/dashboard 접속
2. **New project** 클릭
3. 입력:
   - Name: `trading-academy-prod`
   - Database Password: **강력한 랜덤 생성** → 1Password/브라우저 비밀번호관리자에 저장
   - Region: `ap-northeast-2 (Seoul)` **또는** `ap-southeast-1 (Singapore)` (봇 Render 위치와 가까운 쪽)
   - Pricing Plan: **Free** 로 시작 → 트래픽 늘면 Pro $25/월 전환
4. Create → 약 2분 대기
5. 생성 완료 후 **Settings → API** 에서 복사:
   - Project URL → `SUPABASE_URL`
   - `anon` `public` → `SUPABASE_ANON_KEY`
   - `service_role` `secret` → `SUPABASE_SERVICE_ROLE_KEY`

---

## 2. 스키마 적용 순서

Supabase Dashboard → **SQL Editor → New query** 에서 아래 파일 내용을 **순서대로** 붙여넣어 실행.

### Step A — 기본 스키마
파일: `schema.sql` (프로젝트 루트)
- `users`, `positions`, `trades`, `premium_subscriptions` 등 핵심 테이블 + RLS

### Step B — 랭킹 / 스냅샷 (D-01, D-02)
파일: `supabase/migrations/*_daily_rankings.sql` 순서대로 전부
- `daily_rankings`, `ranking_snapshots`

### Step C — 리퍼럴 미션 / 어드민 감사 (D-03, D-04)
파일: `supabase/migrations/*_referral_missions.sql`, `*_admin_actions.sql`

> 실제 파일명은 `supabase/migrations/` 폴더의 timestamp 순서대로. ls 로 확인 후 전부 실행.

### 실행 전 체크
- **각 Query 가 "Success. No rows returned" 이면 OK.**
- 에러 나면 **이전 Step 을 먼저 실행했는지** 확인 (테이블 의존 관계).
- 이미 존재하는 테이블이 있다는 에러 → 그 테이블만 `DROP TABLE IF EXISTS X CASCADE;` 로 삭제 후 재실행.

---

## 3. pg_cron 확장 + 스케줄 등록 (D-05)

Supabase 는 pg_cron 이 기본 비활성화. Database → Extensions 에서 **pg_cron** 검색 후 Enable.

그 다음 SQL Editor 에서:

```sql
-- 매분: 랭킹 집계 (B-01)
select cron.schedule(
  'trading-rankings-tick',
  '* * * * *',
  $$ select net.http_post(
       url:='https://telegram-trading-bot-XXXX.onrender.com/cron/rankings',
       headers:=jsonb_build_object('x-admin-secret', 'YOUR_ADMIN_SECRET')
     ); $$
);

-- 매일 00:00 KST (15:00 UTC): 랭킹 롤오버 (B-02)
select cron.schedule(
  'trading-rankings-rollover',
  '0 15 * * *',
  $$ select net.http_post(
       url:='https://telegram-trading-bot-XXXX.onrender.com/cron/rollover',
       headers:=jsonb_build_object('x-admin-secret', 'YOUR_ADMIN_SECRET')
     ); $$
);

-- 매일 09:00 KST (00:00 UTC): 리텐션 DM (B-09)
select cron.schedule(
  'trading-retention-dm',
  '0 0 * * *',
  $$ select net.http_post(
       url:='https://telegram-trading-bot-XXXX.onrender.com/cron/retention-dm',
       headers:=jsonb_build_object('x-admin-secret', 'YOUR_ADMIN_SECRET')
     ); $$
);
```

> ✏️ `XXXX` 와 `YOUR_ADMIN_SECRET` 은 Render 발급 후 실제 값으로 치환.
> pg_cron 이 아닌 **봇 내부 node-cron** 을 쓸 수도 있으나, Render 무료 플랜 슬립 때문에 **Supabase pg_cron 이 더 안전**.

### 스케줄 확인
```sql
select * from cron.job;
select * from cron.job_run_details order by start_time desc limit 20;
```

---

## 4. 자동 백업 / PITR (D-07)

- **Free 플랜**: 매일 자동 스냅샷 (7일 보관). 추가 설정 불필요.
- **Pro 플랜 ($25/월)**: Point-in-Time Recovery 활성화
  - Dashboard → **Database → Backups** → **Enable PITR**
  - 복구 가능 범위: 최대 7일 (Pro), 28일 (Team)

> 소프트 런칭은 Free 로 시작 → 유료 구독자 10명 이상 확보 시 Pro 전환 권장.

---

## 5. Row Level Security 검증

모든 테이블에 **RLS 가 활성화** 되어 있어야 함. 확인:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

`rowsecurity = true` 가 아닌 테이블은 정책 누락. `schema.sql` 재확인.

---

## 6. 환경변수 백필

Supabase 에서 복사한 3개 값을 **Render 대시보드 Environment** 에 입력:

| Supabase 값 | Render Env Key |
|---|---|
| Project URL | `SUPABASE_URL` |
| anon public | `SUPABASE_ANON_KEY` |
| service_role secret | `SUPABASE_SERVICE_ROLE_KEY` |

---

## 7. 스모크 테스트

스키마 적용 후 로컬에서:
```bash
# 1. .env 에 위 3개 값 임시 복붙
# 2. ADMIN_SECRET 도 아무거나 임시값
npm run dev:bot
# 다른 터미널
curl http://localhost:3000/api/rankings/today
```

**빈 배열 `[]` 이 나오면 성공** (데이터는 없지만 테이블 존재 확인). 에러 나면 `schema.sql` 재실행.

---

## 8. 초기 시드 데이터 (선택)

런칭 직후 "리더보드가 텅 비어 있어요" 라는 UX 문제를 피하려면, 대표님 본인 + 지인 5~10명을
사전 가입시켜 랭킹을 채우는 걸 권장. (봇에 /start 만 누르면 됨)

---

## 체크리스트 (완료 시 I-05 / D-05 / D-07 체크)

- [ ] `trading-academy-prod` 프로젝트 생성 완료
- [ ] DB 비밀번호 안전하게 저장
- [ ] SUPABASE_URL / ANON / SERVICE_ROLE 3개 값 복사 완료
- [ ] `schema.sql` 실행 성공
- [ ] `supabase/migrations/*.sql` 전부 실행 성공
- [ ] pg_cron 확장 Enable
- [ ] 3개 cron 등록 (rankings / rollover / retention)
- [ ] `cron.job` 에서 3개 잡 확인
- [ ] 모든 테이블 RLS = true 확인
- [ ] Render Env 에 3개 키 입력
- [ ] `/api/rankings/today` 스모크 테스트 통과
