# PROGRESS

## Latest Session — 2026-04-22 (런칭 체크리스트 일괄 정리 · Stage 12 프로덕션 하드닝)

### Done

**체크리스트 인수인계 재진단 — 이미 구현된 항목 다수 발견**
- B-01 랭킹 집계 크론 (`bot/src/engine/ranking.ts` 매분 캐시), B-02 자정 KST 롤오버, B-03 `/api/rankings/today|yesterday`, B-04 VIP 채팅 야간 토글(`ChatSwitcher`), B-05 initData HMAC, B-07 `/api/user/status` 확장, F-01~F-05, F-07, F-09 모두 기존 코드에 구현 완료 확인.

**Phase 1 — P0 잔여**
- `supabase/migrations/03_referral_missions.sql` 신규: 3명/10명 마일스톤 상태 테이블 + RLS + updated_at 트리거.
- `supabase/migrations/04_admin_actions.sql` 신규: 관리자 감사 로그 (JSONB payload, IP, action_type).
- `supabase/migrations/05_pg_cron.sql` 신규: `pg_cron` 확장 + 90일 이전 ranking snapshot 정리 잡.
- `bot/src/services/invitemember.ts` 신규 (B-06): `getChatMember` 래퍼 + Promo code pool 발급기.
- `bot/src/engine/referralMission.ts` 신규 (B-08): `evaluateMilestones(referrerUserId)` — 3명 시 +$50K 지갑 입금, 10명 시 Promo code 자동 발급 + DM.
- `bot/src/bot.ts`: `/start` 에서 초대자 확정되면 `referralMission.evaluateMilestones` 호출. `createBot(engine, context)` 시그니처로 순환의존 해결.
- `bot/src/server.ts`: `/api/user/status` 응답에 `mission{referredCount, milestone3Claimed, milestone10Claimed, promoCode}`, `telegramUserId` 추가. `/api/admin/verify` 승인 시 promo code 자동 발급 + DM + 감사 로그 insert. `/api/admin/metrics` 신규 (A-05).

**Phase 2 — 운영 안정성**
- `bot/src/lib/logger.ts` 신규 (B-17): pino + pino-pretty 개발 모드, PII redact, unhandledRejection/uncaughtException hook.
- `bot/src/lib/sentry.ts` 신규 (B-15): `SENTRY_DSN` 있을 때만 활성, PII 스크럽(x-admin-secret/authorization).
- `bot/src/middleware/rateLimit.ts` 신규 (B-16): express-rate-limit 3종 (trade 30/min, read 120/min, admin 100/min). server.ts 에 `trust proxy=1` + 라우트별 적용.

**Phase 3 — 자동화 / 매출**
- `bot/src/services/affiliates/mexc.ts`, `bot/src/services/affiliates/bybit.ts` 신규 (B-11, B-12): env 기반 수동 목록 → 공식 API 폴백 듀얼 모드. Bybit HMAC-SHA256 서명 구현.
- `bot/src/cron/affiliateReconcile.ts` 신규: 1시간 주기 pending 인증 재조회 후 자동 승인 + 감사 로그.
- B-13 Promo code 자동 발급: `/api/admin/verify` 승인 시점에 `issuePromoCode()` 호출 + DM 발송.

**Phase 4 — 프론트 잔여**
- `web/src/lib/api.ts`: `MissionStatus` 타입 추가, `UserStatus.mission`, `telegramUserId` 필드 추가.
- `web/src/tabs/PremiumTab.tsx`: 기존 3/3 단일 프로그레스 → `ReferralMissionCard` 분리 컴포넌트. 3명/10명 이중 프로그레스 + Promo code 발급 시 탭-투-복사 카드 노출 (F-06).
- `web/src/components/RankCard.tsx` 신규 (F-08): 1080×1920 SVG 스냅샷 + 공유 유틸(`rankCardToDataUrl`, `copyRankCard`). 외부 라이브러리 의존 없음.
- `web/src/lib/analytics.ts` 신규 (F-13): posthog-js + web-vitals 래퍼. CLS/INP/LCP/FCP/TTFB 자동 전송, 이벤트 이름 화이트리스트(`EventName`).
- `web/src/App.tsx`: analytics init + identify + tab_viewed 이벤트.

**Phase 5 — 랜딩페이지 (L-05~L-13)**
- `apps/landing/src/app/layout.tsx` 전면 교체: metadataBase, OG, Twitter card, alternates(en/ko), themeColor viewport.
- `apps/landing/src/app/page.tsx` 확장: Hero + Features 4컷 + LivePreview + LiveLeaderboard(서버 컴포넌트 60s ISR) + Pricing + FAQ + Footer.
- 신규 컴포넌트: `LivePreview`, `LiveLeaderboard`, `PricingTable`, `FAQ`, `SiteFooter`.
- `apps/landing/src/app/ko/page.tsx` 신규 (L-12): 한국어 전용 랜딩.
- `apps/landing/src/app/robots.ts`, `apps/landing/src/app/sitemap.ts` 신규 (L-11): SEO.

**Phase 6 — 법무 (LG-01~LG-05)**
- `apps/landing/src/components/LegalPage.tsx` 공통 레이아웃.
- `/terms`, `/privacy`, `/disclaimer`, `/refund`, `/cookies` 5페이지 작성. "유사투자자문 아님" 명시 + GDPR/PIPA/CCPA 권리 섹션.

**Phase 7 — 배포 준비 + Admin 대시보드**
- `apps/landing/src/app/admin/page.tsx` 신규 (A-05): x-admin-secret 입력 → `/api/admin/metrics` 호출 → Total Users / DAU / MAU / 청산율 / 인증 전환율 표시.
- `.env.example` 세트 4개 갱신/신규: 루트, `bot/`, `web/`, `apps/landing/`.

### 검증 게이트
- ✅ `npm run -w bot typecheck` — 에러 0
- ✅ `npm run -w bot build` — tsc 산출 성공
- ✅ `npm run -w web typecheck` — 에러 0
- ✅ `npm run -w web build` — vite 성공 (1.26MB gzip 374KB)
- ✅ `apps/landing` → `npx next build` — 13 static 페이지 (/, /ko, /admin, /cookies, /disclaimer, /privacy, /refund, /terms, /robots.txt, /sitemap.xml) 전부 prerender 성공

### Blockers / AI 범위 밖
- **IM-01~IM-09** InviteMember 대시보드 세팅 — 대표님 직접 (외부 SaaS).
- **M-01~M-08** 디자인 에셋 — 로고 SVG / OG 이미지 / 프로모 비디오 / 스크린샷.
- **I-01, I-04~I-12** 배포 실행 — GitHub 저장소 생성, Vercel 배포, Render 배포, Supabase 프로젝트 생성, Cloudflare DNS, BotFather 등록, UptimeRobot.
- **LG-01~LG-05** 법무 템플릿 초안만 작성 완료 — 실제 법률 검토 필수.
- **Q-01~Q-05** 실기기 QA — 안드로이드/iOS/Telegram 데스크톱/결제 E2E.

---

## Archive — 2026-04-21 (Stage 8.9 → 8.12 모바일 UI 수술)

### Done (이번 세션, Stage 8.9 ~ 8.12)

**Stage 8.9 — 레이아웃 하단 물리 스페이서 + VIP 럭셔리 라인**
- `TradeTab`: Chart → OrderBook/RecentTrades → ActionPanel 순으로 재배열 (Binance/Bybit 표준 UX), 모든 탭 루트에 `h-[150px] shrink-0 pointer-events-none` 투명 스페이서 추가 → `pb-[150px]` collapse 방지해 하단 폼 잘림 물리적 차단.
- `VIPTab`: 뚱뚱한 gradient 캡슐 배너 삭제 → `h-px bg-gradient-to-r via-yellow-500/50` 명품 시계 카탈로그식 얇은 금선 디바이더 + "Top 10 Elite Analysts" `tracking-[0.4em]`.

**Stage 8.10 — 차트 패딩 + Portfolio 럭셔리 지갑 + Academy 모달 분리**
- `TradeTab`: 차트 섹션 `pt-2` 추가해 최고가 심지 잘림 해결.
- `VIPTab`: i18n 키 `elite.heroSubtitleLine1/Line2` 2분할 + `break-keep` + `<br />` 로 한글 단어 중간 끊김 제거.
- `PortfolioTab`: Amex Black Card + Apple Wallet 레퍼런스 **전면 리디자인**. 상단 hairline + specular diagonal sheen + 6xl metallic gradient equity + 3-stat glass grid (Cash/Margin/Realized).
- `PremiumTab`: 3-PlanCard 스택 **전량 삭제** → 메인은 👑 업그레이드 배너 + 히어로 타이포 + Education Library 4카드(📘⚡🛡️🧠) + Partner Exchanges 배지. 결제는 `fixed inset-0 z-50` 풀스크린 `PaymentModal` (body scroll lock + Esc + backdrop click close + sticky top-0 close bar) 로 완전 분리.

**Stage 8.11 — 안드로이드 WebView 텍스트 투명 / 타이머 가시성 / 뷰포트 1차 수술**
- `PortfolioTab`: `WebkitBackgroundClip: 'text'` + `color: transparent` 조합이 안드로이드 크롬에서 글자 통째로 사라지는 버그 발견 → solid `text-emerald-300/rose-300/white` + `drop-shadow` glow 로 교체.
- `VIPTab`: 우측 disabled 버튼이 타이머 덮고 있던 구조 폐기 → 우측 `text-2xl text-yellow-400` gold 크로노그래프 타이머 노출, 잠금/오픈 뱃지는 좌측 하단 작은 pill 로 축소.
- `PremiumTab`: 배너 `mt-2` → `mt-6` (천장 여백), hero label `tracking-[0.4em]` → `tracking-[0.2em]`, 서브타이틀 `leading-tight` → `leading-relaxed`.
- `useTelegram.ts`: `tg.viewportStableHeight` → `--tg-viewport-height` CSS 변수 주입 + `viewportChanged` 이벤트 구독 (키보드/URL 바 토글 대응). `types/telegram.d.ts` 에 `onEvent`/`offEvent` 타입 추가.
- `App.tsx`: `<main>` 에 `style={{ height: 'var(--tg-viewport-height, 100dvh)' }}` 적용.

**Stage 8.12 — 안드로이드 drop-shadow 텍스트 vanishing 확정 fix + 뷰포트 체인 전체 하드닝**
- `PortfolioTab`: equity `<div>` 에서 **`drop-shadow-*`, `tabular-nums` 완전 제거**. `equityGlow` 변수 삭제. 안드로이드 WebView 버그 — drop-shadow filter + tabular-nums 조합이 큰 텍스트 자체를 렌더 누락시킴. 색만으로 up/down 표기.
- `VIPTab`: 타이머 `drop-shadow-[0_0_12px_rgba(250,204,21,0.4)]` + `tabular-nums` 완전 제거. `text-yellow-400`/`text-emerald-300` 순수 텍스트.
- `PremiumTab`: 배너 `mt-6` 제거 → 루트 컨테이너에 `pt-6` 이전 (wrapper 레벨 여백), hero label `tracking-[0.2em]` → `tracking-widest`.
- `index.css`: `html, body, #root` 높이 `100%` → **`var(--tg-viewport-height, 100dvh)`**. 컨테이너 체인 전체가 Telegram 가시 영역에 맞춰지므로 BottomNav 가 폰 바닥에 물리적으로 고정 (안드로이드 URL 바/시스템 내비 gap 제거).

### 검증 게이트
- ✅ `npm run typecheck -w web` — 에러 0 (각 Stage 완료 시 실행)
- ⏳ **대표님 안드로이드 실기기 검증 대기** — 다음 세션 첫 액션:
  1. Portfolio 탭 — `$100,000` 6xl 숫자가 선명하게 보이는지 (drop-shadow vanishing bug 재발 여부)
  2. 애널리스트 탭 — 우측 gold `HH:MM:SS` 카운트다운 선명한지
  3. Academy 탭 — 👑 배너 상단 여백 넉넉한지, "아카데미 멤버십" 자간 안 벌어졌는지
  4. BottomNav 가 폰 밑바닥에 딱 붙는지 (공중 뜸 / 회색 갭 제거 확인)

### Blockers
- 안드로이드 WebView 에서 drop-shadow + tabular-nums 조합은 **영구 금지 항목**. 럭셔리 글로우 필요하면 `backdrop-blur` / 배경 `blur-3xl` 레이어로만 구현해야 함. GOTCHAS.md 반영 권장.
- 나머지 Stage 3~5 백엔드 과제는 그대로 대기 (랭킹/거래소 인증/Stars 결제).

### 다음 세션 시작 플레이북
1. 대표님 안드로이드 검증 결과 수집 (4개 체크리스트).
2. 실패 항목 있으면 Stage 8.13 즉시 패치.
3. 모든 UI 통과하면 PLAN.md 백엔드 파트로 넘어가 Stage 3 (랭킹 집계) 착수.

---

## Archive — 2026-04-20 (Stage 2)

### Done
- **Stage 1 (skeleton)**: web + bot 모노레포, Telegram WebApp 연동 스켈레톤
- **Stage 2 (DB & Core Engine)**:
  - `.env.example` + `env.ts`에 Supabase/allowance/symbols 추가
  - `supabase/schema.sql`: users / wallets / positions 테이블 + RLS + 트리거 (대시보드 수동 실행)
  - `bot/src/db/` supabase 클라이언트 + row 타입 (UserRow/WalletRow/PositionRow)
  - `bot/src/services/binance.ts`: WebSocket combined stream + EventEmitter + 재연결(백오프 30초 상한) + CLI 모드
  - `bot/src/engine/liquidation.ts`: 순수 함수 3종 (청산가/청산여부/PnL)
  - `bot/src/engine/trading.ts`: upsertUser, grantDailyAllowance, openPosition(optimistic lock + 롤백), closePosition, scanAndLiquidate (전액 몰수 + is_liquidated 플래그)
  - `bot/src/bot.ts`: /start에 유저 upsert + 일일 지급, /balance 추가
  - `bot/src/index.ts`: 피드→엔진 배선, graceful shutdown에 feed.stop() 추가
  - `bot/scripts/test-liquidation.ts`: 16개 assertion 순수함수 검증 스크립트

### Verification Gates (PLAN.md §2)
- ✅ `npm run typecheck -w bot` — 에러 0
- ✅ 바이낸스 단독 실행 (`tsx src/services/binance.ts btcusdt ethusdt`) — 실시간 시세 수신 확인 (BTC ~$75,540, ETH ~$2,310)
- ✅ 청산 로직 테스트 (`tsx scripts/test-liquidation.ts`) — 16/16 pass
- ✅ env guard — Supabase 키 없으면 fail fast

### 대표님 액션 필요 (전달 사항)
1. **Supabase 프로젝트 생성** → Dashboard > SQL Editor에 `supabase/schema.sql` 전체 붙여넣기 후 Run
2. Dashboard > Settings > API에서 URL, anon key, service_role key 복사
3. `.env` 파일에 다음 입력:
   - `TELEGRAM_BOT_TOKEN` (BotFather)
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
4. `npm run dev` → 텔레그램에서 `/start`, `/balance` 확인

### Remaining
- **Stage 3**: 랭킹 집계 + VIP 채팅 권한 (일일 수익률 기준 탑10)
- **Stage 4**: 30개 거래소 래퍼럴 인증 시스템 (3-tier)
- **Stage 5**: Telegram Stars 결제 (구독 + 청산 후 재구매)
- **기타 리팩터 후보**:
  - `openPosition`의 잔고 차감을 Postgres RPC(stored function)로 원자화
  - 포지션 심볼별 인덱싱 — 초당 스캔 비용 모니터링
  - 웹훅 방식 배포 전환 (Vercel/Railway)

### Blockers
- 현재 없음. Stage 2 엔진은 코드 완성 — 대표님이 Supabase 키 주입 후 E2E 검증 가능.

---

## Chunk Log
<!-- verifier-runner만 수정 -->
- [2026-04-20] Stage 1 skeleton committed
- [2026-04-20] Stage 2 DB + Binance + Trading Engine: 16/16 liquidation tests, WS live, typecheck clean
- [2026-04-21] Stage 4 pro UI: lightweight-charts v5 candlestick, real Binance REST+WS, leverage/size preset UI, typecheck clean
- [2026-04-21] Stage 5 Telegram Mini App integration: SDK theme sync (setHeaderColor/BackgroundColor/disableVerticalSwipes), user badge in Header, safe-area-inset padding, `npm run tunnel` script
- [2026-04-21] Stage 5.5 order REST + Stars: priceCache, Express routes (/api/trade/{open,close}, /user/status, /payment/stars), revivePaidUser, grammy pre_checkout + successful_payment, Vite /api proxy, frontend server-driven state (2s polling), LiquidationOverlay 150⭐ button. Full typecheck clean.
- [2026-04-21] Stage 6 대공사 (USD / Multi-coin / 4-tab): DAILY_ALLOWANCE 100억 KRW → $100,000 USD, bot 메시지/invoice USD 포맷, schema 리셋 SQL 주석, `format.ts`에 formatMoney 추가(₩→$, M 축약), `markets.ts` + `CoinSelector` BTC/ETH/SOL 스위처, Header 심볼 메타 동적화, `BottomNav` 4탭(Trade/Portfolio/VIP/Premium), `TradeTab`(기존 단일스크린 이관 + 심볼 상태 내부 관리), `PortfolioTab`(에쿼티 카드 + 오픈포지션 + 거래내역 20건, `GET /api/user/history` 신설 + engine.getPositionHistory), `VIPTab`(KST 21:50~24:00 채팅창구 + Top10 목 리더보드), `PremiumTab`($29.99 앵커/$7.99 평생 할인 + 18개 거래소 카탈로그 + UID 텍스트 인증 폼 + 심사중 pending UI), App.tsx 탭 라우터로 축소. Full typecheck clean (web + bot).
- [2026-04-21] Stage 7.5 퀀텀 점프 (호가창/진동/펀딩/바이럴 공유): `utils/telegram.ts` 햅틱+공유 래퍼 (no-op 폴백 + 3단 share 폴백), `telegram.d.ts` switchInlineQuery/shareToStory/showPopup 타입 추가, `useOrderBook` (@depth10@100ms) + `OrderBook` (10 bids/asks, flash on price change, depth bar), `useRecentTrades` (@trade 30 rolling) + `RecentTrades`, `useFundingRate` (fapi premiumIndex 30s poll + countdown) + `FundingTicker`, `ShareROIButton` (html2canvas 캡처 + Binance 스타일 ROI 카드 + 3단 공유 폴백), ActionPanel LONG/SHORT heavy 햅틱 + 슬라이더/프리셋 selection 햅틱 + Close medium, BottomNav/CoinSelector selectionChanged, LiquidationOverlay Recharge heavy, TradeTab 청산 false→true 에지 error notification + handleOpen/Close success/error 햅틱, TradeTab 레이아웃 재구성 (FundingTicker + OrderBook/RecentTrades 2 컬럼 + 차트 h-[260px] 고정 + overflow-y-auto 스크롤), PortfolioTab 오픈 포지션 라이브 PnL + ShareROI 버튼, html2canvas 설치. Full typecheck clean (web + bot).
- [2026-04-21] Stage 7.5 **Bugfix** (UI 대참사 구조 + VIP/Premium 럭셔리): TradeTab 3단 flex 재구성 (top shrink-0 · middle flex-1 overflow-y-auto · bottom shrink-0) → LONG/SHORT 버튼 상시 노출, 차트 h-[200px] 고정. `useOrderBook`/`useRecentTrades` 심볼 전환 시 bids/asks/status 즉시 리셋해 이전 코인 데이터 잔류 차단. OrderBook/RecentTrades rows=5 컴팩트(text-[9px] / py-[2px], Total 컬럼 제거). VIPTab 럭셔리: hero gradient + 앰비언트 gold glow + Glassmorphism 카운트다운 카드(1s tick, open/close 초단위) + TOP 3 포디움(#1 가운데 tall + 👑 + `shadow-[0_0_25px_rgba(251,191,36,0.35)]` + streak 🔥 badge) + Rank 4~10 리스트 + $5,000 Prize Pool 배너. PremiumTab SaaS 풍: hero + 3-plan(Free/Premium $29.99/Lifetime $7.99) 비교 카드 + "BEST VALUE" 대각 ribbon + 6개 feature 체크리스트 + 인증 폼 indigo→fuchsia gradient CTA + Level 색상구분 exchange pills. Full typecheck clean (web + bot).
- [2026-04-21] Stage 7.8 **럭셔리 성형수술** (Specular / Grain / Typography): ActionPanel LONG/SHORT/Close 버튼 `bg-gradient-to-b from-X-400 to-X-600` + 상단 1px specular 하이라이트(`inset_0_1px_1px_rgba(255,255,255,0.45)`) + 외부 glow(`0_6px_18px_rgba(emerald/rose,0.4)`) + `active:scale-[0.96]` + `active:shadow-[inset_0_2px_4px...]` 물리 press-down. Emerald/Rose 팔레트 통일(LiquidationOverlay red-950→rose-950). OrderBook/RecentTrades 가격에 `drop-shadow-[0_0_4px_rgba(...)]` neon glow + `font-bold tabular-nums`. 차트 h-[200px]→`h-[160px]` 축소, OrderBook/RecentTrades `py-1 text-[10px]` breathing. Typography hierarchy: Header price/Equity/PnL `font-black tabular-nums tracking-tight`, 레이블/Vol/Funding/Notional 전부 `text-white/30~40` 드라스틱 fade. index.css 에 `.grain` (SVG fractalNoise base64 + overlay blend) + `.glass-specular` (135deg linear-gradient 하이라이트) 유틸 추가. VIP hero/countdown/rank-list/prize-pool/포디움#1, Premium hero/Lifetime card/verification form/exchanges/PendingCard 전부 `grain` + 선택적 `glass-specular` + `backdrop-blur-2xl` + `shadow-[0_8px_32px_rgba(0,0,0,0.5)]` 적용 → 물리 간유리 질감. Full typecheck clean (web + bot).
- [2026-04-21] Stage 7.9 **긴급 수술** (Equity Sync / Typography / Bot Menu): PortfolioTab `liveEquity = balance + margin + livePnl` 실시간 틱 (margin 락킹 복구 포함) → STARTING_SEED $100K 대비 델타 부호로 emerald/rose 색상 + `drop-shadow-[0_0_12px_...]` glow + 델타% 표시 font-mono text-4xl font-black tabular-nums. 총자산 카드 `grain glass-specular` 적용. PremiumTab 3-col 가격 `text-lg→text-2xl` 점보화, 기능 리스트 `text-[9px]→text-[11px] font-medium gap-1→gap-2.5` 여백 대폭 확장, FEATURES 6개 영어 punchy bullet 로 교체(Multi-Coin Charts / $100K Daily Seed / VIP Chat Access / Prize Pool / Instant Revive −30% / Lifetime Discount), BEST VALUE ribbon `text-[8px]→text-[9px]` + 위치 보정, hero copy `text-[11px]→text-[13px]` 가독성 상향, 제출 CTA `py-3.5→py-4 text-[14px]` + inner specular + 물리 press-down. Bot `/start` 전면 개편: `buildStartKeyboard` helper + InlineKeyboard 3버튼(🎮 Play Game web_app / 📖 How to Play callback / 💎 VIP & Premium callback), 환영 메시지 $100K USD 명시 + granted/already 분기 개선, `bot.callbackQuery(CB_HOW)` 6단계 게임 가이드 + 청산 안내, `bot.callbackQuery(CB_PREMIUM)` 3-tier 요약(Free/Premium $29.99/Lifetime $7.99) + Mini App Premium 탭 유도 (HTTPS 시 `💎 Open Premium` web_app 버튼 추가). Full typecheck clean (web + bot).
- [2026-04-21] Stage 8.8 **pb-[150px] 일괄 + Black Card Academy + Legendary Podium**: 4개 탭(Trade/Portfolio/VIP/Academy) 모두 루트 스크롤 컨테이너에 **`pb-[150px]`** 강제 일괄 적용 — pb-32/40 부족으로 Lifetime 카드 하단 잘림 재발 → 150px 로 BottomNav(~60px) + safe-area-inset + 여유 버퍼 모두 흡수. `PremiumTab` `PlanCard` 전면 재작성: accent 유니온 `'slate' | 'rose' | 'indigo' | 'gold'` → **`'slate' | 'gold'`** 단순화(모노크롬 = 럭셔리). Free/Premium 은 `bg-slate-900 border-white/10 p-6 rounded-3xl` 미니멀 블랙카드. Lifetime 은 **Amex Black Card 미학**: `bg-gradient-to-b from-slate-900 to-black` + `border-2 border-yellow-500/50` + `p-8` + `shadow-[0_0_80px_rgba(250,204,21,0.2),_0_20px_50px_rgba(0,0,0,0.7)]` + 상단 gold hairline + 가격/배지 모두 메탈릭 gold gradient text(`WebkitBackgroundClip: text` + `linear-gradient(180deg, #fef3c7 0%, #fbbf24 55%, #b45309 100%)`). "BEST VALUE" → **"ELITE LIFETIME PASS"** 로 en/ko 양 locale 교체, badge 위치 상단 중앙 `-top-3 left-1/2 -translate-x-1/2` + `shadow-[0_0_20px_rgba(250,204,21,0.5)]`. `VIPTab` `PodiumCard` 전면 rebuild: `heightHint` prop 제거 → rank 로 직접 판정. Rank 1 **전설급 dominance**: `h-44 scale-[1.08]` + `border-2 border-yellow-500/60` + `shadow-[0_0_80px_rgba(250,204,21,0.5),_0_20px_40px_rgba(0,0,0,0.6)]` + 메달에 `filter: drop-shadow(0 0 12px rgba(250,204,21,0.7))` + 카드 상단 centered radial glow(`-top-8 h-24 bg-yellow-300/30 blur-3xl`). Rank 2/3 은 `h-36 border-2` silver/bronze 메탈릭 + 중간 크기 glow. 각 카드 상단에 대각 `linear-gradient(135deg, ...)` 메탈릭 하이라이트로 "금속 윤기" 시뮬레이션. 리더보드 4~10위 `gap-2 py-3` → **`gap-4 p-4`** + `rounded-xl → rounded-2xl` + `backdrop-blur-md → backdrop-blur-xl` + hover 인터랙션 `hover:border-white/20` + PnL drop-shadow 0_0_6px → 0_0_8px 강화. Full typecheck clean (web).
- [2026-04-21] Stage 8.7 **TradeTab Single-Scroll 재구조 + VIP/Academy 럭셔리 재디자인**: `TradeTab` 3단 flex(TOP shrink-0 / MIDDLE flex-1 overflow-y-auto / BOTTOM shrink-0) 아키텍처 **전면 폐기** — 루트가 `flex h-full flex-col gap-3 overflow-y-auto px-3 pb-32` 단일 스크롤 컨테이너. 레이아웃 순서 Header → FundingTicker → CoinSelector → TradingChart(h-[350px] shrink-0) → ActionPanel(relative wrapper + LiquidationOverlay 오버레이) → BalanceBar → OrderBook/RecentTrades(2-col) 세로 나열. Binance 모바일 앱과 동일 UX — 유저는 차트 먼저 보고 스크롤 내려서 주문. ActionPanel 커져도 차트 찌그러지지 않음. `VIPTab` 포디움 glow 대폭 강화: 🥇 `shadow-[0_0_40px_rgba(250,204,21,0.45)]` / 🥈 `shadow-[0_0_30px_rgba(148,163,184,0.35)]` / 🥉 `shadow-[0_0_30px_rgba(180,83,9,0.35)]`. Rank 4~10 리스트 `divide-y` 단조 구분선 → 각 row 개별 glassmorphism 카드(`bg-white/5 border-white/10 backdrop-blur-md rounded-xl p-3`) + `gap-2` + hover 인터랙션 + PnL 값에 emerald neon glow. `PremiumTab` 3개 가격 카드 모든 breakpoint 에서 **세로 스택 `flex flex-col gap-6`** (모바일/데스크톱 공통, "한 번에 하나씩 집중" 럭셔리 SaaS 패턴). `PlanCard` accent union 에 `'gold'` 추가 — Lifetime 카드만 황금 아우라: `border-yellow-500/50 shadow-[0_0_60px_rgba(250,204,21,0.4)]` + amber/yellow gradient bg + 가격에 `drop-shadow-[0_0_12px_rgba(250,204,21,0.5)]` + `scale-[1.02]` + badge gradient `amber-400 → yellow-300 text-slate-900`. 모든 PlanCard padding `p-3` → `p-6`, rounded `rounded-2xl` → `rounded-3xl`, 가격 `text-2xl` → `text-4xl` 점보화. Full typecheck clean (web).
- [2026-04-21] Stage 8.6 **핀치줌 원천 차단 + 차트 2배**: `index.html` viewport meta 에 `maximum-scale=1.0, minimum-scale=1.0, user-scalable=no` 추가(viewport-fit=cover 유지). `index.css` html/body/#root 에 `touch-action: manipulation` — pan/tap 만 허용하고 pinch-zoom 원천 제거 (Android Chrome + Telegram WebView 에서 바로 차단). `main.tsx` 에 3중 방어 JS 주입 — iOS Safari 가 viewport meta 를 접근성 이유로 무시하는 케이스 대응: `gesturestart/gesturechange/gestureend` preventDefault(iOS 전용 이벤트) + 300ms 내 double-tap `touchend` preventDefault. `TradeTab` 차트 섹션 `h-[160px]` → `h-[350px]` (뷰포트 40vh 상당) — Binance 앱 차트 중심 UX 모방, OrderBook/RecentTrades/ActionPanel 은 자연 스크롤 아래로 배치. Full typecheck clean (web).
- [2026-04-21] Stage 8.4 **9:16 반응형 + 데스크톱 Ultimate Share + 절대좌표 왕관**: `utils/telegram.ts` `shareROI()` 전면 재설계 — `<a download>` 임시 앵커 경로 **전량 삭제** (Telegram Desktop WebView 에서 silent 차단 발생). 대신 `navigator.clipboard.write([new ClipboardItem({'image/png': blob, 'text/plain': textBlob})])` 로 이미지+텍스트를 **둘 다** 클립보드에 한 번에 복사 (카톡/텔레그램/트위터 에디터 어느 쪽이든 paste 가능). ClipboardItem 거부 시(일부 WebView) 최종 폴백으로 `'manual-save'` 결과 반환해 컴포넌트가 풀스크린 이미지 모달을 띄우고 유저가 **직접 우클릭/길게 눌러** "이미지 복사/저장" 컨텍스트 메뉴 유도 (+ 텍스트는 사전에 clipboard.writeText 로 복사 완료). `ShareResult` union 에 `'clipboard-image' | 'manual-save'` 추가, `'desktop-download'` 제거. `ShareROIButton` 에 `manualSaveSrc` state 추가 + z-[60] overlay 에 `<img src=blob:...>` + "🖱️ 이미지를 우클릭(길게 눌러) 복사/저장하세요." 안내 + useEffect cleanup 으로 URL.revokeObjectURL. `PremiumTab` 3-plan pricing `grid-cols-3` → `grid-cols-1 sm:grid-cols-3` 로 모바일 세로 스택(gap-3) + ≥640px 에서만 3-col 유지. `VIPTab` 루트 `overflow-y-auto` 컨테이너에 `pb-40` 추가 → Top 10 리스트가 BottomNav 뒤에 잘리던 사고 해결. `PodiumCard` 메달 박스 `flex items-end` → `relative` + `<span absolute bottom-0 left-1/2>` + inline `transform: translate(-50%, Npx)` 로 **절대 좌표 강제 정렬** — 3개 메달 바닥 픽셀 라인이 수학적으로 일치 (글리프별 Y offset 은 `translateY` 로 추가 미세 보정 유지). `TradeTab` 루트 `flex h-full flex-col` → `flex h-full flex-col px-3` 으로 레버리지 슬라이더/프리셋 버튼/Margin % 버튼/LONG/SHORT 버튼이 390px 뷰포트 좌우 엣지 밀착 → 12px 여백 확보 (터치 영역과 뷰포트 스와이프 충돌 차단). Full typecheck clean (web).
- [2026-04-21] Stage 8.3 **데스크톱 폴백 + 픽셀 강제 정렬**: `utils/telegram.ts` 의 `shareROI()` 전면 개편 — `navigator.canShare({files:[file]})` 정확히 판정, 모바일 true 면 `navigator.share({files,text})` 시트, 데스크톱(Telegram Desktop / Windows Chrome 등)에서 canShare 가 false 나 navigator.share 실패 시 `clipboard.writeText(text)` + `document.createElement('a')` 임시 앵커 `href=URL.createObjectURL(blob)` + `download=filename` + `click()` → PNG 자동 다운로드 + 텍스트 동시 복사 (clipboard/download 중 하나라도 성공하면 `'desktop-download'` 결과 반환). `URL.revokeObjectURL` 은 1000ms 지연 revoke 해서 브라우저가 download 취소하지 않도록 보정. `ShareResult` union 에 `'desktop-download'` 추가. `ShareROIButton` 결과 분기에 데스크톱 케이스 추가 — "✅ 카드 이미지가 다운로드되었습니다! 채팅창에 붙여넣기(Ctrl+V) 하세요." 토스트. VIPTab `PodiumCard` 이모지 글리프 픽셀 강제 보정 — `items-end` 는 유지하되 각 rank 별 `transform: translateY(${offset}px)` 인라인 스타일 적용: 👑(rank1) `+3px`, 🥈(rank2) `+1px`, 🥉(rank3) `0px` → 이모지 내부 패딩 차이를 무효화하고 보이는 바닥 픽셀 라인 완전 일직선. `aria-hidden="true"` 추가해 스크린리더 중복 읽기 방지. Full typecheck clean (web).
- [2026-04-21] Stage 8.2 **통합 수술** (PNG Share / Legal Prize Removal / Podium Align / Hero Fix): `ShareROIButton` 바이럴 공유 재설계 — html2canvas 캡처 blob → File(image/png) → `navigator.share({files,text})` 네이티브 시트 (이미지 자체 첨부), 3단 폴백 유지(navigator-share → tg-inline → clipboard). 한국어 바이럴 카피 도입(ROI 양수: "🔥 폼 미쳤다! 나 방금 수익 먹음! 🏆 너도 공식 모의투자 글로벌 아카데미 가입하고 $100K 챌린지 시작해 봐!" / ROI 음수: "📉 오늘은 수업료 냈다. 리스크 관리 배우는 중." + `t.me/${VITE_BOT_USERNAME}` 딥링크). `.env.example` / `.env` 에 `VITE_BOT_USERNAME` 추가. 카드 푸터 "Telegram Trading Game" → "Trading Academy" + 동적 봇 핸들. VIPTab 의 `$5,000 USDT Prize Pool` 배너 **전량 삭제** (규제 리스크) + `elite.prizePool` / `elite.prizeBody` i18n 키 제거. PodiumCard 픽셀 정렬: grid `items-end` + 메달 전용 고정 높이 박스(`h-12` 일반 / `h-14` tall) + `flex items-end justify-center` 로 👑 🥈 🥉 바닥 baseline 완전 정렬 (폰트별 글리프 높이 차 흡수). `pt-5` vs `pt-3` 가변 패딩 제거 → 통일 `px-3 pt-3 pb-4`. PremiumTab 히어로 "Lock in $7.99 forever" 디센더 잘림 수정 — `p-5` → `px-5 pt-5 pb-6`, `mt-1.5` → `mt-2`, `leading-tight` 추가. UID 인증 카피 교체 ("제휴 거래소 래퍼럴 UID를 제출하면..." → "공식 제휴 거래소 가입 후 UID를 인증하면, 평생 아카데미 혜택을 무료로 받으실 수 있습니다."). Full typecheck clean (web + bot).
- [2026-04-21] Stage 8.12 **Android drop-shadow vanishing fix + viewport chain hardening**: PortfolioTab equity 의 `drop-shadow-*` + `tabular-nums` 완전 제거 → 안드로이드 WebView 가 big text + filter 조합에서 글자를 렌더 누락시키는 버그 차단. `equityGlow` 변수 폐기, 색상만으로 up/down. VIPTab 카운트다운 타이머도 동일 filter 제거, 순수 `text-yellow-400`/`text-emerald-300`. PremiumTab 상단 여백을 배너 `mt-6` 에서 루트 컨테이너 `pt-6` 으로 이전 (wrapper 레벨 일관성), hero label `tracking-widest`. `index.css` 의 `html, body, #root` 높이를 `100%` → `var(--tg-viewport-height, 100dvh)` 로 교체 — Telegram viewportStableHeight 체인이 html 부터 전파되어 BottomNav 가 폰 바닥에 물리적으로 고정, 안드로이드 URL 바 / 시스템 내비 gap 완전 제거. Full typecheck clean (web).
- [2026-04-21] Stage 8.11 **Android text invisibility + viewport variable wiring**: PortfolioTab 의 `WebkitBackgroundClip:text` + `color:transparent` 금속 gradient 기법이 안드로이드 크롬에서 글자 통째로 사라지는 버그 발견 → solid `text-emerald-300/rose-300/white` 로 교체 후 drop-shadow glow 로 럭셔리 질감 유지. VIPTab 우측 disabled 버튼이 타이머 덮고 있던 구조 폐기, 우측에 `text-2xl text-yellow-400` gold 크로노그래프 타이머 노출 + 좌측 하단 작은 잠금 pill. PremiumTab 배너 `mt-2` → `mt-6`, hero label `tracking-[0.4em]` → `tracking-[0.2em]` (한글 "아 카 데 미" 벌림 제거), 서브타이틀 `leading-relaxed`. `useTelegram.ts` 에 `tg.viewportStableHeight` → `document.documentElement.style.setProperty('--tg-viewport-height', ...px)` 주입 + `onEvent('viewportChanged')` 구독으로 키보드/URL 바 토글 대응, cleanup 에서 `offEvent`. `types/telegram.d.ts` 에 `onEvent`/`offEvent` 타입 추가. `App.tsx` `<main>` 에 `style={{ height: 'var(--tg-viewport-height, 100dvh)' }}`. Full typecheck clean (web).
- [2026-04-21] Stage 8.10 **TradeTab chart padding + VIP 한글 타이포 + Portfolio 명품 지갑 + Academy 모달 분리**: TradeTab 차트 섹션 `pt-2` 추가해 최고가 심지 윗쪽 잘림 해결. VIPTab 히어로 서브타이틀 i18n 을 `elite.heroSubtitleLine1/Line2` 로 2분할 + `break-keep` + `<br />` 로 한글 단어 중간 끊김 제거. PortfolioTab **전면 리디자인** — Amex Black Card + Apple Wallet 레퍼런스: 상단 hairline + specular diagonal sheen + 6xl metallic gradient equity + 3-stat glass grid (Cash/Margin/Realized). PremiumTab **결제 UI 를 메인에서 완전 분리** — 3-PlanCard 스택 전량 삭제, 메인은 👑 업그레이드 배너 + 히어로 타이포 + Education Library 4카드(📘 Beginner / ⚡ Leverage / 🛡️ Risk / 🧠 Psychology with i18n) + Partner Exchanges 배지 행. 결제는 `fixed inset-0 z-50` 풀스크린 `PaymentModal` 로 이전 — `document.body.style.overflow='hidden'` body scroll lock, Esc keydown 리스너, backdrop click close, 내부 `e.stopPropagation()`, sticky top-0 close bar, Lifetime Black Card + FEATURE_KEYS 혜택 리스트 + UID 인증 폼 / PendingCard 분기. locale 양쪽(en/ko) 에 `academy.hub.upgradeCta/upgradeSub/library/comingSoon/lessons.{beginner,leverage,risk,psych}.{title,desc}` 블록 추가 + `elite.heroSubtitleLine1/Line2` 분할. Full typecheck clean (web).
- [2026-04-21] Stage 8.9 **거래 탭 재정렬 + VIP 럭셔리 라인 + 전 탭 물리 스페이서**: TradeTab 레이아웃을 Chart → OrderBook/RecentTrades(2-col) → ActionPanel → BalanceBar 순으로 재배열 (Binance/Bybit 모바일 표준: 호가 먼저 보고 주문). 4개 탭(Trade/Portfolio/VIP/Academy) 루트 스크롤 컨테이너 끝에 `h-[150px] shrink-0 pointer-events-none` 투명 스페이서 **강제 주입** — `pb-[150px]` collapse 되는 엣지 케이스 물리적으로 차단, 하단 폼 잘림 근절. VIPTab 뚱뚱한 gradient 캡슐 배너 삭제 → `flex items-center gap-4 py-2` 안에 `h-px flex-1 bg-gradient-to-r from-transparent to-yellow-500/50` 얇은 금선 디바이더 양쪽 + 중앙에 `text-[10px] tracking-[0.4em] text-yellow-500 "Top 10 Elite Analysts"` — 명품 시계 카탈로그 레퍼런스. Academy 뱃지 잘림 `overflow-hidden` 제거로 해결. Full typecheck clean (web).
- [2026-04-21] Stage 8.0 **기본기 완벽 수리** (10B Fix / 60+ Coins / i18n / Academy): `.env` DAILY_ALLOWANCE `10_000_000_000` → `100_000` 수정 (Total Equity $10,000M 버그 근절) + `supabase/schema.sql` 주석에 기존 유저 리셋 SQL (`UPDATE wallets SET balance=100000 WHERE balance > 1000000`) 추가 + 레거시 `schema.sql` DEFAULT 100000 로 교체. `lib/markets.ts` 60종 Binance Perpetual 카탈로그(BTC/ETH/SOL/BNB/XRP/DOGE/PEPE/SHIB/ADA/AVAX/DOT/LINK/MATIC/TRX/LTC/BCH/UNI/ATOM/XLM/XMR/ETC/FIL/INJ/OP/ARB/SUI/APT/SEI/TIA/NEAR/APE/SAND/MANA/AAVE/MKR/COMP/SNX/CRV/DYDX/LDO/RUNE/FTM/ALGO/ICP/HBAR/VET/FLOW/GRT/CHZ/THETA/AXS/GALA/EOS/KAVA/ZIL/WLD/JUP/PYTH/ENA/STRK/WIF/BONK/FLOKI) + `searchMarkets(query)` ticker/name/display 부분일치 + `PALETTE[i%6]` 자동 컬러. `MarketSymbol` 타입을 리터럴 유니온 → `string` 완화. `CoinSelector` 드롭다운 → 풀스크린 검색 모달(현재 심볼 버튼 + input + 필터 리스트, Esc/backdrop 닫기). i18n: `i18next` + `react-i18next` 설치, `locales/en.json` + `locales/ko.json` (Header/Nav/Trade/Portfolio/Elite/Academy/Settings/CoinSelector 키), `lib/i18n.ts` (localStorage > Telegram language_code > navigator > 'en' detect), `main.tsx` import. `SettingsModal` Glassmorphism 언어 토글 + 교육 disclaimer, Header 우측에 ⚙️ 버튼. Academy 리브랜딩: "VIP Chat" → "Elite Analyst Club Access", "Premium" → "Academy Membership", "Prize Pool Eligibility" → "Global Paper Trading Tournament", "Revive" → "Risk Management Reset", "Instant Revive −30%" → "Risk Reset −30%". BottomNav 아이콘 🏆→🎓 / 💎→📘. PremiumTab/VIPTab/PortfolioTab/LiquidationOverlay/Header/BottomNav/App 모두 t() 치환. Bot `/start` paper-trading simulator 포지셔닝 영문 카피, `How It Works` 5단계 + "no real money at risk" 강조, `📘 Academy Membership` 콜백 3-tier 영문, Stars invoice title "Risk Management Reset" 교체. Full typecheck clean (web + bot).
