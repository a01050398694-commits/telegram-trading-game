export type SupportedLang = 'en' | 'ko' | 'ru' | 'tr' | 'vi' | 'id';

export const botLocales: Record<SupportedLang, any> = {
  en: {
    langSet: 'Language set to English! Please open the terminal to apply.',
    startError: '⚠️ Something went wrong while starting. Please try again shortly.',
    userInfoError: 'Unable to read user info.',
    enrollFirst: 'Send /start first to enroll in the Academy.',
    noWallet: 'No practice wallet found. Run /start again.',
    resetRequired: '🔴 *Reset required* — risk management lesson triggered',
    active: '🟢 Active',
    balance: '*💼 Practice Wallet*\nBalance: *{{balance}}*\nStatus: {{status}}\nOpen Positions: {{count}}',
    howItWorks: `📖 *How Trading Academy Works*

1️⃣ /start — Get a $100K virtual balance.
2️⃣ 🎓 Open the mini-app and browse 60+ live Binance markets.
3️⃣ Practice Long/Short with 1-125x leverage and check real-time PnL.
4️⃣ Close positions to complete your learning — both wins and losses are great lessons.
5️⃣ The Top 10 daily rankers receive an invite to the 24:00~00:15 KST Elite Analysts Club!

⚠️ *This is a paper trading simulator* — zero risk of real money loss.
If you run out of virtual balance, you can reset it for 150⭐ — no extra free funds will be provided.`,
    startCaption: `🎓 *Trading Academy Simulator*\n\nPractice your strategy with up to 125x leverage and no real money at risk. Enter the market now!`,
    startLines: [
      '🎓 *Welcome to Trading Academy!*',
      'The ultimate paper trading simulator with live Binance data.',
      '',
      '⚡️ *Live Market Data*: 100% identical to the real crypto market',
      '🛡️ *Zero Risk*: Practice 125x leverage safely',
      '🏆 *Global Leaderboard*: Compete and unlock VIP benefits',
      '',
      '👇 Select your language and open the terminal:'
    ],
    btnOpenTerminal: '🚀 Start Trading',
    btnHowItWorks: '📖 How It Works',
    btnCommunity: '🌐 Join Community',
  },
  ko: {
    langSet: '한국어로 설정되었습니다! 터미널을 열어 설정을 적용하세요.',
    startError: '⚠️ 시작 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    userInfoError: '유저 정보를 읽을 수 없습니다.',
    enrollFirst: '먼저 /start 로 아카데미에 등록하세요.',
    noWallet: '연습 지갑을 찾을 수 없습니다. /start 를 다시 실행하세요.',
    resetRequired: '🔴 *리셋 필요* — 리스크 관리 수업이 발동되었습니다',
    active: '🟢 활성',
    balance: '*💼 연습 지갑*\n잔고: *{{balance}}*\n상태: {{status}}\n오픈 포지션: {{count}}건',
    howItWorks: `📖 *트레이딩 아카데미 사용법*

1️⃣ /start — 가입 시 최초 1회 $100K의 모의 투자금이 지급됩니다.
2️⃣ 🎓 미니앱을 열어 바이낸스의 60+ 라이브 마켓을 둘러보세요.
3️⃣ 1~125배 레버리지로 롱/숏 의사결정을 연습하고 실시간 PnL을 검토하세요.
4️⃣ 포지션을 종료해 학습 결과를 확정하세요 — 승리와 손실 모두 훌륭한 수업입니다.
5️⃣ 일일 상위 10명에게 자정(00:00~00:15 KST) 엘리트 클럽 초대장이 발송됩니다!

⚠️ *본 앱은 모의 투자 시뮬레이터입니다* — 실제 자금 손실 위험이 전혀 없습니다.
연습 잔고가 소진되면 150⭐ 로 리셋해야 계속할 수 있습니다 — 추가 무료 지급은 없습니다.`,
    startCaption: `🎓 *트레이딩 아카데미 시뮬레이터*\n\n실제 자금 손실 없이 1~125배 레버리지 타점을 연습해보세요. 지금 바로 시장에 참여하세요!`,
    startLines: [
      '🎓 *트레이딩 아카데미에 오신 것을 환영합니다!*',
      '라이브 바이낸스 데이터로 돌아가는 완벽한 모의투자 시뮬레이터.',
      '',
      '⚡️ *실시간 마켓 데이터*: 실제 시장과 100% 동일',
      '🛡️ *리스크 제로*: 내 돈 없이 125배 레버리지 연습',
      '🏆 *글로벌 리더보드*: 전 세계 트레이더와 경쟁하고 VIP 혜택 쟁취',
      '',
      '👇 언어를 선택하고 터미널을 여세요:'
    ],
    btnOpenTerminal: '🚀 Start Trading',
    btnHowItWorks: '📖 사용법',
    btnCommunity: '🌐 Join Community',
  },
  ru: {
    langSet: 'Язык изменен на русский! Откройте терминал, чтобы применить.',
    startError: '⚠️ Что-то пошло не так. Пожалуйста, попробуйте позже.',
    userInfoError: 'Не удалось получить данные пользователя.',
    enrollFirst: 'Сначала отправьте /start, чтобы зарегистрироваться в Академии.',
    noWallet: 'Учебный кошелек не найден. Запустите /start еще раз.',
    resetRequired: '🔴 *Требуется сброс* — активирован урок управления рисками',
    active: '🟢 Активен',
    balance: '*💼 Учебный кошелек*\nБаланс: *{{balance}}*\nСтатус: {{status}}\nОткрытые позиции: {{count}}',
    howItWorks: `📖 *Как работает Trading Academy*

1️⃣ /start — Получите виртуальный баланс $100K.
2️⃣ 🎓 Откройте мини-приложение и изучите более 60 рынков Binance.
3️⃣ Практикуйте Long/Short с кредитным плечом до 125x и проверяйте PnL в реальном времени.
4️⃣ Закрывайте позиции для завершения обучения — и прибыль, и убытки важны.
5️⃣ Топ-10 лучших трейдеров дня получают приглашение в Elite Club (00:00~00:15 KST)!

⚠️ *Это симулятор торговли* — нет риска реальных финансовых потерь.
Если ваш баланс исчерпан, вы можете сбросить его за 150⭐ — дополнительных бесплатных средств не предусмотрено.`,
    startCaption: `🎓 *Симулятор Trading Academy*\n\nПрактикуйте стратегию с плечом до 125x без риска реальных потерь. Войдите на рынок сейчас!`,
    startLines: [
      '🎓 *Добро пожаловать в Trading Academy!*',
      'Лучший симулятор торговли с реальными данными Binance.',
      '',
      '⚡️ *Реальные данные*: 100% идентичны реальному рынку',
      '🛡️ *Нулевой риск*: Безопасная практика с плечом до 125x',
      '🏆 *Глобальный рейтинг*: Соревнуйтесь и получайте VIP привилегии',
      '',
      '👇 Выберите язык и откройте терминал:'
    ],
    btnOpenTerminal: '🚀 Start Trading',
    btnHowItWorks: '📖 Как это работает',
    btnCommunity: '🌐 Join Community',
  },
  tr: {
    langSet: 'Dil Türkçe olarak ayarlandı! Uygulamak için terminali açın.',
    startError: '⚠️ Başlatılırken bir hata oluştu. Lütfen biraz sonra tekrar deneyin.',
    userInfoError: 'Kullanıcı bilgisi okunamadı.',
    enrollFirst: 'Akademiye kaydolmak için önce /start gönderin.',
    noWallet: 'Deneme cüzdanı bulunamadı. Lütfen /start komutunu tekrar çalıştırın.',
    resetRequired: '🔴 *Sıfırlama gerekli* — risk yönetimi dersi tetiklendi',
    active: '🟢 Aktif',
    balance: '*💼 Deneme Cüzdanı*\nBakiye: *{{balance}}*\nDurum: {{status}}\nAçık Pozisyonlar: {{count}}',
    howItWorks: `📖 *Trading Academy Nasıl Çalışır*

1️⃣ /start — 100.000$ sanal bakiye kazanın.
2️⃣ 🎓 Mini uygulamayı açın ve 60'tan fazla canlı Binance piyasasına göz atın.
3️⃣ 1-125x kaldıraç ile Long/Short pratiği yapın ve gerçek zamanlı PnL'yi kontrol edin.
4️⃣ Öğreniminizi tamamlamak için pozisyonları kapatın — hem kazançlar hem de kayıplar harika birer derstir.
5️⃣ Günün En İyi 10 kullanıcısı Elite Club'a (00:00~00:15 KST) davet edilir!

⚠️ *Bu bir kağıt ticaret simülatörüdür* — gerçek para kaybı riski sıfırdır.
Sanal bakiyeniz tükenirse, 150⭐ karşılığında sıfırlayabilirsiniz — ekstra ücretsiz bakiye sağlanmaz.`,
    startCaption: `🎓 *Trading Academy Simülatörü*\n\n125x'e kadar kaldıraç ile stratejinizi risksiz bir şekilde pratik yapın. Piyasaya şimdi girin!`,
    startLines: [
      '🎓 *Trading Academy\'ye Hoş Geldiniz!*',
      'Canlı Binance verileriyle en iyi kağıt ticaret simülatörü.',
      '',
      '⚡️ *Canlı Piyasa*: Gerçek kripto piyasasıyla %100 aynı',
      '🛡️ *Sıfır Risk*: 125x kaldıraçla güvenle pratik yapın',
      '🏆 *Küresel Liderlik Tablosu*: Rekabet edin ve VIP avantajlarının kilidini açın',
      '',
      '👇 Dilinizi seçin ve terminali açın:'
    ],
    btnOpenTerminal: '🚀 Start Trading',
    btnHowItWorks: '📖 Nasıl Çalışır',
    btnCommunity: '🌐 Join Community',
  },
  vi: {
    langSet: 'Ngôn ngữ đã được đặt thành Tiếng Việt! Vui lòng mở terminal để áp dụng.',
    startError: '⚠️ Đã xảy ra lỗi khi khởi động. Vui lòng thử lại sau.',
    userInfoError: 'Không thể đọc thông tin người dùng.',
    enrollFirst: 'Gửi /start trước để ghi danh vào Học viện.',
    noWallet: 'Không tìm thấy ví thực hành. Vui lòng chạy lại /start.',
    resetRequired: '🔴 *Cần đặt lại* — bài học quản lý rủi ro đã được kích hoạt',
    active: '🟢 Hoạt động',
    balance: '*💼 Ví Thực Hành*\nSố dư: *{{balance}}*\nTrạng thái: {{status}}\nVị thế đang mở: {{count}}',
    howItWorks: `📖 *Cách Trading Academy Hoạt Động*

1️⃣ /start — Nhận số dư ảo $100K.
2️⃣ 🎓 Mở mini-app và duyệt qua hơn 60 thị trường Binance trực tiếp.
3️⃣ Thực hành Long/Short với đòn bẩy 1-125x và xem PnL thực tế.
4️⃣ Đóng vị thế để hoàn thành bài học — cả chiến thắng và thất bại đều là bài học tuyệt vời.
5️⃣ Top 10 người dùng giỏi nhất mỗi ngày sẽ được mời vào Elite Club (00:00~00:15 KST)!

⚠️ *Đây là một trình mô phỏng giao dịch ảo* — không có rủi ro mất tiền thật.
Nếu bạn hết số dư ảo, bạn có thể đặt lại với giá 150⭐ — không có thêm quỹ miễn phí nào được cung cấp.`,
    startCaption: `🎓 *Trình Mô Phỏng Trading Academy*\n\nThực hành chiến lược của bạn với đòn bẩy lên tới 125x mà không có rủi ro. Vào thị trường ngay!`,
    startLines: [
      '🎓 *Chào mừng đến với Trading Academy!*',
      'Trình mô phỏng giao dịch ảo tốt nhất với dữ liệu Binance trực tiếp.',
      '',
      '⚡️ *Dữ liệu trực tiếp*: Giống 100% thị trường tiền điện tử thực',
      '🛡️ *Không rủi ro*: Thực hành an toàn với đòn bẩy lên tới 125x',
      '🏆 *Bảng xếp hạng toàn cầu*: Cạnh tranh và mở khóa VIP',
      '',
      '👇 Chọn ngôn ngữ của bạn và mở terminal:'
    ],
    btnOpenTerminal: '🚀 Start Trading',
    btnHowItWorks: '📖 Hướng Dẫn',
    btnCommunity: '🌐 Join Community',
  },
  id: {
    langSet: 'Bahasa disetel ke Bahasa Indonesia! Silakan buka terminal untuk menerapkan.',
    startError: '⚠️ Terjadi kesalahan saat memulai. Silakan coba lagi nanti.',
    userInfoError: 'Tidak dapat membaca info pengguna.',
    enrollFirst: 'Kirim /start terlebih dahulu untuk mendaftar di Akademi.',
    noWallet: 'Dompet latihan tidak ditemukan. Jalankan /start lagi.',
    resetRequired: '🔴 *Perlu diatur ulang* — pelajaran manajemen risiko terpicu',
    active: '🟢 Aktif',
    balance: '*💼 Dompet Latihan*\nSaldo: *{{balance}}*\nStatus: {{status}}\nPosisi Terbuka: {{count}}',
    howItWorks: `📖 *Cara Kerja Trading Academy*

1️⃣ /start — Dapatkan saldo virtual $100K.
2️⃣ 🎓 Buka aplikasi mini dan telusuri 60+ pasar Binance langsung.
3️⃣ Latih Long/Short dengan leverage 1-125x dan periksa PnL waktu nyata.
4️⃣ Tutup posisi untuk menyelesaikan pembelajaran — kemenangan dan kekalahan adalah pelajaran hebat.
5️⃣ 10 Peringkat Teratas harian akan menerima undangan ke Elite Club (00:00~00:15 KST)!

⚠️ *Ini adalah simulator perdagangan kertas* — nol risiko kehilangan uang sungguhan.
Jika saldo virtual Anda habis, Anda dapat mengatur ulangnya seharga 150⭐ — tidak ada dana gratis tambahan.`,
    startCaption: `🎓 *Simulator Trading Academy*\n\nLatih strategi Anda dengan leverage hingga 125x tanpa risiko kehilangan uang sungguhan. Masuki pasar sekarang!`,
    startLines: [
      '🎓 *Selamat Datang di Trading Academy!*',
      'Simulator perdagangan kertas terbaik dengan data Binance langsung.',
      '',
      '⚡️ *Data Pasar Langsung*: 100% sama dengan pasar nyata',
      '🛡️ *Tanpa Risiko*: Latihan dengan leverage 125x secara aman',
      '🏆 *Papan Peringkat Global*: Bersaing dan buka manfaat VIP',
      '',
      '👇 Pilih bahasa Anda dan buka terminal:'
    ],
    btnOpenTerminal: '🚀 Start Trading',
    btnHowItWorks: '📖 Cara Kerja',
    btnCommunity: '🌐 Join Community',
  }
};
