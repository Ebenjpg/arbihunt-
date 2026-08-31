/**
 * Canonical network id normalization.
 *
 * Each exchange reports withdrawal/deposit chains with its own naming
 * ("ETH", "ERC20", "usdterc20", "Ethereum (ERC20)", "SPL", "mnt", "Mantle",
 * "APTCOINSTORE", ...). For cross-exchange network matching to work we must map
 * every spelling to ONE canonical id so `matchNetworks` sees the same token on
 * both sides. The map below only contains UNambiguous chain aliases; anything
 * unrecognized falls back to the raw uppercased chain name.
 */
const CHAIN_ALIASES: Record<string, string> = {
  // EVM
  ETH: 'ERC20',
  ERC20: 'ERC20',
  ETHEREUM: 'ERC20',
  'ETH (ERC20)': 'ERC20',
  'ETHEREUM (ERC20)': 'ERC20',
  USDTERC20: 'ERC20',
  BSC: 'BEP20',
  BNB: 'BEP20',
  BEP20: 'BEP20',
  'BNB SMART CHAIN': 'BEP20',
  'BNB CHAIN': 'BEP20',
  'BNB SMARTCHAIN': 'BEP20',
  BNBCHAIN: 'BEP20',
  BEP20USDT: 'BEP20',
  ARB: 'ARB',
  ARBITRUM: 'ARB',
  'ARBITRUM ONE': 'ARB',
  'ARBITRUM ONE (ARB)': 'ARB',
  ARBEVM: 'ARB',
  ARC20: 'ARB',
  ARBITRUMONE: 'ARB',
  OP: 'OP',
  OPTIMISM: 'OP',
  OPETH: 'OP',
  OPTERC20: 'OP',
  'OP MAINNET': 'OP',
  MATIC: 'POLYGON',
  POL: 'POLYGON',
  POLYGON: 'POLYGON',
  'POLYGON POS': 'POLYGON',
  PRC20: 'POLYGON',
  AVAX: 'AVAX',
  AVALANCHE: 'AVAX',
  'AVALANCHE C-CHAIN': 'AVAX',
  'AVALANCHE C': 'AVAX',
  AVAXCCHAIN: 'AVAX',
  AVACCHAIN: 'AVAX',
  CCHAINERC20: 'AVAX',
  AVAX_C: 'AVAX',
  CELO: 'CELO',
  CELOERC20: 'CELO',
  KAIA: 'KAIA',
  KAVAEVM: 'KAIA',
  GTEVM: 'GT',
  MNT: 'MANTLE',
  MANTLE: 'MANTLE',
  'MANTLE (MNT)': 'MANTLE',
  ZKSYNC: 'ZK',
  ZKSYNCEVM: 'ZK',
  ZK: 'ZK',
  ZKEVM: 'ZK',
  LINEA: 'LINEA',
  BASE: 'BASE',
  BASEEVM: 'BASE',
  FANTOM: 'FTM',
  FTM: 'FTM',
  CRONOS: 'CRO',
  CRO: 'CRO',
  MOONBEAM: 'GLMR',
  GLMR: 'GLMR',
  MOONRIVER: 'MOVR',
  MOVR: 'MOVR',
  AURORA: 'AURORA',
  AURORAEVM: 'AURORA',
  TBC: 'TBC',
  GRAVITY: 'GT',
  MON: 'MON',
  MONAD: 'MON',
  XPL: 'XPL',
  PLASMA: 'XPL',
  XRC20: 'XPL',
  // Tron
  TRX: 'TRC20',
  TRC20: 'TRC20',
  TRON: 'TRC20',
  'TRON (TRC20)': 'TRC20',
  TRC20USDT: 'TRC20',
  // Solana
  SOL: 'SOL',
  SOLANA: 'SOL',
  SPL: 'SOL',
  // Native chains
  BTC: 'BTC',
  BITCOIN: 'BTC',
  LIGHTNING: 'LIGHTNING',
  XRP: 'XRP',
  RIPPLE: 'XRP',
  DOGE: 'DOGE',
  DOGECOIN: 'DOGE',
  ADA: 'ADA',
  CARDANO: 'ADA',
  LTC: 'LTC',
  LITECOIN: 'LTC',
  BCH: 'BCH',
  'BITCOIN CASH': 'BCH',
  DOT: 'DOT',
  POLKADOT: 'DOT',
  DOTSM: 'DOT',
  XLM: 'XLM',
  STELLAR: 'XLM',
  ATOM: 'ATOM',
  COSMOS: 'ATOM',
  ETC: 'ETC',
  'ETHEREUM CLASSIC': 'ETC',
  EOS: 'EOS',
  XMR: 'XMR',
  MONERO: 'XMR',
  DASH: 'DASH',
  ZEC: 'ZEC',
  ZCASH: 'ZEC',
  NEAR: 'NEAR',
  NEP141: 'NEAR',
  APT: 'APT',
  APTOS: 'APT',
  APTCOINSTORE: 'APT',
  APTUSDT: 'APT',
  SUI: 'SUI',
  TON: 'TON',
  TONCOIN: 'TON',
  TVM: 'TON',
  TONUSDT: 'TON',
  ALGO: 'ALGO',
  ALGORAND: 'ALGO',
  ZIL: 'ZIL',
  ZILLIQA: 'ZIL',
  RVN: 'RVN',
  RAVENCOIN: 'RVN',
  ONE: 'ONE',
  HARMONY: 'ONE',
  SYS: 'SYS',
  SYSCOIN: 'SYS',
  RUNE: 'RUNE',
  THORCHAIN: 'RUNE',
  XCH: 'XCH',
  CHIA: 'XCH',
  FLOW: 'FLOW',
  STRK: 'STRK',
  STARKNET: 'STRK',
  FIL: 'FIL',
  FILECOIN: 'FIL',
  INJ: 'INJ',
  INJECTIVE: 'INJ',
  KSM: 'KSM',
  KUSAMA: 'KSM',
  XTZ: 'XTZ',
  TEZOS: 'XTZ',
  ICP: 'ICP',
  VET: 'VET',
  VECHAIN: 'VET',
  ARBETH: 'ARB',
};

function norm(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function normKeep(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * Map an exchange-reported chain name to a canonical network id.
 *
 * @param raw chain name as reported by the exchange (e.g. "usdterc20", "Mantle")
 * @param asset asset ticker (used to keep native chains like TRX/BTC identical
 *              to the asset itself)
 */
export function canonicalNetworkId(raw: string, asset?: string): string {
  if (!raw) return 'UNKNOWN';
  const upper = normKeep(raw);
  // Native single-chain coin: the chain equals the asset ticker.
  if (asset && norm(upper) === norm(asset) && asset.length <= 8) {
    return upper;
  }
  const n = norm(raw);
  if (CHAIN_ALIASES[n]) return CHAIN_ALIASES[n];
  if (CHAIN_ALIASES[upper]) return CHAIN_ALIASES[upper];
  if (n.length >= 2 && n.length <= 16 && /^[A-Z0-9]+$/.test(n)) return n;
  return 'UNKNOWN';
}

/** Human-readable chain label for display (best effort). */
export function chainDisplayName(canonicalId: string): string {
  const map: Record<string, string> = {
    ERC20: 'Ethereum',
    BEP20: 'BNB Smart Chain',
    TRC20: 'Tron',
    POLYGON: 'Polygon POS',
    SOL: 'Solana',
    ARB: 'Arbitrum One',
    OP: 'OP Mainnet',
    AVAX: 'Avalanche C-Chain',
    MANTLE: 'Mantle',
    ZK: 'ZKsync Era',
    XPL: 'Plasma',
    TON: 'TON',
    APT: 'Aptos',
    NEAR: 'NEAR',
    SUI: 'Sui',
    XRP: 'Ripple',
    DOGE: 'Dogecoin',
    ADA: 'Cardano',
    LTC: 'Litecoin',
    BCH: 'Bitcoin Cash',
    DOT: 'Polkadot',
    XLM: 'Stellar',
    ATOM: 'Cosmos',
    ETC: 'Ethereum Classic',
    EOS: 'EOS',
    XMR: 'Monero',
    DASH: 'Dash',
    ZEC: 'Zcash',
    ALGO: 'Algorand',
    ZIL: 'Zilliqa',
    RVN: 'Ravencoin',
    ONE: 'Harmony',
    SYS: 'Syscoin',
    RUNE: 'THORChain',
    XCH: 'Chia',
    FLOW: 'Flow',
    STRK: 'Starknet',
    FIL: 'Filecoin',
    INJ: 'Injective',
    KSM: 'Kusama',
    XTZ: 'Tezos',
    CELO: 'Celo',
    KAIA: 'Kaia',
    GT: 'Gravity',
    MON: 'Monad',
    LINEA: 'Linea',
    BASE: 'Base',
    FTM: 'Fantom',
    CRO: 'Cronos',
    GLMR: 'Moonbeam',
    MOVR: 'Moonriver',
  };
  return map[canonicalId] ?? canonicalId;
}
