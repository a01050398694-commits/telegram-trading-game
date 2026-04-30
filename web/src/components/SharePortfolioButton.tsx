import { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { formatMoney } from '../lib/format';
import { hapticImpact, hapticNotification, shareROI, type ShareResult } from '../utils/telegram';
import { useTranslation } from 'react-i18next';

const BOT_USERNAME = (import.meta.env.VITE_BOT_USERNAME as string | undefined)?.trim() || 'your_bot';
const BOT_DEEP_LINK = `https://t.me/${BOT_USERNAME}`;

type SharePortfolioButtonProps = {
  equity: number;
  winRate: number;
  totalTrades: number;
  telegramUserId?: number | null;
};

export function SharePortfolioButton({ equity, winRate, totalTrades, telegramUserId }: SharePortfolioButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [manualSaveSrc, setManualSaveSrc] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (manualSaveSrc) URL.revokeObjectURL(manualSaveSrc);
    };
  }, [manualSaveSrc]);
  
  const deepLink = telegramUserId ? `${BOT_DEEP_LINK}?start=${telegramUserId}` : BOT_DEEP_LINK;

  const shareTextTemplate = `🏆 텔레그램 가상 트레이딩 대회 출전 중!\n\n💰 현재 자산: ${formatMoney(equity)}\n🎯 승률: ${winRate.toFixed(1)}%\n\n👉 지금 바로 무료로 참가하고 $100K 챌린지 시작하기!\n${deepLink}`;

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
      filename: `portfolio-${Date.now()}.png`,
    });

    if (result === 'navigator-share') {
      setResultMsg('✅ 이미지 공유 창 열림.');
      hapticNotification('success');
    } else if (result === 'clipboard-image') {
      setResultMsg('✅ 이미지가 복사되었습니다! 채팅창에 붙여넣기 하세요.');
      hapticNotification('success');
    } else if (result === 'manual-save' && blob) {
      const url = URL.createObjectURL(blob);
      setManualSaveSrc(url);
      setResultMsg('🖱️ 이미지를 우클릭(길게 눌러) 복사/저장하세요.');
      hapticNotification('warning');
    } else if (result === 'tg-inline') {
      setResultMsg('✅ 텔레그램 채팅 선택 중…');
      hapticNotification('success');
    } else if (result === 'clipboard') {
      setResultMsg('📋 문구 복사됨. 붙여넣기 하세요.');
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
        className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-indigo-300 transition-colors hover:bg-indigo-500/20 active:scale-[0.98]"
      >
        📸 Share Portfolio
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/80 px-3 backdrop-blur-sm"
          onClick={handleClose}
        >
          <div className="flex min-h-full flex-col items-center justify-start gap-3 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
          <div
            ref={cardRef}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-[320px] overflow-hidden rounded-3xl p-5 shadow-2xl"
            style={{
              background: 'linear-gradient(140deg, #0f172a 0%, #1e1b4b 55%, #000000 100%)',
            }}
          >
            <div
              className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full opacity-30 blur-3xl"
              style={{ background: '#6366f1' }}
            />

            <div className="flex items-center justify-between">
              <span className="text-2xl">🏆</span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.25em] text-white">
                Trading Game
              </span>
            </div>

            <div className="mt-6">
              <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60">
                Total Equity
              </div>
              <div className="mt-1 font-mono text-5xl font-black leading-none tracking-tight text-white">
                {formatMoney(equity)}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-y-3 font-mono text-[12px]">
              <span className="text-white/50">Win Rate</span>
              <span className="text-right font-bold text-emerald-300">{winRate.toFixed(1)}%</span>
              <span className="text-white/50">Trades</span>
              <span className="text-right text-white">{totalTrades}</span>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-3 text-[10px]">
              <span className="font-bold uppercase tracking-[0.25em] text-indigo-300">
                Play on Telegram
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
              className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-400 py-3 text-sm font-bold uppercase tracking-wider text-white shadow-lg shadow-indigo-500/30 transition-all duration-150 hover:brightness-110 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? 'Preparing…' : '📸 Share Now'}
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

      {manualSaveSrc && (
        <div
          className="fixed inset-0 z-[60] overflow-y-auto overscroll-contain bg-black/90 px-3 backdrop-blur-sm"
          onClick={closeManualSave}
        >
          <div className="flex min-h-full flex-col items-center justify-start gap-3 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-[360px] flex-col gap-3"
          >
            <div className="rounded-xl border border-indigo-400/40 bg-indigo-500/10 px-3 py-2 text-center text-[11px] font-medium text-indigo-200">
              🖱️ 이미지를 <b>우클릭</b> 또는 <b>길게 눌러</b> 복사/저장하세요.
            </div>
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950">
              <img
                src={manualSaveSrc}
                alt="포트폴리오 공유 카드"
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
