export interface Level {
  /** price as decimal string */
  price: string;
  /** quantity as decimal string */
  quantity: string;
}

export interface OrderBookSnapshot {
  exchange: string;
  symbol: string;
  asks: Level[];
  bids: Level[];
  ts: number;
  depth?: number;
}

export interface TickerSnapshot {
  exchange: string;
  exchangeSymbol: string;
  base: string;
  quote: string;
  bid?: string;
  ask?: string;
  last?: string;
  volume24h?: string;
  ts: number;
}

export type FeeSource = 'live' | 'fallback';

export interface FeeInfo {
  taker: number;
  maker: number;
  source: FeeSource;
  note?: string;
}

export type NetworkStatus = 'open' | 'closed' | 'unknown' | 'maintenance';

export interface NetworkDescriptor {
  /** canonical network id, e.g. TRC20, ERC20, BEP20, BTC, SOL */
  id: string;
  chain: string;
  withdrawalFee?: string;
  minWithdrawal?: string;
  minDeposit?: string;
  depositEnabled: NetworkStatus;
  withdrawalEnabled: NetworkStatus;
  contractAddress?: string;
  source: 'live' | 'default';
}

export type ConnectionState = 'connected' | 'error' | 'offline';

export interface ExchangeStatus {
  exchange: string;
  name: string;
  connection: ConnectionState;
  markets: number;
  lastUpdate?: number;
  lastUpdateAgeMs?: number;
  ws: 'connected' | 'disconnected' | 'none';
  rest: 'ok' | 'error';
  errorCount: number;
  latencyMs?: number;
}

export type TransferStatus =
  | 'READY'
  | 'TRANSFER BLOCKED'
  | 'NO COMMON NETWORK'
  | 'NETWORK UNKNOWN'
  | 'NETWORK PARTIAL'
  | 'TRANSFER COST UNKNOWN'
  | 'WITHDRAWAL UNKNOWN'
  | 'ASSET UNVERIFIED'
  | 'INSUFFICIENT LIQUIDITY'
  | 'NEGATIVE PROFIT'
  | 'EXPIRED'
  | 'PENDING';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface OpportunityBreakdownItem {
  label: string;
  usd: string;
}

export interface Opportunity {
  id: string;
  symbol: string;
  base: string;
  quote: string;
  buyExchange: string;
  sellExchange: string;
  buyPrice: number;
  sellPrice: number;
  buyTopAsk: number;
  sellTopBid: number;
  grossSpreadPct: number;
  effectiveSpreadPct: number;
  buyFeePct: number;
  sellFeePct: number;
  buyFeeSource: FeeSource;
  sellFeeSource: FeeSource;
  network?: string;
  networkChain?: string;
  networkMatch: 'yes' | 'no' | 'unknown' | 'partial';
  /** all compatible withdrawal/deposit networks (cheapest first) */
  matchedNetworks?: NetworkDescriptor[];
  withdrawalFeeAsset?: string;
  withdrawalFeeUsd: number;
  /** false when the exchange does not provide a verifiable withdrawal fee */
  withdrawalFeeKnown: boolean;
  depositStatus: NetworkStatus;
  withdrawalStatus: NetworkStatus;
  buyLiquidityUsd: number;
  sellLiquidityUsd: number;
  slippageUsd: number;
  slippagePct: number;
  capital: number;
  finalValue: number;
  netProfitUsd: number;
  netProfitPct: number;
  transferStatus: TransferStatus;
  /** Optional specific reason behind the transfer STATUS (e.g. why a route is
   *  blocked/unknown), derived from the network-match result. */
  transferStatusDetail?: string;
  /** Smallest tradeable quantity (min order/base min) on the buy side. */
  minOrderAmount?: number;
  /** Network-specific transfer window estimate label. */
  transferTimeEstimate?: string;
  /** When the network/withdrawal-fee data used was last sourced/refreshed. */
  networkUpdatedAt?: number;
  dataAgeMs: number;
  confidence: ConfidenceLevel;
  confidenceReasons: string[];
  lastUpdatedAt: number;
  createdAt: number;
  assetVerified: boolean;
  /** On-chain contract address of the base asset on the BUY exchange (when known). */
  buyContractAddress?: string;
  /** On-chain contract address of the base asset on the SELL exchange (when known). */
  sellContractAddress?: string;
  maxExecutable: number;
  avgBuyPrice: number;
  avgSellPrice: number;
  breakdown: OpportunityBreakdownItem[];
}

export interface KpiSnapshot {
  liveOpportunities: number;
  bestNetProfitPct: number | null;
  bestNetProfitUsd: number | null;
  totalMarkets: number;
  activeExchanges: number;
  lastScan: number;
  dataLatencyMs: number;
  demoMode: boolean;
}

export interface NetworkMatchResult {
  matched: NetworkDescriptor[];
  recommended?: NetworkDescriptor;
  status: 'ok' | 'blocked' | 'no-common' | 'unknown';
  reason: string;
  /** Set when exactly ONE side has network data: the matched networks are the
   *  KNOWN side's networks (priced + displayed), while the other side is
   *  unconfirmed. Never presented as fully transfer-ready. */
  oneSided?: 'buy' | 'sell';
}

export interface CalculatorRequest {
  capital: number;
  buyPrice: number;
  sellPrice: number;
  buyFeePct: number;
  sellFeePct: number;
  withdrawalFeeAsset: number;
  slippagePct: number;
}

export interface CalculatorResult {
  tokenQuantity: number;
  grossProfit: number;
  totalFees: number;
  finalValue: number;
  netProfit: number;
  netProfitPct: number;
  buyCost: number;
  buyFeeUsd: number;
  withdrawalFeeUsd: number;
  sellGross: number;
  sellFeeUsd: number;
  slippageUsd: number;
  breakdown: OpportunityBreakdownItem[];
}
