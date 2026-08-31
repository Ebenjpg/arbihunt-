import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -9 });

export { Decimal };

export function toDec(v: Decimal.Value | null | undefined | unknown): Decimal {
  if (v === null || v === undefined || v === '') return new Decimal(0);
  if (typeof v === 'object' && v !== null && 'plus' in v && 'toNumber' in v) return v as Decimal;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return new Decimal(0);
  return new Decimal(n);
}

export function num(v: Decimal.Value | null | undefined | unknown): number {
  return toDec(v).toNumber();
}

export function add(...values: Decimal.Value[]): Decimal {
  let acc = new Decimal(0);
  for (const v of values) acc = acc.plus(toDec(v));
  return acc;
}

export function sub(a: Decimal.Value, b: Decimal.Value): Decimal {
  return toDec(a).minus(toDec(b));
}

export function mul(a: Decimal.Value, b: Decimal.Value): Decimal {
  return toDec(a).times(toDec(b));
}

export function div(a: Decimal.Value, b: Decimal.Value): Decimal {
  return toDec(a).div(toDec(b));
}

export function max(...values: Decimal.Value[]): Decimal {
  return Decimal.max(...values.map(toDec));
}

export function min(...values: Decimal.Value[]): Decimal {
  return Decimal.min(...values.map(toDec));
}

export function maxOrZero(...values: Decimal.Value[]): Decimal {
  return Decimal.max(0, ...values.map(toDec));
}
