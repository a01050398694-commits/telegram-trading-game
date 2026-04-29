# GOTCHAS

누적되는 MUST / MUST NOT 규칙. 실수 반복 방지.

## Stage 1 Setup

### MUST
- **MUST** use `type: "module"` + `.js` import specifiers in bot/ (NodeNext resolution requires explicit extensions).
- **MUST** pass `host: true` to Vite dev server so ngrok/cloudflared tunnels can proxy to localhost.
- **MUST** read `window.Telegram?.WebApp` optionally — 브라우저 직접 접속 시 undefined.

### MUST NOT
- **MUST NOT** hardcode `TELEGRAM_BOT_TOKEN` — 항상 `.env`, 커밋 금지 (.gitignore 등록됨).
- **MUST NOT** use Tailwind v3 config (`tailwind.config.js` + `@tailwind base;`). v4는 `@import "tailwindcss";` + `@tailwindcss/postcss` 플러그인.
- **MUST NOT** skip `bot.init()` before `bot.start()` — `bot.botInfo` 접근 시 에러 발생.

## Stage 2 DB & Engine

### MUST
- **MUST** use Supabase `service_role` key in bot/ for writes — anon 키는 RLS 정책 없이는 insert 거부됨.
- **MUST** subscribe Binance combined stream (`/stream?streams=...`) — single stream endpoint(`/ws/xxx`)는 심볼 추가가 불가.
- **MUST** parse Binance combined payload as `{stream, data}` wrapper — data 필드 안에 실제 ticker가 들어있음.
- **MUST** pure-function liquidation logic (`engine/liquidation.ts`) — DB 없이 단위 테스트 가능해야 함.
- **MUST** set `is_liquidated=true` + `balance=0` on liquidation — PRD 2.2 "청산 시 전액 소실".
- **MUST** cascade liquidate all open positions of liquidated user — 지갑 0원이 되면 기존 포지션 유지 불가.

### MUST NOT
- **MUST NOT** trust `Number(position.entry_price)` without conversion — supabase-js는 numeric 컬럼을 string으로 반환.
- **MUST NOT** use single-stream Binance URL for multiple symbols — combined stream 필수.
- **MUST NOT** execute `supabase/schema.sql` automatically — 대표님이 대시보드에서 수동 실행 (PLAN §3).
- **MUST NOT** modify web/ during Stage 2 — PLAN.md Negative Constraints.
- **MUST NOT** skip optimistic lock on wallet balance update — 동시 포지션 진입 시 race condition 방지.
- **MUST NOT** attach `InlineKeyboard.webApp()` button with an `http://` URL — Telegram API는 WebApp 버튼 URL이 HTTPS가 아니면 sendMessage 자체를 400으로 거부. 개발 중엔 버튼 조건부 생성(`startsWith('https://')`) 또는 cloudflared/ngrok HTTPS 터널 사용.
- **MUST NOT** rely on `import 'dotenv/config'` in workspace packages — `npm run ... -w <pkg>` 는 cwd를 `<pkg>/`로 바꾸므로 루트 `.env`를 못 찾는다. `dirname(fileURLToPath(import.meta.url))` 기준으로 명시 경로 로드.

## Stage 4 Pro UI

### MUST
- **MUST** declare Binance klines tuple as fixed 12-length (`[number, string, string, string, string, string, number, string, number, string, string, string]`) — `noUncheckedIndexedAccess` + `...unknown[]` rest 스프레드 쓰면 모든 인덱스가 `T | undefined` 가 돼서 `parseFloat` 타입 에러.
- **MUST** use lightweight-charts v5 API: `chart.addSeries(CandlestickSeries, options)` — v4 의 `chart.addCandlestickSeries()` 는 deprecated. `CandlestickSeries` 는 named import.
- **MUST** guard `series.update(candle)` with `lastTimeRef` — lightweight-charts 가 과거 시각 데이터를 거부하면 런타임 에러 발생.
- **MUST** fetch 24h ticker (`/api/v3/ticker/24hr`) separately from kline stream — 거래소 UX 에서는 실시간 가격만 있으면 부족함, 24h 변동률/고저가 같이 보여야 "프로" 느낌.

### MUST NOT
- **MUST NOT** use `Math.random()` or mock price feed in web/ — Stage 4 부터 바이낸스 WebSocket(`wss://stream.binance.com:9443/ws/{symbol}@kline_1m`) 직결.
- **MUST NOT** use single-stream WS URL with a `/stream?streams=...` combined path mismatch — single `/ws/{stream}` 는 wrapper 없이 payload 직접, combined `/stream?streams=` 는 `{stream, data}` wrapper. 혼용 금지.

## Stage 5 Telegram Mini App

### MUST
- **MUST** call `tg.ready()` + `tg.expand()` 첫 마운트에서만 — ready 는 스플래시 제거 신호, expand 는 하프스크린 방지. 둘 중 하나라도 빠지면 네이티브 느낌 깨짐.
- **MUST** guard `tg.setHeaderColor?.()` / `setBackgroundColor?.()` / `disableVerticalSwipes?.()` 를 optional chaining 으로 — 구버전 Telegram 클라이언트는 해당 메서드 자체가 없어서 throw.
- **MUST** match `setHeaderColor` / `setBackgroundColor` / body background 모두 동일 색(`#020617` slate-950) — 세 값이 다르면 웹뷰 상단/하단에 색 띠가 남음.
- **MUST** apply `env(safe-area-inset-*)` padding in the outermost layout — iOS 노치/홈바 영역에 UI 걸리는 현상 차단. viewport-fit=cover 만으론 부족.
- **MUST** read user from `window.Telegram.WebApp.initDataUnsafe.user` — SDK 가 먼저 로드된 뒤 접근해야 하므로 useEffect 안에서만. initial render 시점엔 아직 undefined.

### MUST NOT
- **MUST NOT** trust `initDataUnsafe` for auth on backend — 이름 그대로 unsafe. 서버 검증 시엔 `initData` 원본 문자열 + HMAC(bot token) 으로 재계산. 프론트 표시 용도만 OK.
- **MUST NOT** apply both tailwind `p-2` and `.safe-area` padding on same element — 패딩이 이중 가산되어 모바일에서 차트 공간을 잡아먹음.
- **MUST NOT** leave `overflow: visible` on `body` — iOS Safari 웹뷰에서 차트 터치/드래그가 body 전체를 끌고 내려가 WebApp 이 닫히는 사고 발생. `overflow: hidden` + `overscroll-behavior-y: none` 필수.

## Stage 6 USD / Multi-Coin / 4-Tab 대공사

### MUST
- **MUST** treat DB `balance`/`size`/`pnl` (bigint) as **integer USD dollars** from Stage 6 — 기존 원 단위 데이터는 단위 불일치로 폐기 대상. `schema.sql` 주석의 리셋 SQL (`UPDATE wallets SET balance=100000; DELETE FROM positions;`) 을 Supabase 대시보드에서 수동 실행 필수.
- **MUST** keep `env.DAILY_ALLOWANCE` and `env.MARKET_SYMBOLS` as the single source of truth — 프론트 `markets.ts` 의 심볼 배열이 서버 env 와 일치해야 `scanAndLiquidate` 가 해당 심볼 포지션을 감시한다.
- **MUST** use `formatMoney()` for wallet/PnL/size display ($ 축약 포함) and `formatUSD()` only for price precision — 둘은 용도가 다르다 (100_000 → `formatMoney` = "$100,000" vs `formatUSD` = "100000.00").
- **MUST** derive `positionForPanel` by comparing `status.position.symbol` to currently selected `symbol` in TradeTab — 유저가 BTC 포지션 오픈 후 ETH 탭으로 전환하면 ActionPanel 은 "포지션 없음" 상태여야 하고, 원래 포지션은 PortfolioTab 에서만 확인 가능.
- **MUST** render `BottomNav` outside scrollable tab container — `safe-area-inset-bottom` 을 main 레벨에서 처리하고 nav 는 main 자식으로 유지해야 iOS 홈바 위에 정확히 얹힌다.
- **MUST** pass `symbol` and `interval` as reactive deps to `useBinanceFeed` — 이미 그렇게 구현돼 있음. CoinSelector 토글 시 WS 가 자동 재연결.
- **MUST** gate PremiumTab submit with `uid.trim().length >= 3` 최소 검증 — 기획아이디어.md §9 "UID 중심 텍스트 인증". 실서버 POST 는 Stage 7.
- **MUST** compute VIP chat window in KST (UTC+9) — 기획아이디어.md §12 "매일 밤 21:50 ~ 24:00". 서버가 UTC 여도 체감은 KST.

### MUST NOT
- **MUST NOT** hardcode "BTC" in Header volume / Chart tokens — `getMarket(symbol)` 으로 ticker/icon 동적 렌더. 심볼 전환 시 즉시 바뀌어야 한다.
- **MUST NOT** mix 원 단위 숫자와 USD 단위 숫자를 동일 컬럼에 저장 — 대표님이 Stage 6 전환 시점에 `positions` 테이블 DELETE 해야 단위 오염 없음.
- **MUST NOT** duplicate status polling per tab — App 레벨 단일 폴링 + prop 으로 전달. 탭마다 `setInterval` 걸면 N배 트래픽.
- **MUST NOT** put `useBinanceFeed` 호출을 App 최상단에 두고 모든 탭에서 공유하려 하지 말 것 — 현재 TradeTab 내부에서 호출, 다른 탭 전환 시 unmount 되며 WS 자동 종료. VIP/Portfolio/Premium 탭 진입 시 불필요한 네트워크 차단.
- **MUST NOT** trust frontend `submit.kind='pending'` 상태를 서버 검증 결과로 간주 — 실제 승인은 Stage 7 의 `/api/referral/submit` 백엔드 검증 이후에만 유효.

## Stage 7.8 Luxury Polish (Specular / Grain / Typography)

### MUST
- **MUST** use `bg-gradient-to-b from-X-400 to-X-600` + `shadow-[inset_0_1px_1px_rgba(255,255,255,0.45),...]` on primary action buttons — 플랫 `bg-emerald-500` 은 cheap. 상단 내부 1px 하이라이트 + 외부 glow 의 조합이 물리 버튼 질감의 최소 조건.
- **MUST** simulate press-down with `active:scale-[0.96] active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.35)]` — 크기만 줄이면 "click" 이고, inner shadow 를 켜야 "눌림" 느낌.
- **MUST** stack `grain` + `glass-specular` CSS utilities (index.css 정의) on luxury cards — 단순 `backdrop-blur-xl` 만으로는 blurred CSS 느낌. SVG fractalNoise base64 + overlay blend 로 물리 간유리 질감, linear-gradient 135deg 하이라이트로 빛 반사까지 섞어야 "30점→55점" 이상.
- **MUST** use `text-white/40` (또는 `text-white/30`) for secondary labels — `text-slate-500` 보다 dimmer. 메인 숫자와 경쟁하지 않도록 2차 정보는 드라스틱하게 fade.
- **MUST** pair `font-black` + `tabular-nums` + `tracking-tight` on primary numbers (Price, Equity, PnL) — extrabold 로는 약함. tabular-nums 없으면 tick 마다 폭이 흔들려 cheap.
- **MUST** add `drop-shadow-[0_0_4px_rgba(...)]` neon glow to rapidly-updating numbers (OrderBook bids/asks, RecentTrades) — 유리창 너머에서 네온이 새어나오는 거래소 특유의 분위기.

### MUST NOT
- **MUST NOT** use default `green-500` / `red-500` anywhere — 모두 `emerald-400` / `rose-400` 로 통일. tailwind 기본 green/red 는 채도가 너무 진해 저가 앱 느낌. (유일 예외: Binance ticker 컨벤션 따라 long=emerald, short=rose 로 고정)
- **MUST NOT** apply `grain` without `isolation: isolate` + `::after z-0` + `> * position relative z-1` 세트 — 자식 이벤트가 overlay 에 가로막히거나 텍스트 위에 노이즈가 덮여 가독성 파괴.
- **MUST NOT** omit `overflow: hidden` on cards using `glass-specular` + `grain` — ::before/::after pseudo 가 rounded 모서리를 넘어가 각진 네모 블러가 비쳐나오는 사고.
- **MUST NOT** leave TradingChart height above 200px when OrderBook+RecentTrades 2-col 를 동시에 렌더 — 모바일 뷰포트에서 ActionPanel 이 쫓겨나는 재발 사고. 공식: `h-[160px] shrink-0`.

## Stage 7.5 Bugfix (Layout Rescue / WS Desync / Luxury Tabs)

### MUST
- **MUST** structure TradeTab as 3-section flex (`shrink-0` top · `flex-1 min-h-0 overflow-y-auto` middle · `shrink-0` bottom) — ActionPanel 의 LONG/SHORT 버튼이 모바일에서 항상 뷰포트에 보여야 거래 가능. 예전처럼 전체를 `overflow-y-auto` 안에 넣으면 버튼이 스크롤 밑으로 밀려나는 대참사.
- **MUST** reset `bids/asks/status` state at the top of useOrderBook effect on symbol change — WS 는 재연결되지만 state 가 이전 코인 값으로 남아 있어 BTC→ETH 즉시 전환 시 BTC 호가가 남는다. `useRecentTrades` 도 `setStatus('loading')` 재설정.
- **MUST** render OrderBook/RecentTrades in `rows={5}` 컴팩트 모드 (text-[9px], py-[2px]) — 2컬럼 모바일 그리드에서 10행 유지하면 세로 공간 과점유해 차트/ActionPanel 을 밀어낸다.
- **MUST** use Glassmorphism (backdrop-blur-xl + border-white/10 + gradient overlay) for VIP/Premium 탭 카드 — 기본 `bg-slate-900/80` 만으로는 15점짜리 wireframe 느낌. gold/indigo glow (`shadow-[0_0_Npx_rgba(...)]`) 와 함께 써야 "럭셔리".
- **MUST** render "BEST VALUE" badge as diagonal ribbon (`-right-6 top-2 rotate-45 gradient`) on Lifetime plan card — premium SaaS pricing table 의 정석. 일반 badge 는 평면적.
- **MUST** show live chat-window countdown (`chatWindowInfo` + 1s setInterval) on VIPTab — 정적 "21:50 ~ 24:00" 안내만 있으면 긴장감 0. 남은 시간이 tick 해야 희소성 체감.

### MUST NOT
- **MUST NOT** use `fixed bottom-16 z-40` 로 ActionPanel 을 뷰포트에 절대위치 고정하지 말 것 — LiquidationOverlay 와 BottomNav 사이 레이어 순서가 꼬이고, 스크롤 영역 하단 패딩을 별도로 잡아야 하는 코스트 발생. 부모 flex column 의 `shrink-0` 으로 자연스럽게 바닥에 붙이는 게 더 깨끗.
- **MUST NOT** render full-width VIP 리스트만 1위~10위 병렬로 쌓지 말 것 — TOP 3 포디움 카드(#1 가운데 높게) 로 시각적 계층 없으면 "Hall of Fame" 느낌이 안 난다.
- **MUST NOT** leave chart height as `flex-1` in TradeTab 재구성 후 — 중간 스크롤 영역이 수축되면 차트가 접혀 0px 이 되면서 lightweight-charts 가 throw. `h-[200px] shrink-0` 고정 필수.

## Stage 7.5 Quantum Leap (OrderBook / Haptics / Funding / Share)

### MUST
- **MUST** route all Telegram native calls (haptic/popup/share) through `web/src/utils/telegram.ts` — 컴포넌트에서 `window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.()` 중첩 optional chain 쓰면 실수로 throw. 래퍼는 브라우저 모드에서도 silent no-op.
- **MUST** use `depth10@100ms` single-stream for OrderBook — 풀 depthUpdate 병합은 snapshot fetch + buffer 필수로 MVP 에 과잉. 100ms 간격 partial book depth 스트림은 Binance 가 스냅샷을 직접 push 해서 구현 간결.
- **MUST** clear trades state on symbol change in `useRecentTrades` — 이전 코인 체결이 새 코인 리스트에 남으면 유저가 혼란. `setTrades([])` 를 symbol effect 진입 시 호출.
- **MUST** request funding rate from `fapi.binance.com/fapi/v1/premiumIndex` (Futures) — 현물 `api.binance.com` 에는 premiumIndex 없음. symbol 파라미터는 UPPERCASE 필수.
- **MUST** fire `hapticNotification('error')` on `isLiquidated` false→true edge via `useRef` prev 값 — 매 렌더마다 호출하면 연속 진동. 엣지 감지만.
- **MUST** set `backgroundColor: '#020617'` explicit on `html2canvas` capture — 투명 배경이면 iOS 캡처 시 검정 대신 흰색 누수. slate-950 고정으로 카드 주변 그라데이션 깨짐 방지.
- **MUST** 3-tier share fallback (`navigator.share(files)` → `tg.switchInlineQuery` → `clipboard + popup`) — Telegram 버전별 SDK 지원이 제각각이라 한 경로만 쓰면 20% 유저는 공유 실패.

### MUST NOT
- **MUST NOT** call `hapticImpact` on every render or range input event — 슬라이더 drag 중 매 tick 호출하면 디바이스 모터 과열. `onChange` 안에서 `next !== prev` 비교 후 트리거.
- **MUST NOT** use `navigator.share` 이미지 경로를 먼저 시도하지 않고 텍스트부터 보내지 말 것 — 바이럴 핵심은 이미지. 파일 공유가 가능한 환경(iOS Safari/Android Chrome)에서 텍스트만 공유하면 전환율 급락.
- **MUST NOT** 실시간 depth/trade 스트림에 React state 를 매 tick `setState` 로 교체하면서 동시에 `flex-1` 차트 높이를 쓰지 말 것 — CLS(레이아웃 시프트) + 리렌더 비용 증가. TradeTab 에서 차트는 `h-[260px] shrink-0` 고정.
- **MUST NOT** render `ShareROIButton` when `markPrice === null` 상태로 모달에서 공유 누름 — ROI% 가 NaN 으로 계산돼 "+NaN%" 가 카드에 찍힘. 상위에서 `markPrice !== null` 가드 또는 null 허용 시 '--' 라벨 처리.

## Stage 5.5 Order REST & Stars Payment

### MUST
- **MUST** route `/api/*` through Vite proxy (dev) — cloudflared 터널은 `web` 포트(5173) 만 뚫려 있어 브라우저가 `localhost:3000` 직접 호출 불가. `vite.config.ts` 의 `server.proxy` 에 `'/api': { target: 'http://localhost:3000' }` 필수.
- **MUST** use `currency: 'XTR'` + empty `provider_token` for Telegram Stars — 일반 화폐 invoice 와 달리 Stars 는 provider 등록 없이 즉시 발행. `bot.api.sendInvoice(chatId, title, desc, payload, 'XTR', [{label, amount: starsCount}])`.
- **MUST** answer `pre_checkout_query` within 10s — Telegram 은 이 응답이 없으면 결제 자동 취소. grammy `bot.on('pre_checkout_query', ctx => ctx.answerPreCheckoutQuery(true))`.
- **MUST** handle `successful_payment` via `bot.on(':successful_payment')` — 그냥 `message` 핸들러에선 안 걸림. payload prefix(`recharge_v1:`) 검증으로 스푸프 차단.
- **MUST** use `priceCache` shared between feed + server — openPosition/closePosition 은 market 가격이 필요한데 REST 핸들러는 WS 이벤트 루프 밖. feed tick 마다 `cache.set(symbol, price)` → 핸들러에서 `cache.get(symbol)`.
- **MUST** let server be source-of-truth for `is_liquidated` — 프론트에서 markPrice 기반 로컬 청산 판정하면 DB 와 어긋남. polling(`/api/user/status`) 결과만 신뢰.

### MUST NOT
- **MUST NOT** trust `telegramUserId` in request body for auth — `initDataUnsafe` 는 프론트가 임의 조작 가능. MVP 는 unsafe 허용, Stage 6 에서 `initData` HMAC(BOT_TOKEN) 검증으로 승격. 지금은 TODO 주석 필수.
- **MUST NOT** forget server-side `is_liquidated` check before opening new positions — 프론트 disabled 만으론 부족, `TradingEngine.openPosition` 에서 `throw 'LIQUIDATED'` 가드 필수 (이미 구현됨).
- **MUST NOT** reuse `amount` unit incorrectly in Stars invoice — Stars currency 는 `amount` 가 Stars 개수 정수. 다른 화폐(KRW 등)와 달리 소수점 100배 배수 곱 금지.
- **MUST NOT** open position and then hope polling catches up — `openTrade()` 성공 후 즉시 `refresh()` 호출해서 포지션 카드 렌더링 지연(max 2s) 방지.

## Stage 7.9 Urgent (Equity Sync / Typography / Bot Menu)

### MUST
- **MUST** compute live equity as `wallet.balance + position.size + livePnl` — 엔진 `openPosition` 이 `balance -= size` 로 margin 을 lock 하므로 `balance + livePnl` 만 쓰면 margin 이 누락돼 실제 에쿼티보다 작게 표시됨. Binance/Bybit "Margin Balance" 와 동일 공식 유지.
- **MUST** drive equity color 를 `equityDelta = liveEquity - STARTING_SEED($100K)` 부호로 분기 — `livePnl` 부호만 보면 포지션 없을 때 항상 neutral. 누적 실현 PnL 까지 반영해야 "오늘 수익 중" 이 제대로 보임.
- **MUST** pair equity color with `drop-shadow-[0_0_12px_rgba(...,0.5)]` glow — 정적 텍스트 색상 변경만으론 "살아있는 느낌" 실종. 6~12px blur glow 로 틱마다 빛나야 함.
- **MUST** wrap long bullet sentences into 2~3 단어 punchy 영어 라벨 for pricing tier (`Multi-Coin Charts`, `$100K Daily Seed`, `VIP Chat Access`) — 한글 긴 문장은 3-col grid 에서 줄바꿈 3번 발생해 카드 높이 들쭉날쭉. 짧은 영어가 sheer 비교 가독성에 유리.
- **MUST** use `gap-2.5` (≥10px) between feature list items — `gap-1` 은 bullets 끼리 달라붙어 Apple/Stripe 가격표 대비 cheap 하게 보임. 여백 = 럭셔리.
- **MUST** surface `/start` 의 3개 CTA 를 InlineKeyboard 로 한 번에 노출 (Play + How to Play + VIP & Premium) — 단일 Web App 버튼은 "게임 뭐임?" 유저 이탈 유발. 텍스트 가이드와 premium inducement 를 같은 메시지에서 즉시 발화.
- **MUST** define `CB_HOW` / `CB_PREMIUM` 상수 for `callback_data` — 매직 스트링 흩어지면 `bot.callbackQuery('how_to_play')` 오타 시 silent fail (버튼 클릭해도 아무 반응 없음).
- **MUST** call `ctx.answerCallbackQuery()` inside every callback handler — 안 부르면 텔레그램 클라이언트가 "로딩 스피너" 를 3~5초간 유지 (UX 망가짐).

### MUST NOT
- **MUST NOT** skip `InlineKeyboard` when `WEBAPP_URL` is http — Play Game 버튼만 빠지고 How to Play / Premium 은 여전히 동작해야 함. `keyboard ? { reply_markup: keyboard } : {}` 3항 쓰면 개발모드에서 메뉴 전체가 사라지는 회귀 발생.
- **MUST NOT** use `text-[9px]` / `gap-1` on Premium tab pricing cards — 대표님이 "글씨가 microscopic 하다" 여러 번 피드백. Pricing UI 의 bullets 는 최소 `text-[11px] font-medium` + `gap-2.5`.
- **MUST NOT** rely on `livePnl` color alone for equity card glow — 포지션 없을 때 livePnl=0 이므로 항상 neutral 로 보임. 스타팅 시드 대비 델타까지 포함해야 실현 PnL 누적도 반영된다.
- **MUST NOT** claim "static equity" bug fixed without margin 복구 — `balance + livePnl` 만 쓰면 margin lock 구간만큼 항상 작게 나와서 유저는 "숫자 이상함" 으로 느낀다. `+ position.size` 필수.

## Stage 8.0 Flawless Foundations (10B Fix / 60+ Coins / i18n / Academy Rebrand)

### MUST
- **MUST** keep `DAILY_ALLOWANCE=100000` in `.env` and `100_000` as default in `bot/src/env.ts` — Stage 6 USD scale. 과거 `10_000_000_000` (100억 원) 값이 남아 있으면 Total Equity 가 `$10,000.02M` 으로 표시되는 $10B 버그 재현. 기존 유저 지갑은 `UPDATE wallets SET balance=100000 WHERE balance > 1000000` 로 한 번 리셋.
- **MUST** derive `MARKETS` meta with palette 로테이션 + `searchMarkets(query)` 대소문자 무시 부분일치 — 60+ 코인 리스트에서 하드코딩된 color 없이 ticker/name/display 어느 필드라도 검색되게 해야 DOGE/PEPE 같은 밈 코인도 즉시 찾을 수 있다.
- **MUST** expose `MarketSymbol` 을 `string` alias 로 완화 — Stage 6 의 `'btcusdt' | 'ethusdt' | 'solusdt'` 리터럴 유니온은 60+ 코인 추가 시 컴파일 에러 유발. 검색 모달 결과로 선택된 임의 심볼을 그대로 쓸 수 있어야 한다.
- **MUST** load i18n resources 동기적으로 `locales/*.json` 에서 import — CDN/backend fetch 방식은 첫 페인트에서 fallback key literal 이 튀는 FOUT 발생. JSON 을 번들에 포함해야 initial render 부터 번역된 UI.
- **MUST** detect 언어 우선순위 `localStorage > Telegram language_code > navigator.language > 'en'` — Telegram 앱 자체 언어 설정과 브라우저 설정을 둘 다 존중하면서, 사용자가 수동 전환한 기록이 최우선.
- **MUST** keep `TabKey` ('trade'|'portfolio'|'vip'|'premium') 라벨 교체는 i18n 키로만 — TabKey enum 을 바꾸면 App.tsx 라우팅 전체가 깨진다. '애널리스트 클럽' / '아카데미' 는 표시 라벨만 교체하고 내부 식별자는 유지.
- **MUST** rewrite bot `/start` copy 를 "paper-trading simulator / no real money" 로 감싸기 — 도박 규제 회피 + 교육 포지셔닝. "$100K USD 시드" 워딩은 유지하되 반드시 "simulated / practice" 수식어 동반.

### MUST NOT
- **MUST NOT** leave `formatMoney` 의 M 축약 임계값이 1_000_000 인 사실을 잊고 balance 단위를 원→USD 전환할 때 DB 리셋을 건너뛰지 말 것 — 기존 유저 balance 10_000_000_000 은 `$10,000M` 으로 렌더되어 보이는 버그의 원흉이었다. schema 변경만으론 부족, 실데이터 UPDATE 가 동반돼야 한다.
- **MUST NOT** inline-edit `MARKETS` 상수에 각 코인마다 반복 color 하드코드 — 60개 넘으면 팔레트 관리 지옥. `PALETTE[i % PALETTE.length]` 로 자동 할당 유지.
- **MUST NOT** put `<CoinSelector>` 를 탭 변경 시 unmount 되는 TradeTab 내부가 아닌 App 최상단에 두지 말 것 — 현재 TradeTab 안에서만 쓰이므로 OK. 바깥으로 끌어올리면 `useBinanceFeed` 의 심볼 연결과 분리돼 WS 레이스.
- **MUST NOT** t(key) 함수를 컴포넌트 바깥(모듈 top-level)에서 호출 — `useTranslation()` hook 결과만 reactive. top-level 호출 시 초기 언어 고정되어 토글 반영 안 됨.
- **MUST NOT** translate internal callback_data strings (`CB_HOW` / `CB_PREMIUM`) — 라벨만 교체, 식별자는 유지. 번역하면 `bot.callbackQuery('how_to_play')` 가 매칭 안 되어 버튼 무반응.
- **MUST NOT** claim "gambling wording removed" without sweeping Stars invoice title/description — `/api/payment/stars` 의 "Recharge" 문자열도 반드시 "Risk Management Reset" 류 교육 언어로 교체해야 앱스토어 정책 통과.

## Stage 8.2 Viral / Legal / Pixel (PNG Share / Prize Banner / Podium)

### MUST
- **MUST** convert html2canvas `Canvas` → `Blob` → `File(blob, filename, { type: 'image/png' })` before `navigator.share({ files, text })` — 일부 Android/iOS 브라우저는 `Blob` 직접 전달 시 공유 시트가 텍스트만 보내고 이미지를 누락. `File` 객체 + `canShare({files})` 사전 체크 필수.
- **MUST** provide 3-tier share fallback — `navigator.share(files)` → Telegram `switchInlineQuery` → `clipboard.writeText`. 각 단계 실패 시 예외 삼키고 다음으로 진행해야 한다 (iOS Safari 비-HTTPS 환경에서 `navigator.share` 가 권한 에러를 던지는 케이스 때문).
- **MUST** inject bot deep link `t.me/${VITE_BOT_USERNAME}` into share text — 이미지만 공유되면 수신자가 어디서 온 건지 모른다. 카톡/트위터가 t.me 링크를 자동으로 preview 카드로 렌더해 주는 점을 활용.
- **MUST** use `import.meta.env.VITE_BOT_USERNAME` — Vite 는 `VITE_` 프리픽스만 브라우저 번들에 노출. `BOT_TOKEN` 같이 프리픽스 없는 값은 절대 프론트에 읽히면 안 되므로 의도적 네이밍.
- **MUST** align podium medals via `grid items-end` + **fixed-height medal box** (`h-12` / `h-14` tall) + `flex items-end justify-center` — 👑 / 🥈 / 🥉 글리프가 OS 폰트별 height 미묘히 달라 같은 `text-3xl` 만으론 baseline 이 어긋난다. medal 전용 박스 내부에서 `items-end` 로 눌러야 픽셀 퍼펙트.
- **MUST** use uniform card padding (`px-3 pt-3 pb-4`) on all 3 podium cards — 높이 차이는 오직 medal 박스 높이로만 만든다. `pt-5` vs `pt-3` 같이 카드 자체 padding 변주하면 내부 medal 이 흔들린다.
- **MUST** add `leading-tight` to `font-mono font-black text-2xl+` 큰 텍스트 — font-black 웨이트는 디폴트 leading(1.5)에서 descender 가 overflow 상자 밖으로 삐져나가 clipping 된다. `leading-tight` (1.25) 또는 명시적 `leading-[1.2]` 필요.

### MUST NOT
- **MUST NOT** ship any UI surface advertising a *monetary* prize pool (`$5,000 USDT` 등) — 한국/일본/EU 의 도박/경품법 위반 리스크. 토너먼트 eligibility 같이 현금이 없는 자격 언급은 허용, 현금 액수 표시는 금지.
- **MUST NOT** ship raw-text-only share (`navigator.share({ text })` without files) 를 primary path 로 — PLAN.md §1.3 핵심이 이미지 공유. 텍스트만 공유하면 수신자 피드에 단조롭게 묻혀 CTR 급락.
- **MUST NOT** apply `p-5` uniform padding to hero cards containing `font-mono font-black text-2xl+` text — 위쪽은 충분하지만 font descender 가 잘려 "로고 일부 잘린 듯" 한 느낌. `pb` 는 반드시 top 보다 최소 4px 이상 크게.
- **MUST NOT** leave `t.me/your_bot` literal string in ShareROIButton card — 실제 배포 전 반드시 `VITE_BOT_USERNAME` 으로 교체. 하드코드 되면 봇 핸들 바꿀 때마다 소스 수정 필요.
- **MUST NOT** keep i18n keys (`elite.prizePool` / `elite.prizeBody`) for deleted UI — 나중에 다른 개발자가 재사용하며 규제 리스크를 복원시키는 실수 방지. 삭제 시 locale 파일에서도 키 제거.

## Stage 8.11 ~ 8.12 Android WebView Text Vanishing & Viewport Chain

### MUST
- **MUST** 안드로이드 WebView 에서 큰 텍스트(6xl / 2xl+ font-black)에는 `drop-shadow-*`, `tabular-nums`, `WebkitBackgroundClip: 'text'` 조합 중 **어느 것도 붙이지 말 것** — 세 개 다 단독으로도 글자 자체를 렌더 누락시키는 사실이 실측 확인. 특히 gradient-clip + transparent 조합은 iOS/데스크톱 Chrome 은 OK 지만 안드로이드 Chrome WebView 는 fallback color 없으면 투명 글자가 되어 "숫자가 아예 안 보여요" 컴플레인 유발. 럭셔리 글로우는 텍스트 자체가 아니라 **카드 배경 레이어**(`::after blur-3xl`, `bg-yellow-300/30 blur-3xl -z-10`) 로만 구현.
- **MUST** 컨테이너 체인 높이 fix 는 **html/body/#root 전부** 에 `var(--tg-viewport-height, 100dvh)` 주입 — `<main>` 한 곳만 var 로 설정하면 부모 `#root` 가 여전히 100% → 100vh(안드로이드 URL 바 포함) 가 되어 main 아래로 빈 공간이 남는다. 루트 체인 전체 교체가 정답.
- **MUST** `useTelegram` 훅에서 `tg.viewportStableHeight` 값을 `document.documentElement.style.setProperty('--tg-viewport-height', px)` 로 주입 + `tg.onEvent('viewportChanged', applyViewport)` 구독 — 키보드 열림/닫힘, 안드로이드 URL 바 show/hide, Telegram half/full screen 전환 모두 `viewportChanged` 로 신호된다. cleanup 에서 `offEvent` 필수.
- **MUST** `types/telegram.d.ts` 에 `onEvent?`/`offEvent?` optional 타입 — 구버전 Telegram 클라이언트에선 없어서 optional chaining 필수. 없으면 strict TS 에러.
- **MUST** 안드로이드용 fallback 으로 `100dvh` (dynamic viewport height) 사용 — `100vh` 는 Android Chrome 이 URL 바 포함한 initial viewport 로 해석해 부정확. `dvh` 는 URL 바 show/hide 따라 동적 재계산. 2026 기준 Chrome 108+/Safari 15.4+/Firefox 101+ 지원으로 사용 가능.

### MUST NOT
- **MUST NOT** 안드로이드 타깃에 `color: transparent` + `-webkit-background-clip: text` gradient 텍스트 기법 쓰지 말 것 — 안드로이드 Chrome 일부 디바이스에서 fallback color 적용 실패로 투명 글자가 그대로 노출. 꼭 금속 효과 원하면 `text-white` + 배경 레이어 blur glow 로 우회.
- **MUST NOT** `drop-shadow-[0_0_Npx_...]` 을 Big Number (text-4xl 이상 + font-black) 에 직접 걸지 말 것 — 안드로이드 WebView 에서 filter 가 GPU accelerate 될 때 텍스트 전체가 투명해지는 회귀 재현 (실기기 확인). 글로우는 래퍼 div 에 `bg-*/30 blur-3xl absolute -z-10` 로.
- **MUST NOT** `tabular-nums` 를 중요 금액/타이머 big number 에 붙이지 말 것 — Android OS font (Noto Sans) 에서 `font-variant-numeric: tabular-nums` 가 지원 안 되는 weight 조합이 있어 렌더 실패 케이스 존재. 숫자 폭 일관성보다 가시성이 우선.
- **MUST NOT** `<main>` 한 곳만 viewport var 적용하고 `html, body, #root` 는 `height: 100%` 로 방치 — 안드로이드 URL 바 내려오는 순간 #root 이 viewport 보다 커져서 main 아래로 회색 갭 노출. 루트 체인 전부 같은 var 로 동기화.

## Stage 8.8 Universal pb-[150px] & Black Card Rebuild

### MUST
- **MUST** 모든 스크롤 탭 루트(`overflow-y-auto`) 컨테이너에 **`pb-[150px]`** 최소치로 강제 — pb-32(128px)/pb-40(160px) Tailwind preset 은 BottomNav 고정 높이(~60px) + safe-area-inset-bottom(34px iPhone 노치) + 스크롤 buffer 요구치를 합치면 실측 부족. 150px 이상이어야 마지막 카드가 반드시 보인다.
- **MUST** 럭셔리 "Black Card" 디자인은 **모노크롬** 원칙 — 여러 색상(rose/indigo/amber) 을 혼합하지 말고 base(slate-900/black) + 단일 accent(gold) 조합. Amex Black Card / Apple Card / Ledger Nano 전부 모노크롬. 다색은 "캐주얼 SaaS" 느낌.
- **MUST** 메탈릭 텍스트 효과는 `linear-gradient` + `WebkitBackgroundClip: text` + `backgroundClip: text` + `color: transparent` 4종 세트 — 어느 하나 빠지면 Safari/Chrome 한쪽에서 깨진다. inline style 로 명시(Tailwind JIT 는 arbitrary gradient + bg-clip 조합에서 간헐적 fail).
- **MUST** 럭셔리 포디움 glow 는 **2-layer shadow** — `shadow-[0_0_80px_rgba(gold,0.5),_0_20px_40px_rgba(0,0,0,0.6)]` 처럼 colored radial + 진한 drop. 단일 colored shadow 만 쓰면 "떠있는" 깊이감 안 나옴.
- **MUST** Rank 1 메달 자체에도 `filter: drop-shadow(0 0 12px rgba(250,204,21,0.7))` — 카드만 빛나고 메달 글리프는 평면이면 "싼 디지털 트로피" 느낌. 이모지 외곽에 아우라가 있어야 진짜 "legendary".
- **MUST** 배지("ELITE LIFETIME PASS" 등) 는 카드 **외부 상단 중앙** `-top-3 left-1/2 -translate-x-1/2` + 둥근 pill — 기존 대각 ribbon 은 2015년 SaaS pattern. 현대 럭셔리는 위에 살짝 떠 있는 centered pill.

### MUST NOT
- **MUST NOT** Tailwind preset pb-32/pb-40 에 의존 — 16px 단위 jump 이라 150px 정확히 못 맞춤. CEO 가 잘림 재발로 화낸 횟수 고려하면 **매직넘버 `pb-[150px]`** 명시가 정답.
- **MUST NOT** 블랙카드 스타일에 `grain` / `glass-specular` 유틸리티 적용 — 이 두 효과는 "frosted glass" 질감으로 블랙카드의 **solid/mat** 미학과 충돌. 배경이 너무 dark 하면 grain 은 오히려 dithering 노이즈로만 보임.
- **MUST NOT** 럭셔리 가격에 `text-2xl`/`text-3xl` 사용 — 최소 `text-4xl` (36px) 이상. 블랙카드의 가격은 **카드의 주인공**. 글씨가 작으면 "값 싸 보이는" 카드.
- **MUST NOT** 포디움 Rank 1 scale 을 `scale-110` 이상으로 올리지 말 것 — 모바일 390px 3-col grid 에서 좌/우 overflow 발생. `scale-[1.08]` 이 viewport clip 없이 dominance 표현하는 최댓값.
- **MUST NOT** 리더보드 row 에 `divide-y` 다시 쓰지 말 것(Stage 8.7 교훈 재확인) — 모노크롬 블랙카드 미학과 "목록 구분선" 패턴 공존 불가. gap + 독립 카드 방식만.

## Stage 8.7 Single-Scroll TradeTab & Luxury VIP/Academy Redesign

### MUST
- **MUST** 모바일 거래 앱의 TradeTab 은 **단일 스크롤 컨테이너** 로 설계 — 루트가 유일한 `overflow-y-auto`. TOP/MIDDLE/BOTTOM 3단 flex 로 쪼개지 말 것. ActionPanel 이 커지면 MIDDLE 이 쪼그라들어 차트/호가창이 사라지는 사고(특히 포지션 없을 때 Leverage/Size/Long-Short 3섹션 → 500px+). Binance/Upbit 전부 단일 스크롤 구조.
- **MUST** 차트는 `h-[350px] shrink-0` 고정 — 스크롤 컨테이너 안에서 flex 자식이 shrink 되면 `lightweight-charts` 가 0px → throw. 명시적 height + shrink-0.
- **MUST** LiquidationOverlay 는 **ActionPanel 을 감싸는 relative wrapper 내부** 에 렌더 — overlay 가 `absolute inset-0` 로 동작하려면 가장 가까운 positioned ancestor 가 있어야. 루트 overflow-y-auto 는 positioned 컨테이너가 아니라서 overlay 가 전체 페이지로 튐.
- **MUST** 스크롤 끝 `pb-32` (또는 pb-28) — BottomNav(고정 ~60px + safe-area) 뒤로 ActionPanel 마지막 버튼이 가려지는 사고 방지.
- **MUST** Lifetime/최상위 플랜 카드는 황금(`yellow-400` / `amber-400`) 아우라로 dominate — `border-yellow-500/50 shadow-[0_0_60px_rgba(250,204,21,0.4)]` 조합이 "이 옵션을 선택하라" 시각 힌트. Stripe/Linear/Notion Pricing 페이지 전부 이 패턴.
- **MUST** 럭셔리 가격표는 **세로 스택 + `gap-6`(24px)** — 3-col grid 에 squish 시키면 필연적으로 가격/특징이 줄바꿈. 세로 1열은 한 번에 하나만 집중해서 읽게 해 premium 느낌 증대.
- **MUST** 리더보드 하위 랭크(4~10) 는 divide-y 단조 구분선 대신 **각 row 를 독립된 glassmorphism 카드** 로 — `bg-white/5 border-white/10 backdrop-blur-md rounded-xl` + `gap-2` 개별 블록. hover/active 인터랙션까지 주면 "이걸 눌러 상세 볼 수 있다" 어포던스.
- **MUST** 포디움 카드 glow 의 alpha 는 **0.3~0.45 범위** — 0.15 이하는 모바일 OLED 에서 안 보이고, 0.6+ 는 주변 카드까지 번져 난잡. PLAN.md 의 `rgba(250,204,21,0.3~0.45)` 경험치.

### MUST NOT
- **MUST NOT** 단일 스크롤 TradeTab 에서 `flex-1` 를 자식 섹션에 쓰지 말 것 — 스크롤 컨테이너 안에서 flex-1 은 viewport 높이에 의존해 들쭉날쭉. 모든 섹션을 `shrink-0` + 명시적 height/콘텐츠 기반 height 로.
- **MUST NOT** ActionPanel 을 BottomNav 바로 위에 `fixed` / `sticky` 로 고정하지 말 것 — LiquidationOverlay 와 레이어 순서 꼬이고, 스크롤 컨테이너 pb 를 별도로 계산해야 하는 코스트. 차트 바로 아래에 자연스럽게 쌓이는 게 정답.
- **MUST NOT** Lifetime 카드의 scale 을 `scale-105` 이상으로 과하게 키우지 말 것 — 모바일 390px 에서 좌우 overflow 유발. `scale-[1.02]` 정도가 "살짝 튀어나오는" 럭셔리 느낌 마지노선.
- **MUST NOT** 포디움/가격표 glow 를 `shadow-[0_0_Npx_rgba(...)]` 하나만 주고 끝내지 말 것 — 단일 shadow 는 flat glow. 실제 럭셔리 카드는 `shadow-[0_0_60px_rgba(gold,0.4),_0_8px_40px_rgba(0,0,0,0.6)]` 처럼 **colored radial + 진한 drop shadow** 2-layer 조합으로 "떠 있는" 깊이감.
- **MUST NOT** divide-y 유틸리티 의존한 리스트 구분 — border 색상이 alpha 낮으면 거의 안 보이고, 진하면 "표" 느낌. 개별 카드 gap 방식이 현대적.

## Stage 8.6 Pinch-Zoom Kill & Chart Expansion

### MUST
- **MUST** viewport meta 에 `user-scalable=no` **와** `maximum-scale=1.0` **둘 다** 명시 — 브라우저별로 한쪽만 보는 경우가 있어 양쪽 다 쓰는 게 defensive. `minimum-scale=1.0` 까지 셋팅하면 초기 스케일 어떠한 경우에도 1.0 으로 고정.
- **MUST** `touch-action: manipulation` 을 html/body/#root 에 걸어 핀치줌 제거 — CSS 레벨 차단은 Android Chrome/Samsung Internet/Telegram WebView 에서 확실히 동작. double-tap zoom 도 같이 무력화.
- **MUST** iOS Safari 는 JS 레이어로 추가 차단 — `document.addEventListener('gesturestart', preventDefault, { passive: false })` + `gesturechange` + `gestureend`. iOS 10 부터 접근성 정책으로 viewport meta 의 user-scalable=no 를 무시하는 버그(기능) 있음. gesture* 이벤트는 iOS 전용이며 preventDefault 가 유일한 차단 수단.
- **MUST** `passive: false` 옵션 필수 — 최신 브라우저는 touch/gesture 이벤트를 기본 passive 로 등록해 preventDefault 호출해도 무시. 명시적으로 passive: false 해야 차단 효력 발생.
- **MUST** 모바일 거래 앱의 차트 높이는 **최소 40vh (≈350px @ 844px viewport)** — Binance/Upbit/Toss증권 전부 차트가 화면의 절반 가까이 차지. h-[160px] 같은 컴팩트 차트는 "데스크톱 대시보드" 느낌이지 "모바일 트레이딩 앱" 느낌 아님. 유저는 차트를 먼저 보고 주문창은 스크롤로.

### MUST NOT
- **MUST NOT** `{ passive: true }` (혹은 옵션 생략) 으로 gesturestart/touchend 리스너 등록 — preventDefault 가 noop 이 되어 차단 실패. 리스너 등록 시 `{ passive: false }` 가 핵심.
- **MUST NOT** `touch-action: none` 을 html/body 에 걸지 말 것 — pan(세로 스크롤) 까지 죽어서 탭 콘텐츠를 스크롤할 수 없게 된다. 반드시 `manipulation` (pan + tap 허용).
- **MUST NOT** 차트 높이를 `flex-1` 로 유동적 확장하지 말 것 — lightweight-charts v5 는 부모 높이 0px 이 되는 순간 throw, 그리고 MIDDLE 섹션이 `flex-1 overflow-y-auto` 라 flex 연쇄 축소 리스크. 명시적 `h-[350px] shrink-0` 고정으로 차트 영역 확보.
- **MUST NOT** double-tap preventDefault 로직을 `touchend` 말고 `click` 에 걸지 말 것 — `click` 은 이미 탭 완료 후 발생하는 합성 이벤트로 zoom 막기엔 too late. `touchend` 시점에서 시간차 측정해 막아야 한다.

## Stage 8.4 Mobile 9:16 Rebuild & Ultimate Desktop Share

### MUST
- **MUST** use `navigator.clipboard.write([new ClipboardItem({ 'image/png': blob, 'text/plain': textBlob })])` 로 이미지+텍스트를 **하나의 ClipboardItem** 으로 묶어 클립보드에 써야 한다 — 이미지를 먼저 `clipboard.write()` 로 쓴 뒤 `clipboard.writeText()` 를 호출하면 덮어써져서 둘 중 하나만 붙여넣기 가능. 표준 방식은 하나의 ClipboardItem 에 복수 MIME 동시 등록.
- **MUST** 데스크톱 최종 폴백으로 `'manual-save'` 결과를 반환해 컴포넌트가 `<img src={URL.createObjectURL(blob)}>` 풀스크린 모달을 띄우게 위임 — Telegram Desktop WebView 는 ClipboardItem 조차 거부할 수 있다. 이때 유저가 직접 우클릭(데스크톱) 또는 길게 눌러(모바일 웹뷰) "이미지 복사/저장" 컨텍스트 메뉴를 쓸 수 있어야 한다.
- **MUST** `useEffect(() => () => URL.revokeObjectURL(manualSaveSrc), [manualSaveSrc])` cleanup 으로 blob URL 메모리 회수 — manual-save 모달 닫을 때 revoke 안 하면 brokser memory leak. React 의 effect cleanup 이 deps 변경 시 이전 값에 대해 실행되는 점 활용.
- **MUST** 9:16 세로 뷰포트(390x844 기준)에서 가격표/리스트 같은 `grid-cols-N` 레이아웃은 `grid-cols-1 sm:grid-cols-N` 으로 전환 — 3-col 가격카드가 130px 너비에 squeeze 되어 UPPERCASE 타이틀이 2줄 wrap. 세로 스택으로 하나당 full-width 가 읽기 쉽다.
- **MUST** VIP/Portfolio 같은 스크롤 탭 루트에 `pb-32` 이상 여백 부여 — BottomNav(고정 높이 ~60px + safe-area-inset-bottom) 뒤로 리스트 하단 3~4개 row 가 잘려 유저가 "10위가 안 보인다" 느낌. `pb-40` 가 iPhone SE 부터 Pro Max 까지 안전.
- **MUST** absolute coordinate alignment: `position: relative` 박스 + `position: absolute; bottom: 0; left: 50%; transform: translate(-50%, Npx)` 조합으로 이모지/아이콘 **바닥 픽셀 라인을 강제 고정** — `flex items-end` 만으로는 OS 이모지 폰트별 내부 여백 차이(3-5px) 를 흡수 못 함. absolute bottom-0 는 수학적으로 확정.
- **MUST** 모바일 메인 인터랙션 영역(레버리지 슬라이더/마진 프리셋/LONG/SHORT) 의 부모 컨테이너에 최소 `px-3` (12px) 좌우 여백 — 엣지에 터치 타겟이 붙으면 iOS/Android 가 뷰포트 스와이프로 인식해 tab 이 닫히거나 가로 제스처 오인식. 결국 거래 실패.

### MUST NOT
- **MUST NOT** `<a download>` 임시 앵커 방식에 의존 — Telegram Desktop WebView (Windows/Mac 모두) 는 download 트리거를 silent 하게 차단. 유저는 "버튼 눌러도 아무 일 없음" 이라고 컴플레인. Stage 8.3 에서 쓴 방식을 8.4 에서 완전 폐기한 이유. Chromium desktop 브라우저에서도 팝업 차단 설정에 따라 blocked 될 수 있다.
- **MUST NOT** `clipboard.writeText` 와 `clipboard.write([ClipboardItem])` 를 연속 호출하지 말 것 — 둘째 호출이 첫째를 덮어쓴다. 하나의 ClipboardItem 에 `text/plain` 을 같이 포함시켜야 한다.
- **MUST NOT** 세로 스택 가격카드 간 `gap-2` (8px) 유지 — 카드가 full-width 이 되면 시각 밀도가 2배로 증가해 `gap-3` (12px) 이상 필요. 컴팩트 3-col 시절 그대로 gap-1/2 두면 카드끼리 달라붙어 보임.
- **MUST NOT** inline `style={{ transform: 'translate(-50%, Npx)' }}` 를 Tailwind `-translate-x-1/2` 클래스와 혼용하지 말 것 — 둘 다 `transform` property 를 설정하므로 style 이 클래스를 override. 하나의 source of truth 유지를 위해 **inline style 하나만** 쓰는 게 정답. (클래스 남겨도 동작은 하지만 읽는 사람이 혼란.)
- **MUST NOT** PremiumTab 의 PlanCard badge(BEST VALUE 대각 ribbon) 를 세로 스택 전환 후 재검증 없이 방치 — 카드가 full-width 가 되면 `-right-7 rotate-45` 위치가 시각적으로 튀어나와 보일 수 있다. 각 breakpoint 에서 스크린샷 찍어 확인 필요. (현재 코드는 이미 OK 하지만 향후 변경 시 주의.)

## Stage 8.3 Desktop Fallback & Forced Pixel Alignment

### MUST
- **MUST** treat `navigator.share` 존재만으로 모바일 판정하지 말 것 — Windows Chrome/Edge 도 `navigator.share` 는 갖고 있지만 `canShare({files})` 는 false. 반드시 `canShare({files:[file]})` 를 호출해 files 지원 여부를 확정해야 한다. 안 그러면 Telegram Desktop 에서 share 시트가 열리다 말고 실패.
- **MUST** on desktop 경로 **clipboard 와 download 를 동시에** 실행하되 하나 실패해도 다른 하나는 강행 — CEO 지시 "PC 핑계 대지 말고 무조건 사진 다운로드+클립보드 복사". try/catch 분리로 부분 실패 허용. 둘 다 실패한 경우에만 최종 폴백으로.
- **MUST** delay `URL.revokeObjectURL(url)` 최소 500ms (실측 1000ms 안전) — 즉시 revoke 하면 일부 Chromium 이 다운로드를 취소하고 빈 파일을 저장.
- **MUST** append `<a>` 를 `document.body` 에 실제로 삽입한 뒤 `click()` → `removeChild()` — Safari 는 DOM 에 붙지 않은 앵커의 `click()` 을 무시하는 경우가 있다.
- **MUST** use **inline `style={{ transform: 'translateY(Npx)' }}`** for per-rank emoji pixel offset — Tailwind JIT 임의 값(`translate-y-[3px]`) 은 빌드 타임에 생성 안 되면 적용 안 됨. 3개 이하 glyph 보정처럼 하드코드 가능한 경우는 인라인 스타일이 가장 확실.
- **MUST** keep `flex items-end` 상위 정렬 + `translateY` 하위 보정 조합 — flex 자체를 버리고 `mb-*` 로만 눌러 맞추면 tall(#1) 카드 높이 차이가 깨진다. 두 레이어 조합이 표준.
- **MUST** mark 보정용 emoji span with `aria-hidden="true"` — rank 숫자/이름은 별도 label 로 읽히므로 emoji 는 순수 장식. 스크린리더가 "crown crown" 중복으로 읽는 걸 방지.

### MUST NOT
- **MUST NOT** rely on browser's `items-end` alone to align 이모지 바닥 — OS별 이모지 폰트(Apple Color Emoji / Segoe UI Emoji / Noto Color Emoji) 가 글리프 내부 bounding box 가 다르다. 👑 는 뿔 장식 때문에 실제 시각적 바닥이 3~5px 위. 반드시 글리프별 수동 보정.
- **MUST NOT** fall back to text-only clipboard 없이 곧장 `'none'` 반환 — 모든 브라우저 폴백 체인이 끊어지면 유저가 "버튼 눌렀는데 아무 반응 없다" 컴플레인. clipboard 라도 성공시켜야 한다.
- **MUST NOT** use a relative `<a download>` URL for blob downloads — 반드시 `URL.createObjectURL(blob)` 로 블롭 URL 생성. `canvas.toDataURL` 로 base64 하면 대용량에서 Chrome 이 "too long URL" 에러.
- **MUST NOT** attempt `navigator.clipboard.writeText` in non-secure origin (http://) 없이 try/catch — Safari/Chrome 은 non-HTTPS 에서 throw. 반드시 try 로 감싸고 실패해도 다음 단계로 진행.

## Stage 15.3 Telegram Stars Payment

### MUST
- **MUST** cross-verify `ctx.from?.id` (Telegram sender) ↔ `payload.userId` in `bot.on('message:successful_payment')` — Telegram API 가 메시지 출처를 보증하더라도 payload 구조가 미래에 바뀌어도 사칭이 통하지 않도록 명시적 검증을 둔다. 누락 시 silent discard.
- **MUST** distinguish `already_processed:` 에러 (조용히 return) vs 그 외 에러 (사용자에게 `ctx.reply()` 로 "결제는 받았지만 활성화 실패" 안내) in payment handler catch 블록. silent `console.error` 는 결제했는데 아무 일도 안 일어난 듯한 UX 를 만든다.
- **MUST** check `.error` on idempotent UNIQUE-constraint follow-up query — fallback 으로 합성 값 (`periodEnd.toISOString()`) 을 만들면 권한 거부/DB offline 같은 진짜 실패가 숨겨진다.
- **MUST** set `subscription_period: 2592000` 인자를 `bot.api.createInvoiceLink` 의 7번째 파라미터(options) 로 전달 — Stars 자동 갱신 30일은 그 옵션으로만 작동.
- **MUST** use currency `'XTR'` + `provider_token: ''` 로 Telegram Stars 결제. 다른 currency 면 일반 invoice 가 되고 provider_token 이 필요해진다.

### MUST NOT
- **MUST NOT** trust the invoice payload `userId` without re-resolving via `engine.getUserByTelegramId(ctx.from.id)`. payload 는 invoice 발급 시점 데이터일 뿐 결제 시점 발신자 보증이 아님.
- **MUST NOT** restore `seeded_at` or 시드 재발급 in Recharge flow — 1계정 1회 시드 정책 보존. Recharge 는 `wallets.balance += $1000` + `is_liquidated=false` 만.
- **MUST NOT** redirect 결제를 외부 페이지(im.page 등) 로. 모든 결제는 `tg.openInvoice(invoiceLink)` 인앱 흐름. 외부 redirect 는 텔레그램 인앱 브라우저로 열려도 우리 미니앱 상태 sync 가 끊긴다.
- **MUST NOT** use `now()`, `current_timestamp`, or any volatile function inside a Postgres partial index `WHERE` predicate — fails with `42P17 functions in index predicate must be marked IMMUTABLE`. 만료 체크용 인덱스는 partial 빼고 full index 로. 적용 시점이 IMMUTABLE 이 아니므로 인덱스 정의 자체에 박을 수 없다.
