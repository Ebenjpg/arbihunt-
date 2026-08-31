import type { NetworkDescriptor } from '@arbihunt/shared';
import { liveMetadataService } from './liveMetadataService';

export type IdentityStatus = 'verified' | 'unverified' | 'unknown';

function normContract(c: string): string {
  return c.trim().toLowerCase();
}

/**
 * Confirms whether the BUY and SELL exchange listings refer to the same
 * underlying asset. Reliability order (per spec):
 *
 *   1. exchange-native asset identifiers (live metadata presence)
 *   2. contract address match
 *   3. chain/network metadata agreement (common canonical network)
 *   4. safe symbol fallback (both sides resolve to a non-null static table)
 *
 * Returns:
 *  - verified:   strong evidence of same asset (contract match, or common
 *                canonical network, or both sides have a safe known mapping)
 *  - unverified: positive evidence of a CONFLICT (contracts differ)
 *  - unknown:    no evidence either way (do not present as transfer-ready)
 */
export function verifyAssetIdentity(
  buyExchange: string,
  sellExchange: string,
  asset: string,
  buyNetworks: NetworkDescriptor[] | null,
  sellNetworks: NetworkDescriptor[] | null,
): IdentityStatus {
  const buyLive = liveMetadataService.getAssetMeta(buyExchange, asset);
  const sellLive = liveMetadataService.getAssetMeta(sellExchange, asset);

  const buyContracts = new Set(
    [...(buyLive?.contractAddress ? [buyLive.contractAddress] : []), ...(buyNetworks ?? []).map((n) => n.contractAddress).filter((c): c is string => Boolean(c))].map(normContract),
  );
  const sellContracts = new Set(
    [...(sellLive?.contractAddress ? [sellLive.contractAddress] : []), ...(sellNetworks ?? []).map((n) => n.contractAddress).filter((c): c is string => Boolean(c))].map(normContract),
  );

  // Contract conflict = not the same token. Never present as transfer-safe.
  if (buyContracts.size > 0 && sellContracts.size > 0) {
    let matched = false;
    for (const c of buyContracts) {
      if (sellContracts.has(c)) {
        matched = true;
        break;
      }
    }
    return matched ? 'verified' : 'unverified';
  }

  // Common canonical network id => same chain representation.
  const buyIds = new Set((buyNetworks ?? []).map((n) => n.id));
  const sellIds = new Set((sellNetworks ?? []).map((n) => n.id));
  for (const id of buyIds) {
    if (sellIds.has(id)) return 'verified';
  }

  // Both sides resolve to a known (non-null) safe mapping => same identity
  // via exchange-native identifiers / safe symbol normalization.
  if (buyNetworks !== null && sellNetworks !== null) return 'verified';

  // Live metadata agrees on the asset existing on a common chain.
  const buyLiveIds = new Set((buyLive?.networks ?? []).map((n) => n.id));
  const sellLiveIds = new Set((sellLive?.networks ?? []).map((n) => n.id));
  for (const id of buyLiveIds) {
    if (sellLiveIds.has(id)) return 'verified';
  }

  // No usable identity evidence on one side -> genuinely unknown.
  return 'unknown';
}
