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
    // ONE-SIDED match: exactly one exchange knows this asset's networks while
    // the other has no data at all. Surface the KNOWN side's networks (chain,
    // withdrawal fee, contract) instead of hiding everything behind UNKNOWN —
    // the route is priced and displayed, but flagged oneSided so it can never
    // be presented as fully transfer-ready (the other side is unconfirmed,
    // and same-name/different-contract tokens cannot be ruled out without
    // data from both sides).
    const known = fromList.length > 0 ? fromList : toList;
    if (known.length > 0) {
      // Keep the KNOWN side's own status field real (so a suspended withdrawal
      // on the buy side is still detected), but force the OPPOSITE side's
      // status to 'unknown' — we have no data for that exchange, and copying
      // the known side's status would describe the wrong exchange.
      const ranked = rankNetworks(known, price).map((n) => ({
        ...n,
        depositEnabled: fromList.length > 0 ? ('unknown' as const) : n.depositEnabled,
        withdrawalEnabled: toList.length > 0 ? ('unknown' as const) : n.withdrawalEnabled,
      }));
      return {
        matched: ranked,
        recommended: ranked[0],
        status: 'unknown',
        reason: 'NETWORK PARTIAL',
        oneSided: fromList.length > 0 ? 'buy' : 'sell',
      };
    }
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
  const ranked = [...matched].sort((a, b) => rank(a, b, priceDec));

  const fullyVerified = verified.length > 0;
  return {
    matched: ranked,
    recommended: ranked[0],
    status: fullyVerified ? 'ok' : 'unknown',
    reason: fullyVerified ? 'NETWORK MATCH' : 'NETWORK UNKNOWN',
  };
}

function rankNetworks(networks: NetworkDescriptor[], price?: number): NetworkDescriptor[] {
  const priceDec = price && price > 0 ? price : 0;
  return [...networks].sort((a, b) => rank(a, b, priceDec));
}

function rank(a: NetworkDescriptor, b: NetworkDescriptor, priceDec: number): number {
  // Fully verified (deposit=open AND withdrawal=open) routes always rank
  // above unverified routes, then order by USD fee.
  const aVerified = a.depositEnabled === 'open' && a.withdrawalEnabled === 'open' ? 0 : 1;
  const bVerified = b.depositEnabled === 'open' && b.withdrawalEnabled === 'open' ? 0 : 1;
  if (aVerified !== bVerified) return aVerified - bVerified;
  const feeA = feeToUsd(a, priceDec);
  const feeB = feeToUsd(b, priceDec);
  if (feeA !== feeB) return feeA - feeB;
  return (b.minWithdrawal || '').length - (a.minWithdrawal || '').length;
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
