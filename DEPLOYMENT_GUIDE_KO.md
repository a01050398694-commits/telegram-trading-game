# 🚀 Telegram Trading Game - 상용 서버 배포 가이드

대표님, 축하드립니다! 이제 모든 개발이 끝났습니다. 
아래 순서대로 따라 하시면 대표님의 PC가 꺼져도 24시간 돌아가는 글로벌 서비스가 런칭됩니다.

---

## 1. GitHub에 소스코드 올리기
클라우드 서버(Vercel, Render)는 대표님의 깃허브(GitHub)에서 소스코드를 가져와서 배포합니다.
1. [GitHub](https://github.com/) 에 가입하고 로그인합니다.
2. 우측 상단의 `+` 버튼을 눌러 **New repository**를 만듭니다. (이름: `telegram-trading-game`, Private 선택)
3. 레포지토리가 생성되면, 터미널(까만 창)을 열고 이 폴더(`telegram-trading-game`) 위치에서 아래 명령어를 차례대로 입력합니다.
   *(명령어의 주소 부분은 대표님의 실제 GitHub 주소로 바꿔주세요)*
   ```bash
   git add .
   git commit -m "🚀 Ready for Production"
   git branch -M main
   git remote add origin https://github.com/대표님아이디/telegram-trading-game.git
   git push -u origin main
   ```

---

## 2. 프론트엔드 (미니앱 UI) 배포하기 — Vercel
미니앱 화면을 띄워줄 웹 서버입니다. 평생 무료입니다.
1. [Vercel](https://vercel.com/) 에 접속하여 GitHub 계정으로 로그인(Sign up)합니다.
2. 대시보드 우측 상단 **[Add New...] -> [Project]** 를 클릭합니다.
3. 방금 만든 `telegram-trading-game` 레포지토리를 찾아 **[Import]** 버튼을 누릅니다.
4. **아무것도 건드리지 말고** 바로 **[Deploy]** 버튼을 누릅니다! (제가 `vercel.json`에 이미 세팅을 다 해두었습니다.)
5. 1~2분 뒤 폭죽이 터지며 고정된 도메인(예: `https://telegram-trading-game.vercel.app`)이 발급됩니다. **이 주소를 복사해 둡니다.**

---

## 3. 백엔드 (텔레그램 봇 엔진) 배포하기 — Render
실제로 코인 가격을 가져오고 결제를 처리할 봇 서버입니다.
1. [Render](https://render.com/) 에 접속하여 GitHub 계정으로 로그인합니다.
2. 우측 상단 **[New] -> [Blueprint]** 를 클릭합니다.
3. 방금 만든 `telegram-trading-game` 레포지토리를 연결합니다.
4. 제가 미리 만들어둔 `render.yaml` 파일을 렌더가 자동으로 인식합니다. **[Apply]** 를 누릅니다.
5. 배포가 진행되는 동안, 좌측 메뉴에서 **Environment(환경 변수)** 탭으로 들어가 대표님의 로컬 `.env` 파일에 있는 내용들을 똑같이 복사해서 넣어주어야 합니다.
   * `TELEGRAM_BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 등
   * **단, `TELEGRAM_WEBAPP_URL`은 방금 Vercel에서 발급받은 영구 주소(예: `https://...vercel.app`)로 적어줍니다.**

---

## 4. 마지막 관문: 봇파더(BotFather) 연결
이제 텔레그램 공식 봇에게 "우리의 진짜 서버 주소는 이거야!" 라고 알려주어야 합니다.
1. 텔레그램 앱을 열고 **@BotFather** 에게 갑니다.
2. `/mybots` 를 입력하고 대표님의 봇을 선택합니다.
3. **[Bot Settings] -> [Menu Button] -> [Edit Menu Button URL]** 을 누릅니다.
4. Vercel에서 발급받은 영구 주소(`https://...vercel.app`)를 붙여넣습니다.

**🎉 완료! 이제 PC를 끄셔도 전 세계 누구나 접속할 수 있는 서비스가 되었습니다.**
