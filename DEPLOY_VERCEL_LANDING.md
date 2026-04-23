# 🌐 랜딩페이지 별도 Vercel 프로젝트 배포 (I-03)

> 대상: `apps/landing/` (Next.js 16) 를 **미니앱과 별개의 Vercel 프로젝트**로 배포.
> 이미 존재하는 Vercel 프로젝트: `telegram-trading-game` (미니앱, root 기반). 랜딩은 신규 프로젝트가 필요.
> 마지막 검증: 2026-04-23

---

## 왜 별도 프로젝트인가

- 미니앱은 `web/` (Vite), 랜딩은 `apps/landing/` (Next.js) — 빌드 시스템이 다름
- 기존 `vercel.json` 이 `web/dist` 를 output 으로 고정 → 랜딩을 같이 올리려면 설정 분기 필요
- 별도 프로젝트가 가장 안전·명확

---

## 1. Vercel 대시보드에서 신규 프로젝트 생성

1. https://vercel.com/new 접속
2. Import Git Repository → `a01050398694-commits/telegram-trading-game` 선택 → **Import**
3. **Configure Project**:
   - Project Name: `trading-academy-landing`
   - Framework Preset: **Next.js** (자동 감지)
   - **Root Directory**: `apps/landing` ← ★ 중요
   - Build Command: (자동) `next build`
   - Output Directory: (자동) `.next`
   - Install Command: (자동) `npm install`
4. **Environment Variables** (아래 §2)
5. **Deploy** 클릭 → 약 2분 후 `https://trading-academy-landing-xxxx.vercel.app` 발급

---

## 2. 랜딩 Vercel Env Vars

| Key | 값 | 용도 |
|---|---|---|
| `NEXT_PUBLIC_TELEGRAM_BOT_URL` | `https://t.me/Tradergames_bot` | 전 페이지 CTA 버튼 |
| `NEXT_PUBLIC_SITE_URL` | `https://trading-academy-landing-xxxx.vercel.app` (초기) → 이후 커스텀 도메인 | OG 이미지 baseURL, sitemap 등 |
| `NEXT_PUBLIC_API_BASE` | `https://telegram-trading-bot-XXXX.onrender.com` | 랜딩의 Live Leaderboard(L-07) 가 `/api/rankings/today` 호출 |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog Project Key (선택) | A-01 분석 |
| `NEXT_PUBLIC_POSTHOG_HOST` | `https://us.i.posthog.com` | PostHog 호스트 |

> **NEXT_PUBLIC_ prefix 만 브라우저로 노출됨.** 그 외 값은 빌드 시에만 쓰임. 시크릿은 prefix 없이.

---

## 3. 커스텀 도메인 (도메인 구매 후)

소프트 런칭 단계에서는 `.vercel.app` 자동 도메인으로 충분. 도메인 구매 완료 시:

1. 도메인 등록사(Namecheap / 가비아 / Cloudflare Registrar) 에서 구매
2. Vercel 프로젝트 → **Settings → Domains** → Add Domain
3. Vercel 이 안내하는 A/CNAME 레코드를 DNS 에 추가
   - Apex: A `76.76.21.21`
   - www: CNAME `cname.vercel-dns.com`
4. SSL 자동 발급까지 5~10분 대기
5. **커스텀 도메인을 Production Primary 로 설정**
6. `NEXT_PUBLIC_SITE_URL` 을 커스텀 도메인으로 업데이트 → Redeploy

---

## 4. robots.txt / sitemap.xml 확인 (L-11)

배포 후:
```
curl https://trading-academy-landing-xxxx.vercel.app/robots.txt
curl https://trading-academy-landing-xxxx.vercel.app/sitemap.xml
```

`apps/landing/src/app/robots.ts`, `sitemap.ts` 로 자동 생성됨. 200 응답이면 OK.

---

## 5. 법무 페이지 접근성 확인 (LG-01~05 통합 검증)

배포 후 아래 전부 **200 OK + 내용 렌더** 확인:

### English
- `/terms` — 이용약관
- `/privacy` — 개인정보처리방침
- `/disclaimer` — 투자위험 고지
- `/refund` — 환불규정
- `/cookies` — 쿠키정책

### 한국어
- `/ko` — 한글 홈
- `/ko/terms`
- `/ko/privacy`
- `/ko/disclaimer`
- `/ko/refund`
- `/ko/cookies`

### Footer 링크 동작
- 영문 페이지 푸터 → `/terms` 등 영문 경로
- `/ko/*` 페이지 푸터 → `/ko/terms` 등 한글 경로 + 언어 토글 "English" → `/`

---

## 6. 미니앱 vs 랜딩 URL 구분

| 용도 | URL | Vercel Project | 비고 |
|---|---|---|---|
| **Telegram Mini App** | `https://telegram-trading-game-git-main-askbit.vercel.app` | `telegram-trading-game` | BotFather `/setmenubutton` 에 등록 |
| **Landing Page (마케팅)** | `https://trading-academy-landing-xxxx.vercel.app` | `trading-academy-landing` | 랜딩페이지, 법무 문서 호스팅 |

> 혼동 주의: **BotFather 에는 미니앱 URL 만** 등록. 랜딩 URL 은 외부 마케팅·SNS 공유용.

---

## 체크리스트 (완료 시 I-03 체크)

- [ ] Vercel 신규 프로젝트 `trading-academy-landing` 생성
- [ ] Root Directory = `apps/landing`
- [ ] 5개 env var 입력
- [ ] 첫 배포 Success
- [ ] `/robots.txt` + `/sitemap.xml` 200
- [ ] 영문 5개 + 한글 5개 법무 페이지 전부 렌더 확인
- [ ] 푸터 링크 로케일별 동작 확인
- [ ] Live Leaderboard 가 Render 봇에 연결되어 실제 데이터 표시
