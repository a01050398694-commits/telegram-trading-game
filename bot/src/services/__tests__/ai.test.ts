// Stage 18 T5 — ban-phrase post-filter unit test.
// Why: GOTCHA #13 (CTAs leaking into trader-voice messages) survived prompt-only enforcement.
//   The detector is the second line of defense; this test pins its regex coverage.

import { describe, it, expect } from 'vitest';
import { detectBanPhrase } from '../ai.js';

describe('detectBanPhrase', () => {
  it('detects "wanna paper-trade" variants', () => {
    expect(detectBanPhrase('wanna paper-trade this in our app?')).not.toBeNull();
    expect(detectBanPhrase('wanna paper trade this in the app')).not.toBeNull();
  });

  it('detects "in our app" CTA', () => {
    expect(detectBanPhrase('try this in our app')).not.toBeNull();
  });

  it('detects AI self-reference', () => {
    expect(detectBanPhrase("i'm an ai assistant")).not.toBeNull();
    expect(detectBanPhrase('as an AI')).not.toBeNull();
  });

  it('passes clean trader chat', () => {
    expect(detectBanPhrase('sol short. structure broken on h4. in at 83.50.')).toBeNull();
  });
});
