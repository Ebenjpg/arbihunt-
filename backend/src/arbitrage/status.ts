import type { Opportunity, TransferStatus, NetworkDescriptor } from '@arbihunt/shared';
import type { IdentityStatus } from '../networks/assetIdentity';

const TRANSFER_TIME: Record<string, string> = {
  BTC: '~10–60 min',
  LIGHTNING: '~seconds',
  ERC20: '~2–5 min',
  TRC20: '~1–3 min',
  BEP20: '~1–3 min',
  POLYGON: '~2–10 min',
  SOL: '~1–2 min',
  XRP: '~2–10 min',
  DOGE: '~10–60 min',
  ADA: '~5–20 min',
  TRX: '~1–5 min',
  LTC: '~5–30 min',
  BCH: '~10–60 min',
  DOT: '~5–30 min',
  XLM: '~1–5 min',
  ATOM: '~10–30 min',
  AVAX: '~1–5 min',
  FIL: '~10–30 min',
  ETC: '~2–10 min',
  DASH: '~5–20 min',
  ZEC: '~10–40 min',
  EOS: '~1–5 min',
  XMR: '~10–30 min',
  NEAR: '~1–5 min',
  APT: '~1–5 min',
  ARB: '~2–10 min',
  OP: '~2–10 min',
  SUI: '~1–5 min',
  TON: '~1–5 min',
  INJ: '~1–5 min',
  MANTLE: '~1–5 min',
  LINEA: '~1–5 min',
  BASE: '~1–5 min',
  GT: '~1–5 min',
  MON: '~1–5 min',
  XPL: '~1–5 min',
  CELO: '~1–5 min',
  KAIA: '~1–5 min',
  ZK: '~2–10 min',
};

export function transferTimeEstimate(networkId?: string): string {
  if (!networkId) return 'UNKNOWN';
  return TRANSFER_TIME[networkId] ?? 'UNKNOWN';
}

export function computeTransferStatus(input: {
  networkStatus: 'ok' | 'blocked' | 'no-common' | 'unknown';
  assetStatus: IdentityStatus;
  withdrawalFeeKnown?: boolean;
  executable: boolean;
  executableFlag: string;
}): TransferStatus {
  // Only POSITIVE identity conflict (contract addresses differ / provably
  // different tokens) is a hard block. 'unknown' (no evidence either way) is
  // not a failure — the transfer is evaluated on its own merits below.
  if (input.assetStatus === 'unverified') return 'ASSET UNVERIFIED';
  switch (input.networkStatus) {
    case 'no-common':
      return 'NO COMMON NETWORK';
    case 'blocked':
      return 'TRANSFER BLOCKED';
    case 'unknown':
      return 'NETWORK UNKNOWN';
    case 'ok':
      break;
  }
  // A matched network without a verifiable withdrawal fee cannot be priced, so
  // it must not be presented as transfer-ready with a precise net profit.
  if (input.withdrawalFeeKnown === false) return 'TRANSFER COST UNKNOWN';
  if (!input.executable) {
    if (input.executableFlag.includes('NEGATIVE')) return 'NEGATIVE PROFIT';
    return 'INSUFFICIENT LIQUIDITY';
  }
  return 'READY';
}

const ids = (nets: NetworkDescriptor[] | null | undefined): string =>
  nets && nets.length > 0 ? nets.map((n) => n.id).join(',') : 'none';

/**
 * A specific, human-readable explanation for the transfer STATUS, derived from
 * the actual network-match result — instead of the generic "NETWORK UNKNOWN".
 * Returns undefined when the status is self-explanatory (READY, NEGATIVE …).
 */
export function transferStatusDetail(input: {
  networkStatus: 'ok' | 'blocked' | 'no-common' | 'unknown';
  assetStatus: IdentityStatus;
  withdrawalFeeKnown?: boolean;
  fromNetworks: NetworkDescriptor[] | null;
  toNetworks: NetworkDescriptor[] | null;
  recommended: NetworkDescriptor | undefined;
  buy: string;
  sell: string;
}): string | undefined {
  if (input.assetStatus === 'unverified') {
    return `Asset identity conflict (contracts differ) between ${input.buy} and ${input.sell}`;
  }
  switch (input.networkStatus) {
    case 'no-common':
      return `No common network — ${input.buy} has [${ids(input.fromNetworks)}], ${input.sell} has [${ids(input.toNetworks)}]`;
    case 'blocked':
      return `Common networks exist ([${ids(input.fromNetworks)}]) but every route is closed on ${input.buy}/${input.sell}`;
    case 'unknown':
      if (!input.fromNetworks || input.fromNetworks.length === 0) return `No network data for ${input.buy}`;
      if (!input.toNetworks || input.toNetworks.length === 0) return `No network data for ${input.sell}`;
      if (input.recommended) return `Route ${input.recommended.id} not fully open on ${input.buy}/${input.sell}`;
      return 'Networks present but transfer status could not be verified';
    case 'ok': {
      if (input.withdrawalFeeKnown === false && input.recommended) {
        return `Network ${input.recommended.id} matched but the withdrawal fee is unknown on ${input.buy}`;
      }
      return undefined;
    }
  }
}

export function recommendedNetwork(networks: NetworkDescriptor[], price: number): NetworkDescriptor | undefined {
  if (!networks.length) return undefined;
  const feeOf = (n: NetworkDescriptor): number => {
    if (!n.withdrawalFee) return Number.MAX_SAFE_INTEGER;
    const v = parseFloat(n.withdrawalFee);
    return Number.isNaN(v) ? Number.MAX_SAFE_INTEGER : (price > 0 ? v * price : v);
  };
  return [...networks].sort((a, b) => feeOf(a) - feeOf(b))[0];
}
