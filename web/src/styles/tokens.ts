/**
 * Stage 16 — Card Tone Unification Design Tokens
 *
 * 4개 탭(Trade/Portfolio/VIP/Premium)의 카드 디자인을 단일 출처(tokens.ts)로 통일.
 * 안드로이드 WebView 금지사항(drop-shadow + tabular-nums + bg-clip 조합) 위반 방지.
 *
 * Why: 각 탭이 다른 색상/shadow 쓰면 사용자가 일관성 없이 느낌. 토큰 중앙화로 한 곳 변경 시
 * 모든 카드가 함께 변경되고, 파일 ownership hook 이 styles/ 경로 접근을 제어함.
 */

/**
 * Surface — 카드 배경 3단계 계층
 *
 * surface-1: 최상단 카드 (가장 밝음, 대비 높음)
 *   예: TradeTab OrderBook, Portfolio Equity Hero 숫자, VIP 포디움 카드 #1
 *
 * surface-2: 중간 카드 (투명도 낮음, 배경 약간 보임)
 *   예: TradeTab ActionPanel, Portfolio 3-stat 그리드, VIP 리더보드 row
 *
 * surface-3: 배경 카드 (가장 어두움, 깊이감)
 *   예: VIP 앰비언트 glow 뒤, 미사용 항목 fade, 잠금 오버레이 배경
 */
export const COLOR_SURFACE = {
  '1': 'rgba(15, 23, 42, 0.95)', // slate-900 극 opaque (bg-gradient-to-b from-slate-900/95)
  '2': 'rgba(30, 41, 59, 0.8)', // slate-800 투명 (bg-slate-800/70 ~ 80)
  '3': 'rgba(10, 10, 10, 0.7)', // near-black 깊이감 (bg-black/70)
} as const;

/**
 * Border — 선 및 구분선
 */
export const COLOR_BORDER = {
  hairline: 'rgba(255, 255, 255, 0.05)', // border-white/5 (모든 카드 기본)
  subtle: 'rgba(255, 255, 255, 0.1)', // border-white/10 (glassmorphism 카드)
  accent: 'rgba(184, 134, 11, 0.18)', // #B8860B gold 약간 (gold accent border)
} as const;

/**
 * Text — 텍스트 색상 (emerald/rose LONG/SHORT 분리, gold VIP/Lifetime만)
 */
export const COLOR_TEXT = {
  primary: 'rgb(248, 250, 252)', // text-slate-50 (주 텍스트)
  secondary: 'rgba(255, 255, 255, 0.4)', // text-white/40 (라벨/설명)
  muted: 'rgba(255, 255, 255, 0.3)', // text-white/30 (2차 정보, 희미함)
  disabled: 'rgba(255, 255, 255, 0.15)', // text-white/15 (비활성)
} as const;

/**
 * Accent — 감정 상태 색상 (emerald = LONG/수익, rose = SHORT/손실)
 *
 * Why emerald/rose: 바이낸스/업비트 컨벤션. green-500/red-500은 채도 높아 저가 느낌.
 * GOTCHAS §Stage 7.8: emerald-400/rose-400 통일 (green/red 절대 금지)
 *
 * 금지: 1 카드에 다색 혼합. 예컨대 TradeTab OrderBook이 동시에 gold+emerald+violet 쓰면 chaos.
 * 정책: TradeTab bids=emerald, asks=rose. Portfolio equity delta=emerald(up)/rose(down).
 *       VIP rank #1 금메달 glow=gold. Premium Premium subscription=violet.
 */
export const COLOR_ACCENT = {
  long: 'rgb(52, 211, 153)', // emerald-400 (LONG 포지션, 수익)
  short: 'rgb(251, 113, 133)', // rose-400 (SHORT 포지션, 손실)
  gold: 'rgb(250, 204, 21)', // yellow-400 (Lifetime/VIP #1 메달, 럭셔리)
  violet: 'rgb(167, 139, 250)', // violet-400 (Premium subscription lock badge)
  warning: 'rgb(229, 160, 48)', // amber-500 (청산 위험, 레버리지 경고)
} as const;

/**
 * Shadow — 그림자 3 단계 + 특수 효과 (2-layer glow)
 *
 * flat: 카드 경계 subtle 그림자 (기본 카드)
 * lifted: 카드를 약간 떠 올린 느낌 (액션 패널, 호가창)
 * glow-*: 네온 글로우 (시세 틱마다 빛나는 효과, 안드로이드에서는 배경으로만 적용)
 * black-card: 럭셔리 2-layer (포디움 #1, Lifetime/Premium 카드)
 */
export const SHADOW = {
  flat: '0 1px 2px rgba(0, 0, 0, 0.5)', // 기본 subtle
  lifted: '0 4px 12px rgba(0, 0, 0, 0.3)', // ActionPanel 정도
  'glow-emerald': '0 0 4px rgba(52, 211, 153, 0.45)', // OrderBook bid flash
  'glow-rose': '0 0 4px rgba(251, 113, 133, 0.45)', // OrderBook ask flash
  'glow-gold': '0 0 12px rgba(250, 204, 21, 0.7)', // VIP #1 메달 외곽
  'black-card-outer': '0 12px 40px rgba(184, 134, 11, 0.18)', // gold 감싼 외부 shadow
  'black-card-inner': '0 4px 16px rgba(0, 0, 0, 0.6)', // 깊이감 내부 shadow
  'podium-base': '0 0 80px rgba(250, 204, 21, 0.4), 0 20px 40px rgba(0, 0, 0, 0.6)', // 포디움 2-layer
} as const;

/**
 * Radius — 모서리 둥글기
 */
export const RADIUS = {
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  '2xl': '20px',
  '3xl': '24px',
  pill: '9999px', // 무한대 원형
} as const;

/**
 * Spacing — 간격 (4px 기본 단위, Tailwind 호환)
 */
export const SPACING = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  '2xl': '32px',
  '3xl': '40px',
} as const;

/**
 * Typography — 폰트 스타일 (안드로이드 big number 금지: tabular-nums)
 *
 * display: 큰 가격/equity 숫자 (Lifetime/$39.99 같은 주인공급 숫자)
 *   · font-black (900)
 *   · leading-tight (1.25) — font-black은 descender 오버플로우 방지 필수
 *   · tracking-tight (여백 좁음) — "돈" 느낌
 *   · NO tabular-nums on Android (안드로이드 Noto Sans 에서 weight 조합 미지원)
 *
 * body: 일반 텍스트
 *   · font-medium (500)
 *   · leading-relaxed
 *
 * caption: 라벨/보조 텍스트
 *   · font-bold (700)
 *   · text-xs ~ sm
 *
 * mono: 가격 tickers (OrderBook mid price, 평균 진입가 같은 precision 필요)
 *   · JetBrains Mono font-family
 *   · font-black (900)
 *   · 숫자 폭 일관성 필요 시에만 tabular-nums (단, 큰 글씨는 절대 금지)
 *   · 예: text-[10px] 호가창 가격은 tabular-nums OK, text-[28px] equity 는 금지
 */
export const TYPOGRAPHY = {
  display: {
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: '28px', // text-4xl 정도
    fontWeight: 900, // font-black
    lineHeight: 1.25, // leading-tight
    letterSpacing: '-0.02em', // tracking-tight
    // tabular-nums: NO (안드로이드 big number 금지)
  },
  'display-lg': {
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: '36px',
    fontWeight: 900,
    lineHeight: 1.25,
    letterSpacing: '-0.02em',
  },
  body: {
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: '14px',
    fontWeight: 500,
    lineHeight: 1.5,
  },
  caption: {
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: '12px',
    fontWeight: 700,
    lineHeight: 1.4,
  },
  mono: {
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    fontSize: '10px',
    fontWeight: 900,
    lineHeight: 1.4,
    // tabular-nums 은 큰 글씨 아닐 때만 (OrderBook text-[10px] 는 OK)
  },
} as const;

/**
 * Motion — 애니메이션 duration + easing (handoff to frontend-developer)
 */
export const MOTION = {
  duration: {
    fast: '150ms',
    base: '300ms',
    slow: '500ms',
  },
  easing: {
    'ease-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
    'ease-in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
    'ease-back': 'cubic-bezier(0.34, 1.56, 0.64, 1)', // spring 느낌
  },
} as const;

/**
 * Legacy ANALYTICS_TOKENS (PremiumTab 기존 구현과 호환성 유지)
 *
 * Stage 15.2 에서 도입된 Premium/Academy 카드 전용 토큰.
 * 이 값들을 새 통합 토큰으로 점진 이행 필요 (Phase D ⑭).
 */
export const ANALYTICS_TOKENS = {
  bg: '#0A0A0A', // 배경 (surface-3 근처)
  bgCard: '#111111', // 카드 배경 (surface-2)
  border: '#1F1F1F', // 구분선
  borderAccent: '#8B6914', // gold accent (legacy 16진수)
  textPrimary: '#E5E5E5', // text-primary
  textMuted: '#737373', // text-secondary
  numberFont: "'JetBrains Mono', ui-monospace, monospace",
  bodyFont: "'Inter', system-ui, sans-serif",
  positive: '#3FB68C', // 수익 (emerald-400 근처)
  negative: '#E55C5C', // 손실 (rose-400 근처)
  warning: '#E5A030', // 경고 (amber-500)
  lockOverlayBg: 'rgba(0,0,0,0.7)',
} as const;
