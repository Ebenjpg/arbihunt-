import { describe, expect, it } from 'vitest';
import { isDegradedNext, isResilientRow } from '../sticky';

const NOW = 1_000_000;

function storedRow(overrides: Partial<{ transferStatus: string; grossSpreadPct: number; lastUpdatedAt: number }> = {}) {
  return { transferStatus: 'READY', grossSpreadPct: 5, lastUpdatedAt: NOW - 10_000, ...overrides };
}

function nextRow(overrides: Partial<{ grossSpreadPct: number; dataAgeMs: number; transferStatus: string }> = {}) {
  return { grossSpreadPct: 5, dataAgeMs: 2_000, transferStatus: 'READY', ...overrides };
}

describe('isDegradedNext', () => {
  it('accepts replacement immediately when the edge is genuinely gone', () => {
    const existing = storedRow();
    const next = nextRow({ grossSpreadPct: 0.05 });
    expect(isDegradedNext(existing, next, 0.1, 15_000)).toBe(false);
  });

  it('flags a stale snapshot as degraded when the edge still exists', () => {
    const existing = storedRow();
    const next = nextRow({ dataAgeMs: 40_000 });
    expect(isDegradedNext(existing, next, 0.1, 15_000)).toBe(true);
  });

  it('flags a READY row flipping to a non-READY status as degraded', () => {
    const existing = storedRow();
    const next = nextRow({ transferStatus: 'NETWORK UNKNOWN' });
    expect(isDegradedNext(existing, next, 0.1, 15_000)).toBe(true);
  });

  it('does not flag a fresh READY snapshot', () => {
    const existing = storedRow();
    const next = nextRow();
    expect(isDegradedNext(existing, next, 0.1, 15_000)).toBe(false);
  });

  it('does not flag an EXPIRED status flip (expiry is handled by retention)', () => {
    const existing = storedRow();
    const next = nextRow({ transferStatus: 'EXPIRED' });
    expect(isDegradedNext(existing, next, 0.1, 15_000)).toBe(false);
  });
});

describe('isResilientRow', () => {
  it('protects a READY, profitable, recently verified row', () => {
    expect(isResilientRow(storedRow(), NOW, 120_000, 0.1)).toBe(true);
  });

  it('does not protect a row that is not READY', () => {
    expect(isResilientRow(storedRow({ transferStatus: 'NETWORK UNKNOWN' }), NOW, 120_000, 0.1)).toBe(false);
  });

  it('does not protect a row below the display floor', () => {
    expect(isResilientRow(storedRow({ grossSpreadPct: 0.05 }), NOW, 120_000, 0.1)).toBe(false);
  });

  it('does not protect a row older than the grace window', () => {
    expect(isResilientRow(storedRow({ lastUpdatedAt: NOW - 130_000 }), NOW, 120_000, 0.1)).toBe(false);
  });
});
