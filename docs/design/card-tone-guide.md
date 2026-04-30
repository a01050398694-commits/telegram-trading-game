# Design: Card Tone Unification (Phase D ⑬)

## Overview

4개 탭(Trade / Portfolio / VIP / Premium)의 카드 톤이 제각각이어서 사용자가 "일관성 없다"고 느낌.
이 가이드는 모든 카드가 따라야 할 **단일 구조 + 색상 규칙 + 타이포그래피 계층**을 정의.

---

## A. Card Anatomy

모든 카드는 다음 구조를 따름:

```
┌─────────────────────────────────────────┐
│ HEADER (라벨 / side badge / status)     │  ← caption typography
├─────────────────────────────────────────┤
│                                         │
│ BODY (메인 콘텐츠 / 숫자 / 설명)        │  ← display / body
│                                         │
├─────────────────────────────────────────┤
│ FOOTER (메타 정보 / 타임스탠프)         │  ← caption muted
└─────────────────────────────────────────┘

ACTION (CTA 버튼 / 토글 / 인터랙션) — 카드 내부 또는 외부
```

### Dimensions

- **Padding**: `px-3 py-3` (12px 좌우, 12px 상하) 최소
- **Border**: `border border-[var(--border-hairline)]` (white/5)
- **Radius**: `rounded-xl` (12px, --radius-lg)
- **Min height**: cardless 히어로 제외 모든 카드 `min-h-[80px]`

### 카드가 없어야 할 때

**GOTCHAS §Stage 8.16**: 안드로이드 WebView 카드 렌더 버그(높이 collapse, 하단 증발) 원천 차단.
`PortfolioTab` 의 큰 Equity 숫자는 **cardless** — 순수 텍스트 `<div>` 만 화면 정중앙 배치.
카드 추가 시 항상 모바일 스크린샷으로 재검증.

---

## B. Surface Hierarchy

**surface-1** (가장 밝음, 최고 대비)
- `bg-gradient-to-b from-[var(--color-surface-1)] to-...`
- **사용처**:
  - TradeTab: OrderBook card 배경
  - Portfolio: Equity 카드 (cardless 이면 제외)
  - VIP: Podium top 3 카드
  - Premium: 없음 (전부 surface-2)

**surface-2** (중간, 투명 30-50%)
- `bg-[var(--color-surface-2)]`
- **사용처**:
  - TradeTab: ActionPanel, BalanceBar, RecentTrades
  - Portfolio: 3-stat 그리드 (Balance / Margin / PnL), Position card, History list
  - VIP: Leaderboard row 4-10
  - Premium: 모든 analytics card (StatsCard / HourlyBucketsCard / LeverageCard / BehaviorCard)

**surface-3** (배경, 가장 어두움)
- `bg-[var(--color-surface-3)]` + `backdrop-blur-xl`
- **사용처**:
  - VIP: 앰비언트 glow 뒤쪽 배경 요소
  - Premium: LockOverlay 배경
  - Portfolio: RechargeCard 변형 (liquidated 상태)

### Glass Effect 규칙

**glassmorphism 조건**:
1. `border-[var(--border-subtle)]` (white/10)
2. `backdrop-blur-xl` (Tailwind class)
3. `grain` class 붙일 때만 `overflow: hidden` + `isolation: isolate` 필수 (GOTCHAS §Stage 7.8)
4. `glass-specular` 붙일 때만 대각 선 하이라이트 135deg

**금지**: surface-2/surface-3 카드에 grain + glass-specular 동시 적용.
CardLess (히어로) 또는 럭셔리 포디움(surface-1)에만.

---

## C. Typography Tier

### Tier 1 — Display (가격/Equity 큰 숫자)

```css
font-family: 'Inter', system-ui;
font-size: 28px ~ 36px (text-4xl ~ text-5xl);
font-weight: 900 (font-black);
line-height: 1.25 (leading-tight);
letter-spacing: -0.02em (tracking-tight);

/* 금지 (안드로이드): tabular-nums, drop-shadow, background-clip:text */
```

**사용처**:
- Portfolio: Equity `$1,234,567` (cardless)
- Premium: Price `$39.99` (PricingCard)
- RechargeCard: `+$5,000` (큰 숫자)
- VIP: 없음 (타이틀만 body)

### Tier 2 — Body (설명 텍스트)

```css
font-family: 'Inter', system-ui;
font-size: 14px (text-sm);
font-weight: 500 (font-medium);
line-height: 1.5 (leading-relaxed);
color: var(--color-text-primary);
```

**사용처**:
- 모든 카드 BODY 섹션
- 리스트 항목 주제
- 라벨 (장문)

### Tier 3 — Caption (라벨/메타)

```css
font-family: 'Inter', system-ui;
font-size: 12px ~ 11px (text-xs ~ text-sm);
font-weight: 700 (font-bold);
color: var(--color-text-secondary) or var(--color-text-muted);
```

**사용처**:
- 카드 HEADER 라벨 (`BOOK`, `LONG`, `ENTRY PRICE`)
- 3-stat 그리드 라벨
- 2차 정보 (타임스탠프, 거래 ID)

### Tier 4 — Mono (시세/정밀 숫자)

```css
font-family: 'JetBrains Mono', ui-monospace;
font-size: 10px (text-[10px]); /* 호가창 용도 */
font-weight: 900 (font-black);
color: var(--color-text-primary);

/* 조건: 크기 < 14px 일 때만 tabular-nums 허용 */
/* 크기 >= 14px 이면 tabular-nums 절대 금지 (안드로이드) */
```

**사용처**:
- OrderBook: 가격, 수량 (text-[10px] tabular-nums OK)
- RecentTrades: 가격 (text-[10px] tabular-nums OK)
- Premium analytics: 숫자 (text-[12px] ~ 14px, tabular-nums 신중)

---

## D. Accent Usage

**정책**: 1 카드 1 accent color. 다색 혼합 금지.

### emerald-400 (`var(--color-accent-long)`)

**의미**: LONG 포지션 / 수익 / 상승 추세

**사용처**:
- TradeTab:
  - ActionPanel LONG 버튼 배경 + text
  - OrderBook bid 호가 (행 background flash)
  - bid 가격 텍스트 색 + neon glow
- Portfolio:
  - Equity card 테두리 (up delta)
  - PnL positive 숫자 색
  - 3-stat grid Margin 라벨 (수익 있을 때)
- VIP:
  - Leaderboard: 포지션 있는 유저 row highlight
- **금지**: rose/gold/violet 같은 카드 영역에 혼합

### rose-400 (`var(--color-accent-short)`)

**의미**: SHORT 포지션 / 손실 / 하강 추세

**사용처**:
- TradeTab:
  - ActionPanel SHORT 버튼 배경 + text
  - OrderBook ask 호가 (행 background flash)
  - ask 가격 텍스트 색 + neon glow
- Portfolio:
  - Equity card 테두리 (down delta)
  - PnL negative 숫자 색
  - Liquidated badge 배경
- VIP:
  - 없음 (리더보드는 neutral)
- **금지**: emerald/gold/violet 혼합

### gold (`var(--color-accent-gold)`) — yellow-400 `rgb(250, 204, 21)`

**의미**: VIP / Lifetime / 럭셔리 / 특별함

**사용처**:
- Portfolio:
  - RechargeCard (idle variant) border + glow
  - "BEST VALUE" 뱃지 배경
- VIP:
  - Podium #1 카드 테두리 + 2-layer glow
  - 👑 메달 외곽 drop-shadow glow
  - 포디움 배경 그라디언트 overlay
- Premium:
  - PricingCard (Lifetime) 테두리 + 그라디언트 overlay
  - 우상단 gold radial glow
  - PRO 뱃지 배경
- **규칙**: 한 화면에 gold 사용 카드는 **최대 1-2개** (overwhelm 방지)

### violet-400 (`var(--color-accent-violet)`) — rgb(167, 139, 250)

**의미**: Premium subscription / 구독 상태 / 프리미엄 기능

**사용처**:
- Premium:
  - SubscriptionStatusCard (Premium 상태) 배경
  - Lock badge 배경 (non-Premium 카드)
  - 모든 analytics card lock overlay
- **금지**: 다른 탭에는 절대 violet 사용

### warning (`var(--color-accent-warning)`) — amber-500 `rgb(229, 160, 48)`

**의미**: 청산 위험 / 높은 레버리지 / 주의

**사용처**:
- TradeTab:
  - ActionPanel leverage >= 20 텍스트 색
  - Distance to liquidation 5~15 숫자 색
- Portfolio:
  - RechargeCard (liquidated variant) border (amber dramatic)
- **금지**: 수익/손실 표시와 혼동 불가

---

## E. Anti-patterns

### ❌ 색상

- `text-green-500` / `text-red-500` 사용 금지
  → 대신 `text-[var(--color-accent-long)]` / `text-[var(--color-accent-short)]`

- 1 카드에 emerald + rose 동시 사용
  → 예: OrderBook 전체를 "bids green, asks red" 혼합은 OK, 하지만 카드 경계/배경은 단색만

- 다색 그라디언트 (e.g., `bg-gradient-to-r from-emerald-400 to-rose-400`)
  → 안 됨. 각 카드는 **모노크롬** 원칙 (base + 1 accent)

### ❌ Shadow & Glow

- `drop-shadow-[0_0_Npx_...]` 큰 텍스트(text-4xl+) 직접 적용
  → **안드로이드 WebView 텍스트 투명 버그 (Stage 8.11 GOTCHAS)**
  → 대신 래퍼 `<div>` 에 `bg-*/30 blur-3xl absolute -z-10` 배경 glow

- 단일 shadow 로 럭셔리 깊이 표현
  → 2-layer shadow 필수: colored radial + 진한 drop shadow

### ❌ Typography

- `tabular-nums` + `font-black` + `text-4xl` 조합
  → **안드로이드 Weight 미지원 문제**
  → text-[10px] 호가창 = OK, text-[28px]+ Equity = 금지

- Cardless 히어로 텍스트에 `background-clip: text` + `color: transparent` gradient
  → **안드로이드 Chrome fallback color 실패로 투명 글자**
  → 대신 solid color text + 배경 blur glow

### ❌ Layout

- border-y divider 리스트 (e.g., `divide-y border-white/10`)
  → 블랙카드/모노크롬 미학과 충돌
  → 대신 각 row 를 `gap-2` 개별 glassmorphism 카드로

- 모든 스크롤 탭에 pb-32/pb-40 만 쓰기
  → **BottomNav(60px) + safe-area(34px) + buffer 합 = 150px+ 필요**
  → 명시적 `pb-[150px]` 사용 (GOTCHAS §Stage 8.8)

---

## F. Tab-by-Tab Migration Map

### 1. TradeTab (`web/src/tabs/TradeTab.tsx`)

**목표**: Binance dense 거래소 톤 유지 + 토큰 마이그레이션

| 컴포넌트 | 현재 스타일 | 토큰화 대상 | 변경 사항 |
|---------|-----------|-----------|---------|
| **OrderBook** (`OrderBook.tsx`) | `bg-slate-900/80 border-white/5` | surface-2 + border-hairline | ✓ surface-2 CSS var로 통일 |
| - bid 가격 | `text-emerald-400` | accent-long | ✓ 변수화 (차수 변경 없음) |
| - ask 가격 | `text-rose-400` | accent-short | ✓ 변수화 |
| - mid price glow | `drop-shadow-[0_0_4px_rgba(52,211,153,0.45)]` | shadow-glow-emerald | ✓ 호가창 낮은 글씨(text-[10px])라 glow OK |
| **ActionPanel** (`ActionPanel.tsx`) | `bg-slate-900/80 border-white/5` | surface-2 | ✓ 통일 |
| - LONG 버튼 | `bg-emerald-500/15 border-emerald-500/40` | accent-long (배경은 50% 투명) | ⚠ 배경 opacity 조정 필요 |
| - SHORT 버튼 | `bg-rose-500/15 border-rose-500/40` | accent-short | ⚠ 배경 opacity |
| **BalanceBar** | `bg-slate-900/80` | surface-2 | ✓ 통일 |
| **RecentTrades** | `bg-slate-900/80` | surface-2 | ✓ 통일 |

**마이그레이션 절차**:
1. ActionPanel + OrderBook + RecentTrades 모두 `background: 'var(--color-surface-2)'` 로 일괄 변경
2. glow shadow (text-[10px] 작은 글씨) 는 `--shadow-glow-*` 변수 사용 OK
3. LONG/SHORT 버튼 배경 색상 emerald/rose 는 유지, 하지만 hex 코드 대신 `var(--color-accent-long)` 참조

---

### 2. PortfolioTab (`web/src/tabs/PortfolioTab.tsx`)

**목표**: Amex Black Card 럭셔리 톤 + cardless 유지

| 컴포넌트 | 현재 스타일 | 토큰화 대상 | 변경 사항 |
|---------|-----------|-----------|---------|
| **Equity Hero** (cardless) | `text-emerald-300` (solid, no shadow) | display-lg + accent-long | ✓ color var만 (shadow NO) |
| **3-stat Grid** | `bg-white/5 border-white/10` | surface-2 + border-subtle | ✓ 통일 (현재 inline style) |
| - Equity delta | emerald(up) / rose(down) 색 변경 | accent-long / accent-short | ✓ 변수화 |
| **Position Card** | `bg-slate-900/80 border-white/5` | surface-2 | ✓ 통일 |
| **History List** | 각 row `bg-white/5 border-white/5` | surface-2 | ✓ 통일 |
| **RechargeCard** (idle) | `gold` 테두리 + glow | border-accent + shadow-glow-gold | ✓ border-accent 사용 (gold hairline) |
| **RechargeCard** (liquidated) | `amber dramatic` 테두리 | accent-warning (border) | ✓ warning color 추가 |

**마이그레이션 절차**:
1. Equity 숫자 cardless 유지 (히어로 텍스트만)
2. 모든 card (3-stat, Position, History) surface-2 + border-hairline 통일
3. RechargeCard 는 현재 gold/amber inline style → tokens 참조로 교체

---

### 3. VIPTab (`web/src/tabs/VIPTab.tsx`)

**목표**: 럭셔리 금메달 포디움 + 리더보드 glassmorphism

| 컴포넌트 | 현재 스타일 | 토큰화 대상 | 변경 사항 |
|---------|-----------|-----------|---------|
| **Podium Top 3** | 각각 glass + gold glow | surface-1 (또는 투명 surface-1.5) + shadow-podium-base | ✓ 2-layer shadow 정의됨 |
| - #1 카드 | `border-yellow-500/50 shadow-[0_0_60px_...]` | border-accent + shadow-glow-gold | ✓ border-accent (gold hairline) |
| - #1 메달 👑 | `drop-shadow-[0_0_12px_rgba(250,204,21,0.7)]` | shadow-glow-gold | ✓ 변수화 |
| **Leaderboard 4-10** | `bg-white/5 border-white/10` (divide-y) | surface-2 + 개별 카드로 변경 | ⚠ divide-y → 개별 card gap 재구성 (GOTCHAS §Stage 8.8) |
| - neutral row | `text-slate-400` | text-secondary | ✓ 변수화 |
| **Ambient Glow** | 우상단 `bg-amber-400/20 blur-[80px]` | 배경 glow (config 진행) | ⚠ 별도 glow rect 토큰화 (현재 scope 외) |

**마이그레이션 절차**:
1. Podium #1/2/3 카드: `bg-[var(--color-surface-1)]` + `border: 1px solid var(--border-accent)`
2. Podium 2-layer shadow 교체: `shadow: var(--shadow-podium-base)`
3. Leaderboard row: divide-y 제거, 각 row 개별 `surface-2 + border-hairline` 카드로 변경 (gap-2)

---

### 4. PremiumTab (`web/src/tabs/PremiumTab.tsx`)

**목표**: Bloomberg Terminal 톤 + 럭셔리 pricing card

| 컴포넌트 | 현재 스타일 | 토큰화 대상 | 변경 사항 |
|---------|-----------|-----------|---------|
| **SubscriptionStatusCard** | 현재 inline style (검정+gold gradient) | 토큰화 진행 중 (Phase D ⑭) | 미포함 (별도 작업) |
| **Analytics Cards** | `ANALYTICS_TOKENS` (bg/border/text) | 기존 ANALYTICS_TOKENS 유지 + 신 tokens 매핑 | ⚠ 하위 호환성 유지 필요 |
| - StatsCard | `T.bgCard` + `T.border` | surface-2 + border-subtle | ✓ mapping 확인 |
| **PricingCard** (Lifetime) | `linear-gradient(135deg, rgba(184,134,11,0.18)...)` | surface-1 + border-accent + shadow-black-card-* | ✓ gold gradient inline 유지 (복잡함) |
| - 가격 텍스트 | `font-black text-4xl` | display-lg (no tabular!) | ✓ typo 변수화 |
| **RechargeCard** (Academy) | `bg-white/10 border-white/10` | surface-2 | ✓ 통일 |
| **LockOverlay** | `bg-black/70` | surface-3 | ✓ 통일 |

**마이그레이션 절차**:
1. ANALYTICS_TOKENS 유지 (legacy), 하지만 내부 값을 새 tokens.ts 참조로 동기화
2. PricingCard 는 현재 inline style 그대로 유지 (gold gradient 복잡함)
3. StatsCard/HourlyBucketsCard/LeverageCard/BehaviorCard 는 ANALYTICS_TOKENS 통해 surface-2 자동 상속
4. LockOverlay: `bg: var(--color-surface-3)` 변경

---

## Validation Checklist

구현 후 검증 항목:

- [ ] 모든 카드 경계색 `var(--border-hairline)` or `var(--border-subtle)` 사용
- [ ] emerald/rose 가격 색상 `var(--color-accent-long)` / `var(--color-accent-short)` 변수화
- [ ] 텍스트 크기 28px+ 는 `tabular-nums` + `drop-shadow` 조합 없음 (안드로이드)
- [ ] gold 테두리/glow 는 `var(--color-accent-gold)` 사용
- [ ] 모든 스크롤 탭 pb-[150px] 이상 확인 (BottomNav 노출)
- [ ] 리더보드 divide-y 제거, 개별 카드 gap-2 로 재구성
- [ ] 모바일 390px 스크린샷: 텍스트 가시성 + 카드 높이 collapse 없음 검증
- [ ] 안드로이드 WebView (Chrome 120+): 큰 숫자 텍스트 투명 버그 없음 확인

---

## Reference

- **Tokens source**: `web/src/styles/tokens.ts` (TypeScript export)
- **CSS variables**: `web/src/styles/tokens.css` (`:root` 정의)
- **Import**: `web/src/index.css` 에서 import (모든 컴포넌트 자동 접근)
- **GOTCHAS**: `/GOTCHAS.md` §Stage 7.8 ~ 8.12 안드로이드 이슈
