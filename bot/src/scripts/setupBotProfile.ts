import { Bot } from 'grammy';
import { env } from '../env.js';
import { webAppUrl } from '../lib/webappUrl.js';

async function main() {
  const bot = new Bot(env.BOT_TOKEN);

  const descKo = `🎓 트레이딩 아카데미에 오신 것을 환영합니다

내 돈 들이지 않고 실전 감각을 마스터하세요. 바이낸스 실시간 데이터를 100% 연동한 최고급 모의투자 시뮬레이터입니다.

⚡️ 실시간 마켓 데이터: 실제 코인 시장과 동일한 환경
🛡️ 리스크 제로: 내 돈 없이 최대 125배 레버리지 연습
💰 무제한 자본: 가입 즉시 $10,000 연습용 시드 지급
🏆 글로벌 리더보드: 전 세계 트레이더들과 경쟁하고 VIP 혜택 쟁취

리스크 0%로 실전 경험을 쌓을 준비가 되셨나요?
👇 하단의 [시작] 버튼을 눌러 터미널에 접속하세요!`;

  const descEn = `🎓 Welcome to Trading Academy

Master the markets without risking your own capital. The ultimate crypto trading simulator.

⚡️ Live Market Data: 100% identical to the real crypto market
🛡️ Zero Risk: Practice up to 125x leverage safely
💰 Unlimited Capital: Get $10,000 starting practice seed
🏆 Global Leaderboard: Compete and unlock VIP benefits

Ready to prove your skills with zero financial risk?
👇 Click [Start] below to enter the terminal!`;

  const shortKo = `최고급 비트코인 모의투자 시뮬레이터. 내 돈 한 푼 없이 125배 타점을 연습하고 VIP 혜택을 쟁취하세요!`;
  const shortEn = `The ultimate crypto paper trading simulator. Practice up to 125x leverage with zero financial risk!`;

  try {
    // Clear out localized descriptions completely
    await bot.api.setMyDescription('', { language_code: 'ko' });
    await bot.api.setMyShortDescription('', { language_code: 'ko' });

    // Set English as the universal default
    await bot.api.setMyDescription(descEn);
    
    await bot.api.setMyShortDescription(shortEn);

    // Reset global Menu Button to English
    await bot.api.setChatMenuButton({
      menu_button: {
        type: 'web_app',
        text: 'OPEN TERMINAL',
        web_app: { url: webAppUrl() }
      }
    });

    console.log('✅ Bot profile updated successfully!');
  } catch (err) {
    console.error('❌ Failed to update bot profile:', err);
  }
}

main();
