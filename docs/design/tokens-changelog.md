# Tokens Changelog — Stage 16

## Phase D ⑬ Card Tone Unification

**Date**: 2026-05-01  
**Owner**: design-lead  
**Scope**: TypeScript tokens export + CSS variables + 4-tab migration guide

---

## Why Each Token Value

### Surface Colors

**Why 3 tiers (surface-1/2/3)?**
- Mobile card hierarchy 필수. Dense 거래소 UI (Binance) 는 카드를 여러 opacity 로 겹쳐 "깊이감" 표현.
- surface-1 (slate-900/95): 최상 대비 → 주인공급 카드 (OrderBook, Podium #1)
- surface-2 (slate-800/80): 중간 → 일반 카드 (ActionPanel, Analytics, 리더보드)
- surface-3 (black/70): 배경 → 보조 요소 (LockOverlay, 앰비언트 bg)

**Why `rgba()` 대신 hex?**
- CSS 변수 호환성. `rgba(15, 23, 42, 0.95)` 는 Tailwind arbitrary 와 inline style 모두 쓸 수 있음.
- 안드로이드 WebView 에서 hex color 보다 rgba 가 더 안정적 (실측).

### Border Colors

**Why hairline / subtle / accent 3가지?**
- hairline (white/5): 카드 기본 경계 → 대부분 card
- subtle (white/10): glassmorphism 강조 → 럭셔리 포디움
- accent (gold 약간): gold 테두리 → RechargeCard (idle), Lifetime pricing

**Why gold-hairline 은 따로?**
- emerald/rose 테두리와 섞으면 "chaos" 느낌.
- gold 는 특별함 시그널 (VIP/Lifetime 만).

### Accent Colors

**Why emerald-400 (52, 211, 153) 아닌 green-500?**
- Tailwind green-500 는 `rgb(34, 197, 94)` — 채도 높아 "저가 앱" 느낌.
- emerald-400 는 `rgb(52, 211, 153)` — Figma/Linear/Notion 표준. "luxury trading" 톤.
- GOTCHAS §Stage 7.8 "MUST NOT use green-500/red-500" — 강제사항.

**Why rose-400 (251, 113, 133) 아닌 red-500?**
- red-500 (239, 68, 68) 너무 짙음.
- rose-400 은 LONG(emerald) 대비 시각적으로 "soft" 하지만 읽기 쉬움.
- Binance/Upbit 에서 모두 사용.

**Why gold rgb(250, 204, 21) 아닌 amber-500?**
- gold 는 Amex Black Card 컨벤션. 럭셔리 느낌 필수.
- rgb(250, 204, 21) 은 Figma "Gold" 표준 ≈ yellow-400.
- 이전 값들 `#DAA520` (Goldenrod) 보다 밝고 명확.

**Why violet-400?**
- Premium 구독 배지 배경. emerald/rose/gold 와는 별도 영역.
- 인디고/블루 보다 따뜻해 "프리미엄" 느낌.

### Shadow / Glow

**Why 2-layer podium shadow?**
```
shadow-podium-base: 0 0 80px rgba(250,204,21,0.4), 0 20px 40px rgba(0,0,0,0.6)
```
- 1st layer: colored radial glow (gold 80px blur) → 아우라, "떠 있음" 신호
- 2nd layer: hard drop shadow (검정 20px) → 깊이감, 3D 떠올려 보임

**왜 하나만으로는 안 되는가?**
- colored shadow 만: 너무 soft, "LED neon" 느낌만 (깊이 X)
- drop shadow 만: flat 느낌, "종이 위에 그린 것"

**GOTCHAS §Stage 8.8 실측**: Stripe / Linear / Notion Lifetime pricing card 전부 2-layer 사용.

**Why glow-emerald / glow-rose 는 4px 작은 shadow?**
- OrderBook 호가창 가격은 text-[10px] 작은 글씨.
- 큰 blur (12px+) 하면 자간 가려짐.
- 4px 정도 neon glow 만 해야 "라이브 시장" 느낌.

### Typography

**Why display 는 leading-tight (1.25)?**
- font-black (900 weight) 는 descender (y, g, p) 가 베이스라인 아래로 삐져나옴.
- line-height 1.5 (default) 로는 "혼잡" 느낌. 1.25 로 줄이면 명확.
- GOTCHAS §Stage 8.2 "leading-tight 필수".

**Why mono 는 JetBrains Mono?**
- Figma / 거래소 표준. 숫자 폭 일관성(tabular-nums) 필요할 때 선택 폰트.
- 하지만 **text-4xl+ 에는 절대 tabular-nums 금지** (안드로이드 Noto Sans weight 미지원).

**Why body 는 font-medium (500)?**
- Inter 의 기본 weight. 너무 light 하지도 너무 heavy 하지도 않음.
- caption 은 bold (700) 로 구분 명확.

### Motion

**Why duration-fast 150ms?**
- Stripe / Linear 표준.
- Toast / toast 애니메이션, shadow 변화 정도.

**Why duration-base 300ms?**
- Modal fade-in, card glow pulse 같은 주요 전환.

**Why easing-out cubic-bezier(0.16, 1, 0.3, 1)?**
- "ease-out" = 시작은 빠르고 끝은 slow.
- 거래 앱 같은 "빠른" 느낌.

---

## Token Ownership & Maintenance

| Token Category | Source of Truth | CSS Variable | Frontend Usage |
|---|---|---|---|
| Color | `tokens.ts` COLOR_SURFACE / COLOR_ACCENT | `tokens.css :root` | `var(--color-*)` + Tailwind arbitrary |
| Shadow | `tokens.ts` SHADOW | `tokens.css :root` | `shadow-[var(...)]` 또는 inline |
| Typography | `tokens.ts` TYPOGRAPHY | N/A (JS export) | Tailwind class + inline font-family |
| Motion | `tokens.ts` MOTION | `tokens.css :root` | CSS animation duration + easing |

**Update Flow**:
1. Design lead 가 `tokens.ts` 수정
2. `tokens.css` 자동 mirror (수동 동기화 필수)
3. `index.css` 에서 import 하므로 모든 컴포넌트 즉시 반영
4. frontend-developer 는 필요 시 `var(--color-surface-1)` 참조

---

## Deprecated / Removed

### ANALYTICS_TOKENS (Legacy, 유지)

Stage 15.2 에서 도입된 `PremiumTab` 전용 tokens.
새 통합 tokens 와 겹치는 값들:

```typescript
// 기존 (legacy)
ANALYTICS_TOKENS.bg: '#0A0A0A' → COLOR_SURFACE['3'] 근처
ANALYTICS_TOKENS.bgCard: '#111111' → COLOR_SURFACE['2'] 근처
ANALYTICS_TOKENS.borderAccent: '#8B6914' → COLOR_ACCENT.gold (hex ver)
```

**이행 계획** (Phase D ⑭):
1. Stage 16: ANALYTICS_TOKENS 유지 (호환성)
2. Stage 17: PremiumTab 의 T.* 참조를 새 COLOR_* 로 점진 교체
3. Stage 18: ANALYTICS_TOKENS deprecated 선언, 최종 제거

---

## Known Limitations & Workarounds

### Limitation 1: Inline Style 교체 난이도

**상황**: PricingCard 의 gold gradient 는 복잡한 inline style.
```css
background: linear-gradient(135deg, rgba(184,134,11,0.18) 0%, ...);
box-shadow: 0 0 0 1px rgba(184, 134, 11, 0.18), ...;
```

**해결책**: 현재 inline 그대로 유지. CSS variable 로 전환하려면 `--color-accent-gold` 를 모든 지점에 주입 필요 (복잡).

**우선순위**: LOW (Phase D ⑭ 별도).

### Limitation 2: Dynamic Color Generation

**상황**: LeaderBoard row 가 사용자 rank 에 따라 색상을 동적으로 변경하려면?

**현 policy**: 색상은 **정적** — rank 별 별도 CSS class 또는 surface-2 + accent 조합만.
동적 색상 원하면 JS 로 `style={{ color: getColorByRank(rank) }}` 처리.

**근거**: CSS 변수는 컴파일 타임 값. 런타임 동적 색상 필요 시 JS 계산이 더 명확.

---

## Validation Results

### Typecheck ✓

```bash
# tokens.ts 는 standalone export, no runtime
npx tsc --noEmit web/src/styles/tokens.ts
```

### CSS Syntax ✓

```bash
# tokens.css :root 는 valid CSS
npx stylelint web/src/styles/tokens.css
```

### Tailwind JIT ✓

Arbitrary value 로 쓸 수 있음:
```tsx
<div className="bg-[var(--color-surface-1)] border-[var(--border-hairline)]" />
```

Tailwind v4 `@theme` 로 내장화 가능 (현재 scope 외).

---

## Migration Guide (for frontend-developer)

구현 시 체크리스트:

1. **TradeTab**: OrderBook / ActionPanel / RecentTrades 모두 `surface-2` 로 통일
2. **PortfolioTab**: RechargeCard idle/liquidated 변형, gold/warning color 변수화
3. **VIPTab**: Podium 2-layer shadow, Leaderboard divide-y → 개별 카드로
4. **PremiumTab**: ANALYTICS_TOKENS 유지 (현재), Phase ⑭ 에서 마이그레이션

매 탭마다 모바일 390px 스크린샷 검증 필수 (안드로이드 big number bug).
