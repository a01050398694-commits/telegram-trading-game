import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// npm workspaces에서 `npm run dev -w bot`의 cwd는 bot/이 된다.
// 루트 `.env` 하나로 운영하기 위해 이 파일 기준 상위 2단계를 명시적으로 로드한다.
// bot/.env (워크스페이스 전용) > 루트 .env 우선순위.
const __dirname = dirname(fileURLToPath(import.meta.url));
const botEnv = resolve(__dirname, '../.env');
const rootEnv = resolve(__dirname, '../../.env');
for (const path of [botEnv, rootEnv]) {
  if (existsSync(path)) {
    loadDotenv({ path });
    break;
  }
}

// 환경변수는 boundary 한 곳에서만 읽어 타입 안전한 상수로 노출한다.
// 누락 시 즉시 throw 해서 silent-fail 방지.
function required(name: string): string {
  const value = process.env[name];
  const placeholder = `your_${name.toLowerCase()}_here`;
  if (!value || value === placeholder) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.length > 0 ? value : fallback;
}

// 쉼표로 구분된 리스트. 공백 제거, 빈 원소 제거.
function list(name: string, fallback: string): string[] {
  return optional(name, fallback)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export const env = {
  BOT_TOKEN: required('TELEGRAM_BOT_TOKEN'),
  WEBAPP_URL: optional('TELEGRAM_WEBAPP_URL', 'http://localhost:5173'),
  // Render/Heroku 등 PaaS 는 $PORT 를 주입하므로 우선 채택, 로컬은 BOT_SERVER_PORT fallback.
  SERVER_PORT: Number(process.env.PORT ?? optional('BOT_SERVER_PORT', '3000')),
  NODE_ENV: optional('NODE_ENV', 'development'),

  // Supabase — bot은 service_role 우선 사용(RLS 우회), anon은 fallback.
  SUPABASE_URL: required('SUPABASE_URL'),
  SUPABASE_ANON_KEY: required('SUPABASE_ANON_KEY'),
  SUPABASE_SERVICE_ROLE_KEY: optional('SUPABASE_SERVICE_ROLE_KEY', ''),

  // Trading engine — Stage 15.1: 무료 자본 $10,000 (계정당 1회만, free_credit_used flag 로 보장).
  // 청산 시 InviteMember Recharge 결제 ($2.99) 로 +$1,000 충전.
  DAILY_ALLOWANCE: BigInt(optional('DAILY_ALLOWANCE', '10000')),
  MARKET_SYMBOLS: list('MARKET_SYMBOLS', 'btcusdt,ethusdt,solusdt'),
  
  VIP_CHAT_ID: optional('VIP_CHAT_ID', ''),
  VIP_CHANNEL_URL: optional('VIP_CHANNEL_URL', 'https://t.me/binance'),
  PREMIUM_CHAT_ID: optional('PREMIUM_CHAT_ID', ''),
  COMMUNITY_CHAT_ID: optional('COMMUNITY_CHAT_ID', ''),
  COMMUNITY_GROUP_URL: optional('COMMUNITY_GROUP_URL', 'https://t.me/Trader_club'),
  
  // AI Community Manager
  OPENAI_API_KEY: optional('OPENAI_API_KEY', ''),
  
  // Shill Engine
  SHILL_BOT_TOKENS: list('SHILL_BOT_TOKENS', ''),
} as const;
