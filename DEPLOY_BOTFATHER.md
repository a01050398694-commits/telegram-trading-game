# 🤖 BotFather 세팅 스크립트 (I-07 / I-08 / I-09)

> 텔레그램 앱에서 [@BotFather](https://t.me/BotFather) 에게 순서대로 명령어를 전송.
> 대상 봇: `@Tradergames_bot`
> 마지막 검증: 2026-04-23

---

## 0. 준비물

- Vercel 미니앱 **Production URL** — 예: `https://telegram-trading-game-git-main-askbit.vercel.app`
  - 호스트만 추출: `telegram-trading-game-git-main-askbit.vercel.app`
- BotFather 봇 선택: `/mybots` → `@Tradergames_bot` 터치

---

## I-07 ── 봇 프로필 (이름 / 설명 / 소개)

### 1-A. 봇 이름 변경 (`/setname`)
```
/setname
@Tradergames_bot
Trading Academy
```
> 화면에 보이는 표시 이름. username 은 변경 불가 (`@Tradergames_bot` 그대로).

### 1-B. 짧은 설명 (`/setdescription`) — 최대 512자
```
/setdescription
@Tradergames_bot
```
붙여넣기:
```
$100K Daily Practice Capital. Compete on daily leaderboards, join the Elite Analyst Club, and master crypto futures trading — safely, inside Telegram. No real money involved.

매일 $100K 연습 자본으로 글로벌 랭킹에서 경쟁하고 Elite 채팅방에 초대받으세요. 텔레그램 안에서 리스크 관리를 체계적으로 배웁니다. 실제 돈은 관여되지 않습니다.
```

### 1-C. About (`/setabouttext`) — 최대 120자, 봇 프로필 상단에 표시
```
/setabouttext
@Tradergames_bot
```
붙여넣기:
```
Paper-trading simulator. $100K daily capital, live Binance feeds, global leaderboards. 모의 트레이딩 시뮬레이터.
```

---

## I-07 ── 명령어 메뉴 (`/setcommands`)

```
/setcommands
@Tradergames_bot
```
붙여넣기 **(한 줄 하나씩)**:
```
start - 게임 시작 / Start the game
play - 미니앱 열기 / Open Mini App
rank - 오늘의 랭킹 / Today's leaderboard
portfolio - 내 포트폴리오 / My portfolio
premium - 프리미엄 구독 / Subscribe to premium
referral - 친구 초대 링크 / Referral link
help - 도움말 / Help
refund - 환불 요청 / Request refund
getid - 채팅방 ID 확인 (관리자) / Get chat ID (admin)
```

---

## I-08 ── 미니앱 메뉴 버튼 (`/setmenubutton`)

채팅창 하단의 ≡ 대신 "Play" 버튼이 뜨게 만드는 설정.

```
/setmenubutton
@Tradergames_bot
```
BotFather 가 **버튼 이름 텍스트**를 물어봄 →
```
Play
```

그 다음 **URL 입력** →
```
https://telegram-trading-game-git-main-askbit.vercel.app
```

> 도메인 구매 후에는 이 URL 만 `https://app.tradingacademy.io` 같은 걸로 다시 설정.

---

## I-09 ── 미니앱 도메인 화이트리스트 (`/setdomain`)

Telegram 이 initData 서명을 해줄 **허용 호스트** 목록.

```
/setdomain
@Tradergames_bot
telegram-trading-game-git-main-askbit.vercel.app
```

> ✏️ **호스트만** 입력 (https:// X, 슬래시 X, 경로 X). 여러 도메인을 쓰려면 명령을 반복.
> 커스텀 도메인 추가 시: `/setdomain` → `app.tradingacademy.io` 같이 추가 등록.

---

## (선택) 봇 프로필 사진 (`/setuserpic`)

```
/setuserpic
@Tradergames_bot
```
512x512 PNG 업로드 (M-03 에셋 제작 완료 후).

---

## (선택) Mini App Store 등록 (`/setmarkdownv2` 불필요, 별도 플로우)

Mini App Store 에 공개 등록하려면:
1. BotFather → `/mybots` → 봇 선택 → **Mini Apps → Configure Mini App**
2. Short name, Title, Description, Photo, GIF, URL 입력
3. Telegram 심사 (며칠 소요) → 승인되면 `https://t.me/apps/...` 에 노출

소프트 런칭 단계에서는 **보류 권장** — 먼저 직접 링크/QR 로 테스트 후 안정화되면 등록.

---

## I-10 ── 파란체크 인증 (Verified Bot)

**요구 조건 (2026년 기준, 변동 가능)**:
- 공식 언론 인용 기사 3건 이상, 또는
- 팔로워 1만 명 이상 공식 채널 보유
- 정부·기업 계정은 별도 플로우

대부분의 스타트업은 런칭 초기 불가. **런칭 후 3~6개월, PR 커버리지 확보 시점에 신청**.
신청 방법: https://telegram.org/faq#q-how-do-i-get-verified (Telegram Support 티켓)

---

## 검증 (I-07/08/09 완료 기준)

1. 텔레그램에서 `@Tradergames_bot` 검색 → 프로필 확인
   - 이름: Trading Academy
   - About 표시 확인
   - 하단에 **Play 버튼** 노출 → 터치 → Vercel 미니앱 로드
2. `/start` 입력 → 명령어 리스트가 `/` 입력 시 자동완성에 뜨는지 확인
3. 미니앱 내에서 API 호출 성공 (Render 봇에 연결되어 있음을 의미)
4. **initData 검증이 통과** 하면 `/setdomain` 화이트리스트 OK

실패 시 점검:
- **"Please activate the bot"** → `/start` 가 한 번도 호출된 적 없음. 텔레그램에서 메시지 보내기
- **미니앱이 빈 화면** → Vercel 도메인 오타 또는 HTTPS 아님
- **"The mini app is not initialized correctly"** → `/setdomain` 미등록 또는 호스트 불일치
