# 🚀 Render 봇 배포 — 환경변수 체크리스트 (I-04)

> 대상: `render.yaml` (Blueprint) 으로 Render 에 봇을 배포할 때 입력해야 하는 값 전체.
> 마지막 검증: 2026-04-23

---

## 1. Blueprint Apply 플로우 요약

1. https://render.com 접속 → GitHub 연결 → **New → Blueprint**
2. `a01050398694-commits/telegram-trading-game` 선택
3. Render 가 `render.yaml` 자동 인식 → **Apply** 클릭
4. 아래 **"필수" 섹션의 변수 7개**를 입력창에 순서대로 입력
5. Deploy 시작 → 약 3~5분 후 `https://telegram-trading-bot-XXXX.onrender.com` 발급
6. 발급된 URL 을 **Vercel 미니앱의 rewrite 대상**으로 재확인 (아래 §4)
7. BotFather 에 같은 URL을 등록 (별도 문서 `DEPLOY_BOTFATHER.md` 참조)

---

## 2. 필수 7개 (없으면 봇이 기동 안 함)

| Key | 값 | 어디서 구하나 |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | `123456:ABC...` | BotFather → `/mybots` → 선택 → **API Token** |
| `TELEGRAM_WEBAPP_URL` | `https://telegram-trading-game-git-main-askbit.vercel.app` | Vercel 미니앱 **Production 도메인** (아래 §4) |
| `SUPABASE_URL` | `https://xxxxx.supabase.co` | Supabase 프로젝트 → Settings → API |
| `SUPABASE_ANON_KEY` | `eyJhbGciOi...` (긴 JWT) | Supabase → Settings → API → **anon public** |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOi...` (긴 JWT) | Supabase → Settings → API → **service_role secret** |
| `VIP_CHAT_ID` | `-1001234567890` **또는** `@Trader_club` | Telegram 그룹에 봇 추가 후 `/getid` 로 확인 |
| `PREMIUM_CHAT_ID` | `-1001234567890` | InviteMember 가 관리하는 유료 채널 ID |

### 확인 포인트
- `TELEGRAM_WEBAPP_URL` 은 **https://** 로 시작하고 **슬래시 없이** 끝나야 함 (`.vercel.app`).
- `SUPABASE_SERVICE_ROLE_KEY` 는 절대 프론트·Git 에 노출 금지. Render Env 에만 존재.
- 그룹 ID는 **음수 정수**(`-100...`) 형태. `@handle` 은 공개 채널에만 통함.

---

## 3. 자동 / 기본값 (입력 불필요)

| Key | 값 | 이유 |
|---|---|---|
| `ADMIN_SECRET` | 자동 생성 | `generateValue: true` → Render 가 강력한 랜덤 문자열 생성. **Render 대시보드 Environment 탭**에서 복사해 `/admin` 페이지에 입력. |
| `NODE_ENV` | `production` | 고정 |
| `DAILY_ALLOWANCE` | `100000` | 매일 리셋되는 가상 자본 |
| `MARKET_SYMBOLS` | `btcusdt,ethusdt,solusdt,bnbusdt,xrpusdt` | 초기 5개. 추가 원하면 수정 |
| `LOG_LEVEL` | `info` | pino 로그 |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.1` | 10% 샘플링 |

---

## 4. 선택 — 해당 기능을 쓸 경우에만 입력

### B-15 Sentry (에러 추적)
- `SENTRY_DSN` — Sentry 프로젝트 생성 후 Client Keys (DSN) 복사

### B-11 / B-12 Affiliate UID 매칭 (MEXC / Bybit)
- 수동 리스트 방식:
  - `MEXC_AFFILIATE_UIDS` — 쉼표 구분 UID 목록
  - `MEXC_AFFILIATE_URL` — 레퍼럴 랜딩 URL
  - `BYBIT_AFFILIATE_UIDS` — 쉼표 구분
- 공식 API 방식 (더 정확):
  - `MEXC_API_KEY`, `MEXC_API_SECRET`
  - `BYBIT_API_KEY`, `BYBIT_API_SECRET`

### B-13 Lifetime 프로모 코드 자동 발급
- `INVITEMEMBER_PROMO_POOL` — 쉼표 구분 프로모 코드 목록 (InviteMember 에서 사전 발급)

---

## 5. Vercel Production 도메인 확인 방법

1. https://vercel.com/askbit/telegram-trading-game 접속
2. **Deployments** 탭 → 최상단 "Production" 레이블 찾기
3. 도메인 예시:
   - 자동 도메인: `telegram-trading-game-git-main-askbit.vercel.app` (branch 별칭, **이걸 쓰는 걸 권장**)
   - 대체: `telegram-trading-game.vercel.app` (Vercel 이 기본 도메인으로 할당한 경우)
4. 해당 URL 을 `TELEGRAM_WEBAPP_URL` 에 입력
5. 또한 그 URL 의 **호스트 부분만** (예: `telegram-trading-game-git-main-askbit.vercel.app`) 을
   나중에 BotFather `/setdomain` 에 등록해야 함

---

## 6. 배포 후 검증 (I-04 완료 기준)

```
curl https://telegram-trading-bot-XXXX.onrender.com/health
```

기대 응답:
```json
{ "ok": true, "env": "production", "prices": { ... 5개 심볼 ... } }
```

**`prices` 가 비어 있으면** → Binance WebSocket 연결 실패. Render Logs 에서
`[binance]` 로그 확인. Render 무료 플랜은 EU/US 리전이라 Binance 가 429/451 로 차단할 수
있음. 이 경우 GOTCHAS.md 의 fallback 정책 확인.

---

## 7. Render 무료 플랜 주의

- 15분 비활성 → **자동 슬립**. 첫 요청이 10~30초 지연됨.
- 해결: UptimeRobot 으로 `/health` 를 **5분마다 핑** (DEPLOY_MONITORING.md 참조)
- 유료 Starter ($7/월) 로 업그레이드하면 슬립 없음
- 텔레그램 webhook 모드를 쓰면 Render 가 깨어나지 않을 때 이벤트 누락 → **polling 모드가 안전** (현재 구현은 polling)

---

## 8. 보안 주의 ★★★

- ❌ `.env` 파일을 GitHub 커밋 금지 (`.gitignore` 에 포함됨)
- ❌ `SUPABASE_SERVICE_ROLE_KEY` 를 프론트 (Vite `VITE_*`) 에 절대 넣지 말 것
- ❌ `ADMIN_SECRET` 을 공개 채널/DM 에 공유 금지
- ✅ 프론트는 `VITE_BOT_USERNAME`, `VITE_INVITEMEMBER_BOT_URL`, `VITE_POSTHOG_KEY` 만 사용
- ✅ Render Env 변경 후에는 **Manual Deploy → Clear cache & redeploy** 권장
