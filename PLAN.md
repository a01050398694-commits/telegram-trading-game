# [Stage 14] InviteMember 결제 연동 및 Failed to fetch 해결

## Objective
유저가 캡처한 "Failed to fetch" 에러는 로컬 PC의 터널링(Cloudflare)이 끊어지거나 CORS 문제로 인해 Vercel 프론트엔드가 백엔드와 통신하지 못해 발생한 것입니다.
또한, CEO의 지시에 따라 Telegram Stars 결제 대신 **InviteMember($4 유료 플랜)**를 활용한 결제 연동으로 전면 교체해야 합니다.
프론트엔드에서 결제 버튼을 누르면 백엔드 API를 거치지 않고 곧바로 InviteMember 결제 봇으로 리다이렉트되도록 수정합니다.

## Atomic Tasks for Claude Code (CLI)

### Task 1: InviteMember 결제 버튼 리다이렉트 적용
1. `web/src/tabs/PremiumTab.tsx` 및 결제 버튼이 있는 파일(`TradeTab.tsx`, `PortfolioTab.tsx` 등)을 찾습니다.
2. 기존의 `requestStarsInvoice` API 호출을 모두 제거합니다. (이 때문에 Failed to fetch 에러가 발생했습니다)
3. 결제 버튼 클릭 시 `window.Telegram.WebApp.openTelegramLink(import.meta.env.VITE_INVITEMEMBER_BOT_URL || 'https://t.me/academy_premium_ch')` 함수를 호출하여 InviteMember 봇으로 곧바로 넘어가도록 수정합니다.
4. **주의:** 하드코딩하지 말고 반드시 `import.meta.env.VITE_INVITEMEMBER_BOT_URL` 환경 변수를 사용하세요.

### Task 2: Failed to fetch 에러의 근본적 해결 (Render 백엔드 이주)
현재 프론트엔드는 Vercel에 완벽히 올라갔지만, 백엔드는 아직 터널링 주소를 바라보고 있어 불안정합니다.
1. `render.yaml`의 `type`을 `web`으로 설정하고 `PORT` 환경변수를 매핑하세요.
2. `bot/src/server.ts`의 Express 서버가 `process.env.PORT`를 수신(`listen`)하도록 수정하세요.
3. CORS 설정(`cors()`)에 `https://web-askbit.vercel.app` 도메인을 명시적으로 허용하도록 추가하세요.

### Task 3: 자동 배포 가이드
1. 위 코드 수정이 완료되면 `git add . && git commit -m "feat: integrate InviteMember & fix cors"` 후 `git push` 하세요.
2. CEO에게 Render 대시보드(https://dashboard.render.com/)에서 GitHub 저장소를 연결하여 백엔드 Web Service를 배포하는 방법을 한글로 안내하세요.
3. Render 배포가 완료되면 얻게 될 주소를 Vercel의 `VITE_API_URL` 환경 변수에 어떻게 교체해서 넣어야 하는지 안내하세요.

## Verification
- 결제 버튼이 더 이상 API를 호출하지 않고 InviteMember 봇으로 이동하는가?
- Express 서버가 Render의 PORT 환경변수를 바라보는가?

### Task 4: Vercel 환경변수 강제 주입 및 최종 UX 검증 (진행 중)
1. `web/.env.production` 파일에 올바른 `VITE_API_URL`(터널 주소)과 `VITE_INVITEMEMBER_BOT_URL`(@gunymarketing_bot)을 강제 주입하여 저장합니다.
2. `git add web/.env.production`, `git commit -m "fix: inject production env vars"`, `git push`를 통해 Vercel의 자동 재배포를 트리거합니다.
3. 배포 완료 후, 텔레그램 미니앱을 켜고 `Failed to fetch` 에러가 완벽히 사라졌는지(백엔드 API 통신 정상화) 확인합니다.
4. 모든 결제/업그레이드 버튼을 클릭해보고 `@gunymarketing_bot`으로 정상 리다이렉트되는지 전수조사합니다.

### Stage 14.1 (UX Polishing) [완료]
1. `App.tsx`: 초기 API 로드 실패 시(statusError 발생), 유저를 가짜 $100k 계좌로 입장시키지 않고, 꽉 찬 에러 스크린("Connection Failed")과 "Retry Connection" 버튼을 띄우도록 수정 완료.
2. `utils/telegram.ts`: 데스크탑 환경 등 Telegram 밖에서 접속했을 때를 대비하여 `openTelegramLinkSafe(url)`를 신규 제작하여 `window.open` fallback 추가 완료.
3. `PremiumTab.tsx` 등: 모든 결제 링크 진입부를 방금 만든 `openTelegramLinkSafe`로 전면 교체 완료.
4. `ActionPanel.tsx`: 주문 버튼 클릭 시 불명확한 `...` 문구를 `Submitting...`으로 변경하여 소비자 관점 로딩 UI/UX 최적화 완료.

---

# [Stage 14.1] UX Polishing — Errors, Payment Fallback, Trade Pending

## Objective
Stage 14에서 결제 흐름과 백엔드 도달성 골격을 갖춘 다음, 소비자 관점에서 발견된 거친 UX 모서리를 정밀하게 깎는다. 가짜 데이터 노출, 일반 브라우저에서 죽는 결제 버튼, 의미 없는 `…` pending 라벨을 모두 제거한다.

## Atomic Tasks

### Task 1 — App.tsx Connection Failed 가드
- 초기 로딩 중 `statusError`가 존재하고 `status`가 아직 들어오지 않은 상태에서, 가짜 데이터로 탭을 렌더하지 않는다.
- 전역 `Connection Failed` 풀스크린(⚠️ 아이콘 + 붉은색 경고 텍스트 + 에러 메시지)을 표시하고, 중앙의 `Retry Connection` 버튼이 `refresh()`를 호출하도록 한다.
- (현재 상태) `web/src/App.tsx` 67–92행에 이미 구현 — 회귀 방지 차원에서 이 스펙을 PLAN에 박제.

### Task 2 — `openTelegramLinkSafe` 헬퍼
- `web/src/utils/telegram.ts`에 `openTelegramLinkSafe(url: string): void` 추가.
- 텔레그램 WebApp 컨텍스트면 `window.Telegram.WebApp.openTelegramLink`를 사용하고, 일반 브라우저 컨텍스트면 `window.open(url, '_blank', 'noopener,noreferrer')`로 폴백.
- (현재 상태) `web/src/utils/telegram.ts` 173–180행에 구현 완료.

### Task 3 — 결제 버튼 일관성
- `web/src/tabs/PremiumTab.tsx`, `web/src/tabs/TradeTab.tsx`, `web/src/tabs/PortfolioTab.tsx`에서 InviteMember 결제 봇으로 보내는 모든 버튼의 `onClick`이 `openTelegramLinkSafe(url)`를 사용하도록 통일한다.
- 직접 `window.Telegram?.WebApp?.openTelegramLink?.(...)`를 호출하는 코드는 전부 제거.

### Task 4 — Trade pending 라벨
- `web/src/components/ActionPanel.tsx`의 LONG/SHORT 버튼이 `pending` 상태일 때 보여주던 `…`을 `Submitting...`으로 교체. Close 버튼은 기존 `Closing…`을 유지(이미 명확).

### Task 5 — PLAN.md 기록
- 이 Stage 14.1 섹션을 PLAN.md 하단에 추가하여 다음 세션에서도 이 UX 합의가 어디서 왔는지 추적 가능하게 한다.

## Negative Constraints
- VIPTab의 `openTelegramLink` 호출은 결제와 무관(VIP 라운지 채널 입장)하므로 이번 변경 범위에서 제외.
- 백엔드(`bot/**`) 코드 변경 금지 — Stage 14 Task 2 범위.
- 청산 오버레이의 디자인/카피는 건드리지 않는다.

## Verification
- 결제 관련 onClick이 `openTelegramLinkSafe`만 사용하는가? (`grep -rE "openTelegramLink\??\.\(" web/src/tabs`로 직접 호출 0건이어야 함)
- LONG/SHORT 버튼에서 `pending` 시 `Submitting...`이 노출되는가?
- `tsc --noEmit` 통과.

---

# [Stage 14.2] Native Payment Restoration

## Objective
Stage 14에서 InviteMember 봇 리다이렉트로 전환했던 결제 흐름을 텔레그램 네이티브 결제창(`Telegram.WebApp.openInvoice`)으로 원상복구한다.
유저를 미니앱 밖으로 쫓아내는 InviteMember 흐름은 컨텍스트 단절·복귀 동선 누락·결제 후 자동 새로고침 불가 등 UX가 최악이라 폐기.
Stage 14.1의 일반 개선(`openTelegramLinkSafe` 헬퍼, `Connection Failed` 가드, `Submitting...` 라벨)은 모두 그대로 유지한다.

## Atomic Tasks

### Task 1 — `requestStarsInvoice` API 클라이언트 부활
- `web/src/lib/api.ts`에 `requestStarsInvoice(telegramUserId: number, productType: 'reset' | 'elite' = 'reset')` 함수 복원.
- 백엔드 `POST /api/payment/stars`에 `{ telegramUserId, productType }` body 전송 → `{ ok: true; invoiceLink: string }` 반환.
- (현재 상태) Antigravity가 이미 154–159행에 복구.

### Task 2 — PremiumTab Elite 결제 복구
- 업그레이드 버튼 onClick → `requestStarsInvoice(telegramUserId, 'elite')` → `window.Telegram.WebApp.openInvoice(invoiceLink, callback)` 호출.
- `status === 'paid'`면 햅틱 heavy + 토스트 "✅ Premium activated!" 1.5초 후 `window.location.reload()`.
- `openInvoice`가 미지원(데스크탑 브라우저 등)이면 `openTelegramLinkSafe(VITE_INVITEMEMBER_BOT_URL)`로 폴백.
- 결제 진행 중 `isPaying` 플래그로 버튼 disable + 라벨 "Loading..." 표기.
- (현재 상태) Antigravity가 이미 66–116행에 복구.

### Task 3 — TradeTab/PortfolioTab Recharge 복구
- 청산 시 보이는 리차지 버튼 onClick → `requestStarsInvoice(telegramUserId, 'reset')` 호출.
- 동일하게 `openInvoice` → 결제 성공 콜백에서 `refresh()`/`load()`로 상태 재조회. 폴백 동일.
- `starsPending`/`starsError` state 부활:
  - TradeTab: `LiquidationOverlay`에 다시 전달.
  - PortfolioTab: 인라인 청산 버튼 disabled + `150 ⭐` 라벨 + 에러 박스 부활.

### Task 4 — PLAN.md 기록
- 이 Stage 14.2 섹션을 PLAN.md 하단에 추가.

## Negative Constraints
- `openTelegramLinkSafe` 헬퍼 자체는 삭제 금지 — referral unlock 버튼 + openInvoice 폴백 두 곳에서 사용.
- `.env.production`의 `VITE_INVITEMEMBER_BOT_URL`은 폴백용으로 유지.
- 백엔드 `/api/payment/stars` 엔드포인트는 그대로 (Stage 14에서 안 건드림).
- VIPTab은 변경 없음.

## Verification
- 미니앱(텔레그램 모바일)에서 결제 버튼 탭 → 미니앱을 닫지 않고 네이티브 Stars 결제 시트가 즉시 떠야 함.
- 결제 완료 후 자동으로 status 재조회 (Premium은 reload, Recharge는 refresh/load).
- 데스크탑 프리뷰에서 `openInvoice`가 없으면 InviteMember 봇으로 폴백 (페이지 깨짐 없음).
- `tsc --noEmit` 통과.
