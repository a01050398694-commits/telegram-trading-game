import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Telegram Web App은 HTTPS만 허용하지만, 개발 단계에서는
// ngrok/cloudflared 같은 터널로 localhost를 HTTPS로 노출시켜 연결한다.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    // /api/* 는 bot(Express:3000) 로 프록시.
    // 브라우저 입장에선 same-origin → CORS 문제 없음, 동일 cloudflared 터널로 모두 노출.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
