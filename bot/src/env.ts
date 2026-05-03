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
  // Stage 15.5 — InviteMember 채널 멤버십 = 결제 상태 진실원.
  //   · PREMIUM_CHANNEL_ID — InviteMember 가 Premium 결제 후 자동 초대하는 비공개 채널.
  //     5분 폴링 (premiumSync) 으로 멤버 = is_premium=true.
  //   · RECHARGE_CHANNEL_ID — Recharge 결제 후 자동 초대되는 비공개 채널.
  //     bot.on('chat_member') 즉시 +$1,000 잔고 적립 후 5분 뒤 자동 ban → unban (재구매 가능).
  // legacy PREMIUM_CHAT_ID 도 fallback 으로 유지 (이전 .env 호환).
  PREMIUM_CHANNEL_ID: optional('PREMIUM_CHANNEL_ID', optional('PREMIUM_CHAT_ID', '')),
  // Stage 15.5 — Recharge 패키지 별 채널 분리.
  //   InviteMember 가 plan 별로 다른 채널에 chat-add 하도록 설정.
  //   봇이 chat_member 이벤트에서 어느 채널인지 보고 credit 금액 결정.
  //   레거시 RECHARGE_CHANNEL_ID 는 _1K_ID 에 fallback 으로 매핑 (기존 .env 호환).
  RECHARGE_CHANNEL_1K_ID: optional('RECHARGE_CHANNEL_1K_ID', optional('RECHARGE_CHANNEL_ID', '')),
  RECHARGE_CHANNEL_5K_ID: optional('RECHARGE_CHANNEL_5K_ID', ''),
  RECHARGE_CHANNEL_10K_ID: optional('RECHARGE_CHANNEL_10K_ID', ''),
  ADMIN_TG_ID: optional('ADMIN_TG_ID', ''),
  COMMUNITY_CHAT_ID: optional('COMMUNITY_CHAT_ID', ''),
  COMMUNITY_GROUP_URL: optional('COMMUNITY_GROUP_URL', 'https://t.me/Trader_club'),
  
  // AI Community Manager
  OPENAI_API_KEY: optional('OPENAI_API_KEY', ''),
  
  // Shill Engine
  SHILL_BOT_TOKENS: list('SHILL_BOT_TOKENS', ''),

  // Signal Cron — defaults to dry-run; Render must explicitly set 'false' to broadcast.
  SIGNAL_CRON_DRY_RUN: optional('SIGNAL_CRON_DRY_RUN', 'true'),

  // Stage 20 — Algorithmic trader bot mode. Default: 3 symbols, 83-min tick, AI persona OFF, outcome tracking ON.
  SIGNAL_SYMBOLS: list('SIGNAL_SYMBOLS', 'btcusdt,ethusdt,solusdt'),
  SIGNAL_TICK_INTERVAL_MIN: Number(optional('SIGNAL_TICK_INTERVAL_MIN', '83')),
  SIGNAL_AI_COMMENTARY: optional('SIGNAL_AI_COMMENTARY', 'false'),
  SIGNAL_OUTCOME_TRACKING: optional('SIGNAL_OUTCOME_TRACKING', 'true'),

  // Stage 17 C13 — FRED (St. Louis Fed) for fedRate / CPI / unemployment / GDP.
  // Optional: macro.ts skips FRED block when empty, Yahoo Finance still works.
  FRED_API_KEY: optional('FRED_API_KEY', ''),
} as const;
