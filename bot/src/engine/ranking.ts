import { SupabaseClient } from '@supabase/supabase-js';
import { PriceCache } from '../priceCache.js';

export type RankingEntry = {
  rank: number;
  telegramUserId: number;
  username: string;
  equity: number;
  dailyPnl: number;
  dailyPnlPercent: number;
};

export class RankingEngine {
  private cache: RankingEntry[] = [];
  private updateTimer: NodeJS.Timeout | null = null;
  private lastRolloverDateStr: string | null = null;

  constructor(
    private readonly db: SupabaseClient,
    private readonly priceCache: PriceCache,
  ) {}

  start() {
    this.updateRankings(); // initial
    this.updateTimer = setInterval(() => this.updateRankings(), 60_000); // 매분 업데이트
  }

  stop() {
    if (this.updateTimer) clearInterval(this.updateTimer);
  }

  getTop100(): RankingEntry[] {
    return this.cache;
  }

  private async updateRankings() {
    try {
      // 1. 자정(KST) 기준점 계산
      const now = new Date();
      // KST는 UTC+9
      const kstOffset = 9 * 60 * 60 * 1000;
      const kstDate = new Date(now.getTime() + kstOffset);
      kstDate.setUTCHours(0, 0, 0, 0); // KST 자정
      const startOfDayUTC = new Date(kstDate.getTime() - kstOffset);
      const currentDateStr = kstDate.toISOString().split('T')[0]!;

      // 롤오버 체크 (최초 실행시는 현재 날짜로 초기화만 하고, 날짜가 바뀌었으면 롤오버 실행)
      if (this.lastRolloverDateStr !== null && this.lastRolloverDateStr !== currentDateStr) {
        await this.rolloverMidnight(this.lastRolloverDateStr);
      }
      this.lastRolloverDateStr = currentDateStr;

      // 2. 데이터 페치
      // 전체 지갑 및 유저 정보
      const { data: users, error: userErr } = await this.db
        .from('users')
        .select('id, telegram_id, username, first_name, wallets(balance)');
        
      if (userErr || !users) throw new Error('Failed to fetch users');

      // 오늘 청산/종료된 포지션들의 실현 손익
      const { data: closedPositions, error: closedErr } = await this.db
        .from('positions')
        .select('user_id, pnl')
        .gte('closed_at', startOfDayUTC.toISOString())
        .neq('status', 'open');

      // 현재 열려있는 포지션들 (미실현 손익 계산용)
      const { data: openPositions, error: openErr } = await this.db
        .from('positions')
        .select('user_id, symbol, side, size, entry_price')
        .eq('status', 'open');

      if (closedErr || openErr) throw new Error('Failed to fetch positions');

      // 3. 유저별 집계
      const userStats = new Map<string, { balance: number; realizedPnl: number; unrealizedPnl: number }>();
      
      for (const u of users) {
        const balance = (u.wallets as unknown as { balance: number }[])?.[0]?.balance ?? 0;
        userStats.set(u.id, { balance, realizedPnl: 0, unrealizedPnl: 0 });
      }

      for (const p of closedPositions || []) {
        const stat = userStats.get(p.user_id);
        if (stat) stat.realizedPnl += p.pnl;
      }

      for (const p of openPositions || []) {
        const stat = userStats.get(p.user_id);
        if (!stat) continue;
        
        const currentPrice = this.priceCache.get(p.symbol);
        if (!currentPrice) continue;

        const entryPrice = Number(p.entry_price);
        let upnl = 0;
        if (p.side === 'long') {
          upnl = (currentPrice - entryPrice) * p.size;
        } else {
          upnl = (entryPrice - currentPrice) * p.size;
        }
        stat.unrealizedPnl += upnl;
      }

      // 4. 랭킹 산정
      const rankings: RankingEntry[] = [];
      
      for (const u of users) {
        const stat = userStats.get(u.id);
        if (!stat) continue;
        
        // 현재 Equity = Balance + Unrealized PNL
        const equity = stat.balance + stat.unrealizedPnl;
        
        // Daily PNL = Realized + Unrealized
        const dailyPnl = stat.realizedPnl + stat.unrealizedPnl;
        
        // 시작 자산 추정 = (현재 Equity) - (Daily PNL)
        // (단, 재충전 등 이벤트가 있으면 정확하지 않지만 MVP 스펙으론 충분)
        const startEquity = equity - dailyPnl;
        const dailyPnlPercent = startEquity > 0 ? (dailyPnl / startEquity) * 100 : 0;

        const displayName = u.username 
          ? `@${u.username}` 
          : (u.first_name || `User${u.telegram_id.toString().slice(-4)}`);

        rankings.push({
          rank: 0, // 나중에 정렬 후 할당
          telegramUserId: u.telegram_id,
          username: displayName,
          equity,
          dailyPnl,
          dailyPnlPercent,
        });
      }

      // 수익률(PnlPercent) 내림차순 정렬 (자본금이 다르므로 수익금보단 수익률이 공정)
      rankings.sort((a, b) => b.dailyPnlPercent - a.dailyPnlPercent);
      
      // 등수 할당 및 Top 100 컷오프
      const top100 = rankings.slice(0, 100).map((r, i) => ({ ...r, rank: i + 1 }));
      
      this.cache = top100;
      console.log(`[ranking] Updated top 100, cached at ${new Date().toISOString()}`);

    } catch (err) {
      console.error('[ranking] Update failed:', err);
    }
  }

  private async rolloverMidnight(dateStr: string) {
    console.log(`[ranking] Triggering midnight rollover for date: ${dateStr}`);
    try {
      if (this.cache.length === 0) return;

      // Map telegramUserId back to users table UUID
      const { data: users, error: userErr } = await this.db
        .from('users')
        .select('id, telegram_id')
        .in('telegram_id', this.cache.map(r => r.telegramUserId));
        
      if (userErr || !users) {
        console.error('[ranking] Rollover failed to fetch user ids', userErr);
        return;
      }

      const idMap = new Map<number, string>();
      for (const u of users) idMap.set(u.telegram_id, u.id);

      const inserts = this.cache.map(r => ({
        date: dateStr,
        rank: r.rank,
        user_id: idMap.get(r.telegramUserId)!,
        equity: r.equity,
        daily_pnl: r.dailyPnl,
        daily_pnl_pct: r.dailyPnlPercent,
      })).filter(r => r.user_id !== undefined);

      if (inserts.length === 0) return;

      const { error } = await this.db.from('ranking_snapshots').insert(inserts);
      if (error) {
        console.error('[ranking] Rollover insert failed:', error);
      } else {
        console.log(`[ranking] Successfully rolled over ${inserts.length} rankings to snapshot.`);
      }
    } catch (err) {
      console.error('[ranking] Rollover error:', err);
    }
  }
}
