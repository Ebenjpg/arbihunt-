import type { NetworkDescriptor } from '@arbihunt/shared';
import { userNetworkOverrides } from './userOverrides';

type NetInput = {
  id: string;
  chain: string;
  fee?: string;
  minWithdrawal?: string;
  minDeposit?: string;
  deposit?: 'open' | 'closed' | 'unknown';
  withdrawal?: 'open' | 'closed' | 'unknown';
  contractAddress?: string;
};

function N(n: NetInput): NetworkDescriptor {
  return {
    id: n.id,
    chain: n.chain,
    withdrawalFee: n.fee,
    minWithdrawal: n.minWithdrawal,
    minDeposit: n.minDeposit,
    depositEnabled: n.deposit ?? 'open',
    withdrawalEnabled: n.withdrawal ?? 'open',
    contractAddress: n.contractAddress,
    source: 'default',
  };
}

/**
 * Static, clearly-marked fallback network table. Exchange APIs do not expose
 * withdrawal/deposit network details without private keys, so these are
 * DEFAULT estimates. Live verification can be layered on later.
 */
const COMMON: Record<string, NetworkDescriptor[]> = {
  BTC: [
    N({ id: 'BTC', chain: 'Bitcoin', fee: '0.0005', minWithdrawal: '0.0005' }),
    N({ id: 'LIGHTNING', chain: 'Lightning', fee: '0.00001', minWithdrawal: '0.0001' }),
  ],
  ETH: [N({ id: 'ERC20', chain: 'Ethereum', fee: '0.005', minWithdrawal: '0.001' })],
  USDT: [
    N({ id: 'TRC20', chain: 'Tron', fee: '1', minWithdrawal: '2' }),
    N({ id: 'ERC20', chain: 'Ethereum', fee: '5', minWithdrawal: '5' }),
    N({ id: 'BEP20', chain: 'BNB Smart Chain', fee: '0.5', minWithdrawal: '2' }),
    N({ id: 'POLYGON', chain: 'Polygon', fee: '0.1', minWithdrawal: '2' }),
  ],
  USDC: [
    N({ id: 'ERC20', chain: 'Ethereum', fee: '2', minWithdrawal: '5' }),
    N({ id: 'BEP20', chain: 'BNB Smart Chain', fee: '0.5', minWithdrawal: '2' }),
    N({ id: 'TRC20', chain: 'Tron', fee: '1', minWithdrawal: '2' }),
    N({ id: 'POLYGON', chain: 'Polygon', fee: '0.1', minWithdrawal: '2' }),
  ],
  BNB: [N({ id: 'BEP20', chain: 'BNB Smart Chain', fee: '0.0005', minWithdrawal: '0.001' })],
  XRP: [N({ id: 'XRP', chain: 'Ripple', fee: '0.25', minWithdrawal: '10' })],
  SOL: [N({ id: 'SOL', chain: 'Solana', fee: '0.001', minWithdrawal: '0.01' })],
  DOGE: [N({ id: 'DOGE', chain: 'Dogecoin', fee: '1', minWithdrawal: '10' })],
  ADA: [N({ id: 'ADA', chain: 'Cardano', fee: '0.3', minWithdrawal: '2' })],
  MATIC: [N({ id: 'POLYGON', chain: 'Polygon', fee: '0.05', minWithdrawal: '1' })],
  POL: [N({ id: 'POLYGON', chain: 'Polygon', fee: '0.05', minWithdrawal: '1' })],
  TRX: [N({ id: 'TRX', chain: 'Tron', fee: '5', minWithdrawal: '20' })],
  LTC: [N({ id: 'LTC', chain: 'Litecoin', fee: '0.001', minWithdrawal: '0.01' })],
  BCH: [N({ id: 'BCH', chain: 'Bitcoin Cash', fee: '0.0001', minWithdrawal: '0.001' })],
  DOT: [N({ id: 'DOT', chain: 'Polkadot', fee: '0.1', minWithdrawal: '1' })],
  LINK: [N({ id: 'ERC20', chain: 'Ethereum', fee: '0.1', minWithdrawal: '1' })],
  XLM: [N({ id: 'XLM', chain: 'Stellar', fee: '0.1', minWithdrawal: '1' })],
  ATOM: [N({ id: 'ATOM', chain: 'Cosmos', fee: '0.001', minWithdrawal: '0.01' })],
  AVAX: [N({ id: 'AVAX', chain: 'Avalanche C-Chain', fee: '0.005', minWithdrawal: '0.01' })],
  FIL: [N({ id: 'FIL', chain: 'Filecoin', fee: '0.01', minWithdrawal: '0.1' })],
  ETC: [N({ id: 'ETC', chain: 'Ethereum Classic', fee: '0.001', minWithdrawal: '0.01' })],
  DASH: [N({ id: 'DASH', chain: 'Dash', fee: '0.005', minWithdrawal: '0.01' })],
  ZEC: [N({ id: 'ZEC', chain: 'Zcash', fee: '0.0001', minWithdrawal: '0.001' })],
  EOS: [N({ id: 'EOS', chain: 'EOS', fee: '0.1', minWithdrawal: '1' })],
  XMR: [N({ id: 'XMR', chain: 'Monero', fee: '0.00005', minWithdrawal: '0.001' })],
  NEAR: [N({ id: 'NEAR', chain: 'NEAR', fee: '0.005', minWithdrawal: '0.01' })],
  APT: [N({ id: 'APT', chain: 'Aptos', fee: '0.01', minWithdrawal: '0.1' })],
  ARB: [N({ id: 'ARB', chain: 'Arbitrum One', fee: '0.001', minWithdrawal: '0.01' })],
  OP: [N({ id: 'OP', chain: 'OP Mainnet', fee: '0.001', minWithdrawal: '0.01' })],
  SUI: [N({ id: 'SUI', chain: 'Sui', fee: '0.01', minWithdrawal: '0.1' })],
  TON: [N({ id: 'TON', chain: 'TON', fee: '0.01', minWithdrawal: '0.1' })],
  GLM: [N({ id: 'ERC20', chain: 'Ethereum', fee: '1', minWithdrawal: '10' })],
  UNI: [N({ id: 'ERC20', chain: 'Ethereum', fee: '0.05', minWithdrawal: '0.5' })],
  CRV: [N({ id: 'ERC20', chain: 'Ethereum', fee: '1', minWithdrawal: '10' })],
  AAVE: [N({ id: 'ERC20', chain: 'Ethereum', fee: '0.01', minWithdrawal: '0.1' })],
  LDO: [N({ id: 'ERC20', chain: 'Ethereum', fee: '0.1', minWithdrawal: '1' })],
  INJ: [N({ id: 'INJ', chain: 'Injective', fee: '0.01', minWithdrawal: '0.1' })],
  FLOKI: [N({ id: 'BEP20', chain: 'BNB Smart Chain', fee: '10000', minWithdrawal: '100000' })],
  BONK: [N({ id: 'SOL', chain: 'Solana', fee: '10000', minWithdrawal: '100000' })],
  WIF: [N({ id: 'SOL', chain: 'Solana', fee: '0.001', minWithdrawal: '0.1' })],
  PEPE: [N({ id: 'ERC20', chain: 'Ethereum', fee: '500000', minWithdrawal: '1000000' })],
  SHIB: [N({ id: 'ERC20', chain: 'Ethereum', fee: '20000', minWithdrawal: '100000' })],
  DOTC: [],
  // --- Single-chain native assets with a well-defined withdrawal network ---
  ONE: [N({ id: 'ONE', chain: 'Harmony', fee: '0.1', minWithdrawal: '1' })],
  ZIL: [N({ id: 'ZIL', chain: 'Zilliqa', fee: '1', minWithdrawal: '2' })],
  RVN: [N({ id: 'RVN', chain: 'Ravencoin', fee: '1', minWithdrawal: '2' })],
  FLOW: [N({ id: 'FLOW', chain: 'Flow', fee: '0.01', minWithdrawal: '0.1' })],
  STRK: [N({ id: 'STRK', chain: 'Starknet', fee: '0.0001', minWithdrawal: '0.001' })],
  ZK: [N({ id: 'ZKSYNC', chain: 'ZKsync Era', fee: '0.0001', minWithdrawal: '0.001' })],
  SYS: [N({ id: 'SYS', chain: 'Syscoin', fee: '0.001', minWithdrawal: '0.001' })],
  RUNE: [N({ id: 'RUNE', chain: 'THORChain', fee: '0.001', minWithdrawal: '0.001' })],
  XCH: [N({ id: 'XCH', chain: 'Chia', fee: '0.00005', minWithdrawal: '0.001' })],
  VELODROME: [N({ id: 'OP', chain: 'OP Mainnet', fee: '0.001', minWithdrawal: '0.01' })],
  KAITO: [N({ id: 'SOL', chain: 'Solana', fee: '0.001', minWithdrawal: '0.01' })],
  // --- Widely traded ERC-20 tokens (deposit/withdraw over Ethereum) ---
  COTI: [N({ id: 'ERC20', chain: 'Ethereum', fee: '0.5', minWithdrawal: '2' })],
  BADGER: [N({ id: 'ERC20', chain: 'Ethereum', fee: '0.1', minWithdrawal: '1' })],
  HIGH: [N({ id: 'ERC20', chain: 'Ethereum', fee: '0.1', minWithdrawal: '1' })],
  MKR: [N({ id: 'ERC20', chain: 'Ethereum', fee: '0.001', minWithdrawal: '0.01' })],
  COMP: [N({ id: 'ERC20', chain: 'Ethereum', fee: '0.01', minWithdrawal: '0.1' })],
  SNX: [N({ id: 'ERC20', chain: 'Ethereum', fee: '0.05', minWithdrawal: '0.5' })],
  SUSHI: [N({ id: 'ERC20', chain: 'Ethereum', fee: '0.05', minWithdrawal: '0.5' })],
  '1INCH': [N({ id: 'ERC20', chain: 'Ethereum', fee: '0.5', minWithdrawal: '2' })],
  GRT: [N({ id: 'ERC20', chain: 'Ethereum', fee: '5', minWithdrawal: '10' })],
  IMX: [N({ id: 'ERC20', chain: 'Ethereum', fee: '1', minWithdrawal: '2' })],
  MAGIC: [N({ id: 'ERC20', chain: 'Ethereum', fee: '0.5', minWithdrawal: '2' })],
  ENA: [N({ id: 'ERC20', chain: 'Ethereum', fee: '0.5', minWithdrawal: '2' })],
  OM: [N({ id: 'ERC20', chain: 'Ethereum', fee: '0.5', minWithdrawal: '2' })],
  W: [N({ id: 'ERC20', chain: 'Ethereum', fee: '0.05', minWithdrawal: '0.5' })],
  BLUR: [N({ id: 'ERC20', chain: 'Ethereum', fee: '1', minWithdrawal: '2' })],
  APE: [N({ id: 'ERC20', chain: 'Ethereum', fee: '0.5', minWithdrawal: '1' })],
  RNDR: [N({ id: 'ERC20', chain: 'Ethereum', fee: '0.5', minWithdrawal: '2' })],
  RENDER: [N({ id: 'ERC20', chain: 'Ethereum', fee: '0.5', minWithdrawal: '2' })],
  GALA: [N({ id: 'ERC20', chain: 'Ethereum', fee: '50', minWithdrawal: '100' })],
  SAND: [N({ id: 'ERC20', chain: 'Ethereum', fee: '2', minWithdrawal: '5' })],
  MANA: [N({ id: 'ERC20', chain: 'Ethereum', fee: '2', minWithdrawal: '5' })],
  AXS: [N({ id: 'ERC20', chain: 'Ethereum', fee: '0.5', minWithdrawal: '2' })],
  CHZ: [N({ id: 'ERC20', chain: 'Ethereum', fee: '50', minWithdrawal: '100' })],
  ENJ: [N({ id: 'ERC20', chain: 'Ethereum', fee: '0.5', minWithdrawal: '2' })],
  FET: [N({ id: 'ERC20', chain: 'Ethereum', fee: '0.2', minWithdrawal: '1' })],
  AGIX: [N({ id: 'ERC20', chain: 'Ethereum', fee: '0.2', minWithdrawal: '1' })],
  PEOPLE: [N({ id: 'ERC20', chain: 'Ethereum', fee: '0.05', minWithdrawal: '0.5' })],
  ONDO: [N({ id: 'ERC20', chain: 'Ethereum', fee: '0.5', minWithdrawal: '2' })],
  REZ: [N({ id: 'ERC20', chain: 'Ethereum', fee: '0.01', minWithdrawal: '0.1' })],
  ALT: [N({ id: 'ERC20', chain: 'Ethereum', fee: '0.1', minWithdrawal: '1' })],
  DYM: [N({ id: 'DYM', chain: 'Dymension', fee: '0.001', minWithdrawal: '0.01' })],
  // --- Solana-native SPL tokens (withdraw over Solana) ---
  JTO: [N({ id: 'SOL', chain: 'Solana', fee: '0.001', minWithdrawal: '0.01' })],
  JUP: [N({ id: 'SOL', chain: 'Solana', fee: '0.001', minWithdrawal: '0.01' })],
  PYTH: [N({ id: 'SOL', chain: 'Solana', fee: '0.001', minWithdrawal: '0.01' })],
  GMT: [N({ id: 'SOL', chain: 'Solana', fee: '0.001', minWithdrawal: '0.01' })],
  // --- BNB Smart Chain (BEP-20) tokens ---
  CAKE: [N({ id: 'BEP20', chain: 'BNB Smart Chain', fee: '0.1', minWithdrawal: '1' })],
  LISTA: [N({ id: 'BEP20', chain: 'BNB Smart Chain', fee: '0.5', minWithdrawal: '2' })],
};

/** Per-exchange overrides (replace the COMMON list for that asset). */
const OVERRIDES: Record<string, Record<string, NetworkDescriptor[]>> = {
  bitfinex: {
    USDT: [N({ id: 'ERC20', chain: 'Ethereum', fee: '6', minWithdrawal: '10' })],
    USDC: [N({ id: 'ERC20', chain: 'Ethereum', fee: '2', minWithdrawal: '10' })],
  },
  bitmart: {
    USDT: [
      N({ id: 'TRC20', chain: 'Tron', fee: '1', minWithdrawal: '2' }),
      N({ id: 'ERC20', chain: 'Ethereum', fee: '6', minWithdrawal: '5' }),
      N({ id: 'BEP20', chain: 'BNB Smart Chain', fee: '1', minWithdrawal: '2' }),
    ],
  },
  bitrue: {
    USDT: [
      N({ id: 'TRC20', chain: 'Tron', fee: '1', minWithdrawal: '2' }),
      N({ id: 'ERC20', chain: 'Ethereum', fee: '5', minWithdrawal: '5' }),
      N({ id: 'BEP20', chain: 'BNB Smart Chain', fee: '0.5', minWithdrawal: '2' }),
    ],
  },
  cryptocom: {
    USDT: [N({ id: 'ERC20', chain: 'Ethereum', fee: '5', minWithdrawal: '5' }), N({ id: 'TRC20', chain: 'Tron', fee: '1', minWithdrawal: '2' })],
  },
  mexc: {
    USDT: [
      N({ id: 'TRC20', chain: 'Tron', fee: '1', minWithdrawal: '2' }),
      N({ id: 'ERC20', chain: 'Ethereum', fee: '5', minWithdrawal: '5' }),
      N({ id: 'BEP20', chain: 'BNB Smart Chain', fee: '0.5', minWithdrawal: '2' }),
    ],
  },
};

export function resolveNetworks(exchangeId: string, asset: string): NetworkDescriptor[] | null {
  const key = asset.toUpperCase();
  const user = userNetworkOverrides[exchangeId]?.[key];
  if (user) return user;
  const overridden = OVERRIDES[exchangeId]?.[key];
  if (overridden) return overridden;
  const common = COMMON[key];
  if (common) return common;
  return null;
}
