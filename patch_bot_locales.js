const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'bot/src/locales.ts');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(/btnOpenTerminal: '.*'/g, "btnOpenTerminal: '🚀 Start Trading'");
content = content.replace(/btnCommunity: '.*'/g, "btnCommunity: '🌐 Join Community'");

fs.writeFileSync(filePath, content);
console.log('Bot locales patched.');
