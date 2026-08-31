import type { ConfidenceLevel } from '../types';

export interface ConfidenceInput {
  dataAgeMs: number;
  networkStatus: 'ok' | 'blocked' | 'no-common' | 'unknown';
  assetVerified: boolean;
  buyFeeSource: 'live' | 'fallback';
  sellFeeSource: 'live' | 'fallback';
  slippagePct: number;
  executable: boolean;
  liquidityOk: boolean;
  freshMaxMs: number;
  staleMaxMs: number;
  withdrawalFeeKnown?: boolean;
  /** Quote deviates a lot from the cross-exchange median (stale/partial book). */
  offMarket?: boolean;
}

export interface ConfidenceResult {
  level: ConfidenceLevel;
  reasons: string[];
}

/**
 * Confidence score derived from data freshness, network compatibility,
 * asset identity, fee certainty, liquidity and slippage.
 */
export function computeConfidence(input: ConfidenceInput): ConfidenceResult {
  let score = 50;
  const reasons: string[] = [];

  const { dataAgeMs, freshMaxMs, staleMaxMs } = input;

  if (dataAgeMs <= freshMaxMs) {
    score += 20;
    reasons.push('Fresh price data');
  } else if (dataAgeMs <= staleMaxMs) {
    score += 10;
    reasons.push('Aging price data');
  } else {
    score -= 50;
    reasons.push('Stale price data');
  }

  // Off-market quote: surfaced early so it is always visible in the reason list.
  if (input.offMarket) {
    score -= 28;
    reasons.push('Price deviates from market median');
  }

  switch (input.networkStatus) {
    case 'ok':
      score += 15;
      reasons.push('Compatible network found');
      break;
    case 'blocked':
      score -= 40;
      reasons.push('Transfer blocked');
      break;
    case 'no-common':
      score -= 45;
      reasons.push('No common network');
      break;
    case 'unknown':
      score -= 15;
      reasons.push('Network info unknown');
      break;
  }

  if (input.assetVerified) {
    score += 10;
    reasons.push('Asset identity verified');
  } else {
    score -= 20;
    reasons.push('Asset identity not confirmed');
  }

  if (input.withdrawalFeeKnown === false) {
    score -= 25;
    reasons.push('Withdrawal fee unknown');
  }

  if (input.buyFeeSource === 'live') {
    score += 5;
    reasons.push('Live buy fee');
  } else {
    reasons.push('Default buy fee');
  }
  if (input.sellFeeSource === 'live') {
    score += 5;
    reasons.push('Live sell fee');
  } else {
    reasons.push('Default sell fee');
  }

  if (input.liquidityOk) {
    score += 10;
    reasons.push('Full capital executable');
  } else {
    score -= 15;
    reasons.push('Limited liquidity');
  }

  if (input.slippagePct < 0.5) {
    score += 5;
    reasons.push('Low slippage');
  } else if (input.slippagePct > 2) {
    score -= 10;
    reasons.push('High slippage');
  }

  if (!input.executable) {
    score -= 30;
    reasons.push('Not currently executable');
  }

  score = Math.max(0, Math.min(100, score));
  let level: ConfidenceLevel = score >= 70 ? 'HIGH' : score >= 45 ? 'MEDIUM' : 'LOW';

  // An off-market quote is never high-confidence, even when every other signal
  // is perfect — confidence can be rebuilt once the price is back in line.
  if (input.offMarket && level === 'HIGH') level = 'MEDIUM';

  return { level, reasons: reasons.slice(0, 6) };
}
