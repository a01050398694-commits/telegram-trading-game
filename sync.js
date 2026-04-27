const fs = require('fs');
const path = require('path');

function copyFolderSync(from, to) {
    if (!fs.existsSync(to)) fs.mkdirSync(to, { recursive: true });
    fs.readdirSync(from).forEach(element => {
        const fromPath = path.join(from, element);
        const toPath = path.join(to, element);
        if (fs.lstatSync(fromPath).isFile()) {
            fs.copyFileSync(fromPath, toPath);
        } else {
            copyFolderSync(fromPath, toPath);
        }
    });
}

try {
    console.log('Syncing bot/src...');
    copyFolderSync(
        'E:\\claude\\telegram_game_project\\telegram-trading-game\\bot\\src',
        'C:\\Users\\user\\Desktop\\telegram-trading-game\\bot\\src'
    );
    
    console.log('Syncing web/src...');
    copyFolderSync(
        'E:\\claude\\telegram_game_project\\telegram-trading-game\\web\\src',
        'C:\\Users\\user\\Desktop\\telegram-trading-game\\web\\src'
    );
    
    console.log('Syncing web/src/locales...');
    copyFolderSync(
        'E:\\claude\\telegram_game_project\\telegram-trading-game\\web\\src\\locales',
        'C:\\Users\\user\\Desktop\\telegram-trading-game\\web\\src\\locales'
    );

    console.log('✅ Sync complete!');
} catch (e) {
    console.error('Error during sync:', e);
}
