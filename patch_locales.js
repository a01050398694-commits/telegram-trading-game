const fs = require('fs');
const path = require('path');

const localesDir = path.join(__dirname, 'web/src/locales');
const files = fs.readdirSync(localesDir).filter(f => f.endsWith('.json'));

const newKeysEn = {
  referral: {
    unlock: "Unlock after payment",
    couponCopied: "Coupon code copied!",
    linkCopied: "Invite link copied!",
    title: "Invite Friends Mission",
    invitedCount: "{{count}} friends invited",
    step1: "🎁 Step 1 · 3 Friends → +$50,000 Practice Capital",
    done: "Done",
    step2: "🏆 Step 2 · 10 Friends → Academy 1-Month Coupon",
    issued: "Issued",
    tapToCopy: "Tap to copy",
    copyLink: "Copy Invite Link 🔗"
  }
};

const newKeysKo = {
  referral: {
    unlock: "결제를 완료하셨나요? 락 풀기",
    couponCopied: "쿠폰 코드가 복사되었습니다!",
    linkCopied: "초대 링크가 복사되었습니다!",
    title: "친구 초대 미션",
    invitedCount: "{{count}} 명 초대 완료",
    step1: "🎁 1단계 · 3명 → +$50,000 연습 자본",
    done: "완료",
    step2: "🏆 2단계 · 10명 → Academy 1개월 쿠폰",
    issued: "발급됨",
    tapToCopy: "탭하여 복사",
    copyLink: "초대 링크 복사하기 🔗"
  }
};

files.forEach(file => {
  const filePath = path.join(localesDir, file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  if (!data.academy.referral) {
    data.academy.referral = file === 'ko.json' ? newKeysKo.referral : newKeysEn.referral;
  }
  if (!data.trade.errorNoTelegram) {
    data.trade.errorNoTelegram = file === 'ko.json' ? "Telegram 내부에서 열어주세요 (유저 ID 없음)" : "Please open inside Telegram (No User ID)";
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
});

console.log('Locales patched successfully.');
