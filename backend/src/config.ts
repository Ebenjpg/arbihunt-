import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env') });
dotenv.config();

function intEnv(key: string, def: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return def;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

function boolEnv(key: string, def = false): boolean {
  const v = process.env[key];
  if (v === undefined || v === '') return def;
  return v === 'true' || v === '1' || v.toLowerCase() === 'yes';
}

export interface AppConfig {
  backendPort: number;
  frontendPort: number;
  tickerPollMs: number;
  orderbookPollMs: number;
  scanIntervalMs: number;
  wsEnabled: boolean;
  defaultCapital: number;
  minProfitPct: number;
  freshMaxMs: number;
  staleMaxMs: number;
  demoMode: boolean;
  enabledExchanges: string[] | null;
  disabledExchanges: string[];
  orderBookDepth: number;
  /**
   * Number of candidate pairs evaluated per scan cycle. This is a *batch*
   * budget, NOT a permanent cap: the engine rotates through the full candidate
   * universe so no market is ever silently dropped, no matter how large the
   * market set grows.
   */
  maxCandidatesPerScan: number;
  /**
   * Max distinct buy/sell pairs kept per token so one token can surface multiple
   * buy-LOW/sell-HIGH opportunities (with their different liquidity) without
   * flooding the table with every possible ordering.
   */
  maxPairsPerToken: number;
  /** Capacity of the order-book TTL cache (entries), scales with market size. */
  orderBookCacheCapacity: number;
  /**
   * How long a discovered opportunity stays in the store before being pruned.
   * Decoupled from the (fast) scan interval so results remain visible on the
   * dashboard even when individual scan cycles are slow/rate-limited.
   */
  opportunityRetentionMs: number;
  /** Interval (ms) at which live asset/network metadata is refreshed. */
  assetMetadataRefreshMs: number;
  /** Enable fetching live asset metadata from public exchange APIs. */
  liveMetadataEnabled: boolean;
  /**
   * Keep-alive self-ping (Render free tier sleeps after 15 min of inactivity).
   * The backend pings its own public /api/health URL every 14 min to stay awake.
   * Empty URL disables the pinger (local dev never needs it).
   */
  keepAliveUrl: string;
  keepAliveMs: number;
}

export const config: AppConfig = {
  backendPort: intEnv('BACKEND_PORT', 3001),
  frontendPort: intEnv('FRONTEND_PORT', 3000),
  tickerPollMs: intEnv('TICKER_POLL_MS', 12000),
  orderbookPollMs: intEnv('ORDERBOOK_POLL_MS', 1500),
  scanIntervalMs: intEnv('SCAN_INTERVAL_MS', 5000),
  wsEnabled: boolEnv('WS_ENABLED', true),
  defaultCapital: intEnv('DEFAULT_CAPITAL', 100),
  minProfitPct: Number.parseFloat(process.env.MIN_PROFIT_PCT || '0.10'),
  freshMaxMs: intEnv('FRESH_MAX_MS', 5000),
  staleMaxMs: intEnv('STALE_MAX_MS', 15000),
  demoMode: boolEnv('DEMO_MODE', false),
  enabledExchanges: process.env.ENABLED_EXCHANGES
    ? process.env.ENABLED_EXCHANGES.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    : null,
  disabledExchanges: process.env.DISABLED_EXCHANGES
    ? process.env.DISABLED_EXCHANGES.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    : [],
  orderBookDepth: intEnv('ORDERBOOK_DEPTH', 20),
  maxCandidatesPerScan: intEnv('MAX_CANDIDATES_PER_SCAN', 400),
  maxPairsPerToken: intEnv('MAX_PAIRS_PER_TOKEN', 2),
  orderBookCacheCapacity: intEnv('ORDERBOOK_CACHE_CAPACITY', 200000),
  opportunityRetentionMs: intEnv('OPPORTUNITY_RETENTION_MS', 300000),
  assetMetadataRefreshMs: intEnv('ASSET_METADATA_REFRESH_MS', 900000),
  liveMetadataEnabled: boolEnv('LIVE_METADATA_ENABLED', true),
  keepAliveUrl: (process.env.KEEP_ALIVE_URL || '').trim(),
  keepAliveMs: intEnv('KEEP_ALIVE_MS', 14 * 60 * 1000),
};
