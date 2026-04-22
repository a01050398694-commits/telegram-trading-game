import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMoney } from '../lib/format';

// Stage 7.5 Bugfix — VIP 탭 럭셔리 리디자인.
// 기획아이디어.md §12,13: "상위 10등만 밤 21:50~24:00 사이 10분 채팅".
// CTO 디렉션: Glassmorphism + gold glow + 👑 + "MEMBERS ONLY" exclusive club.

type LeaderboardRow = {
  rank: number;
  name: string;
  pnl: number;
  streak?: number; // 연승
  isYou?: boolean;
};

import { getTodayRankings, type RankingEntry, type UserStatus } from '../lib/api';

// 채팅 창 KST 체크 + 다음 오픈까지 남은 시간.
function chatWindowInfo(now: Date = new Date()): {
  open: boolean;
  secondsToNext: number;
  secondsToClose: number;
} {
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const kst = new Date(kstMs);
  const kstDayStart = Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth(),
    kst.getUTCDate(),
  );
  const openAt = kstDayStart + (21 * 60 + 50) * 60 * 1000;
  const closeAt = kstDayStart + 24 * 60 * 60 * 1000;

  const open = kstMs >= openAt && kstMs < closeAt;
  if (open) {
    return { open: true, secondsToNext: 0, secondsToClose: Math.floor((closeAt - kstMs) / 1000) };
  }
  // 지금이 openAt 이전이면 오늘 openAt 까지, 아니면 내일 openAt 까지.
  const nextOpen = kstMs < openAt ? openAt : openAt + 24 * 60 * 60 * 1000;
  return { open: false, secondsToNext: Math.floor((nextOpen - kstMs) / 1000), secondsToClose: 0 };
}

function formatHMS(sec: number): string {
  if (sec <= 0) return '00:00:00';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function medal(rank: number): string {
  if (rank === 1) return '👑';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return `${rank}`;
}

export function VIPTab({ status }: { status?: UserStatus | null }) {
  const { t } = useTranslation();
  const [info, setInfo] = useState(() => chatWindowInfo());
  const [rankings, setRankings] = useState<RankingEntry[]>([]);

  useEffect(() => {
    const id = window.setInterval(() => setInfo(chatWindowInfo()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    // 1분 주기로 랭킹 갱신
    const fetchRankings = async () => {
      try {
        const res = await getTodayRankings();
        setRankings(res.rankings);
      } catch (err) {
        console.error('Failed to fetch rankings', err);
      }
    };
    void fetchRankings();
    const interval = setInterval(fetchRankings, 60_000);
    return () => clearInterval(interval);
  }, []);

  const myId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
  const displayRows: LeaderboardRow[] = rankings.map(r => ({
    rank: r.rank,
    name: r.username,
    pnl: r.dailyPnl,
    // 원래 pnl 에는 수익금($)이 찍혔음. MOCK 데이터는 1_240_300 등.
    // 하지만 우리는 formatMoney를 쓰므로 r.dailyPnl 을 그대로 넘기고 UI를 약간 수정.
    isYou: r.telegramUserId === myId,
  }));

  // MOCK fallback if empty
  const finalRows = displayRows.length > 0 ? displayRows : [];
  const top1 = finalRows[0];
  const top2 = finalRows[1];
  const top3 = finalRows[2];
  const podiumList = [top2, top1, top3].filter(Boolean) as LeaderboardRow[];

  const isTop10 = myId ? rankings.slice(0, 10).some(r => r.telegramUserId === myId) : false;
  const canChat = info.open && (isTop10 || status?.isVIP);

  return (
    // Stage 8.4 — 하단 BottomNav 에 Top 10 리스트가 잘리는 문제. pb-40 로 충분한 여백 확보.
    <div className="relative flex h-full flex-col gap-3 overflow-y-auto pb-[150px]">
      {/* Ambient gold glow behind everything */}
      <div className="pointer-events-none fixed top-10 left-1/2 -z-10 h-[200px] w-[200px] -translate-x-1/2 rounded-full bg-amber-400/20 blur-[80px]" />

      {/* ── HERO TITLE + LUXURY DIVIDER ───────────────────
          Stage 8.9 — 뚱뚱한 캡슐 히어로 배너 완전 삭제.
          명품 시계 카탈로그에 쓰는 얇은 금선 디바이더로 대체.
          타이틀/서브타이틀은 순수 타이포그래피로 승부. */}
      <div className="pt-2 text-center">
        <div className="font-mono text-2xl font-bold tracking-tight text-white">
          {t('elite.heroTitle')}
        </div>
        {/* Stage 8.10 — break-keep 으로 한글 단어 중간 끊김 방지 + 수동 <br /> 로 "초대됩니다" 독립 라인. */}
        <div className="mt-2 break-keep text-[11px] leading-relaxed text-slate-400">
          {t('elite.heroSubtitleLine1')}
          <br />
          {t('elite.heroSubtitleLine2')}
        </div>
      </div>

      <div className="flex items-center gap-4 py-2">
        <div className="h-px flex-1 bg-gradient-to-r from-transparent to-yellow-500/50" />
        <span className="text-[10px] font-bold uppercase tracking-[0.4em] text-yellow-500">
          Top 10 Elite Analysts
        </span>
        <div className="h-px flex-1 bg-gradient-to-l from-transparent to-yellow-500/50" />
      </div>

      {/* ── MASSIVE DEDICATED COUNTDOWN TIMER ─────────────────
          Stage 8.14 — 타이머가 구석 carousel 카드 안에 묶여 있어 모바일에서 거의 안 보임.
          전용 카드로 분리해서 화면 중앙에 거대하게 박아 무시 불가능하게 만든다. */}
      <button
        type="button"
        onClick={() => {
          if (window.Telegram?.WebApp) {
            window.Telegram.WebApp.openTelegramLink?.('https://t.me/Trader_club');
          }
        }}
        className={`mt-4 w-full flex flex-col items-center justify-center rounded-2xl border py-6 transition-all cursor-pointer ${
          canChat
            ? 'border-emerald-400/40 bg-emerald-500/10 shadow-[0_0_30px_rgba(16,185,129,0.2)] hover:bg-emerald-500/20 active:scale-[0.98]'
            : 'border-yellow-500/30 bg-yellow-500/5 shadow-[0_0_30px_rgba(250,204,21,0.15)] hover:bg-yellow-500/10'
        }`}
      >
        <div
          className={`mb-3 text-[10px] font-bold uppercase tracking-[0.35em] ${
            canChat ? 'text-emerald-300/80' : 'text-yellow-500/70'
          }`}
        >
          {canChat ? t('elite.openNow') : t('elite.countdown')}
        </div>
        <div
          className={`font-mono text-4xl font-bold tracking-widest ${
            canChat ? 'text-emerald-300' : 'text-yellow-400'
          }`}
        >
          {info.open ? formatHMS(info.secondsToClose) : formatHMS(info.secondsToNext)}
        </div>
        <div className="mt-3 text-[10px] uppercase tracking-wider text-slate-400">
          {canChat 
            ? '🎓 You have chat access until 24:00 KST' 
            : info.open 
              ? '👁️ Read-only (Top 10 or Premium to chat)' 
              : '🔒 opens 21:50 KST'}
        </div>
      </button>

      {/* ── PODIUM — TOP 3 ─────────────────────────── */}
      {/* Stage 8.8 — 2위(왼쪽) · 1위(가운데 높게) · 3위(오른쪽) 배치. items-end 로 바닥 정렬. */}
      <div className="grid grid-cols-3 items-end gap-3 pt-4">
        {podiumList.map((r) => (
          <PodiumCard key={r.rank} row={r} />
        ))}
      </div>

      {/* ── RANK 4 ~ 10 LIST ───────────────────────── */}
      {/* Stage 8.8 — gap-4 여유 숨쉴 공간 + glassmorphism 강화 (bg-white/5 + backdrop-blur-xl + p-4). */}
      <div className="flex flex-col gap-4">
        <div className="px-1 text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500">
          {t('elite.leaderboard')} · 4 — 100
        </div>
        {finalRows.slice(3).map((r) => (
          <LeaderRow key={r.rank} row={r} />
        ))}
      </div>

      {/* Stage 8.2 — Prize Pool 배너는 규제 리스크로 완전 제거. */}
      <div className="pb-1 text-center text-[9px] text-slate-600">
        {t('settings.disclaimer')}
      </div>

      {/* Stage 8.9 — 물리 스페이서. pb-[150px] collapse 방지. */}
      <div className="h-[150px] shrink-0 pointer-events-none" aria-hidden="true" />
    </div>
  );
}

// Stage 8.8 — 포디움 전면 rebuild. Rank 1 (Legendary) dominance.
//   · Rank 1: scale-110 + h-44 + metallic gold border-2 + shadow-[0_0_80px_rgba(250,204,21,0.5)]
//   · Rank 2: silver metallic + medium glow
//   · Rank 3: bronze metallic + medium glow
//   · tall 인자 제거 (rank 로 직접 판정)
function PodiumCard({ row }: { row: LeaderboardRow }) {
  const isRank1 = row.rank === 1;
  const isRank2 = row.rank === 2;

  // 메탈릭 보더: 각 메달 색상의 금속 gradient.
  const metalBorder = isRank1
    ? 'border-2 border-yellow-500/60'
    : isRank2
      ? 'border-2 border-slate-300/50'
      : 'border-2 border-orange-600/60';

  // Massive glow — 특히 rank 1 은 0_0_80px 전설급.
  const glow = isRank1
    ? 'shadow-[0_0_80px_rgba(250,204,21,0.5),_0_20px_40px_rgba(0,0,0,0.6)]'
    : isRank2
      ? 'shadow-[0_0_40px_rgba(203,213,225,0.3),_0_12px_30px_rgba(0,0,0,0.5)]'
      : 'shadow-[0_0_40px_rgba(217,119,6,0.3),_0_12px_30px_rgba(0,0,0,0.5)]';

  // 카드 배경: 어두운 bg 기반 + 각 메탈 hue 를 상단에만 섞음.
  const bg = isRank1
    ? 'bg-gradient-to-b from-yellow-500/15 via-slate-900 to-black'
    : isRank2
      ? 'bg-gradient-to-b from-slate-300/10 via-slate-900 to-black'
      : 'bg-gradient-to-b from-orange-500/10 via-slate-900 to-black';

  const textColor = isRank1 ? 'text-amber-200' : isRank2 ? 'text-slate-100' : 'text-orange-200';
  const nameColor = isRank1 ? 'text-amber-100' : isRank2 ? 'text-slate-200' : 'text-orange-100';

  // Rank 1 dominance: scale-110 + h-44. 2/3 은 h-36.
  const sizeCls = isRank1 ? 'h-44 scale-[1.08]' : 'h-36';

  // 메달 박스 — absolute bottom-0 강제 정렬 유지.
  const medalBoxHeight = isRank1 ? 'h-16' : 'h-12';
  const medalSize = isRank1 ? 'text-5xl' : 'text-3xl';
  const medalYOffset = row.rank === 1 ? 3 : row.rank === 2 ? 1 : 0;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl px-3 pt-3 pb-4 ${sizeCls} ${metalBorder} ${bg} ${glow}`}
    >
      {/* 금속 하이라이트 (대각 그라데이션) — 카드 상단에 희미한 윤기. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: isRank1
            ? 'linear-gradient(135deg, rgba(255,236,179,0.18) 0%, transparent 45%)'
            : isRank2
              ? 'linear-gradient(135deg, rgba(255,255,255,0.14) 0%, transparent 45%)'
              : 'linear-gradient(135deg, rgba(255,183,120,0.15) 0%, transparent 45%)',
        }}
      />
      {isRank1 && (
        <div className="pointer-events-none absolute -top-8 left-1/2 h-24 w-24 -translate-x-1/2 rounded-full bg-yellow-300/30 blur-3xl" />
      )}
      <div className="relative flex h-full flex-col items-center justify-between text-center">
        <div className={`${medalBoxHeight} relative w-full`}>
          <span
            className={`absolute bottom-0 left-1/2 inline-block ${medalSize} leading-none`}
            style={{
              transform: `translate(-50%, ${medalYOffset}px)`,
              filter: isRank1
                ? 'drop-shadow(0 0 12px rgba(250,204,21,0.7))'
                : 'drop-shadow(0 0 6px rgba(255,255,255,0.2))',
            }}
            aria-hidden="true"
          >
            {medal(row.rank)}
          </span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <span
            className={`font-mono text-[10px] font-bold uppercase tracking-widest ${textColor}`}
          >
            {row.name}
          </span>
          <span
            className={`font-mono ${isRank1 ? 'text-base' : 'text-sm'} font-bold tabular-nums ${nameColor} drop-shadow-[0_0_6px_rgba(52,211,153,0.4)]`}
          >
            <span className="text-emerald-400">+{formatMoney(row.pnl)}</span>
          </span>
          {row.streak !== undefined && row.streak > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded-full border border-rose-400/30 bg-rose-500/20 px-2 py-0.5 text-[8px] font-bold text-rose-200">
              🔥 {row.streak}W
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function LeaderRow({ row }: { row: LeaderboardRow }) {
  // Stage 8.8 — glassmorphism 강화. backdrop-blur-xl + p-4 + subtle border glow on hover.
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl transition-all hover:border-white/20 hover:bg-white/[0.08]">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-slate-800/80 font-mono text-[12px] font-bold text-slate-300">
          {row.rank}
        </span>
        <span className="font-mono text-[14px] font-semibold tracking-wide text-slate-100">
          {row.name}
        </span>
      </div>
      <span className="font-mono text-[14px] font-bold tabular-nums text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]">
        +{formatMoney(row.pnl)}
      </span>
    </div>
  );
}
