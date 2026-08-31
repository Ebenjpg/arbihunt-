import type { NetworkDescriptor } from '@arbihunt/shared';

/**
 * USER-MANAGED NETWORK OVERRIDES (highest priority).
 *
 * Live exchange APIs do NOT expose withdrawal/deposit network info or withdrawal
 * fees without private (authenticated) keys, so the scanner cannot read them
 * automatically. To resolve a coin that currently shows UNKNOWN, verify the real
 * withdrawal network + fee ON THE EXCHANGE (wallet -> withdraw -> pick network)
 * and add it here. It is then treated as verified and displayed.
 *
 * Usage:
 *   userNetworkOverrides = {
 *     "<exchangeId>": {
 *       "<ASSET>": [
 *         { n: { id: 'TRC20', chain: 'Tron', fee: '1', min: '2' } },
 *       ],
 *     },
 *   };
 *
 * Fields per network: id, chain, fee (withdrawal fee in tokens), min (min
 * withdrawal), deposit/withdrawal ('open'|'closed'|'unknown').
 *
 * ⚠️ Only enter REAL values you verified on the exchange. Never guess — a wrong
 *    network or fee will mislead a real transfer.
 */
export const userNetworkOverrides: Record<string, Record<string, NetworkDescriptor[]>> = {
  // EXAMPLE (delete before real use):
  // mexc: {
  //   PONKE: [N({ id: 'SOL', chain: 'Solana', fee: '0.001', minWithdrawal: '0.01' })],
  // },
};

interface NetInput {
  id: string;
  chain: string;
  fee?: string;
  min?: string;
  minDeposit?: string;
  deposit?: 'open' | 'closed' | 'unknown';
  withdrawal?: 'open' | 'closed' | 'unknown';
  contractAddress?: string;
}

export function N(x: NetInput): NetworkDescriptor {
  return {
    id: x.id,
    chain: x.chain,
    withdrawalFee: x.fee,
    minWithdrawal: x.min,
    minDeposit: x.minDeposit,
    depositEnabled: x.deposit ?? 'open',
    withdrawalEnabled: x.withdrawal ?? 'open',
    contractAddress: x.contractAddress,
    source: 'live',
  };
}
