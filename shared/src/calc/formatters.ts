import { toDec, num } from './decimal';

export function fmtUsd(v: unknown, digits = 2): string {
  const d = toDec(v);
  return d.isNegative() ? `-$${d.abs().toFixed(digits)}` : `$${d.toFixed(digits)}`;
}

export function fmtSigned(v: unknown, digits = 2): string {
  const d = toDec(v);
  return d.isNegative() ? `-$${d.abs().toFixed(digits)}` : `+$${d.toFixed(digits)}`;
}

export function fmtPct(v: unknown, digits = 2): string {
  const d = toDec(v);
  return `${d.isNegative() ? '' : '+'}${d.toFixed(digits)}%`;
}

export function fmtPrice(v: unknown, digits = 6): string {
  const d = toDec(v);
  if (d.isZero()) return '0';
  const n = num(d);
  if (n >= 1000) return n.toFixed(2);
  if (n >= 1) return n.toFixed(digits);
  return n.toFixed(8);
}

export function fmtCompact(v: unknown): string {
  const n = num(v);
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

export function fmtAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

export function fmtTime(ts: number | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

export function freshnessLabel(ageMs: number, freshMaxMs: number, staleMaxMs: number): 'FRESH' | 'AGING' | 'STALE' {
  if (ageMs <= freshMaxMs) return 'FRESH';
  if (ageMs <= staleMaxMs) return 'AGING';
  return 'STALE';
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
