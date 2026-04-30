// 라이브 사이트 전수조사 스크립트
const BASE = 'https://telegram-trading-game.vercel.app';

async function run() {
  // 1. index.html 가져오기
  const html = await fetch(BASE).then(r => r.text());
  console.log('=== INDEX.HTML ===');
  console.log('Length:', html.length);
  
  // 2. JS 번들 찾기
  const jsMatch = html.match(/src="\/(assets\/index-[^"]+\.js)"/);
  const cssMatch = html.match(/href="\/(assets\/index-[^"]+\.css)"/);
  console.log('JS bundle:', jsMatch?.[1] ?? 'NOT FOUND');
  console.log('CSS bundle:', cssMatch?.[1] ?? 'NOT FOUND');
  
  // 3. JS 번들 내용 검사
  if (jsMatch) {
    const js = await fetch(`${BASE}/${jsMatch[1]}`).then(r => r.text());
    console.log('\n=== JS BUNDLE CHECKS ===');
    console.log('JS size:', js.length);
    console.log('Contains m-auto:', js.includes('m-auto'));
    console.log('Contains justify-center:', js.includes('justify-center'));
    console.log('Contains PremiumTab:', js.includes('PremiumTab'));
    console.log('Contains StatsCard:', js.includes('StatsCard'));
    console.log('Contains Trade Statistics:', js.includes('Trade Statistics'));
    console.log('Contains Trading Academy:', js.includes('Trading Academy'));
    console.log('Contains ACADEMY:', js.includes('ACADEMY'));
    console.log('Contains safe-area-inset-top,0px:', js.includes('safe-area-inset-top,0px'));
    console.log('Contains safe-area-inset-top):', js.includes('safe-area-inset-top)'));
    console.log('Contains env(safe-area:', js.includes('env(safe-area'));
    console.log('Contains flex flex-col overflow-y-auto:', js.includes('flex flex-col overflow-y-auto'));
    console.log('Contains overflow-x-hidden:', js.includes('overflow-x-hidden'));
    
    // 4. PremiumTab 관련 CSS 클래스 찾기
    const ptMatch = js.match(/pt-\[max\([^)]+\)\]/g);
    console.log('pt-[max(...)] patterns:', ptMatch);
    
    // 빌드 시간 추정 (해시로)
    console.log('\nJS hash (filename):', jsMatch[1]);
  }
  
  // 4. CSS 번들 내용 검사
  if (cssMatch) {
    const css = await fetch(`${BASE}/${cssMatch[1]}`).then(r => r.text());
    console.log('\n=== CSS BUNDLE CHECKS ===');
    console.log('CSS size:', css.length);
    console.log('Contains safe-area-inset-top, 0px:', css.includes('safe-area-inset-top, 0px'));
    console.log('Contains safe-area-inset-top):', css.includes('safe-area-inset-top)'));
    console.log('CSS hash (filename):', cssMatch[1]);
  }
  
  // 5. HTTP 헤더 검사
  console.log('\n=== HTTP HEADERS ===');
  const resp = await fetch(BASE);
  for (const [k, v] of resp.headers) {
    if (k.toLowerCase().includes('cache') || k.toLowerCase().includes('age') || k.toLowerCase().includes('date') || k.toLowerCase().includes('x-vercel')) {
      console.log(`${k}: ${v}`);
    }
  }
}

run().catch(console.error);
