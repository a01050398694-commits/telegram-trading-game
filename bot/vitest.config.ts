import { defineConfig } from 'vitest/config';

// Phase K — Vitest config for bot workspace.
// - Node env (no jsdom): handlers, engine, db helpers all server-side.
// - Match any *.test.ts under src/ (collocated or in __tests__/).
// - Vite's resolver handles `.js` extension imports against `.ts` source — fits NodeNext.
// - env: stub the required env vars so importing src/env.ts in tests does not throw.
//   Tests that exercise external boundaries must mock the supabase client themselves.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    globals: false,
    testTimeout: 10_000,
    env: {
      TELEGRAM_BOT_TOKEN: 'test-token',
      TELEGRAM_WEBAPP_URL: 'http://localhost:5173',
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role',
      NODE_ENV: 'test',
      DAILY_ALLOWANCE: '10000',
      INITIAL_SEED_USD: '10000',
      LOCK_MODE_DURATION_MINUTES: '30',
      MARKET_SYMBOLS: 'btcusdt,ethusdt',
      PREMIUM_CHANNEL_ID: '-1001000000000',
      RECHARGE_CHANNEL_1K_ID: '-1001000000001',
      RECHARGE_CHANNEL_5K_ID: '-1001000000002',
      RECHARGE_CHANNEL_10K_ID: '-1001000000003',
    },
  },
});
