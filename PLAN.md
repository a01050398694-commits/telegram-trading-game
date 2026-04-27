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

