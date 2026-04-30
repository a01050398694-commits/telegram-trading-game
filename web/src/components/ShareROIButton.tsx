import { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { getMarket } from '../lib/markets';
import { formatUSD, calcPnl } from '../lib/format';
import { hapticImpact, hapticNotification, shareROI, type ShareResult } from '../utils/telegram';

// Stage 8.4 — Desktop Ultimate Fallback: clipboard image + manual-save modal.
// ShareROIButton 은 3개 모달 상태를 관리한다:
//   · 공유 미리보기 카드 모달 (open = true)
//   · manual-save 이미지 모달 (manualSaveSrc != null) — 데스크톱 최종 폴백
//   · 토스트(resultMsg) — 결과 메시지

const BOT_USERNAME = (import.meta.env.VITE_BOT_USERNAME as string | undefined)?.trim() || 'your_bot';
const BOT_DEEP_LINK = `https://t.me/${BOT_USERNAME}`;

type Position = {
  symbol: string;
  side: 'long' | 'short';
  entryPrice: number;
  size: number;
  leverage: number;
};

type ShareROIButtonProps = {
  position: Position;
  markPrice: number | null;
  telegramUserId?: number | null;
};

export function ShareROIButton({ position, markPrice, telegramUserId }: ShareROIButtonProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  // manual-save 모달: blob URL 을 state 로 보관 → <img src={manualSaveSrc} />.
  // 모달 닫힐 때 URL.revokeObjectURL 로 메모리 회수.
  const [manualSaveSrc, setManualSaveSrc] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // unmount 시 blob URL 누수 방지.
  useEffect(() => {
    return () => {
      if (manualSaveSrc) URL.revokeObjectURL(manualSaveSrc);
    };
  }, [manualSaveSrc]);

  const marketKnown = markPrice !== null;
  const market = getMarket(position.symbol);
  const pnl = marketKnown
    ? calcPnl(position.side, position.entryPrice, markPrice, position.size, position.leverage)
    : 0;
  const roiPct = marketKnown
    ? ((markPrice - position.entryPrice) / position.entryPrice) *
      100 *
      (position.side === 'long' ? 1 : -1) *
      position.leverage
    : 0;

  const deepLink = telegramUserId ? `${BOT_DEEP_LINK}?start=${telegramUserId}` : BOT_DEEP_LINK;

  const roiSign = roiPct >= 0 ? '+' : '';
  const tickerLine = `${market.ticker}USDT ${position.side.toUpperCase()} ${position.leverage}x · ROI ${roiSign}${roiPct.toFixed(2)}%`;
  const shareTextTemplate =
    roiPct >= 0
      ? `🔥 폼 미쳤다! 나 방금 수익 먹음!\n${tickerLine}\n\n🏆 너도 공식 모의투자 글로벌 아카데미 가입하고 $100K 챌린지 시작해 봐!\n👉 ${deepLink}`
      : `📉 오늘은 수업료 냈다. 리스크 관리 배우는 중.\n${tickerLine}\n\n🎓 너도 $100K 모의 시드로 같이 연습하자!\n👉 ${deepLink}`;

  const handleOpen = () => {
    hapticImpact('light');
    setResultMsg(null);
    setOpen(true);
  };
  const handleClose = () => setOpen(false);

  const closeManualSave = () => {
    if (manualSaveSrc) URL.revokeObjectURL(manualSaveSrc);
    setManualSaveSrc(null);
  };

  const handleShare = async () => {
    hapticImpact('medium');
    setBusy(true);
    setResultMsg(null);
    let blob: Blob | null = null;
    try {
      if (cardRef.current) {
        const canvas = await html2canvas(cardRef.current, {
          backgroundColor: '#020617',
          scale: 2,
          useCORS: true,
          logging: false,
        });
        blob = await new Promise<Blob | null>((r) =>
          canvas.toBlob((b) => r(b), 'image/png', 0.95),
        );
      }
    } catch (err) {
      console.error('[share] capture failed', err);
    }

    const result: ShareResult = await shareROI({
      text: shareTextTemplate,
      blob,
      filename: `roi-${market.ticker}-${Date.now()}.png`,
    });

    if (result === 'navigator-share') {
      setResultMsg('✅ 이미지 공유 창 열림.');
      hapticNotification('success');
    } else if (result === 'clipboard-image') {
      // Stage 8.4: 데스크톱 Chromium 경로 — 이미지+텍스트 둘 다 클립보드에 복사 완료.
      setResultMsg('✅ 이미지가 클립보드에 복사되었습니다! 채팅창에서 Ctrl+V 붙여넣기.');
      hapticNotification('success');
    } else if (result === 'manual-save' && blob) {
      // 최종 폴백: 풀스크린 이미지 모달을 열어서 유저가 직접 우클릭/길게 눌러 복사/저장.
      const url = URL.createObjectURL(blob);
      setManualSaveSrc(url);
      setResultMsg('🖱️ 이미지를 우클릭(길게 눌러) 복사/저장하세요.');
      hapticNotification('warning');
    } else if (result === 'tg-inline') {
      setResultMsg('✅ 텔레그램 채팅 선택 중…');
      hapticNotification('success');
    } else if (result === 'clipboard') {
      setResultMsg('📋 문구 복사됨. 카톡/트위터에 붙여넣기.');
      hapticNotification('warning');
    } else {
      setResultMsg('⚠️ 공유 기능이 지원되지 않는 환경.');
      hapticNotification('error');
    }
    setBusy(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-1 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-300 transition-colors hover:bg-amber-400/20 active:scale-[0.98]"
      >
        🚀 Share ROI
      </button>

      {open && (
        // Stage 15.7 — 잘림 fix. m-auto 는 콘텐츠가 viewport 보다 클 때 위/아래로 잘림.
        // min-h-full + justify-center 패턴: 짧으면 가운데, 길면 위에서부터 자연 스크롤.
        <div
          className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/80 backdrop-blur-sm"
          onClick={handleClose}
        >
          <div
            className="flex min-h-full w-full flex-col items-center justify-center gap-3 px-3"
            style={{
              paddingTop: 'max(1.5rem, env(safe-area-inset-top, 0px))',
              paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))',
            }}
          >
          <div
            ref={cardRef}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-[320px] overflow-hidden rounded-3xl p-5 shadow-2xl"
            style={{
              background:
                roiPct >= 0
                  ? 'linear-gradient(140deg, #0f172a 0%, #064e3b 55%, #022c22 100%)'
                  : 'linear-gradient(140deg, #0f172a 0%, #7f1d1d 55%, #450a0a 100%)',
            }}
          >
            <div
              className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full opacity-40 blur-3xl"
              style={{ background: roiPct >= 0 ? '#10b981' : '#f43f5e' }}
            />

            <div className="flex items-center justify-between">
              <span className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl text-lg font-bold ${market.color}`}>
                {market.icon}
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.25em] text-white">
                Perpetual
              </span>
            </div>

            <div className="mt-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60">
                {market.ticker}USDT
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span
                  className={`text-xs font-black uppercase tracking-wider ${
                    position.side === 'long' ? 'text-emerald-300' : 'text-rose-300'
                  }`}
                >
                  {position.side === 'long' ? '▲ LONG' : '▼ SHORT'}
                </span>
                <span className="rounded-md bg-white/10 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                  {position.leverage}x
                </span>
              </div>
            </div>

            <div className="mt-5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/60">
                Return on Equity
              </div>
              <div
                className={`mt-1 font-mono text-5xl font-black leading-none tracking-tight ${
                  roiPct >= 0 ? 'text-emerald-300' : 'text-rose-300'
                }`}
              >
                {roiPct >= 0 ? '+' : ''}
                {roiPct.toFixed(2)}%
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-y-2 font-mono text-[11px]">
              <span className="text-white/50">Entry</span>
              <span className="text-right text-white">${formatUSD(position.entryPrice)}</span>
              <span className="text-white/50">Mark</span>
              <span className="text-right text-white">
                ${markPrice !== null ? formatUSD(markPrice) : '--'}
              </span>
              <span className="text-white/50">PnL</span>
              <span
                className={`text-right font-bold ${
                  pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'
                }`}
              >
                {pnl >= 0 ? '+$' : '-$'}
                {Math.abs(Math.round(pnl)).toLocaleString('en-US')}
              </span>
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-3 text-[10px]">
              <span className="font-bold uppercase tracking-[0.25em] text-white">
                Trading Academy
              </span>
              <span className="text-white/50">t.me/{BOT_USERNAME}</span>
            </div>
          </div>

          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-[320px] flex-col gap-2"
          >
            <button
              type="button"
              disabled={busy}
              onClick={handleShare}
              className="w-full rounded-xl bg-gradient-to-r from-amber-400 to-amber-300 py-3 text-sm font-bold uppercase tracking-wider text-slate-900 shadow-lg shadow-amber-500/30 transition-all duration-150 hover:brightness-110 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? 'Preparing…' : '🚀 Share Now'}
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="w-full rounded-xl border border-white/10 bg-slate-900/80 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-300 hover:bg-slate-800"
            >
              Close
            </button>
            {resultMsg && (
              <div className="rounded-md bg-white/10 px-3 py-1.5 text-center text-[11px] text-white">
                {resultMsg}
              </div>
            )}
          </div>
          </div>
        </div>
      )}

      {/* Stage 8.4 — 데스크톱 최종 폴백: 이미지 직접 표시 + 우클릭 유도 모달. */}
      {/* Stage 15.7 — 잘림 fix. m-auto → min-h-full + justify-center 으로 변경. */}
      {manualSaveSrc && (
        <div
          className="fixed inset-0 z-[60] overflow-y-auto overscroll-contain bg-black/90 backdrop-blur-sm"
          onClick={closeManualSave}
        >
          <div
            className="flex min-h-full w-full flex-col items-center justify-center gap-3 px-3"
            style={{
              paddingTop: 'max(1.5rem, env(safe-area-inset-top, 0px))',
              paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom, 0px))',
            }}
          >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-[360px] flex-col gap-3"
          >
            <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-center text-[11px] font-medium text-amber-200">
              🖱️ 이미지를 <b>우클릭</b> 또는 <b>길게 눌러</b> "이미지 복사" / "이미지 저장" 을 선택하세요.
              <br />
              문구는 이미 클립보드에 복사되어 있습니다.
            </div>
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950">
              <img
                src={manualSaveSrc}
                alt="ROI 공유 카드"
                className="block h-auto w-full select-none"
                draggable
              />
            </div>
            <button
              type="button"
              onClick={closeManualSave}
              className="w-full rounded-xl border border-white/10 bg-slate-900/80 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-300 hover:bg-slate-800"
            >
              닫기
            </button>
          </div>
          </div>
        </div>
      )}
    </>
  );
}
