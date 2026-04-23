# 📊 모니터링 · 로그 세팅 (I-11 / I-12)

> UptimeRobot 가동 감시 + 로그 대시보드 북마크.
> 마지막 검증: 2026-04-23

---

## I-11 ── UptimeRobot (무료 가동 감시)

### 1. 계정 가입
1. https://uptimerobot.com/signUp 접속 → Google 로그인
2. **Free 플랜**: 50개 monitor, 5분 간격 — 소프트 런칭 규모에 충분

### 2. 모니터 3개 생성

#### Monitor A — Telegram Mini App (Vercel)
- **+ Add New Monitor** → **HTTP(s)**
- Friendly Name: `Trading Academy — Mini App`
- URL: `https://telegram-trading-game-git-main-askbit.vercel.app`
- Monitoring Interval: **5 minutes**
- Alert Contacts: (기본 email) + 원하면 Telegram Bot 알림 추가

#### Monitor B — Landing Page (Vercel)
- Friendly Name: `Trading Academy — Landing`
- URL: `https://trading-academy-landing-xxxx.vercel.app` (§ Vercel 랜딩 발급 후)
- Monitoring Interval: **5 minutes**

#### Monitor C — Bot API Health (Render) ★ 중요
- Friendly Name: `Trading Academy — Bot API`
- URL: `https://telegram-trading-bot-XXXX.onrender.com/health`
- Monitoring Interval: **5 minutes**
- **Keyword Monitor** 로 추가: Keyword = `"ok":true` → 응답 본문에 없으면 다운으로 간주
- **Render Free 플랜은 15분 비활성 시 슬립** → UptimeRobot 5분 핑이 **자동 wake-up 역할**을 겸함. 1석 2조.

### 3. Public Status Page (선택)

- Dashboard → **Status Pages → Add New**
- 3개 monitor 선택 → URL 공개
- 이용자가 봇이 살아있는지 확인 가능 (신뢰도 ↑)

### 4. 알림 채널

- Free: Email 만
- Pro($7/월): Slack, Discord, Telegram Bot, Webhook 등 추가
- **최소**: 대표님 gmail 1개 등록

---

## I-12 ── 로그 · 대시보드 북마크

### A. Render — 봇 로그
URL: `https://dashboard.render.com/web/<service-id>/logs`
- 서비스 선택 후 **Logs** 탭
- 실시간 스트림 + 시간 필터
- 무료 플랜은 **최근 7일 보존**. 장기 보관 필요하면 Logtail / Better Stack 연동

### B. Vercel — 미니앱 / 랜딩 로그
URL:
- 미니앱: `https://vercel.com/askbit/telegram-trading-game/logs`
- 랜딩: `https://vercel.com/askbit/trading-academy-landing/logs`
- **Runtime Logs** → Edge / Serverless 함수 에러
- **Build Logs** → deployment 실패 원인

### C. Supabase — DB 로그
URL: `https://supabase.com/dashboard/project/<project-ref>/logs/postgres-logs`
- **Postgres Logs** — 쿼리 에러, 슬로우 쿼리
- **API Logs** — PostgREST 호출 로그
- **Auth Logs** — (현재 미사용)
- **Edge Function Logs** — (현재 미사용)

### D. Sentry — 에러 추적 (B-15)
URL: `https://<org>.sentry.io/issues/`
- `@sentry/node` (bot), `@sentry/react` (web) 연결됨
- 새 이슈 = Slack/Email 알림 설정 권장

### E. PostHog — 제품 분석 (A-01)
URL: `https://app.posthog.com/dashboards`
- DAU / MAU / Funnel / Retention
- 핵심 이벤트 정의 필요 (별도 A-01 작업)

---

## 북마크 세트 (브라우저 즐겨찾기 폴더 "Trading Academy Ops")

```
[Trading Academy Ops]
├── Render Bot         → https://dashboard.render.com/web/<ID>/logs
├── Vercel Mini App    → https://vercel.com/askbit/telegram-trading-game
├── Vercel Landing     → https://vercel.com/askbit/trading-academy-landing
├── Supabase DB        → https://supabase.com/dashboard/project/<REF>
├── Supabase Logs      → https://supabase.com/dashboard/project/<REF>/logs/postgres-logs
├── Sentry             → https://<org>.sentry.io/issues/
├── PostHog            → https://app.posthog.com/dashboards
├── UptimeRobot        → https://uptimerobot.com/dashboard
├── BotFather          → https://t.me/BotFather
├── InviteMember       → https://invitemember.com/dashboard
└── GitHub Repo        → https://github.com/a01050398694-commits/telegram-trading-game
```

---

## 일상 모니터링 루틴 (권장 — 하루 1회 3분)

1. UptimeRobot → 3개 monitor 모두 Up 확인
2. Sentry → 신규 이슈 0 또는 triage
3. Render Logs → 최근 1시간 ERROR 레벨 스캔
4. Supabase → DB 사이즈 (Free 500MB 한도), connection count

---

## 알림 우선순위

| 레벨 | 조건 | 행동 |
|---|---|---|
| 🔴 P0 | 봇 API 5분 이상 다운 | 즉시 Render 대시보드 확인 → 재배포 |
| 🔴 P0 | Supabase 다운 | Supabase status page 확인 → 대응 불가 시 트위터 공지 |
| 🟠 P1 | Sentry 1시간 내 동일 에러 10건↑ | 코드 수정 + hotfix 배포 |
| 🟡 P2 | Vercel Build 실패 | commit 롤백 후 로컬 재현 |
| 🟢 P3 | DB 사이즈 70%↑ | Pro 플랜 업그레이드 계획 |

---

## 체크리스트 (완료 시 I-11 / I-12 체크)

- [ ] UptimeRobot 계정 가입
- [ ] 3개 monitor 생성 (미니앱 / 랜딩 / 봇 /health)
- [ ] 봇 monitor 에 keyword `"ok":true` 설정
- [ ] Email 알림 등록
- [ ] 브라우저 북마크 폴더 "Trading Academy Ops" 구성
- [ ] Sentry 프로젝트 2개 (bot + web) 생성 + DSN 확보
- [ ] PostHog 프로젝트 생성 + KEY 확보 (A-01 에서 이벤트 연결)
