import type { Db } from '../db/supabase.js';
import { checkMexcAffiliateUid } from '../services/affiliates/mexc.js';
import { checkBybitAffiliateUid } from '../services/affiliates/bybit.js';
import { childLogger } from '../lib/logger.js';

// B-11 / B-12 — 매시간 pending 인증 건을 거래소 API 로 재조회.
// 1. 거래소가 MEXC / Bybit 이면 자동 매칭 시도.
// 2. 매칭되면 status='approved' + users.is_verified=true 로 업데이트.
// 3. 관리자 알림은 /api/admin/metrics 폴링으로 충분 (MVP).

const log = childLogger('affiliate-reconcile');

const INTERVAL_MS = 60 * 60 * 1000; // 1시간

export class AffiliateReconcileCron {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly db: Db) {}

  start(): void {
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, INTERVAL_MS);
    log.info({ intervalMs: INTERVAL_MS }, 'affiliate reconcile started');
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    try {
      const { data: pending, error } = await this.db
        .from('exchange_verifications')
        .select('id, user_id, exchange_id, uid')
        .eq('status', 'pending')
        .in('exchange_id', ['mexc', 'bybit'])
        .limit(200);
      if (error) {
        log.error({ err: error.message }, 'fetch pending failed');
        return;
      }
      if (!pending || pending.length === 0) return;

      let approved = 0;
      for (const row of pending) {
        const check =
          row.exchange_id === 'mexc'
            ? await checkMexcAffiliateUid(row.uid)
            : await checkBybitAffiliateUid(row.uid);
        if (!check.ok || !check.isAffiliate) continue;

        const { error: updErr } = await this.db
          .from('exchange_verifications')
          .update({ status: 'approved' })
          .eq('id', row.id);
        if (updErr) {
          log.warn({ err: updErr.message, id: row.id }, 'update failed');
          continue;
        }

        await this.db.from('users').update({ is_verified: true }).eq('id', row.user_id);
        await this.db.from('admin_actions').insert({
          actor_label: 'affiliate-reconcile-cron',
          action_type: 'verify_approve',
          target_user_id: row.user_id,
          payload: { exchange_id: row.exchange_id, uid: row.uid, source: 'auto' },
          note: 'auto-approved by affiliate reconcile',
        });
        approved += 1;
      }

      if (approved > 0) {
        log.info({ approved, total: pending.length }, 'affiliate reconcile cycle done');
      }
    } catch (err) {
      log.error({ err }, 'affiliate reconcile tick failed');
    }
  }
}
