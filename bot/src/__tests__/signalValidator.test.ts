import { describe, it, expect } from 'vitest';
import {
  validateSignal,
  __test__ as gates,
  type GateId,
} from '../services/signalValidator.js';
import type { Signal } from '../services/signalEngine.js';
import type { FullMacroSnapshot } from '../services/macroBundle.js';

// Why: synthesize a "clean" signal that passes every gate by default. Each test then
//   mutates one field to flip exactly one gate, isolating the failure.
function cleanLong(): Signal {
  return {
    symbol: 'BTCUSDT',
    direction: 'long',
    score: 60,
    confidence: 'medium',
    currentPrice: 80000,
    entry: 80000,
    stopLoss: 79200, // 1% below
    tp1: 81600, // 2% above → rr 2.0
    tp2: 82400, // 3% above → rr 3.0
    leverage: 5,
    rationale: [],
    multiTimeframeAlignment: {
      m15: 'bullish',
      h1: 'bullish',
      h4: 'bullish',
      d1: 'bullish',
      alignmentScore: 1,
    },
    structure: { trend: 'bullish', recentSwingHigh: 82000, recentSwingLow: 78000, bosDetected: true },
    keyLevels: { nearestResistance: 81600, nearestSupport: 79200, pivot: 80000 },
    divergence: { bullish: false, bearish: false },
    volumeConfirmation: 'confirmed',
  };
}

function cleanShort(): Signal {
  const long = cleanLong();
  return {
    ...long,
    direction: 'short',
    stopLoss: 80800, // 1% above
    tp1: 78400, // 2% below → rr 2.0
    tp2: 77600, // 3% below → rr 3.0
    multiTimeframeAlignment: {
      m15: 'bearish',
      h1: 'bearish',
      h4: 'bearish',
      d1: 'bearish',
      alignmentScore: 1,
    },
  };
}

const baseCtx = {
  // 1% of $80k = $800. ATR=$200 → 0.75*ATR=$150 floor. Our slDist=$800 passes.
  // 10*ATR=$2000 ceiling. tp1Dist=$1600, tp2Dist=$2400 — wait tp2Dist exceeds 12*ATR=$2400?
  // 80000 → tp2=82400 → tp2Dist=2400. 12*200=2400. equal → passes (strict >).
  atr1h: 200,
  macro: null as FullMacroSnapshot | null,
  // Tuesday 2026-04-21 14:00 UTC — not in any FOMC/CPI window, not a weekend.
  now: Date.UTC(2026, 3, 21, 14, 0, 0, 0),
};

describe('validateSignal — clean signals pass', () => {
  it('clean long passes all gates', () => {
    const r = validateSignal(cleanLong(), baseCtx);
    expect(r.ok).toBe(true);
  });

  it('clean short passes all gates', () => {
    const r = validateSignal(cleanShort(), baseCtx);
    expect(r.ok).toBe(true);
  });

  it('skip-direction signal short-circuits to ok', () => {
    const s = cleanLong();
    s.direction = 'skip';
    const r = validateSignal(s, baseCtx);
    expect(r.ok).toBe(true);
  });
});

describe('G1 — TP direction', () => {
  it('rejects long with tp1 below entry (regression: 2026-05-06 BTC incident)', () => {
    const s = cleanLong();
    s.entry = 81401;
    s.tp1 = 79143; // below entry — the actual buggy production value
    s.tp2 = 79448;
    const r = gates.checkG1(s);
    expect(r.ok).toBe(false);
    expect(r.failure?.gate).toBe<GateId>('G1_TP_DIRECTION');
    expect(r.failure?.reason).toMatch(/tp1.*below entry/);
  });

  it('rejects long with tp1 exactly at entry', () => {
    const s = cleanLong();
    s.tp1 = s.entry;
    const r = gates.checkG1(s);
    expect(r.ok).toBe(false);
  });

  it('rejects long with tp1 just under the 0.1% buffer', () => {
    const s = cleanLong();
    s.tp1 = s.entry * 1.0009; // below 0.1% buffer
    const r = gates.checkG1(s);
    expect(r.ok).toBe(false);
  });

  it('accepts long with tp1 at 0.11% above entry', () => {
    const s = cleanLong();
    s.entry = 80000;
    s.tp1 = 80088; // +0.11%
    s.stopLoss = 80000 - 60; // 0.075% below → rr1 = 88/60 ≈ 1.47
    s.tp2 = 80100;
    const r = gates.checkG1(s);
    expect(r.ok).toBe(true);
  });

  it('rejects short with tp1 above entry', () => {
    const s = cleanShort();
    s.tp1 = s.entry * 1.005;
    const r = gates.checkG1(s);
    expect(r.ok).toBe(false);
    expect(r.failure?.gate).toBe<GateId>('G1_TP_DIRECTION');
  });
});

describe('G2 — Signed R:R floor', () => {
  it('rejects long with rr1 below 1.0', () => {
    const s = cleanLong();
    s.entry = 80000;
    s.stopLoss = 79000; // slDist 1000
    s.tp1 = 80800; // rr1 0.8
    s.tp2 = 82000; // rr2 2.0 (passes)
    const r = gates.checkG2(s);
    expect(r.ok).toBe(false);
    expect(r.failure?.gate).toBe<GateId>('G2_RR_FLOOR');
    expect(r.failure?.reason).toMatch(/rr1=0\.80/);
  });

  it('rejects long with rr2 below 1.5', () => {
    const s = cleanLong();
    s.entry = 80000;
    s.stopLoss = 79000; // slDist 1000
    s.tp1 = 81100; // rr1 1.1 (passes G2_TP1)
    s.tp2 = 81400; // rr2 1.4 (fails G2_TP2)
    const r = gates.checkG2(s);
    expect(r.ok).toBe(false);
    expect(r.failure?.reason).toMatch(/rr2=1\.40/);
  });

  it('accepts long with rr1=1.0, rr2=1.5 (boundary)', () => {
    const s = cleanLong();
    s.entry = 80000;
    s.stopLoss = 79000;
    s.tp1 = 81000; // rr1 1.0
    s.tp2 = 81500; // rr2 1.5
    const r = gates.checkG2(s);
    expect(r.ok).toBe(true);
  });

  it('signed rr correctly produces negative for wrong-direction tp (defense check)', () => {
    // If G1 was bypassed, G2 still catches it.
    const s = cleanLong();
    s.entry = 81401;
    s.stopLoss = 80313;
    s.tp1 = 79143; // wrong side → signed rr1 negative
    s.tp2 = 79448;
    const r = gates.checkG2(s);
    expect(r.ok).toBe(false);
  });
});

describe('G3 — SL outside noise', () => {
  it('rejects when slDist < 0.75 × ATR', () => {
    const s = cleanLong();
    s.entry = 80000;
    s.stopLoss = 79900; // slDist 100
    const r = gates.checkG3(s, 200); // 0.75*200=150 floor
    expect(r.ok).toBe(false);
    expect(r.failure?.gate).toBe<GateId>('G3_SL_NOISE');
  });

  it('accepts when slDist = 0.75 × ATR (boundary)', () => {
    const s = cleanLong();
    s.entry = 80000;
    s.stopLoss = 79850; // slDist 150
    const r = gates.checkG3(s, 200);
    expect(r.ok).toBe(true);
  });

  it('passes through when ATR is null (cannot verify, do not block)', () => {
    const s = cleanLong();
    s.stopLoss = 80000 - 1; // tiny slDist
    const r = gates.checkG3(s, null);
    expect(r.ok).toBe(true);
  });
});

describe('G4 — TP not absurd', () => {
  it('rejects when tp1Dist > 10 × ATR', () => {
    const s = cleanLong();
    s.entry = 80000;
    s.tp1 = 82100; // 2100 away
    const r = gates.checkG4(s, 200); // 10*200=2000
    expect(r.ok).toBe(false);
    expect(r.failure?.gate).toBe<GateId>('G4_TP_CEILING');
  });

  it('rejects when tp2Dist > 12 × ATR', () => {
    const s = cleanLong();
    s.entry = 80000;
    s.tp1 = 81000; // 1000 away — passes
    s.tp2 = 82500; // 2500 away — exceeds 12*200=2400
    const r = gates.checkG4(s, 200);
    expect(r.ok).toBe(false);
  });
});

describe('G6 — MTF confluence (≥ 3/4 after iter 3 revert; 2/4 was -EV)', () => {
  it('rejects when only 2 of 4 components confirm', () => {
    const s = cleanLong();
    s.multiTimeframeAlignment = { m15: 'bullish', h1: 'bullish', h4: 'bearish', d1: 'bearish', alignmentScore: 0.5 };
    s.volumeConfirmation = 'confirmed'; // h1 + volume = 2/4
    const r = gates.checkG6(s);
    expect(r.ok).toBe(false);
    expect(r.failure?.gate).toBe<GateId>('G6_MTF_CONFLUENCE');
  });

  it('accepts when 3 of 4 components confirm (boundary)', () => {
    const s = cleanLong();
    s.multiTimeframeAlignment = { m15: 'bullish', h1: 'bullish', h4: 'bullish', d1: 'bearish', alignmentScore: 0.75 };
    s.volumeConfirmation = 'confirmed';
    // h4+h1+volume = 3/4
    const r = gates.checkG6(s);
    expect(r.ok).toBe(true);
  });

  it('accepts when all 4 confirm', () => {
    const r = gates.checkG6(cleanLong());
    expect(r.ok).toBe(true);
  });
});

describe('G7 — Divergence vs direction', () => {
  it('rejects long with bearish divergence', () => {
    const s = cleanLong();
    s.divergence = { bullish: false, bearish: true };
    const r = gates.checkG7(s);
    expect(r.ok).toBe(false);
    expect(r.failure?.gate).toBe<GateId>('G7_DIVERGENCE');
  });

  it('rejects short with bullish divergence', () => {
    const s = cleanShort();
    s.divergence = { bullish: true, bearish: false };
    const r = gates.checkG7(s);
    expect(r.ok).toBe(false);
  });

  it('accepts long with no divergence', () => {
    const r = gates.checkG7(cleanLong());
    expect(r.ok).toBe(true);
  });
});

describe('G9 — Macro suppression', () => {
  it('blocks during FOMC ±2h window', () => {
    // 2026-03-18 18:00 UTC is FOMC. Test 17:00 UTC (1h before).
    const fomcMinus1h = Date.UTC(2026, 2, 18, 17, 0, 0, 0);
    const r = gates.checkG9(null, fomcMinus1h);
    expect(r.ok).toBe(false);
    expect(r.failure?.gate).toBe<GateId>('G9_MACRO_SUPPRESSED');
    expect(r.failure?.reason).toMatch(/FOMC/);
  });

  it('blocks during weekend window (Saturday)', () => {
    // 2026-04-25 is a Saturday.
    const sat = Date.UTC(2026, 3, 25, 12, 0, 0, 0);
    const r = gates.checkG9(null, sat);
    expect(r.ok).toBe(false);
    expect(r.failure?.reason).toMatch(/weekend/);
  });

  it('blocks when BTC.D > 65', () => {
    const macro = {
      global: { btcDominance: 67.5 },
    } as unknown as FullMacroSnapshot;
    const r = gates.checkG9(macro, baseCtx.now);
    expect(r.ok).toBe(false);
    expect(r.failure?.reason).toMatch(/BTC\.D/);
  });

  it('passes on a quiet weekday outside event windows', () => {
    const r = gates.checkG9(null, baseCtx.now);
    expect(r.ok).toBe(true);
  });
});

describe('Integration — gate ordering', () => {
  it('returns first failure encountered (G1 before G2)', () => {
    // Construct a signal that fails BOTH G1 and G2 — should report G1.
    const s = cleanLong();
    s.entry = 81401;
    s.stopLoss = 80313;
    s.tp1 = 79143;
    s.tp2 = 79448;
    const r = validateSignal(s, baseCtx);
    expect(r.ok).toBe(false);
    expect(r.failure?.gate).toBe<GateId>('G1_TP_DIRECTION');
  });
});
