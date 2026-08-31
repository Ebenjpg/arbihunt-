import type { NetworkDescriptor } from '@arbihunt/shared';
import { liveMetadataService } from './liveMetadataService';
import { resolveNetworks } from './staticNetworks';

export class NetworkService {
  /**
   * Resolve networks for an asset on an exchange.
   *
   * Precedence:
   *   1. LIVE exchange metadata (contracts, chains, fees, deposit/withdraw
   *      status) fetched from public exchange APIs.
   *   2. staticNetworks.ts (user overrides + safe DEFAULT fallback for
   *      unambiguous assets).
   *   3. null → NETWORK UNKNOWN (exchange genuinely does not expose it).
   */
  getNetworks(exchangeId: string, asset: string): NetworkDescriptor[] | null {
    const live = liveMetadataService.getNetworks(exchangeId, asset);
    if (live) return live;
    return resolveNetworks(exchangeId, asset);
  }

  /** Whether an exchange provides LIVE metadata (identity can be trusted). */
  hasLiveMetadata(exchangeId: string): boolean {
    return liveMetadataService.isSupported(exchangeId);
  }

  /** Contract address known from live metadata (used for asset identity). */
  getContractAddress(exchangeId: string, asset: string): string | undefined {
    return liveMetadataService.getAssetMeta(exchangeId, asset)?.contractAddress;
  }

  /**
   * True when the exchange exposes live metadata for this exact asset.
   * Identity can then be confirmed by contract/chain instead of guesswork.
   */
  isVerifiedAsset(exchangeId: string, asset: string): boolean {
    return liveMetadataService.hasAsset(exchangeId, asset) || resolveNetworks(exchangeId, asset) !== null;
  }
}

export const networkService = new NetworkService();
