import { defineConfig } from 'vitest/config';

// Phase K — Vitest config for bot workspace.
// - Node env (no jsdom): handlers, engine, db helpers all server-side.
// - Match any *.test.ts under src/ (collocated or in __tests__/).
// - Vite's resolver handles `.js` extension imports against `.ts` source — fits NodeNext.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/__tests__/**/*.test.ts'],
    globals: false,
    testTimeout: 10_000,
  },
});
