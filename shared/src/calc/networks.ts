import type { NetworkDescriptor, NetworkMatchResult } from '../types';

export interface MatchInput {
  from: NetworkDescriptor[];
  to: NetworkDescriptor[];
  /** optional current buy price (in quote) used to rank networks by USD fee */
  price?: number;
}

/**
 * Finds the set of compatible withdrawal/deposit networks between two
 * exchanges for a given asset, selects the cheapest valid route and reports
 * transfer status.
 *
 * A route is a candidate when both sides list the same canonical network and
 * neither side is explicitly CLOSED. Routes where deposit/withdrawal status is
 * UNKNOWN are kept as candidates (so the network + fee are never hidden), but
 * the overall status is lowered to 'unknown' unless a fully-verified
 * (deposit=open AND withdrawal=open) route exists.
 */
export function matchNetworks({ from, to, price }: MatchInput): NetworkMatchResult {
  const fromList = from || [];
  const toList = to || [];

  if (fromList.length === 0 || toList.length === 0) {
    return {
      matched: [],
      status: 'unknown',
      reason: 'NETWORK UNKNOWN',
    };
  }

  const toById = new Map<string, NetworkDescriptor>();
  for (const n of toList) toById.set(n.id, n);

  const matched: NetworkDescriptor[] = [];
  const verified: NetworkDescriptor[] = [];
  let anyOverlap = false;
  for (const f of fromList) {
    const t = toById.get(f.id);
    if (!t) {
      continue;
    }
    anyOverlap = true;
    const fClosed = f.withdrawalEnabled === 'closed';
    const tClosed = t.depositEnabled === 'closed';
    if (fClosed || tClosed) continue; // hard-blocked route, skip
    const candidate: NetworkDescriptor = {
      ...f,
      // merge the stricter status
      depositEnabled: t.depositEnabled,
      withdrawalEnabled: f.withdrawalEnabled,
    };
    matched.push(candidate);
    if (f.withdrawalEnabled === 'open' && t.depositEnabled === 'open') {
      verified.push(candidate);
    }
  }

  if (matched.length === 0) {
    if (anyOverlap) {
      return {
        matched: [],
        status: 'blocked',
        reason: 'TRANSFER BLOCKED',
      };
    }
    return {
      matched: [],
      status: 'no-common',
      reason: 'NO COMMON NETWORK',
    };
  }

  const priceDec = price && price > 0 ? price : 0;
  const rank = (a: NetworkDescriptor, b: NetworkDescriptor): number => {
    // Fully verified (deposit=open AND withdrawal=open) routes always rank
    // above unverified routes, then order by USD fee.
    const aVerified = a.depositEnabled === 'open' && a.withdrawalEnabled === 'open' ? 0 : 1;
    const bVerified = b.depositEnabled === 'open' && b.withdrawalEnabled === 'open' ? 0 : 1;
    if (aVerified !== bVerified) return aVerified - bVerified;
    const feeA = feeToUsd(a, priceDec);
    const feeB = feeToUsd(b, priceDec);
    if (feeA !== feeB) return feeA - feeB;
    return (b.minWithdrawal || '').length - (a.minWithdrawal || '').length;
  };
  const ranked = [...matched].sort(rank);

  const fullyVerified = verified.length > 0;
  return {
    matched: ranked,
    recommended: ranked[0],
    status: fullyVerified ? 'ok' : 'unknown',
    reason: fullyVerified ? 'NETWORK MATCH' : 'NETWORK UNKNOWN',
  };
}

function feeToUsd(n: NetworkDescriptor, price: number): number {
  if (!n.withdrawalFee) return Number.MAX_SAFE_INTEGER;
  const parsed = parseFloat(n.withdrawalFee);
  if (Number.isNaN(parsed)) return Number.MAX_SAFE_INTEGER;
  return price > 0 ? parsed * price : parsed;
}

export function networkMatches(a: NetworkDescriptor[], b: NetworkDescriptor[]): boolean {
  const ids = new Set(a.map((n) => n.id));
  return b.some((n) => ids.has(n.id));
}
