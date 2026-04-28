import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EXCHANGES, getExchange, levelLabel, type VerificationLevel } from '../lib/exchanges';
import { hapticImpact, hapticSelection, openStarsInvoice, showAlertSafe } from '../utils/telegram';
import { ApiError, submitVerification, requestStarsInvoice, type ServerVerification, type UserStatus } from '../lib/api';

// Stage 8.15 — Payment Modal 전면 폐기 → 인라인 아코디언.
//
// 왜 모달을 부쉈나 (Android Telegram WebView 버그):
//   · body { overflow:hidden } 걸고 fixed inset-0 overlay 열면 Android Chromium 은
//     overflow-y-auto 자식까지 얼어붙어 폼 하단 submit 버튼이 접근 불가.
//   · Esc/backdrop-click 닫기 로직은 데스크탑 전제. 텔레그램 WebView 는 Esc 키 자체가 없음.
//
// 새 구조:
//   · "Upgrade" 버튼 → showForm 토글 → 배너 바로 아래 UID 폼이 네이티브 흐름 안에서 인라인 확장.
//   · 부모 <div className="overflow-y-auto"> 의 기본 스크롤을 그대로 쓰므로 Android 에서도 100% 작동.
//   · body scroll lock / Esc 리스너 전부 제거.

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'pending'; exchange: string; uid: string; level: VerificationLevel }
  | { kind: 'approved'; exchange: string };

type PremiumTabProps = {
  telegramUserId: number | null;
  status: UserStatus | null;
};

type LessonKey = 'beginner' | 'leverage' | 'risk' | 'psych';
type Lesson = { key: LessonKey; icon: string; accent: string };

const LESSONS: readonly Lesson[] = [
  { key: 'beginner', icon: '📘', accent: 'from-sky-400/20 to-slate-900' },
  { key: 'leverage', icon: '⚡', accent: 'from-amber-400/20 to-slate-900' },
  { key: 'risk', icon: '🛡️', accent: 'from-emerald-400/20 to-slate-900' },
  { key: 'psych', icon: '🧠', accent: 'from-fuchsia-400/20 to-slate-900' },
];

const FEATURE_KEYS = ['multiChart', 'dailySeed', 'eliteChat', 'tournament', 'resetDiscount', 'lifetimeDiscount'] as const;

export function PremiumTab({ telegramUserId, status }: PremiumTabProps) {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);

  const toggleForm = () => {
    hapticImpact('medium');
    setShowForm((prev) => !prev);
  };

  const showComingSoon = () => {
    hapticSelection();
    setToast(t('academy.hub.comingSoon'));
    window.setTimeout(() => setToast(null), 1800);
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-3 pt-12 pb-[150px]">
      {/* ── INVITEMEMBER UPGRADE BUTTON ─────────────────────────
          Stage 14 — 결제는 미니앱 밖의 InviteMember 봇으로 즉시 리다이렉트.
          기존 requestStarsInvoice / openInvoice 백엔드 의존을 전면 제거 (Failed to fetch 원천 차단). */}
      {(!status || !status.isPremium) && (
      <div className="flex flex-col gap-2 w-full">
        <button
          type="button"
          disabled={isPaying}
          onClick={async () => {
            if (!telegramUserId) {
              showAlertSafe(
                'Telegram 사용자 정보를 불러오지 못했습니다.\n\n원인: 일반 브라우저로 직접 접속했거나 Telegram WebApp 초기화 전입니다.\n\n해결: 텔레그램 봇 안에서 미니앱을 다시 열어주세요.',
              );
              return;
            }
            hapticImpact('medium');
            setIsPaying(true);
            try {
              console.log('[Payment] PremiumTab elite button clicked, telegramUserId=', telegramUserId);
              const res = await requestStarsInvoice(telegramUserId, 'elite');
              if (!res.invoiceLink) {
                console.error('[Payment] server returned no invoiceLink:', res);
                showAlertSafe('서버가 invoice link 를 반환하지 않았습니다.\n\n응답: ' + JSON.stringify(res));
                setIsPaying(false);
                return;
              }
              // Stage 14.4.1 진단 모드 — 결제창 안 뜨는 원인 사후 추적용. 정상 동작 검증 후 제거.
              const path = openStarsInvoice(
                res.invoiceLink,
                () => {
                  hapticImpact('heavy');
                  setToast('✅ Premium activated!');
                  window.setTimeout(() => window.location.reload(), 1500);
                },
                (reason) => {
                  showAlertSafe('결제 실패: ' + reason);
                  setIsPaying(false);
                },
              );
              showAlertSafe(
                `[결제 진단]\n경로: ${path}\nlink: ${res.invoiceLink}\n\n` +
                  (path === 'native'
                    ? '→ openInvoice 호출됨. Stars 결제 시트가 떠야 합니다.\n시트가 안 뜨면 봇파더에서 Stars 결제 활성화 확인.'
                    : path === 'tg-link'
                      ? '→ openTelegramLink 호출됨. Telegram 결제 대화창으로 이동해야 합니다.'
                      : '→ location.href 로 redirect. 텔레그램 앱이 deep link 를 잡아채야 합니다.'),
              );
              if (path !== 'native') setIsPaying(false);
            } catch (err) {
              const msg = err instanceof Error ? err.message : 'Payment failed';
              console.error('[Payment] PremiumTab error:', err);
              showAlertSafe('결제 API 호출 실패: ' + msg);
              setIsPaying(false);
            }
          }}
          className="group relative flex w-full shrink-0 flex-col rounded-2xl border-2 border-yellow-500/50 bg-gradient-to-b from-slate-900 to-black p-5 text-left shadow-[0_0_60px_rgba(250,204,21,0.2),_0_16px_40px_rgba(0,0,0,0.6)] transition-all active:scale-[0.98] disabled:opacity-50"
        >
          <div className="pointer-events-none absolute inset-x-6 top-0 h-[1px] bg-gradient-to-r from-transparent via-yellow-400/70 to-transparent" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                <span className="shrink-0 text-xl drop-shadow-[0_0_12px_rgba(250,204,21,0.6)]">
                  💎
                </span>
                <span className="break-words whitespace-normal font-mono text-[13px] font-bold uppercase leading-snug tracking-[0.15em] text-amber-200">
                  {isPaying ? 'Loading...' : t('academy.hub.upgradeCta')}
                </span>
              </div>
              <div className="mt-2 break-words whitespace-normal text-[11px] leading-relaxed text-amber-100/70">
                {t('academy.hub.upgradeSub')}
              </div>
            </div>
            <span className="shrink-0 text-xl text-amber-300/70 transition-transform duration-200">
              →
            </span>
          </div>
        </button>


      </div>
      )}

      {/* ── EXCHANGE UID VERIFICATION (ACCORDION) ─────────────
          Stage 8.10 — 단일 CTA 버튼. 클릭 시 결제 모달.
          Stage 8.14 — Liquid layout.
            · 고정 높이/overflow-hidden 제약 해제. 컨텐츠가 wrap 되면서 세로 자동 확장.
            · 한글 라벨이 한 줄에 안 맞을 수 있으니 break-words + whitespace-normal 로 강제 줄바꿈.
            · WebkitBackgroundClip:text 는 안드로이드 크롬에서 텍스트를 증발시키므로 solid amber-200 로 복귀. */}
      <button
        type="button"
        onClick={toggleForm}
        aria-expanded={showForm}
        className="group relative mt-3 flex w-full shrink-0 flex-col rounded-2xl border border-indigo-500/30 bg-slate-900/50 p-4 text-left transition-all hover:bg-slate-800/50 active:scale-[0.98]"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-lg">🎁</span>
            <span className="break-words whitespace-normal font-mono text-[12px] font-bold uppercase tracking-widest text-indigo-300">
              {t('academy.verify.title')}
            </span>
          </div>
          <span
            className={`shrink-0 text-lg text-indigo-400 transition-transform duration-200 ${
              showForm ? 'rotate-90' : ''
            }`}
          >
            →
          </span>
        </div>
      </button>


      {/* ── INLINE UID VERIFICATION FORM (ACCORDION) ─────
          Stage 8.15 — 모달 폐기. 업그레이드 버튼 아래에 네이티브 flow 안에서 인라인으로 확장.
          Stage 9 — 서버 /api/verify 실제 연동. 이전 Pending 있으면 자동 복원. */}
      {showForm && (
        <InlineUpgradeForm
          telegramUserId={telegramUserId}
          existingVerification={status?.verification ?? null}
        />
      )}

      {/* ── HERO CARD ────────────────────────────────────
          Stage 8.16 — 안드로이드 WebView GPU 버그(overflow-hidden + shadow 결합 시 컨텐츠 잘림) 차단을 위해
          overflow-hidden 과 복잡한 blur 이펙트를 제거하고 둥근 테두리 및 단색 테마로 심플하게 구성. */}
      <div className="rounded-3xl border border-indigo-400/20 bg-slate-900 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/20 text-xl shadow-[0_0_15px_rgba(99,102,241,0.2)]">
            🎓
          </div>
          <div className="text-[11px] font-black uppercase tracking-widest text-indigo-300">
            {t('academy.heroTitle')}
          </div>
        </div>
        
        <div className="mt-4 break-keep text-[14px] font-medium leading-relaxed tracking-tight text-slate-200">
          {t('academy.heroSubtitle')}
        </div>
      </div>

      {/* ── REFERRAL MISSION (F-05, F-06) ───────────────────
          두 단계 마일스톤:
            · 3명 초대  → +$50,000 연습 자본 (milestone_3_claimed)
            · 10명 초대 → Academy 1개월 Promo code (milestone_10_claimed) */}
      <ReferralMissionCard status={status} onCopy={(msg) => {
        setToast(msg);
        window.setTimeout(() => setToast(null), 2000);
      }} />

      <div className="relative">
        {(!status || !status.isPremium) && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-3xl bg-slate-950/40 backdrop-blur-[6px]">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-900 shadow-[0_0_30px_rgba(250,204,21,0.2)] mb-4">
              <span className="text-3xl">🔒</span>
            </div>
            <div className="font-mono text-[14px] font-bold text-white uppercase tracking-widest">
              Premium Only
            </div>
            <div className="mt-2 text-[11px] text-slate-300">
              Upgrade to access educational library
            </div>
          </div>
        )}

      {/* ── EDUCATION LIBRARY ─────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 pb-3">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent to-white/20" />
          <span className="text-[10px] font-black uppercase tracking-[0.4em] text-white/50">
            {t('academy.hub.library')}
          </span>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent to-white/20" />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {LESSONS.map((l) => (
            <LessonCard key={l.key} lesson={l} onClick={showComingSoon} />
          ))}
        </div>
      </div>

      {/* EXCHANGES LIST — 간단 배지 그리드 유지 (정보성). */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
        <div className="flex items-center justify-between pb-2.5">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">
            Partner Exchanges · {EXCHANGES.length}+
          </span>
          <span className="text-[9px] text-slate-600">we add 2+ / month</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {EXCHANGES.map((x) => {
            const levelColor =
              x.level === 1
                ? 'border-emerald-400/30 text-emerald-200'
                : x.level === 2
                  ? 'border-amber-400/30 text-amber-200'
                  : 'border-slate-500/30 text-slate-300';
            return (
              <span
                key={x.id}
                className={`rounded-full border bg-slate-800/60 px-2.5 py-1 text-[10px] font-bold ${levelColor}`}
              >
                {x.name}
              </span>
            );
          })}
        </div>
      </div>
      </div>

      {/* Stage 8.9 — 물리 스페이서. */}
      <div className="h-[150px] shrink-0 pointer-events-none" aria-hidden="true" />

      {/* ── TOAST ──────────────────────────────────────── */}
      {toast && (
        <div className="pointer-events-none fixed bottom-32 left-1/2 z-40 -translate-x-1/2 rounded-full border border-white/10 bg-black/90 px-4 py-2 text-[11px] font-bold text-white backdrop-blur-xl">
          {toast}
        </div>
      )}
    </div>
  );
}

function ReferralMissionCard({
  status,
  onCopy,
}: {
  status: UserStatus | null;
  onCopy: (msg: string) => void;
}) {
  const { t } = useTranslation();
  const referred = status?.mission?.referredCount ?? status?.referralCount ?? 0;
  const m3Done = status?.mission?.milestone3Claimed ?? false;
  const m10Done = status?.mission?.milestone10Claimed ?? false;
  const promoCode = status?.mission?.promoCode ?? null;

  const progress3 = Math.min(100, (referred / 3) * 100);
  const progress10 = Math.min(100, (referred / 10) * 100);

  const copyPromo = () => {
    if (!promoCode) return;
    navigator.clipboard.writeText(promoCode);
    onCopy(t('academy.referral.couponCopied'));
  };

  const copyInvite = () => {
    if (!status?.telegramUserId) return;
    const botUsername = import.meta.env.VITE_BOT_USERNAME || 'Tradergames_bot';
    const link = `https://t.me/${botUsername}?start=${status.telegramUserId}`;
    navigator.clipboard.writeText(link);
    onCopy(t('academy.referral.linkCopied'));
  };

  return (
    <div className="relative mt-4 mb-4 rounded-3xl border border-emerald-400/20 bg-slate-900 p-5">
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
        <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-emerald-500/10 blur-[30px]" />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🤝</span>
          <span className="text-[13px] font-bold tracking-wide text-emerald-300">
            {t('academy.referral.title')}
          </span>
        </div>
        <span className="rounded-md bg-emerald-500/10 px-2 py-1 font-mono text-[10px] text-emerald-400/80">
          {t('academy.referral.invitedCount', { count: referred })}
        </span>
      </div>

      {/* Milestone 1: 3명 → $50K */}
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-200">
            {t('academy.referral.step1')}
          </span>
          <span
            className={`text-[10px] font-mono ${
              m3Done ? 'text-emerald-400' : 'text-slate-500'
            }`}
          >
            {m3Done ? t('academy.referral.done') : `${Math.min(referred, 3)}/3`}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${
              m3Done ? 'bg-emerald-400' : 'bg-emerald-500'
            }`}
            style={{ width: `${progress3}%` }}
          />
        </div>
      </div>

      {/* Milestone 2: 10명 → 1개월 쿠폰 */}
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-200">
            {t('academy.referral.step2')}
          </span>
          <span
            className={`font-mono text-[10px] ${
              m10Done ? 'text-amber-400' : 'text-slate-500'
            }`}
          >
            {m10Done ? t('academy.referral.issued') : `${Math.min(referred, 10)}/10`}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${
              m10Done ? 'bg-amber-400' : 'bg-amber-500/80'
            }`}
            style={{ width: `${progress10}%` }}
          />
        </div>
      </div>

      {/* Promo code 노출 — 발급됐을 때만 */}
      {m10Done && promoCode && (
        <button
          type="button"
          onClick={copyPromo}
          className="mb-3 w-full rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-center transition-all hover:bg-amber-500/20 active:scale-[0.98]"
        >
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-amber-300">
            Academy 1-Month Promo
          </div>
          <div className="mt-1 font-mono text-sm font-black text-amber-100">
            {promoCode}
          </div>
          <div className="mt-1 text-[9px] text-amber-400/70">{t('academy.referral.tapToCopy')}</div>
        </button>
      )}

      <button
        type="button"
        onClick={copyInvite}
        className="w-full rounded-xl border border-emerald-500/30 bg-emerald-500/20 py-3 text-[12px] font-bold text-emerald-300 transition-all hover:bg-emerald-500/30 active:scale-[0.98]"
      >
        {t('academy.referral.copyLink')}
      </button>
    </div>
  );
}

function LessonCard({ lesson, onClick }: { lesson: Lesson; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${lesson.accent} p-4 text-left backdrop-blur-xl transition-all hover:border-white/25 active:scale-[0.98]`}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">{lesson.icon}</span>
        <div className="flex-1">
          <div className="font-mono text-[13px] font-black text-white">
            {t(`academy.hub.lessons.${lesson.key}.title`)}
          </div>
          <div className="mt-1 break-keep text-[11px] leading-relaxed text-slate-300/80">
            {t(`academy.hub.lessons.${lesson.key}.desc`)}
          </div>
        </div>
      </div>
      <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-400">
        {t('academy.hub.comingSoon')}
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────
// InlineUpgradeForm — 부모 탭 스크롤 흐름 안에서 펼쳐지는 아코디언 폼.
// Stage 8.15: 이전 PaymentModal (fixed inset-0 overlay) 가 Android WebView 에서
// body scroll-lock 때문에 submit 버튼까지 못 닿는 문제를 뿌리째 해결.
// Stage 9: handleSubmit 이 더 이상 mock 이 아니라 실제 POST /api/verify 호출.
//          status 폴링 응답으로 내려온 기존 Pending 이 있으면 즉시 복원.
// ─────────────────────────────────────────────────────────
function InlineUpgradeForm({
  telegramUserId,
  existingVerification,
}: {
  telegramUserId: number | null;
  existingVerification: ServerVerification | null;
}) {
  const { t } = useTranslation();

  // 기존 Pending/Approved 상태 복원 — 서버가 이미 가진 이력을 폼 대신 보여줌.
  const initialState: SubmitState = (() => {
    if (!existingVerification) return { kind: 'idle' };
    const ex = getExchange(existingVerification.exchangeId);
    const level: VerificationLevel = ex?.level ?? 3;
    const name = ex?.name ?? existingVerification.exchangeId;
    if (existingVerification.status === 'approved') {
      return { kind: 'approved', exchange: name };
    }
    if (existingVerification.status === 'pending') {
      return {
        kind: 'pending',
        exchange: name,
        uid: existingVerification.uid,
        level,
      };
    }
    return { kind: 'idle' };
  })();

  const [exchangeId, setExchangeId] = useState<string>(
    existingVerification?.exchangeId ?? EXCHANGES[0]!.id,
  );
  const [uid, setUid] = useState(existingVerification?.uid ?? '');
  const [email, setEmail] = useState(existingVerification?.email ?? '');
  const [submit, setSubmit] = useState<SubmitState>(initialState);
  const [error, setError] = useState<string | null>(null);

  // 서버 status 폴링으로 새로운 verification 이 도착하면 폼 상태 재동기화.
  useEffect(() => {
    if (!existingVerification) return;
    const ex = getExchange(existingVerification.exchangeId);
    if (existingVerification.status === 'approved') {
      setSubmit({ kind: 'approved', exchange: ex?.name ?? existingVerification.exchangeId });
    } else if (existingVerification.status === 'pending') {
      setSubmit({
        kind: 'pending',
        exchange: ex?.name ?? existingVerification.exchangeId,
        uid: existingVerification.uid,
        level: ex?.level ?? 3,
      });
    }
  }, [existingVerification?.id, existingVerification?.status]);

  const selectedExchange = getExchange(exchangeId);
  const canSubmit =
    uid.trim().length >= 3 &&
    selectedExchange !== null &&
    submit.kind === 'idle' &&
    telegramUserId !== null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExchange) {
      setError(t('academy.verify.errSelectExchange'));
      return;
    }
    if (uid.trim().length < 3) {
      setError(t('academy.verify.errUidShort'));
      return;
    }
    if (telegramUserId === null) {
      setError(t('academy.verify.errNoTelegram'));
      return;
    }

    setError(null);
    hapticImpact('medium');
    setSubmit({ kind: 'submitting' });

    try {
      const res = await submitVerification({
        telegramUserId,
        exchangeId: selectedExchange.id,
        uid: uid.trim(),
        email: email.trim() ? email.trim() : null,
      });
      const v = res.verification;
      if (v.status === 'approved') {
        setSubmit({ kind: 'approved', exchange: selectedExchange.name });
      } else {
        setSubmit({
          kind: 'pending',
          exchange: selectedExchange.name,
          uid: v.uid,
          level: selectedExchange.level,
        });
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : (err as Error).message;
      setError(msg);
      setSubmit({ kind: 'idle' });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Lifetime Black Card — 재사용. */}
      <div className="relative overflow-visible rounded-3xl border-2 border-yellow-500/50 bg-gradient-to-b from-slate-900 to-black p-6 shadow-[0_0_60px_rgba(250,204,21,0.2),_0_20px_50px_rgba(0,0,0,0.7)]">
          <div className="pointer-events-none absolute inset-x-6 top-0 h-[1px] bg-gradient-to-r from-transparent via-yellow-400/70 to-transparent" />
          <div className="text-[10px] font-black uppercase tracking-[0.35em] text-amber-300/90">
            {t('academy.planLifetime')}
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span
              className="font-mono text-5xl font-black tabular-nums tracking-tight text-transparent drop-shadow-[0_0_16px_rgba(250,204,21,0.4)]"
              style={{
                backgroundImage: 'linear-gradient(180deg, #fef3c7 0%, #fbbf24 55%, #b45309 100%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
              }}
            >
              {t('academy.priceLifetime')}
            </span>
            <span className="font-mono text-sm font-semibold text-amber-200/60">
              {t('academy.subtitleLifetime')}
            </span>
          </div>
          <ul className="mt-5 flex flex-col gap-2 border-t border-amber-400/20 pt-4">
            {FEATURE_KEYS.map((k) => (
              <li key={k} className="flex items-start gap-2 text-[12px] leading-snug text-slate-100">
                <span className="mt-[1px] font-black text-emerald-400">✓</span>
                <span>{t(`academy.features.${k}`)}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* UID Form / Pending / Approved — Stage 9 실제 서버 상태 반영. */}
        {submit.kind === 'pending' ? (
          <PendingCard
            exchange={submit.exchange}
            uid={submit.uid}
            level={submit.level}
            onReset={() => setSubmit({ kind: 'idle' })}
          />
        ) : submit.kind === 'approved' ? (
          <ApprovedCard exchange={submit.exchange} />
        ) : (
          <form
            onSubmit={handleSubmit}
            className="relative mt-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl"
          >
            <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-indigo-400/60 via-fuchsia-400/60 to-transparent" />
            <div className="text-[11px] font-black uppercase tracking-[0.3em] text-indigo-200">
              {t('academy.verify.title')}
            </div>
            <div className="mt-2 text-[12px] leading-relaxed text-slate-200">
              {t('academy.verify.hint')}
            </div>

            <label className="mt-4 block">
              <span className="text-[10px] font-black uppercase tracking-wider text-white/50">
                {t('academy.verify.exchange')}
              </span>
              <div className="relative mt-1">
                <select
                  value={exchangeId}
                  onChange={(e) => {
                    hapticSelection();
                    setExchangeId(e.target.value);
                  }}
                  className="w-full appearance-none rounded-xl border border-white/10 bg-slate-800/80 px-3 py-2.5 pr-10 font-mono text-sm font-bold text-white focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                >
                  {EXCHANGES.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name} · {levelLabel(x.level)}
                    </option>
                  ))}
                </select>
                <svg
                  className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </label>

            <label className="mt-3 block">
              <span className="text-[10px] font-black uppercase tracking-wider text-white/50">
                {t('academy.verify.uid')} <span className="text-rose-400">*</span>
              </span>
              <input
                type="text"
                value={uid}
                onChange={(e) => setUid(e.target.value)}
                placeholder="e.g. 12345678"
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800/80 px-3 py-2.5 font-mono text-sm text-white placeholder:text-slate-600 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                inputMode="numeric"
              />
            </label>

            <label className="mt-3 block">
              <span className="text-[10px] font-black uppercase tracking-wider text-white/50">
                Email (optional)
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="partial exchange email"
                className="mt-1 w-full rounded-xl border border-white/10 bg-slate-800/80 px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
              />
            </label>

            {error && (
              <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] font-medium text-rose-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="mt-4 w-full rounded-xl bg-gradient-to-r from-indigo-500 via-indigo-400 to-fuchsia-400 py-4 text-[14px] font-black uppercase tracking-wider text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.35),_0_6px_20px_rgba(99,102,241,0.45)] transition-all duration-100 hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-none disabled:bg-slate-700 disabled:text-slate-500 disabled:shadow-none"
            >
              {submit.kind === 'submitting' ? '...' : t('academy.verify.submit')}
            </button>
          </form>
        )}
    </div>
  );
}

function PendingCard({
  exchange,
  uid,
  level,
  onReset,
}: {
  exchange: string;
  uid: string;
  level: VerificationLevel;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="relative mt-4 overflow-hidden rounded-2xl border border-amber-400/40 bg-gradient-to-br from-amber-500/15 via-slate-900 to-slate-900 p-4 shadow-[0_8px_32px_rgba(0,0,0,0.5),_0_0_25px_rgba(251,191,36,0.2)] backdrop-blur-2xl">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-400/20 text-xl">
          ⏳
        </span>
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-300">
            Under Review
          </div>
          <div className="font-mono text-sm font-bold text-white">
            {exchange} · UID {uid}
          </div>
        </div>
      </div>
      <div className="mt-3 rounded-xl bg-white/[0.03] px-3 py-2 text-[11px] leading-relaxed text-amber-100/80">
        {t('academy.verify.pending')} · Level:{' '}
        <span className="font-bold">
          {level === 1 ? 'Auto' : level === 2 ? 'Semi-auto (~2h)' : 'Manual (~24h)'}
        </span>
      </div>
      <button
        type="button"
        onClick={onReset}
        className="mt-3 w-full rounded-xl border border-white/10 bg-transparent py-2.5 text-[11px] font-black uppercase tracking-wider text-slate-300 hover:bg-white/5"
      >
        {t('common.cancel')}
      </button>
    </div>
  );
}

// Stage 9 — 승인 완료 배지. VIP 평생 혜택 활성화를 시각적으로 알림.
function ApprovedCard({ exchange }: { exchange: string }) {
  const { t } = useTranslation();
  return (
    <div className="relative mt-4 rounded-2xl border border-emerald-400/40 bg-gradient-to-br from-emerald-500/15 via-slate-900 to-slate-900 p-4 shadow-[0_0_25px_rgba(16,185,129,0.2)]">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-400/20 text-xl">
          ✅
        </span>
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-300">
            {t('academy.verify.approvedTitle')}
          </div>
          <div className="font-mono text-sm font-bold text-white">{exchange}</div>
        </div>
      </div>
      <div className="mt-3 rounded-xl bg-white/[0.03] px-3 py-2 text-[11px] leading-relaxed text-emerald-100/80">
        {t('academy.verify.approvedHint')}
      </div>
    </div>
  );
}
