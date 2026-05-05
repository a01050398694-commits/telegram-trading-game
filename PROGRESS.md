# PROGRESS

_Last updated: 2026-05-05_

## Latest Session — 2026-05-05 (Stage 17 LIVE — Binance Futures 7기능 + Polish + Cleanup)

### 결론
**Stage 17 마스터 플랜 (Phase F → G → H) 완전 자동 실행 → 5 commits LIVE → CEO 손 0번. 7 기능 (Limit / SL·TP / OpenOrders / OrderHistory / 부분청산 / Cross·Isolated 토글 / 6 timeframe + MA20·Volume + 10단 호가 + 큰체결 강조) 모두 작동. 회귀 0.**

### 인프라 (LIVE — 변동 없음)
- **Bot**: Render `https://telegram-trading-bot-o9r7.onrender.com` (auto-deploy on `main` push, polling)
- **미니앱**: Vercel `https://telegram-trading-game.vercel.app` (auto-deploy on `main` push)
- **DB**: Supabase `jvigsfcrlrmsdbdpnayr` (마이그레이션 14개 적용: 01~14 — Stage 17 의 12·13·14 추가됨)
- **결제**: InviteMember 8 plans (PayPal USD 4 + Stars 4)
- **봇**: `@Tradergames_bot` Mini App enabled
- **CEO admin Telegram ID**: `7626898903`

### 이번 세션 5 commits (chronological)
| commit | 내용 |
|---|---|
| `19df8ed` | Stage 17 F: limit orders, SL/TP, order history + IDOR fixes (26 파일) |
| `fce5320` | Stage 17 G: partial close RPC + margin mode chip + IDOR guards (16 파일) |
| `392c57f` | Stage 17 H: timeframe + MA20/Volume + 10-deep book + big trade highlight (15 파일) |
| `870813e` | Polish: Cross/Stop "Coming Soon" 강화, 토큰 일관성, 44px 터치 타겟 (8 파일) |
| `782f894` | Cleanup: academy i18n 45 키 + node-cron + 2 orphan docs 삭제 (-674 줄) |

### Stage 17 검증 결과
- typecheck/build (bot+web): 모든 phase 0 errors
- code-auditor: 결함 11건 자동 fix 루프로 처리 (IDOR 4 + 방향 검증 2 + silent fail 3 + 검증 누락 2)
- browser-verifier on LIVE: 4탭 카드 잘림 가드 PASS (Trade 125–316 / Portfolio 82–752 / VIP 84–752 / Premium 82–752)
- 9개 신규 컴포넌트 모두 마운트 (OrderTypeTabs / LimitPriceInput / SlTpInputs / OpenOrdersCard / OrderHistorySection / PartialCloseControls / MarginModeChip / TimeframeRow / IndicatorToggles)
- LIVE 콘솔 errors 0 (앱 영역, vite.svg/favicon 404 무관)
- timeframe 클릭 시 Binance kline_5m/1h fetch 200 OK

### DB 현황 (Supabase live count)
- users: 3 (Trader=CEO 본인 / askbit / Arkadij_Video=외부 실 유저)
- wallets: 3 (balance: $11,496 / $160,484 / $9,999)
- positions: 31 (open 1, closed 30)
- orders: 0 (Stage 17 신규 테이블, 사용 시작 전)
- ranking_snapshots: 24 (90일 자동 retention)

---

## ✅ Done (이번 세션)
- `supabase/migrations/12_orders.sql` — orders 테이블 + RLS 3정책 (LIVE 적용)
- `supabase/migrations/13_positions_sl_tp.sql` — sl_price/tp_price/margin_mode/realized_pnl_total + open_position_atomic 시그니처 확장 (LIVE)
- `supabase/migrations/14_close_partial_rpc.sql` — close_position_partial RPC + 함수 내 IDOR 가드 (LIVE)
- `bot/src/engine/orderMatcher.ts` (신규) — Limit 매칭 + SL/TP 트리거 + 매칭 실패 상태 구분 (expired vs cancelled)
- `bot/src/engine/trading.ts` 메서드 추가: placeLimitOrder / placeStopOrder / cancelOrder / cancelAllOrders / getOpenOrders / getOrderHistory / setSlTpForPosition / closePartial / setMarginMode + openPosition slPrice/tpPrice optional + closePosition userId 가드 (Stage 16 이전 IDOR 함께 fix)
- `bot/src/server.ts` 라우트 7개 추가 + `/api/user/status` openOrders 필드 + `/api/trade/open` orderType/limitPrice/slPrice/tpPrice optional
- `bot/src/index.ts` orderMatcher tick wiring (scanAndLiquidate 다음)
- `web/src/lib/api.ts` — Order 타입 + 9 클라 함수 + UserStatus.openOrders + OpenTradeInput 확장
- 9 신규 컴포넌트 (위 목록)
- ActionPanel / TradeTab / PortfolioTab 통합 (TimeframeRow + IndicatorToggles + OrderTypeTabs + OpenOrdersCard + MarginModeChip + PartialCloseControls + SlTpInputs + LimitPriceInput + OrderHistorySection 마운트)
- TradeTab `pb-[260px]` → `pb-[280px]` (Stage 17 신규 컴포넌트 누적 후 충분 검증)
- 6 locale (en/ko/ru/tr/vi/id) 신규 키: orderType / orders / slTp / partialClose / marginMode / timeframe / indicators
- localStorage `tg.chart.timeframe` + `tg.chart.indicators` 기억 (화이트리스트 검증 + JSON.parse try/catch)
- TradingChart MA20 LineSeries + Volume HistogramSeries (실 Binance kline volume, mock random 0)
- OrderBook 10단 + depth bar 양쪽 (emerald/rose)
- RecentTrades 10행 + `>$10K` amber-400/20 강조
- Polish: Cross 🔒 + (Soon) 라벨 / Stop `[Coming Soon]` 라벨 amber-400 / OrderTypeTabs·TimeframeRow active amber → gold token / MarginModeChip active violet → emerald (premium 컨벤션 위반 fix) / ActionPanel leverage amber-400 → warning token / Premium·Recharge 결제 버튼 `min-h-[44px]` (WCAG)
- Cleanup: academy.* 미사용 i18n 45 키 6 locale 삭제 (nav.academy 보존), `node-cron` + `@types/node-cron` 의존성 제거, `docs/design/tokens-changelog.md` + `docs/ops/db-backup-restore.md` 삭제
- GOTCHAS.md 누적: `## Stage 17 Phase F` (IDOR / 방향 검증 / orderMatcher 상태 / any 캐스트 금지) + `## Stage 17 Phase H` (React inline style 단위 / lightweight-charts histogram 별도 update / localStorage 화이트리스트 / Volume mock 금지)

## 🔄 Remaining (우선순위 순)

### CEO 결정 필요
1. **CEO 본인 계정 reset 여부** — `Trader` (telegram_id 7626898903) wallet $11,496 → $10K, closed positions 11개 archive. 명시 지시 시에만 진행.
2. **askbit 계정 정리** — balance $160,484 가 Stage 15.1 $10K seed 정책 대비 비정상. 의도된 promo / test data 인지 확인 필요.
3. **사업자등록 + 통신판매업 신고** (정부24, 1-2일) → BusinessInfo placeholder 실제값 교체.
4. **Cross margin 진짜 구현** (Stage 18) — UI 만 disabled. Stage 17 의도적 제외 §0.
5. **Stop 주문 별도 진입 UX** — 현재 Limit + SlTp 옵션에 통합. 별도 Stop 탭 원하면 새 PRD 필요.

### 자율 가능 (다음 세션 풀오토)
6. **남은 미사용 i18n ~109 키** 보수적 추가 검증 (landing/elite/common/nav/trade/orders/settings 카테고리). 동적 호출 패턴 안전 검증 후 30~50개 추가 삭제 가능.
7. **더 큰 디자인 리프레시** — CEO "디자인/버튼/편리성 업그레이드" 광범위 피드백. design-lead 에 토큰 + 컴포넌트 그루핑 가이드 받아서 frontend-developer 가 적용. (이번 세션 Polish 는 표시 명확성 + 토큰 일관성 + 접근성만 처리)
8. **bundle size 절감** — web build 1.49MB (gzip 441KB). 500KB warning. dynamic import 코드 스플릿 검토.
9. **Stage 17 신규 컴포넌트 unit test** — orderMatcher matchLimit/matchStopOrder 가드 케이스, closePartial RPC 시뮬레이션. `bot/__tests__` 또는 vitest.

## 🚧 Blockers
- **Sentry DSN 미발급** — Phase B 에서 코드는 wired up, DSN 없어 실제 에러 추적 안 됨. sentry.io 무료 가입 후 Render `SENTRY_DSN` + Vercel `VITE_SENTRY_DSN` 입력 필요. (CEO 직접, 5분)
- **Render free plan cold start** — 15분 무활동 sleep → polling 끊김. Starter $7/월 또는 UptimeRobot ping 필요.
- **DB 자동 백업** — Supabase Pro $25/월 (PITR 30일) 또는 GitHub Actions `pg_dump` cron 미구현.
- **package-lock.json** — `node-cron` 의존성 package.json 에서 제거됐지만 lock 파일은 보호 파일이라 미동기화. Render 가 다음 deploy 시 `npm install` 자동 실행으로 자연 동기화 (장애 없음, 주의만).

## 📝 Notes for Next Session

### 마스터 플랜 위치
- Stage 17 마스터 플랜: `C:\Users\user\Desktop\Stage17_Master_Plan_2026-05-05.md` (소유: CEO Desktop)
- Stage 17 spec (1166 lines): `docs/specs/stage-17-binance-futures.md`
- Stage 17 design (1192 lines): `docs/design/stage-17-binance-futures.md`

### 절대 잊지 말 것 (이번 세션에서 학습한 GOTCHAS)
1. **모든 user-scoped mutate 함수에 userId 인자 강제** — `placeStopOrder/cancelOrder/closePartial/closePosition/setSlTpForPosition` 모두 `.eq('user_id', userId)` 이중 가드. RPC 도 `p_user_id` 파라미터 + 함수 내 RAISE UNAUTHORIZED. service_role 키가 RLS 우회하므로 애플리케이션 레벨이 마지막 방어선.
2. **SL/TP 가격 방향 검증 필수** — Long: SL ≤ entry / TP ≥ entry, Short 반대. 위반 즉시 청산 트리거 → 자산 사고. `setSlTpForPosition` + `placeStopOrder` 둘 다.
3. **orderMatcher catch 에서 rethrow 절대 금지** — for-loop 안에서 rethrow 시 같은 tick 의 다른 주문 매칭 막힘. console.error + status update만.
4. **orderMatcher 매칭 실패 상태 구분** — `INSUFFICIENT_BALANCE`/`LIQUIDATED` → `expired` (사용자 통제 외), 그 외 → `cancelled` (시스템 책임).
5. **React inline style 단위 명시** — `style={{ paddingBottom: 280 }}` 는 unitless = 0px. 반드시 `'280px'` 또는 className `pb-[280px]`.
6. **lightweight-charts Histogram series 별도 update** — Candlestick `update()` 가 volume 필드 무시. ticking 시 `volumeSeries.update({time, value, color})` 명시 안 하면 1분 지연.
7. **Volume 데이터 mock random 절대 금지** — 거래 신호 fake. Binance kline tuple `[5]` 에서 실 volume 매핑.
8. **타입 안전** — PositionRow/OrderRow 를 `any` 캐스트 금지 (supabase-js numeric → string 변환 누락 silent bug).
9. **Cross/Stop 탭 disabled** — 의도된 동작. Cross = Stage 18, Stop = Limit+SlTp 통합. CEO 가 LIVE 보고 "왜 안 돼?" 질문 가능 — 답변 준비.

### 다음 세션 시작할 때
1. `/status` 입력 또는 PROGRESS.md 정독.
2. 추가 i18n cleanup 또는 디자인 리프레시 둘 중 하나 (CEO 지시 따라).
3. CEO 가 DB row 정리 / 사업자등록 / Sentry DSN 발급 결정 했는지 확인.
4. Stage 18 시작 시 Cross margin 진짜 구현 (잔고 공유 + liquidation 재계산) — 별도 PRD 필요.

---

## Archive — 2026-05-01 LATE (Stage 15.5 인프라 완성 · 출시 가능 상태)

**4 Phase (A→D) 풀 자동 처리 + 결제 받을 수 있는 상태로 LIVE.**
- Phase A 백엔드 안전망 (commit `f5fe80d`): render.yaml + migration 09 payment_events + migration 10 atomic RPC + recordPaymentEvent helper + deterministic chargeId
- Phase B 프론트 안전망 (commit `fefc62a`): Sentry + ErrorBoundary + i18n trade.* + 결제 에러 다국어
- Phase C 법적·결제 UX (commit `c8ee015`): TermsPage/PrivacyPage/RefundPage + BusinessInfo placeholder + 동의 체크박스 + DemoBadge + AppFooter + usePaymentPolling
- Phase D 디자인 업그레이드 (commit `df5c5a6`): tokens.{ts,css} + card-tone-guide + lucide-react SVG BottomNav + framer-motion AnimatePresence
- 검증: 가드 4개 PASS (4탭 잘림 / PricingCard inline gold / ActionPanel Mark Price ▲▼ / BottomNav lucide SVG)

---

## Next Session Plan — 출시 후 (우선순위 순)

### 🔥 운영 안전 (Day 0~1)
1. **Sentry DSN 발급 + 연결** — sentry.io 무료 가입 → DSN → Render `SENTRY_DSN` + Vercel `VITE_SENTRY_DSN`
2. **Render free plan cold start 차단** — 15분 무활동 sleep → polling 끊김. Starter $7/월 권장 또는 UptimeRobot ping
3. **DB 백업** — Supabase Pro $25/월 (PITR 30일) 또는 GitHub Actions `pg_dump` cron

### 📈 트래픽 + 그로스
4. **사업자등록 + 통신판매업 신고** (정부24, 1-2일) → BusinessInfo placeholder 실제값 교체
5. **첫 유저 onboarding funnel** 측정 (PostHog 이벤트 wire-up)
6. **랜딩 페이지 재구축** — `apps/landing` 폴더 사라짐. Stage 12 의 SEO/OG/FAQ 구조 부활 필요

### 🛠 제품 깊이
7. 바탕화면 `추가 개발계획.md` 51개 중 출시전 16 끝남, 남은 35개 P1/P2 정렬

---

## Archive — 2026-05-01 (가격 라이브 + 잘림 fix + 출시 전 plan 확정)

### Done

**P0 — 가격 freeze 근본 원인 fix (최종)**
- `useBinanceFeed.ts` — `@kline_1m` 이 fstream 에서 데이터 0 (handshake OK / 메시지 0). `@aggTrade` 도 동일 차단.
- 작동 확인된 `@trade` stream 으로 별도 WS 추가 (RAF throttle 60fps)
- chart 는 kline 그대로 (REST history + 1분 갱신), price/direction 은 @trade
- 측정: 12초간 20회 가격 변동 (1.7회/초) ▲▼ 화살표 + 색상 깜빡

**P0 — 카드 잘림 근본 원인 fix**
- `flex h-full min-h-0 flex-col gap-X overflow-y-auto` 컨테이너에서 자식 default `shrink:1` 가 minHeight 없는 카드를 38-42px 로 압축 → 텍스트 overflow → '잘림'
- PremiumTab + PortfolioTab root: `flex flex-col gap-X` → `space-y-X` 단순 block 으로 전환
- 측정: FREE PLAN 38px → 92px, Premium Plan 41px → 499px, Recharge 42px → 327px

**P0 — Mark Price 라이브 표시 (UX 누락)**
- ActionPanel 포지션 카드 + PortfolioTab OpenPositionRow 에 Mark Price 큰 글씨 + ▲▼ + LIVE pulse dot 추가
- 사용자가 PnL 변동을 가격 변동으로 인지 가능

**문서**
- 바탕화면 `추가 개발계획.md` (51개 항목 P0~P2)
- 바탕화면 `출시전 필수작업.md` (16개 P0 — 다음 세션 진행)

### Commits (이번 세션)
- `19fcde1` flex squish fix
- `1785ddd` Live Mark Price display
- `075d70a → 921d2c2 → 1da3f51 → c09f068` aggTrade → trade → bookTicker → trade 수렴

### 검증 게이트
- ✅ typecheck + build + Playwright 측정 가격 1.7회/초 변동 확인
- ✅ Vercel deploy READY (bundle index-CPUPCpvQ.js 계열)
- ✅ 텔레그램 메뉴 URL 갱신 완료

---

## Next Session Plan — 출시 전 P0 16개 (총 ~15h, 0원, design-lead 활용)

### Phase A — 백엔드 안전망 (병렬, ~3h)
- ① `render.yaml` env 보강 (RECHARGE_CHANNEL_*_ID, PREMIUM_CHANNEL_ID, INITIAL_SEED_USD 등 누락분)
- ③ 결제 idempotency: `inviteMemberSync.ts` chargeId deterministic (`update.date` 사용) + 마이그레이션 09 `payment_events`
- ④ 트랜잭션 안정성: 마이그레이션 10 atomic RPC (`open_position_atomic` / `close_position_atomic`) + `trading.ts` 호출 변경
- ⑤ render.yaml 에 `numInstances: 1` 명시

### Phase B — 프론트 안전망 (병렬, ~3h)
- ⑥ ErrorBoundary + `@sentry/react` 설치 + main.tsx wrap
- ⑦ i18n 누락 키 (Mark/PnL/Liq/Margin/Notional + 새 카드들) — 6 locales
- ⑧ 사용자 facing 에러 메시지 다국어 정비

### Phase C — 법적 + 결제 UX (~3h)
- ⑨ 약관/개인정보/환불 페이지 3개 + `?page=` 라우팅 (사업자정보 placeholder)
- ⑩ DemoBadge 컴포넌트 (Header + Onboarding)
- ⑪ Footer placeholder (사업자번호/통신판매업 [추후])
- ⑫ 결제 진행 상태 표시 (RechargeCard/PricingCard — InviteMember 외부 결제 후 폴링 indicator)

### Phase D — 디자인 업그레이드 (design-lead 활용, ~6h)
- ⑬ **카드 톤 통일** — design-lead 호출로 디자인 토큰 + 4개 탭 일관 가이드 → 적용 (가장 큰 작업)
- ⑭ 아이콘 lucide-react 통일 (emoji 제거)
- ⑮ 데스크톱 반응형 (max-w 컨테이너 + 두 컬럼)
- ⑯ 페이지 전환 모션 (framer-motion fade + stagger)

### Phase E — 사용자 액션 + 마무리 (~1h)
- 사용자: Render 가입 (GitHub 로그인 1번) + env 입력 + Deploy
- 사용자: GitHub Secrets 에 Supabase service-role 키
- 나: ② DB 백업 GitHub Actions workflow 작성 + 첫 배포 검증

### 진행 방식 합의
- **Phase 끝마다 보고** (3일 분산 권장: A+B → C → D → E)
- design-lead 는 ⑬ 카드 톤 통일에 1회 호출 (디자인 토큰 + 가이드 받기)
- 사용자 결정: 한국 사업자등록 추후, PayPal 다른 사업자 연동 그대로 활용
- 비용: 0원 (코드만)

### CTO 직접 (코드 X)
- 한국 사업자등록 / 통신판매업 신고 (선택, 결제 받기 전 권장)
- Render Dashboard 가입 + env 입력 (Phase E 단계, 5분)
- GitHub Secrets 입력 (1분)

---

## Archive — 2026-04-28 (Antigravity 인수인계 · 전체 정상화)

### Done

**P0 — 즉시 처리 (인수인계 문서 00~07 기반)**

1. **`.env` DAILY_ALLOWANCE 100000 → 10000** — Stage 15.1 정책($10K 무료 시드) 적용. 이전 값이 남아있어 신규 가입자에게 $100K 지급되는 문제 수정.

2. **cache-bust 통합 헬퍼 `bot/src/lib/webappUrl.ts` 신규 생성** — `env.WEBAPP_URL` 에 `?v=Date.now()` 자동 부착. localhost dev 는 cache-bust 안 함.

3. **cache-bust 누락 6개 파일 패치** (텔레그램 WebView 캐시 우회):
   - `bot/src/index.ts` — BTC 변동성 알림 인라인 버튼
   - `bot/src/cron/marketBrief.ts` — 마켓 브리프 인라인 버튼
   - `bot/src/engine/community.ts` — AI 커뮤니티 매니저 4곳
   - `bot/src/cron/retention.ts` — 리텐션 DM 2곳
   - `bot/src/engine/shillEngine.ts` — Shill 봇 인라인 버튼
   - `bot/src/scripts/setupBotProfile.ts` — 봇 프로필 메뉴 URL

4. **하드코딩 금액 수정 ($100K → $10K)**:
   - `bot/src/cron/retention.ts` — 비활동 유저 넛지 DM 메시지 (한국어/영어)
   - `bot/src/scripts/setupBotProfile.ts` — 봇 설명 텍스트 (한국어/영어)

5. **`package.json`에 `tunnel:bot` 스크립트 추가** — `npx cloudflared tunnel --url http://localhost:3001`

**서버 기동 + 검증**
- 기존 봇 프로세스 (PID 7780) 종료 → 새 봇 서버 `PORT=3001` 기동 성공
- cloudflared 터널 신규 생성: `https://eric-rehabilitation-lots-href.trycloudflare.com`
- `web/.env.production` 터널 URL 갱신
- Git commit + push → Vercel 자동 배포 트리거

### 검증 게이트
- ✅ `npm run typecheck` (web + bot) — EXIT=0
- ✅ 봇 서버 기동 — `@Tradergames_bot` polling 시작, menu button URL set (cache-busted)
- ✅ Binance 5개 심볼 연결, 랭킹 엔진 캐시 갱신
- ✅ `/health` 로컬 — `{ ok: true, env: "development" }`
- ✅ `/health` 터널 — `{ ok: true, env: "development" }`
- ✅ GitHub push 완료 (`8a68781`), Vercel 자동 배포 트리거됨

### 남은 작업 (CEO 직접 or 다음 세션)
- **텔레그램 미니앱 캐시 잠금** — CEO 가 BotFather → Configure Mini App 에서 URL 확인/교체 필요 (01-current-issue.md 참고)
- **Vercel Dashboard 환경변수** — `VITE_API_URL` 을 새 터널 URL 로 갱신 (현재 `web/.env.production` 은 갱신 완료, Dashboard 도 동기화 권장)
- **Stage 15.2~15.5** — DB subscriptions 테이블, InviteMember 폴링 cron, PremiumTab UI 재설계, 포트폴리오 코칭

---

## Archive — 2026-04-22 (런칭 체크리스트 일괄 정리 · Stage 12 프로덕션 하드닝)

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
- [2026-05-05] Stage 17 Phase F: migrations 12/13 (orders/positions SL/TP), orderMatcher engine, 5 API 라우트 + UserStatus 확장, 5 신규 컴포넌트(OrderTypeTabs/LimitPriceInput/SlTpInputs/OpenOrdersCard/OrderHistorySection), TradeTab+PortfolioTab 통합, i18n 6 locale. ActionPanel orderType stop 타입 fix (onOpen args 에서 stop→undefined). typecheck+build clean.
- [2026-05-05] Stage 17 Phase G: close_position_partial RPC + closePartial/setMarginMode 메서드 + PartialCloseControls/MarginModeChip 컴포넌트 + 6 locale partialClose/marginMode i18n, typecheck/build/audit clean
- [2026-05-05] Stage 17 Phase H: TimeframeRow + IndicatorToggles + MA20/Volume series + OrderBook 10단 depth bar + RecentTrades $10K amber + localStorage, typecheck/build/audit clean
