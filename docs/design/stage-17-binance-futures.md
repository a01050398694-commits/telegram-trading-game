# Design: Stage 17 — Binance Futures 7기능 추가 (Limit Orders + Position Management + Enhanced Charts)

> **변경 기록**: Stage 16 카드 톤 가이드 + tokens 정책 100% 준수. 신규 토큰 0 추가.
> **계획**: Phase F(Limit Order 3일) → Phase G(Partial Close 2일) → Phase H(Charts 2일).

---

## 0. Design Principles

**4대 원칙**:

1. **Binance 모바일 앱 동등성** — 트레이더 친숙도. Limit/Stop 탭, Partial Close 4버튼, 10단 호가 모두 상업용 거래소 UX 매칭.
2. **한 화면 한 임무** — Trade 탭 = "주문 내기", Portfolio = "검토", 화면 전환 시 context loss 최소화.
3. **토큰 100% 재사용** — 기존 surface-1/2/3 + accent-long/short/gold/violet/warning 내에서 모두 해결. 새 색상 금지.
4. **카드 잘림 Zero** — GOTCHAS Stage 15.8 flex squish fix (`shrink-0` + minHeight + pb-[260px]) 절대 위반 금지.
5. **안드로이드 금지조합 회피** — `drop-shadow + tabular-nums + bg-clip` 3개 동시 사용 금지 (Stage 8.11 누적).

---

## 1. TradeTab 새 레이아웃 (top → bottom 단일 스크롤)

**왜 레이아웃 변경**: 
- 현재 Stage 16: Header → CoinSelector → Chart → OrderBook/RecentTrades → ActionPanel 순서
- **Stage 17 추가물**: TimeframeRow(차트 위), IndicatorToggles(차트 옆), OrderTypeTabs(ActionPanel 상단 3탭), SlTpInputs(조건부), OpenOrdersCard(ActionPanel 아래)
- 기존 flex 3단(TOP/MIDDLE/BOTTOM) 구조에 newCard들이 쌓이면 MIDDLE 수축 → 차트/호가 잘림
- **해결책**: Stage 8.7 단일 스크롤 유지하되, 신규 섹션 높이 명시 + pb 증가

### ASCII Wireframe (375px 모바일 기준)

```
┌──────────────────────────────────┐ 
│ Header (Price, 24h stats)        │  shrink-0, h-auto
├──────────────────────────────────┤
│ FundingTicker ($0.0123/h)        │  shrink-0, h-10
├──────────────────────────────────┤
│ CoinSelector: BTC ▼              │  shrink-0, h-10
│ MarginModeChip: [Isolated]       │  ← 신규, 옆에 인라인
├──────────────────────────────────┤
│ TimeframeRow: [1m|5m|15m|...]    │  ← 신규, shrink-0, h-9
├──────────────────────────────────┤
│ TradingChart                     │  shrink-0, h-[350px]
│ (lightweight-charts v5)          │
├──────────────────────────────────┤
│ IndicatorToggles [MA20] [Vol]    │  ← 신규, shrink-0, h-9
├──────────────────────────────────┤
│ OrderBook (10단) | RecentTrades  │  grid-cols-2, shrink-0, h-[220px]
│ (10행)                           │
├──────────────────────────────────┤
│ ┌─ OrderTypeTabs ─────────────┐ │  ← 신규, shrink-0, h-9
│ │ [Market] [Limit] [Stop]     │ │
│ └─────────────────────────────┘ │
│ ┌─ Market 선택 상태 ───────────┐ │  ← 슬라이더/사이즈/레버리지
│ │ Leverage slider + Size + ...  │ │
│ │ [25%] [50%] [75%] [100%]    │ │ (포지션 있을 때만 부분청산)
│ │ [LONG]   [SHORT]             │ │
│ └─────────────────────────────┘ │
│ ┌─ SlTpInputs (토글) ─────────┐ │  ← 신규, optional collapse
│ │ TP Price: [___________]      │ │
│ │ SL Price: [___________]      │ │
│ └─────────────────────────────┘ │
│ ActionPanel 전체 shrink-0       │
├──────────────────────────────────┤
│ OpenOrdersCard (미체결 주문)    │  ← 신규, shrink-0, min-h-[60px]
│ [LIMIT BUY 0.5 BTC @ $63,200]  │
│ [LIMIT SELL 1 ETH @ $2,400]    │
│ [Cancel ✕] [Cancel ✕]         │
├──────────────────────────────────┤
│ BalanceBar                       │  shrink-0, h-16
│                                  │
│ (물리 스페이서 h-[260px])        │  pb용 여백
└──────────────────────────────────┘
```

**높이 계산 (iPhone SE 375×667)**:
- Header: ~48px
- FundingTicker: 40px
- CoinSelector + MarginModeChip: 40px
- TimeframeRow: 36px
- TradingChart: 350px (shrink-0 고정)
- IndicatorToggles: 36px
- OrderBook/RecentTrades: 220px
- **ActionPanel (신규 tabs 포함)**: 280~350px (Limit input, SlTp inputs, Position close 추가)
- OpenOrdersCard: 60~150px (미체결 주문 수에 따라 scroll)
- BalanceBar: 64px
- **Total: ~1200px+** → **pb-[260px] 필수** (기존 pb-[200px]은 부족)

---

## 2. ActionPanel 대형 재구성 (Stage 17 핵심)

### 2.1 OrderTypeTabs (신규 컴포넌트)

**위치**: ActionPanel 카드 상단  
**높이**: h-9 (36px)  
**분기**: 3개 탭으로 ActionPanel 콘텐츠 전환

```tsx
// pseudo-code (실제 구현은 frontend-developer)
<div className="flex gap-1 border-b border-[var(--border-hairline)]">
  {['market', 'limit', 'stop'].map(type => (
    <button
      key={type}
      onClick={() => onOrderTypeChange(type)}
      className={`
        flex-1 py-2 px-3 text-sm font-bold rounded-t-lg
        transition-colors ${duration-fast} ${easing-ease-out}
        ${activeType === type
          ? 'bg-amber-500/15 text-white border-b-2 border-amber-400'
          : 'bg-slate-800/50 text-slate-400 hover:text-slate-300'}
      `}
    >
      {t(`orderType.${type}`)}
    </button>
  ))}
</div>
```

**Tailwind classes**:
- Active state: `bg-amber-500/15` (accent warning, Stage 7.8 luxury accent) + `border-b-2 border-amber-400`
- Inactive: `bg-slate-800/50 text-slate-400`
- Hover: `hover:text-slate-300`
- Motion: `transition-colors duration-150 ease-out`
- Accessibility: `focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-400`

**State tree**:
```
orderType: 'market' | 'limit' | 'stop'
```

---

### 2.2 ActionPanel 내부 분기 구조

#### 2.2a. Market 선택 (현재 로직 유지)

**콘텐츠**:
```
Leverage Slider: 1x ~ 125x (Stage 5.5 기존)
Size % Selector: [25%] [50%] [75%] [100%] 또는 input
Long/Short 버튼

+ [Optional] SlTpInputs 토글 펼침
```

**이미 구현된 부분**: `leverage` state + `sizePct` state + 슬라이더 UI  
**신규 추가**: SlTpInputs toggle 위치 확인 (아래 섹션)

#### 2.2b. Limit 선택 (신규)

**콘텐츠**:
```
Limit Price Input:
  ┌──────────────────────────────────┐
  │ Limit Price: [$__________]       │  ← number input
  │              [Last] [Mid] [+5%]  │  ← 빠른 입력 버튼
  └──────────────────────────────────┘

(Mark Price: $63,250 표시 — 참고용)

Leverage: 1x ~ 125x (SliderInput)
Size %: [25%] [50%] [75%] [100%]

+ SlTpInputs (optional)

[LONG]  [SHORT]  ← 주문 생성 버튼
```

**LimitPriceInput component**:
```tsx
type LimitPriceInputProps = {
  value: number | null;
  onChange: (price: number | null) => void;
  markPrice: number | null;  // 참고용 표시
};

// 버튼들:
// - [Last]: 마지막 거래 가격 (RecentTrades 최상단)
// - [Mid]: (bid + ask) / 2 (OrderBook 계산)
// - [+5%]: markPrice * 1.05 (long일 때), markPrice * 0.95 (short일 때)
```

**Tailwind 클래스**:
- Input: `border border-[var(--border-hairline)] bg-[var(--color-surface-2)] rounded-lg px-3 py-2 text-sm font-mono`
- Quick buttons: `text-[11px] font-bold bg-slate-700/50 hover:bg-slate-600 px-2 py-1 rounded`

#### 2.2c. Stop 선택 (신규, Phase G 범위 재조정 → Phase H로 미룸)

**범위 재조정**: Stage 17 스펙에는 SL/TP 가 있지만, 명시적 "Stop" 탭은 실제로는 **Limit 탭 내에서 선택**으로 구현하는 게 UX상 나음.

> [DECISION] Stop Loss/Take Profit 의 실제 UX:
> - **방법 1** (현재 설계): "Stop" 탭 = SL/TP 별도 입력 (다소 복잡)
> - **방법 2** (권장): "Limit" 탭 내에서 SL/TP 는 "추가 옵션" 토글로 처리
> 
> **최종 결정**: Phase F/G 에서는 **Limit + SlTp 옵션** 만 구현, 순수 "Stop" 탭은 Phase H 에서 재검토.

따라서 **현 설계에서는 Market/Limit/Stop 3탭이지만, Stop 은 "coming soon" 상태로 disabled 처리**.

---

### 2.3 SlTpInputs (신규 컴포넌트)

**위치**: ActionPanel 내부, Leverage/Size 아래, LONG/SHORT 버튼 위  
**상태**: 토글 `[+ TP/SL]` 클릭으로 펼침  
**높이**: 접힘 0px / 펼침 ~80px

```tsx
type SlTpInputsProps = {
  slPrice: number | null;
  tpPrice: number | null;
  onSlTpChange: (args: { slPrice?: number | null; tpPrice?: number | null }) => void;
  markPrice: number | null;
};

// UI structure
<div className="border-t border-[var(--border-hairline)] pt-2 mt-2">
  <button
    onClick={() => setExpanded(!expanded)}
    className="text-[12px] font-bold text-slate-400 hover:text-white"
  >
    {expanded ? '- TP/SL' : '+ TP/SL'}
  </button>

  {expanded && (
    <div className="space-y-2 mt-2">
      <input
        placeholder={t('slTp.tp')}
        value={tpPrice ?? ''}
        onChange={e => onSlTpChange({ tpPrice: e.target.value ? Number(e.target.value) : null })}
        className="w-full border border-[var(--border-hairline)] ..."
      />
      <input
        placeholder={t('slTp.sl')}
        value={slPrice ?? ''}
        onChange={e => onSlTpChange({ slPrice: e.target.value ? Number(e.target.value) : null })}
        className="w-full border border-[var(--border-hairline)] ..."
      />
    </div>
  )}
</div>
```

**Tailwind 클래스**:
- Input field: `w-full border border-[var(--border-hairline)] bg-[var(--color-surface-2)] rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-400/50`
- Toggle button: `text-[12px] font-bold text-slate-400 hover:text-white transition-colors duration-150`

**토큰 매핑**:
- border: `--border-hairline`
- bg: `--color-surface-2`
- focus ring: amber-400 (warning accent, Stage 7.8)

---

### 2.4 PartialCloseControls (신규 컴포넌트, 포지션 카드 내부)

**위치**: ActionPanel → Position rendering 경로에서 포지션이 존재할 때만 표시  
**위치상세**: 기존 "Close Position" 전체 버튼 → "Partial Close" 4버튼 행 + "Full Close" 100% 버튼

```tsx
type PartialCloseControlsProps = {
  positionSize: number;
  balance: number;
  onClose: (pct: 25 | 50 | 75 | 100) => void;
  pending?: boolean;
  error?: string | null;
};

<div className="space-y-2">
  <div className="grid grid-cols-4 gap-1">
    {[25, 50, 75, 100].map(pct => (
      <button
        key={pct}
        onClick={() => onClose(pct as 25 | 50 | 75 | 100)}
        disabled={pending}
        className={`
          py-2 px-2 text-xs font-bold rounded-lg
          border border-[var(--border-hairline)]
          bg-gradient-to-b from-rose-500/20 to-rose-600/10
          text-rose-400
          hover:from-rose-500/30 hover:to-rose-600/20
          active:scale-[0.96]
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-all duration-150
        `}
      >
        {pct}%
      </button>
    ))}
  </div>

  {error && (
    <p className="text-[11px] text-rose-400 text-center">{error}</p>
  )}
</div>
```

**Tailwind 클래스**:
- Button base: `text-xs font-bold rounded-lg border border-[var(--border-hairline)]`
- Background: `bg-gradient-to-b from-rose-500/20 to-rose-600/10` (close = rose color, Stage 7.8)
- Text: `text-rose-400`
- Hover: `hover:from-rose-500/30 hover:to-rose-600/20`
- Active press: `active:scale-[0.96] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.35)]`
- Disabled: `disabled:opacity-50 disabled:cursor-not-allowed`

**토큰 매핑**:
- border: `--border-hairline`
- color: rose-400 (accent-short, Stage 7.8 "닫기" = 손실 색)

**확인 다이얼로그** [DECISION]:
- 단계 1 구현에서는 즉시 청산 (no confirm)
- 단계 2에서 필요 시 추가

---

### 2.5 MarginModeChip (신규 컴포넌트)

**위치**: CoinSelector 바로 오른쪽 (같은 행)  
**높이**: h-9 (36px)  
**상태**: "Isolated" / "Cross" 토글 (현재 단계에서는 UI only)

```tsx
type MarginModeChipProps = {
  mode: 'isolated' | 'cross';
  onChange: (mode: 'isolated' | 'cross') => void;
  disabled?: boolean;
};

<div className="flex gap-1 rounded-lg bg-[var(--color-surface-2)] border border-[var(--border-subtle)] p-1">
  {['isolated', 'cross'].map(m => (
    <button
      key={m}
      onClick={() => {
        if (m === 'cross') {
          toast(t('marginMode.comingSoon'));
          return;
        }
        onChange(m as 'isolated' | 'cross');
      }}
      disabled={disabled}
      className={`
        px-2 py-1 text-xs font-bold rounded-md
        transition-colors duration-150
        ${mode === m
          ? 'bg-violet-500/20 text-violet-400 border border-violet-500/50'
          : 'bg-slate-800/50 text-slate-400 hover:text-slate-300'}
      `}
    >
      {t(`marginMode.${m}`)}
    </button>
  ))}
</div>
```

**Tailwind 클래스**:
- Container: `flex gap-1 rounded-lg bg-[var(--color-surface-2)] border border-[var(--border-subtle)] p-1`
- Active button: `bg-violet-500/20 text-violet-400 border border-violet-500/50` (violet = premium, Stage 16)
- Inactive: `bg-slate-800/50 text-slate-400 hover:text-slate-300`

**토큰 매핑**:
- bg: `--color-surface-2`
- border: `--border-subtle` (white/10)
- accent: violet-400 (premium color, Stage 16 tokens)
- motion: `transition-colors duration-150 ease-out`

**기능**: 
- Isolated 선택 → State 업데이트, 아무 일 없음 (isolated 만 동작)
- Cross 선택 → Toast 팝업 "Cross margin coming soon 통합 마진 곧 출시" → State 는 isolated 유지

---

## 3. OpenOrdersCard (신규 컴포넌트)

**위치**: ActionPanel 바로 아래 (TradeTab 레이아웃에서)  
**높이**: min-h-[60px], 내용에 따라 확장 (max-h-[200px] 이후 scroll)  
**상태 3가지**:
- Empty: "No open orders" 텍스트만
- Pending orders exist: 테이블 행들
- Error: 에러 메시지

### 3.1 Empty State

```tsx
<div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--color-surface-2)] p-4 text-center">
  <p className="text-sm text-slate-400">{t('orders.noOrders')}</p>
</div>
```

### 3.2 Orders Present

```tsx
<div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--color-surface-2)] p-3 space-y-2 max-h-[200px] overflow-y-auto">
  <div className="flex items-center justify-between pb-2 border-b border-[var(--border-hairline)]">
    <span className="text-[11px] font-bold text-slate-400">
      {t('orders.open')} ({orders.length})
    </span>
    {orders.length > 0 && (
      <button
        onClick={onCancelAll}
        className="text-[11px] font-bold text-rose-400 hover:text-rose-300"
      >
        {t('orders.cancelAll')}
      </button>
    )}
  </div>

  {orders.map(order => (
    <div
      key={order.id}
      className="flex items-center justify-between text-[12px] rounded-md border border-[var(--border-hairline)] bg-slate-800/30 px-2.5 py-2"
    >
      <div className="flex-1">
        <span className="font-bold text-slate-200">
          {order.type === 'limit'
            ? t('orderType.limit').toUpperCase()
            : t('orderType.stop_loss').toUpperCase()}
        </span>
        {' '}
        <span className={order.side === 'long' ? 'text-emerald-400' : 'text-rose-400'}>
          {order.side.toUpperCase()}
        </span>
        {' '}
        <span className="text-slate-300">
          {formatMoney(order.size, 0)} @ {formatUSD(order.price)}
        </span>
      </div>
      <button
        onClick={() => onCancelOrder(order.id)}
        className="ml-2 text-slate-400 hover:text-rose-400 transition-colors"
        title={t('orders.cancel')}
      >
        ✕
      </button>
    </div>
  ))}
</div>
```

**Tailwind 클래스**:
- Card: `rounded-xl border border-[var(--border-hairline)] bg-[var(--color-surface-2)] p-3`
- Item row: `flex items-center justify-between text-[12px] rounded-md border border-[var(--border-hairline)] bg-slate-800/30 px-2.5 py-2`
- Cancel button: `text-slate-400 hover:text-rose-400 transition-colors duration-150`
- Header: `text-[11px] font-bold text-slate-400`

**토큰 매핑**:
- surface: `--color-surface-2`
- border: `--border-hairline`
- accent (side colors): emerald-400 (long), rose-400 (short)

**Props**:
```tsx
type OpenOrdersCardProps = {
  orders: ServerOrder[];  // from API
  onCancelOrder: (orderId: string) => void;
  onCancelAll: () => void;
  pending?: boolean;
  error?: string | null;
};
```

---

## 4. TimeframeRow (신규 컴포넌트)

**위치**: TradingChart 바로 위  
**높이**: h-9 (36px)  
**콘텐츠**: 6개 칩 버튼 [1m] [5m] [15m] [1h] [4h] [1d]  
**상태**: localStorage 기억 또는 per-symbol 마지막 선택

```tsx
type TimeframeRowProps = {
  activeFrame: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
  onChange: (frame: '1m' | '5m' | '15m' | '1h' | '4h' | '1d') => void;
};

const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;

<div className="flex gap-1 justify-center shrink-0">
  {TIMEFRAMES.map(frame => (
    <button
      key={frame}
      onClick={() => onChange(frame)}
      className={`
        px-2.5 py-1.5 text-[11px] font-bold rounded-md
        transition-all duration-150 ease-out
        ${activeFrame === frame
          ? 'bg-amber-500/20 text-amber-300 border-b-2 border-amber-400 border-t border-l border-r border-[var(--border-hairline)]'
          : 'bg-slate-800/50 text-slate-400 border border-[var(--border-hairline)] hover:bg-slate-700 hover:text-slate-300'}
      `}
    >
      {frame}
    </button>
  ))}
</div>
```

**Tailwind 클래스**:
- Active: `bg-amber-500/20 text-amber-300 border-b-2 border-amber-400` (gold accent, Stage 7.8)
- Inactive: `bg-slate-800/50 text-slate-400 border border-[var(--border-hairline)]`
- Hover: `hover:bg-slate-700 hover:text-slate-300`
- Motion: `transition-all duration-150 ease-out`

**토큰 매핑**:
- Active accent: amber-400/300 (timeframe = 시간 개념, gold는 시간대 표시 컨벤션)
- border: `--border-hairline`
- surface: slate-800

**[DECISION] localStorage 정책**:
- **선택 1**: 코인별 timeframe 기억 (BTC = 1h, ETH = 5m)
- **선택 2**: 전역 timeframe (모든 코인 동일, 마지막 선택값)

> 현재 권장: **선택 2 (전역)**. 모바일 UX에서 코인 전환 시 타임프레임까지 바뀌면 혼란 가능. 마지막 사용한 프레임으로 고정이 더 직관적.

---

## 5. IndicatorToggles (신규 컴포넌트)

**위치**: TradingChart 바로 아래 (또는 우상단 floating)  
**높이**: h-8 (32px)  
**콘텐츠**: 2개 토글 [MA20] [Volume]

```tsx
type IndicatorTogglesProps = {
  indicators: { ma20: boolean; volume: boolean };
  onChange: (key: 'ma20' | 'volume', value: boolean) => void;
};

<div className="flex gap-2 shrink-0 px-1">
  {['ma20', 'volume'].map(key => (
    <button
      key={key}
      onClick={() => onChange(key as 'ma20' | 'volume', !indicators[key as 'ma20' | 'volume'])}
      className={`
        px-2.5 py-1 text-[10px] font-bold rounded-md
        transition-all duration-150
        ${indicators[key as 'ma20' | 'volume']
          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
          : 'bg-slate-800/50 text-slate-400 border border-[var(--border-hairline)]'}
      `}
    >
      {t(`indicators.${key}`)}
    </button>
  ))}
</div>
```

**Tailwind 클래스**:
- Active: `bg-emerald-500/20 text-emerald-300 border border-emerald-500/50` (ma/volume = 데이터, 적 용 시 emerald = positive)
- Inactive: `bg-slate-800/50 text-slate-400 border border-[var(--border-hairline)]`
- Motion: `transition-all duration-150`

**토큰 매핑**:
- active accent: emerald-400 (indicator enabled = data insight, long color 대여)
- border: `--border-hairline`

**[DECISION] 위치**:
- **위치 A** (권장): Chart 바로 아래, 가로 flex row (현재 TimeframeRow 아래 배치)
- **위치 B**: Chart 우상단 floating badge

> 현재 권장: **위치 A (row layout)**. 우상단 floating 은 터치 잘못 가능성 + 차트 데이터 obscure risk.

---

## 6. OrderBook 5단 → 10단 확장

**위치**: OrderBook 컴포넌트 (기존 위치 유지)  
**변경**: `rows={5}` → `rows={10}`  
**depth bar**: 현재 한쪽(bids)만 → 양쪽 모두 시각화

### 6.1 OrderBook 렌더 변경

```tsx
// 기존
<OrderBook symbol={symbol} midPrice={feed.price} rows={5} />

// 신규 (Stage 17)
<OrderBook symbol={symbol} midPrice={feed.price} rows={10} />
```

### 6.2 내부 Depth Bar 강화

```tsx
// OrderBook.tsx 내부
type DepthBar = {
  type: 'bid' | 'ask';
  size: number;
  maxSize: number;  // largest bid/ask size in last 10
};

// Render
<div className="flex items-center">
  {/* Bid depth (left-aligned) */}
  {type === 'bid' && (
    <div
      className="bg-emerald-500/10 rounded-sm flex-shrink-0"
      style={{
        width: `${(size / maxSize) * 100}%`,
        minWidth: '1px'
      }}
      aria-hidden="true"
    />
  )}
  
  {/* Price/Qty center */}
  <span className="text-[10px] font-mono tabular-nums text-center flex-1">
    {formatUSD(price)} {formatMoney(size, 0)}
  </span>

  {/* Ask depth (right-aligned) */}
  {type === 'ask' && (
    <div
      className="bg-rose-500/10 rounded-sm flex-shrink-0 ml-auto"
      style={{
        width: `${(size / maxSize) * 100}%`,
        minWidth: '1px'
      }}
      aria-hidden="true"
    />
  )}
</div>
```

**Tailwind 클래스**:
- Bid bar: `bg-emerald-500/10` (long color, Stage 7.8)
- Ask bar: `bg-rose-500/10` (short color)
- Text: `text-[10px] font-mono tabular-nums` (숫자 폭 일관성, 크기 < 14px 이므로 tabular-nums OK)

**Height 증가**:
- 5행 × (~28px per row) ≈ 140px
- 10행 × (~22px per row) ≈ 220px → 기존 180px 대비 +40px

---

## 7. RecentTrades 행 강조 ($10K+)

**위치**: RecentTrades 컴포넌트 (기존 위치 유지)  
**변경**: 큰 체결(>$10,000 USD)시 배경 강조 + 1초 pulse

```tsx
// RecentTrades.tsx 내부
const isLargeTrade = (size: number, price: number) => {
  return size * price >= 10000;  // $10K USD threshold
};

// Render
{trades.map(trade => (
  <div
    key={trade.id}
    className={`
      flex justify-between text-[9px] py-[2px]
      transition-colors duration-500 ease-out
      ${isLargeTrade(trade.size, trade.price)
        ? 'bg-amber-400/20 rounded px-1'
        : ''}
    `}
  >
    {/* qty price time */}
  </div>
))}
```

**Tailwind 클래스**:
- Large trade highlight: `bg-amber-400/20` (amber = attention, Stage 16)
- Animation: `transition-colors duration-500 ease-out` (1초 fade)
- Rounded: `rounded px-1` (강조 박스 느낌)

**토큰 매핑**:
- highlight color: amber-400 (warning/attention accent)

---

## 8. PortfolioTab 의 OrderHistorySection (신규)

**위치**: PortfolioTab 기존 history 섹션 확장  
**높이**: max-h-[300px] overflow-y-auto  
**콘텐츠**: 체결/취소된 주문 목록

### 8.1 OrderHistorySection 구조

```tsx
type OrderHistoryProps = {
  orders: Order[];  // filled/cancelled/triggered
  symbol?: string;  // optional filter
};

<div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--color-surface-2)] p-3">
  <div className="flex items-center justify-between pb-2 border-b border-[var(--border-hairline)]">
    <span className="text-[11px] font-bold text-slate-400">
      {t('orders.history')}
    </span>
    
    {/* Filter chips (optional) */}
    <div className="flex gap-1">
      {['all', 'filled', 'cancelled'].map(filter => (
        <button
          key={filter}
          onClick={() => onFilterChange(filter)}
          className={`text-[9px] font-bold px-2 py-1 rounded ${
            activeFilter === filter
              ? 'bg-amber-500/20 text-amber-300'
              : 'bg-slate-800/50 text-slate-400'
          }`}
        >
          {t(`orders.filter.${filter}`)}
        </button>
      ))}
    </div>
  </div>

  {/* Order rows */}
  <div className="space-y-1 max-h-[250px] overflow-y-auto">
    {filteredOrders.map(order => (
      <div
        key={order.id}
        className="text-[11px] p-2 rounded-md border border-[var(--border-hairline)] bg-slate-800/30"
      >
        <div className="flex justify-between items-center">
          <span className="font-bold">
            {order.type === 'limit' ? 'LIMIT' : 'STOP'}{' '}
            <span className={order.side === 'long' ? 'text-emerald-400' : 'text-rose-400'}>
              {order.side.toUpperCase()}
            </span>
          </span>
          <span className={`font-bold ${
            order.status === 'filled'
              ? 'text-emerald-400'
              : order.status === 'triggered'
              ? 'text-amber-400'
              : 'text-slate-400'
          }`}>
            {t(`orders.status.${order.status}`)}
          </span>
        </div>
        <div className="text-slate-300 mt-1">
          {formatMoney(order.size, 0)} @ {formatUSD(order.price)}{' '}
          {order.filledAt && (
            <span className="text-slate-500 text-[10px]">
              • {formatTime(order.filledAt)}
            </span>
          )}
        </div>
      </div>
    ))}
  </div>
</div>
```

### 8.2 상태 배지 색상

| 상태 | 색상 | 의미 |
|------|------|------|
| filled | emerald-400 | 체결됨 (수익 = long 느낌) |
| cancelled | slate-400 | 취소됨 (neutral) |
| triggered | amber-400 | 트리거됨 (SL/TP 작동) |
| expired | slate-500 | 만료됨 (미사용) |

**토큰 매핑**:
- Card: `--color-surface-2` + `--border-hairline`
- Status colors: 기존 accent 사용 (emerald/amber/slate)

**[DECISION] 분리 vs 통합**:
- **선택 1**: 기존 trade history (포지션 청산 히스토리) + 신규 order history (Limit/Stop 히스토리) 통합
- **선택 2**: 분리 (Orders tab, Trade History tab)

> 현재 권장: **선택 1 (통합)**. PortfolioTab 에서 하나의 "Transaction History" 섹션으로 모두 표시. filter chips 로 구분.

---

## 9. 토큰 매핑 테이블

| 컴포넌트 | Surface | Border | Accent | Shadow | Motion |
|---------|---------|--------|--------|--------|--------|
| OrderTypeTabs | 2 | hairline | amber (active) | flat | ease-out 150ms |
| LimitPriceInput | 2 | hairline | — | flat | — |
| SlTpInputs | 2 | subtle | warning (focus ring) | flat | ease-out 150ms |
| OpenOrdersCard | 2 | hairline | — | lifted | — |
| OrderHistorySection | 2 | hairline | emerald/amber/slate | flat | — |
| PartialCloseControls | (inline) | hairline | rose | flat | ease-out 150ms + active scale |
| TimeframeRow | slate-800 | hairline | amber (active) | — | ease-out 150ms |
| IndicatorToggles | slate-800 | hairline | emerald (active) | — | ease-out 150ms |
| MarginModeChip | 2 | subtle | violet (active) | flat | ease-out 150ms |
| OrderBook (10단) | 2 | hairline | emerald/rose (depth) | lifted | — |
| RecentTrades (highlight) | 2 | hairline | amber (>$10K) | flat | 500ms ease-out |

**CSS 변수 인용**:
- `--color-surface-1`: rgba(15, 23, 42, 0.95)
- `--color-surface-2`: rgba(30, 41, 59, 0.8)
- `--color-surface-3`: rgba(10, 10, 10, 0.7)
- `--border-hairline`: rgba(255, 255, 255, 0.05)
- `--border-subtle`: rgba(255, 255, 255, 0.1)
- `--color-accent-long`: rgb(52, 211, 153) [emerald-400]
- `--color-accent-short`: rgb(251, 113, 133) [rose-400]
- `--color-accent-gold`: rgb(250, 204, 21) [yellow-400]
- `--color-accent-violet`: rgb(167, 139, 250) [violet-400]
- `--color-accent-warning`: rgb(229, 160, 48) [amber-500]
- `--shadow-flat`: 0 1px 2px rgba(0, 0, 0, 0.5)
- `--shadow-lifted`: 0 4px 12px rgba(0, 0, 0, 0.3)
- `--duration-fast`: 150ms
- `--easing-ease-out`: cubic-bezier(0.16, 1, 0.3, 1)

---

## 10. i18n 신규 키 (6개 locale: en/ko/ja/zh/es/fr)

### 10.1 Order Types

```json
{
  "orderType": {
    "market": "Market",
    "limit": "Limit",
    "stop_loss": "Stop Loss",
    "take_profit": "Take Profit"
  }
}
```

| Key | EN | KO |
|-----|-----|-----|
| orderType.market | Market | 시장가 |
| orderType.limit | Limit | 지정가 |
| orderType.stop_loss | Stop Loss | 손절가 |
| orderType.take_profit | Take Profit | 익절가 |

### 10.2 Orders & Actions

```json
{
  "orders": {
    "open": "Open Orders",
    "history": "Order History",
    "cancel": "Cancel",
    "cancelAll": "Cancel All",
    "noOrders": "No open orders",
    "status": {
      "pending": "Pending",
      "filled": "Filled",
      "cancelled": "Cancelled",
      "triggered": "Triggered",
      "expired": "Expired"
    },
    "filter": {
      "all": "All",
      "filled": "Filled",
      "cancelled": "Cancelled"
    }
  }
}
```

| Key | EN | KO |
|-----|-----|-----|
| orders.open | Open Orders | 미체결 주문 |
| orders.history | Order History | 주문 내역 |
| orders.cancel | Cancel | 취소 |
| orders.cancelAll | Cancel All | 전체 취소 |
| orders.noOrders | No open orders | 미체결 주문 없음 |
| orders.status.pending | Pending | 미체결 |
| orders.status.filled | Filled | 체결 |
| orders.status.cancelled | Cancelled | 취소됨 |
| orders.status.triggered | Triggered | 발동됨 |

### 10.3 Partial Close

```json
{
  "partialClose": {
    "title": "Close Position",
    "pct25": "25%",
    "pct50": "50%",
    "pct75": "75%",
    "pct100": "100%",
    "confirm": "Close X% of position?"
  }
}
```

| Key | EN | KO |
|-----|-----|-----|
| partialClose.title | Close Position | 청산 |
| partialClose.pct25 | 25% | 25% |
| partialClose.pct50 | 50% | 50% |
| partialClose.pct75 | 75% | 75% |
| partialClose.pct100 | 100% | 100% |
| partialClose.confirm | Close X% of position? | X% 청산하시겠습니까? |

### 10.4 Margin Mode

```json
{
  "marginMode": {
    "isolated": "Isolated",
    "cross": "Cross",
    "comingSoon": "Cross margin coming soon"
  }
}
```

| Key | EN | KO |
|-----|-----|-----|
| marginMode.isolated | Isolated | 격리 |
| marginMode.cross | Cross | 통합 |
| marginMode.comingSoon | Cross margin coming soon | 통합 마진 곧 출시 |

### 10.5 SL/TP

```json
{
  "slTp": {
    "sl": "Stop Loss",
    "tp": "Take Profit"
  }
}
```

| Key | EN | KO |
|-----|-----|-----|
| slTp.sl | Stop Loss | 손절가 |
| slTp.tp | Take Profit | 익절가 |

### 10.6 Timeframes

```json
{
  "timeframe": {
    "1m": "1m",
    "5m": "5m",
    "15m": "15m",
    "1h": "1h",
    "4h": "4h",
    "1d": "1d"
  }
}
```

> 숫자는 번역 불필요 (그대로 사용)

### 10.7 Indicators

```json
{
  "indicators": {
    "ma20": "MA20",
    "volume": "Volume"
  }
}
```

| Key | EN | KO |
|-----|-----|-----|
| indicators.ma20 | MA20 | MA20 |
| indicators.volume | Volume | 거래량 |

---

## 11. Accessibility Checklist

- [ ] **OrderTypeTabs**: Tab 키로 3개 탭 순환, Enter/Space 로 선택. `role="tablist"` + `role="tab"` 마크업.
- [ ] **LimitPriceInput**: `<input type="number">` + `aria-label="Limit Price"`. Quick buttons 에도 `aria-label` .
- [ ] **SlTpInputs**: Toggle button 에 `aria-expanded`. Inputs 에 `aria-describedby="sltp-error"` (에러 시).
- [ ] **OpenOrdersCard**: Cancel 버튼 에 `aria-label="Cancel order {orderId}"`. 스크린리더가 주문 내용 읽어줌.
- [ ] **TimeframeRow**: `role="group"` + `aria-label="Chart timeframe"`. Active 버튼 `aria-current="true"`.
- [ ] **PartialCloseControls**: 각 버튼 `aria-label="Close 25% of position"` 등.
- [ ] **Color 비의존성**: 모든 상태가 색상만으로 표현 X. Badge/icon/text 조합.
- [ ] **Focus ring**: 모든 interactive element 에 `focus:ring-2 focus:ring-offset-2 focus:ring-amber-400/50` (또는 테마색).
- [ ] **Mobile touch**: 최소 44x44px touch target (버튼/input 모두).

---

## 12. 카드 잘림 방지 (GOTCHAS Stage 15.8 + 8.8)

### 12.1 TradeTab 레이아웃 검증

```css
/* 루트 컨테이너 */
.trade-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;  /* flex squeeze 방지 */
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: 260px;  /* 기존 200px → 260px 증가 (OpenOrdersCard 추가) */
}

/* 모든 신규 카드 */
.card-new {
  flex-shrink: 0;  /* flex 자식에서 수축 금지 */
  min-height: 60px;  /* 빈 상태에서도 38px 미만 압축 X */
  border: 1px solid var(--border-hairline);
  background-color: var(--color-surface-2);
  border-radius: var(--radius-lg);
  padding: 12px;
}

/* 스페이서 (물리적 여백) */
.spacer {
  flex-shrink: 0;
  height: 260px;
  pointer-events: none;
  aria-hidden: true;
}
```

### 12.2 검증 게이트 (Phase 끝마다)

**TradeTab height ranges** (mobile 375px 기준):
- Empty state (no position): 600~800px 뷰포트에 수평으로 보여야 함 (pb-260 포함 시 scrollbar 있음 OK)
- With position: 800~1200px (actionpanel 크기 증가)

**OrderBook/RecentTrades**:
- rows={10} 확장 후 높이 220px 유지 확인 (text-[9px] 컴팩트 모드)

**OpenOrdersCard**:
- 주문 5개 이상: max-h-[200px] 자동 scroll 작동 확인

---

## 13. 안드로이드 금지조합 회피 (Stage 8.11 GOTCHAS)

### 13.1 금지 조합

```css
/* ❌ 금지: 큰 텍스트 + drop-shadow + tabular-nums + bg-clip */

/* ❌ WRONG */
.big-number {
  font-size: 28px;  /* text-4xl */
  font-weight: 900;
  tabular-nums;
  drop-shadow: 0 0 8px rgba(...);
  background-clip: text;
  color: transparent;
}

/* ✅ CORRECT */
.big-number {
  font-size: 28px;
  font-weight: 900;
  color: rgb(248, 250, 252);  /* solid color, no transparent */
  /* no tabular-nums, no drop-shadow, no bg-clip */
  
  /* 글로우는 배경 레이어에서만 */
  position: relative;
  /* ::before pseudo-element로 glow 처리 */
}

.big-number::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(...);
  border-radius: inherit;
  filter: blur(12px);
  z-index: -1;
}
```

### 13.2 OrderBook 호가창 (safe)

```css
/* ✅ OK: 작은 숫자 (<14px) + tabular-nums */
.orderbook-price {
  font-size: 10px;  /* text-[10px] */
  font-weight: 900;
  font-variant-numeric: tabular-nums;
  drop-shadow: 0 0 4px rgba(52, 211, 153, 0.45);  /* 단일 glow OK */
  color: rgb(52, 211, 153);
}
```

**결론**:
- `text-4xl+` (28px+): tabular-nums, drop-shadow, bg-clip 모두 금지
- `text-[10px]` (OrderBook): tabular-nums + drop-shadow OK (작으므로)
- LimitPriceInput, SlTpInputs: 일반 input 텍스트, 큰 폰트 아니므로 제약 없음

---

## 14. 모바일 적응 (375px 기준)

### 14.1 Vertical Stack

| 화면 크기 | 레이아웃 |
|---------|---------|
| < 600px (portrait) | 모두 vertical stack (현재 설계 유지) |
| 600-1024px | OrderBook/RecentTrades 가로 2-col (현재 유지) |
| > 1024px | 3-col 또는 desktop layout (향후) |

### 14.2 Touch Target

- 최소 44x44px: TimeframeRow, PartialCloseControls, MarginModeChip 버튼
- Input field: min-h-11 (44px)

### 14.3 Keyboard Navigation

```
Tab Order (TradeTab):
1. CoinSelector
2. MarginModeChip
3. TimeframeRow chips (1m/5m/...)
4. IndicatorToggles (ma20/volume)
5. OrderTypeTabs (market/limit/stop)
6. LimitPriceInput (orderType=limit 시만)
7. Leverage slider
8. Size % selector
9. SlTpInputs (expanded 시만)
10. [LONG] [SHORT] 버튼
11. PartialCloseControls [25%/50%/75%/100%] (position 존재 시)
12. [+ TP/SL] toggle
```

---

## 15. [DECISION] 태그 (명확하지 않은 결정사항)

| # | 주제 | 선택 1 | 선택 2 | 권장 | 근거 |
|----|------|--------|--------|------|------|
| 1 | IndicatorToggles 위치 | 차트 아래 row | 우상단 floating | Row | 터치 실수 방지 + 차트 obscure 방지 |
| 2 | Limit 가격 auto-fill | Last / Mid / +5% 버튼 | 별도 UI | 버튼 3개 | Binance 컨벤션 |
| 3 | OrderHistory 분리 | 통합 (Orders tab) | 분리 (Trade + Orders) | 통합 | PortfolioTab 단순화 |
| 4 | localStorage timeframe | 코인별 기억 | 전역 기억 | 전역 | 코인 전환 시 혼란 방지 |
| 5 | PartialClose confirm | Dialog 필수 | 즉시 실행 | 즉시 | MVP 단순화 (Phase G에서 재검토) |
| 6 | Swipe-to-cancel 모바일 | 구현 | 스킵 | 스킵 | Stage 17 scope 외, Phase H+ 에서 검토 |
| 7 | Cross margin 기능 | Phase G 구현 | UI만 (disabled) | UI만 | 스펙 명시: "UI 토글만, 로직은 isolated 유지" |
| 8 | Stop tab 활성화 | 순수 Stop 주문 입력 | Limit+SlTp 옵션에 통합 | 통합 | UX 복잡도 + backend orderMatcher 설계상 |

---

## 16. 검증 체크리스트 (frontend-developer 용)

**Phase F (Limit Orders, 3일)**:
- [ ] OrderTypeTabs component 생성 + Market/Limit/Stop 3탭 전환
- [ ] LimitPriceInput component + [Last]/[Mid]/[+5%] 버튼 동작
- [ ] OpenOrdersCard component + pending orders 렌더링 + Cancel 버튼
- [ ] OrderHistorySection component + filled/cancelled orders 표시
- [ ] TradeTab 단일 스크롤 유지 확인 (차트 350px shrink-0, pb-260px)
- [ ] i18n keys 6 locale 모두 추가 (orderType.*, orders.*)
- [ ] TypeScript tsc --noEmit + npm run build 성공
- [ ] npm run lint 성공
- [ ] Playwright E2E: Limit 주문 1건 → pending → filled 시뮬레이션

**Phase G (Partial Close + Margin Mode, 2일)**:
- [ ] PartialCloseControls component + [25%/50%/75%/100%] 4버튼
- [ ] MarginModeChip component + Isolated/Cross 토글 (Cross 비활성, toast)
- [ ] SlTpInputs component + [+ TP/SL] toggle 펼침/접힘
- [ ] closePartial() API 호출 + position.size 업데이트 UI
- [ ] i18n keys (partialClose.*, marginMode.*, slTp.*)
- [ ] Playwright: Partial close 25% → balance 증가 + position.size 75% 확인
- [ ] TypeScript/lint/build 성공

**Phase H (Enhanced Charts, 2일)**:
- [ ] TimeframeRow component + [1m/5m/15m/1h/4h/1d] 칩 + localStorage 기억
- [ ] IndicatorToggles component + [MA20] [Volume] 토글
- [ ] TradingChart: `useBinanceFeed(symbol, timeframe)` interval 파라미터 활성화
- [ ] OrderBook rows={5} → rows={10} + depth bar 양쪽 강화
- [ ] RecentTrades: >$10K 거래 amber-400/20 배경 1초 pulse
- [ ] i18n keys (timeframe.*, indicators.*)
- [ ] TradeTab 높이 재검증: pb-[260px] 후 BottomNav 미노출 확인
- [ ] Android WebView (Chrome 120+) 스크린샷: 큰 숫자 투명 버그 없음
- [ ] Playwright: chart timeframe 전환 시 kline 재로드 + MA20/Volume 시각 변화

---

## 17. Out of Scope (Stage 17 v1)

- Hedge mode (양방향 포지션)
- Trailing stop (동적 손절가)
- Post-only/IOC/FOK 고급 주문 타입
- Index vs Last price (Mark price 통일)
- Cross 마진 진짜 로직 (공유 margin pool)
- Drawing tools (Trend line, Fibonacci)
- RSI/MACD/Bollinger bands (MA20/Volume만)
- Funding rate 정산 (display only)
- SL/TP drag adjustment (입력 UI만)
- Push notification (price alert)
- Position merge/split
- Advanced orderbook depth (snapshot-based full book rebuild)

---

## Reference

- **Spec**: `docs/specs/stage-17-binance-futures.md` (pm-lead)
- **Tokens**: `web/src/styles/tokens.ts` + `tokens.css` (design-lead)
- **Card Guide**: `docs/design/card-tone-guide.md` (Stage 16)
- **GOTCHAS**: `/GOTCHAS.md` Stage 7.8~8.12 (안드로이드, 카드 잘림, 모바일)
- **Components to refactor**:
  - `web/src/tabs/TradeTab.tsx` (layout + new state)
  - `web/src/components/ActionPanel.tsx` (tabs + limit + sltp + partialclose)
  - `web/src/components/OrderBook.tsx` (5→10 rows + depth bar)
  - `web/src/components/RecentTrades.tsx` (highlight >$10K)
  - `web/src/tabs/PortfolioTab.tsx` (OrderHistorySection)
- **API**: `web/src/lib/api.ts` (Order types + new endpoints from backend spec)

