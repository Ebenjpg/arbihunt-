import type { NetworkDescriptor, NetworkStatus } from '@arbihunt/shared';
import { logger } from '../logger';
import { HttpClient } from '../httpClient';
import { tickerService } from '../market-data/tickerService';
import { canonicalNetworkId, chainDisplayName } from './canonicalNetwork';
import { getCredential } from './credentials';
import { hmacSha256, hmacSha256Base64 } from './hmac';

/**
 * LIVE asset/network metadata, fetched directly from each exchange's public
 * APIs. This is the primary source for asset identity + withdrawal/deposit
 * networks + withdrawal fees. staticNetworks.ts remains ONLY a fallback for
 * exchanges that do not expose this data publicly.
 *
 * Sources (confirmed live):
 *  - Gate     /api/v4/spot/currencies (bulk, chains + contracts + status)
 *             + /api/web/v1/withdraw/depositwithdraw/getCoinsDepositWithdrawFee
 *             (per-asset on demand: keyword query for fees + min + status)
 *  - Bitget   /api/v2/spot/public/coins (bulk, chains + fees + contracts)
 *  - HTX      /v2/reference/currencies  (bulk, chains + fees + contracts)
 *  - Poloniex /currencies               (bulk, single chain + fee + status)
 *  - KuCoin   /api/v2/currencies/{cur}  (per-asset chains + fees; fetched on demand)
 *  - LBank    /v1/withdrawConfigs.do    (lbkex, bulk bare array: chains + fees + status)
 *  - WhiteBIT /api/v4/public/assets     (bulk, deposit/withdraw networks; no fee)
 *  - BitMart  /spot/v1/currencies       (bulk, status only; no chains/fees)
 *  - HitBTC   /api/2/public/currency    (bulk, single chain + payoutFee)
 */

export interface AssetMeta {
  networks: NetworkDescriptor[];
  contractAddress?: string;
  fullName?: string;
}

type StatusOf = 'open' | 'closed';

function statusOf(enabled: boolean | undefined, fallback: NetworkStatus): NetworkStatus {
  if (enabled === undefined) return fallback;
  return enabled ? 'open' : 'closed';
}

/** Maps an API "_disabled" flag to an "enabled" boolean. 0=open, 1=closed. */
function chainEnabled(disabledFlag: unknown): boolean | undefined {
  if (typeof disabledFlag === 'number') return disabledFlag === 0 ? true : disabledFlag === 1 ? false : undefined;
  if (typeof disabledFlag === 'boolean') return disabledFlag === false;
  return undefined;
}

export class LiveMetadataService {
  private cache = new Map<string, Map<string, AssetMeta>>();
  private inflight = new Map<string, Promise<void>>();
  private lastRefresh = new Map<string, number>();
  private started = false;
  /** Gate assets whose per-asset withdrawal fee has been fetched this cycle. */
  private gateFeeDone = new Set<string>();

  get startedFlag(): boolean {
    return this.started;
  }

  lastUpdated(exchangeId: string): number | undefined {
    return this.lastRefresh.get(exchangeId);
  }

  isSupported(exchangeId: string): boolean {
    return SUPPORTED.has(exchangeId);
  }

  async start(refreshMs: number): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.refresh();
    setInterval(() => void this.refresh().catch(() => undefined), refreshMs);
  }

  async refresh(): Promise<void> {
    await Promise.allSettled([
      this.refreshGate(),
      this.refreshBitget(),
      this.refreshHtx(),
      this.refreshPoloniex(),
      this.refreshLbank(),
      this.refreshWhitebit(),
      this.refreshBitmart(),
      this.refreshHitbtc(),
      this.refreshMexc(),
      this.refreshBybit(),
      this.refreshBitrue(),
      this.refreshDigifinex(),
      this.refreshBinance(),
      this.refreshOkx(),
      this.refreshXt(),
      this.refreshBtse(),
      this.refreshBingx(),
      this.refreshCryptoCom(),
      this.refreshPhemex(),
    ]);
    logger.info(undefined, 'METADATA', 'live asset metadata refreshed', {
      status: `exchanges=${[...this.cache.keys()].join(',')} assets=${[...this.cache.values()].reduce((n, m) => n + m.size, 0)}`,
    });
  }

  /** Per-exchange asset count for the supported live sources. */
  stats(): Record<string, { assets: number; lastUpdated: number }> {
    const out: Record<string, { assets: number; lastUpdated: number }> = {};
    for (const id of SUPPORTED) {
      const count = this.cache.get(id)?.size ?? 0;
      const lu = this.lastRefresh.get(id) ?? 0;
      if (lu > 0) out[id] = { assets: count, lastUpdated: lu };
    }
    return out;
  }

  /**
   * Distinct base assets currently being scanned (derived from the live ticker
   * universe). Used to bound per-asset metadata fetches (BTSE, Phemex) so we
   * only ask about coins we actually trade, never the whole internet.
   */
  private scannedAssets(): string[] {
    const set = new Set<string>();
    for (const canonical of tickerService.getCanonicalSymbols()) {
      const base = canonical.split('/')[0];
      if (base) set.add(base.toUpperCase());
    }
    return Array.from(set);
  }

  /** Per-exchange asset count for the supported live sources. */
  getNetworks(exchangeId: string, asset: string): NetworkDescriptor[] | null {
    const meta = this.cache.get(exchangeId)?.get(asset.toUpperCase());
    return meta && meta.networks.length > 0 ? meta.networks : null;
  }

  getAssetMeta(exchangeId: string, asset: string): AssetMeta | null {
    return this.cache.get(exchangeId)?.get(asset.toUpperCase()) ?? null;
  }

  hasAsset(exchangeId: string, asset: string): boolean {
    return this.cache.get(exchangeId)?.has(asset.toUpperCase()) ?? false;
  }

  /** Per-asset on-demand fetch (Gate fee, KuCoin, CoinEx). Cached + deduplicated. */
  async ensure(exchangeId: string, asset: string): Promise<void> {
    if (!SUPPORTED.has(exchangeId)) return;
    const key = `${exchangeId}:${asset.toUpperCase()}`;
    // Gate: bulk `currencies` gives network geometry/status but no withdrawal
    // fee; the fee is enriched per-asset via the public fee-list keyword query.
    if (exchangeId === 'gate' && !this.gateFeeDone.has(asset.toUpperCase())) {
      const pending = this.inflight.get(key);
      if (pending) return pending;
      const task = this.fetchGateFee(asset);
      this.inflight.set(key, task);
      try {
        await task;
      } finally {
        this.inflight.delete(key);
      }
      return;
    }
    if (exchangeId !== 'kucoin' && exchangeId !== 'coinex') return;
    if (this.cache.get(exchangeId)?.has(asset.toUpperCase())) return;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const task = this.fetchOnDemand(exchangeId, asset);
    this.inflight.set(key, task);
    try {
      await task;
    } finally {
      this.inflight.delete(key);
    }
  }

  private store(exchangeId: string, asset: string, meta: AssetMeta): void {
    let map = this.cache.get(exchangeId);
    if (!map) {
      map = new Map();
      this.cache.set(exchangeId, map);
    }
    map.set(asset.toUpperCase(), meta);
    this.lastRefresh.set(exchangeId, Date.now());
  }

  private async fetchOnDemand(exchangeId: string, asset: string): Promise<void> {
    if (exchangeId === 'kucoin') {
      await this.fetchKucoin(asset);
      return;
    }
    if (exchangeId === 'coinex') {
      await this.fetchCoinex(asset);
      return;
    }
    // unsupported exchange: cache empty marker so we don't retry forever
    if (!this.cache.has(exchangeId)) this.cache.set(exchangeId, new Map());
    this.lastRefresh.set(exchangeId, Date.now());
  }

  // --------------------------------------------------------------------------
  // Gate
  // --------------------------------------------------------------------------
  private async refreshGate(): Promise<void> {
    // Bulk `currencies` provides network geometry, deposit/withdraw status and
    // contract addresses. Withdrawal fees are sparse here, so they are enriched
    // per-asset by fetchGateFee() via the public fee-list keyword query (the
    // fee dump endpoint's page iteration is unreliable and drops coins).
    const http = new HttpClient({
      baseUrl: 'https://api.gateio.ws',
      requestsPerSecond: 4,
      maxConcurrent: 2,
      name: 'gate-metadata',
      timeoutMs: 25000,
    });
    const out = new Map<string, AssetMeta>();
    let page = 1;
    const limit = 1000;
    // NOTE: Gate currently returns the ENTIRE currency list (all chains) on
    // every request, ignoring page/limit and shuffling order. We therefore
    // stop as soon as an iteration adds no NEW assets, which makes this robust
    // to both paginated and full-list responses (no infinite loop).
    let seen = 0;
    while (true) {
      const { data } = await http.get<Array<Record<string, unknown>>>(`/api/v4/spot/currencies?page=${page}&limit=${limit}`);
      if (!Array.isArray(data) || data.length === 0) break;
      for (const c of data) {
        const currency = String(c.currency ?? '').toUpperCase();
        if (!currency || out.has(currency)) continue;
        const chains = Array.isArray(c.chains) ? (c.chains as Array<Record<string, unknown>>) : [];
        const networks: NetworkDescriptor[] = [];
        for (const ch of chains) {
          const rawName = String(ch.name ?? '');
          const id = canonicalNetworkId(rawName, currency);
          if (id === 'UNKNOWN') continue;
          networks.push({
            id,
            chain: chainDisplayName(id),
            depositEnabled: statusOf(ch.deposit_disabled === undefined ? undefined : !ch.deposit_disabled, 'closed'),
            withdrawalEnabled: statusOf(ch.withdraw_disabled === undefined ? undefined : !ch.withdraw_disabled, 'closed'),
            contractAddress: ch.addr ? String(ch.addr) : undefined,
            source: 'live',
          });
        }
        if (networks.length === 0) continue;
        out.set(currency, {
          networks,
          contractAddress: networks.find((n) => n.contractAddress)?.contractAddress,
          fullName: c.name ? String(c.name) : undefined,
        });
      }
      if (out.size === seen) break;
      seen = out.size;
      page += 1;
      if (page > 5) break;
    }
    for (const [asset, meta] of out) this.store('gate', asset, meta);
    // Fees expire on each refresh so a fresh fee-list lookup happens lazily.
    this.gateFeeDone.clear();
    logger.info('gate', 'METADATA', `cached ${out.size} assets`);
  }

  /**
   * Per-asset Gate withdrawal-fee enrichment. Queries the public coin deposit/
   * withdraw fee list by exact coin keyword and merges fee / min / status into
   * the cached networks (preserving contracts and geometry from refreshGate).
   */
  private async fetchGateFee(asset: string): Promise<void> {
    const key = asset.toUpperCase();
    const http = new HttpClient({
      baseUrl: 'https://www.gate.io',
      requestsPerSecond: 4,
      maxConcurrent: 2,
      name: 'gate-metadata-fee',
      timeoutMs: 20000,
    });
    try {
      const { data } = await http.get<{ data?: { list?: Array<Record<string, unknown>> } }>(
        `/api/web/v1/withdraw/depositwithdraw/getCoinsDepositWithdrawFee?keyword=${encodeURIComponent(key)}&page=1&page_size=50`,
      );
      const list = data?.data?.list ?? [];
      const row = list.find((c) => String(c.coin ?? '').toUpperCase() === key) ?? list[0];
      if (!row) return;
      const chains = Array.isArray(row.chains) ? (row.chains as Array<Record<string, unknown>>) : [];
      if (chains.length === 0) return;
      const existing = this.cache.get('gate')?.get(key);
      const networks: NetworkDescriptor[] = existing ? existing.networks.map((n) => ({ ...n })) : [];
      for (const ch of chains) {
        const rawName = String(ch.name_en ?? ch.name_cn ?? ch.chain ?? '');
        const id = canonicalNetworkId(rawName, key);
        if (id === 'UNKNOWN') continue;
        const fee = String(ch.withdraw_txfee ?? '');
        const cur = networks.find((n) => n.id === id);
        if (cur) {
          if (fee && fee !== '0') cur.withdrawalFee = fee;
          else if (fee === '0' && cur.withdrawalFee === undefined) cur.withdrawalFee = '0';
          if (ch.withdraw_amount_mini != null && ch.withdraw_amount_mini !== '') cur.minWithdrawal = String(ch.withdraw_amount_mini);
          if (ch.deposit_amount_mini != null && ch.deposit_amount_mini !== '') cur.minDeposit = String(ch.deposit_amount_mini);
          const wd = chainEnabled(ch.is_withdraw_disabled);
          if (wd !== undefined) cur.withdrawalEnabled = wd ? 'open' : 'closed';
          const dp = chainEnabled(ch.is_deposit_disabled);
          if (dp !== undefined) cur.depositEnabled = dp ? 'open' : 'closed';
        } else {
          networks.push({
            id,
            chain: chainDisplayName(id),
            withdrawalFee: fee && fee !== '0' ? fee : fee === '0' ? '0' : undefined,
            minWithdrawal: ch.withdraw_amount_mini != null && ch.withdraw_amount_mini !== '' ? String(ch.withdraw_amount_mini) : undefined,
            minDeposit: ch.deposit_amount_mini != null && ch.deposit_amount_mini !== '' ? String(ch.deposit_amount_mini) : undefined,
            depositEnabled: statusOf(chainEnabled(ch.is_deposit_disabled), 'unknown'),
            withdrawalEnabled: statusOf(chainEnabled(ch.is_withdraw_disabled), 'unknown'),
            source: 'live',
          });
        }
      }
      if (networks.length > 0) {
        this.store('gate', key, {
          networks,
          contractAddress: existing?.contractAddress ?? networks.find((n) => n.contractAddress)?.contractAddress,
          fullName: existing?.fullName ?? (row.name_en ? String(row.name_en) : undefined),
        });
      }
    } catch (err) {
      logger.debug('gate', 'METADATA', `fee fetch failed for ${key}`, { error: String(err) });
    } finally {
      this.gateFeeDone.add(key);
    }
  }

  // --------------------------------------------------------------------------
  // Bitget
  // --------------------------------------------------------------------------
  private async refreshBitget(): Promise<void> {
    const http = new HttpClient({
      baseUrl: 'https://api.bitget.com',
      requestsPerSecond: 3,
      maxConcurrent: 2,
      name: 'bitget-metadata',
      timeoutMs: 15000,
    });
    const { data } = await http.get<{ data?: Array<Record<string, unknown>> }>('/api/v2/spot/public/coins');
    const rows = Array.isArray(data?.data) ? data.data : [];
    const out = new Map<string, AssetMeta>();
    for (const coin of rows) {
      const currency = String(coin.coin ?? '').toUpperCase();
      if (!currency) continue;
      const chains = Array.isArray(coin.chains) ? (coin.chains as Array<Record<string, unknown>>) : [];
      const networks: NetworkDescriptor[] = [];
      for (const ch of chains) {
        const rawName = String(ch.chain ?? '');
        const id = canonicalNetworkId(rawName, currency);
        if (id === 'UNKNOWN') continue;
        const fee = String(ch.withdrawFee ?? '');
        const rechargeable = ch.rechargeable;
        const withdrawable = ch.withdrawable;
        networks.push({
          id,
          chain: chainDisplayName(id),
          withdrawalFee: fee && fee !== '0' ? fee : fee === '0' ? '0' : undefined,
          minWithdrawal: ch.minWithdrawAmount ? String(ch.minWithdrawAmount) : undefined,
          minDeposit: ch.minDepositAmount ? String(ch.minDepositAmount) : undefined,
          depositEnabled: statusOf(
            typeof rechargeable === 'boolean' ? rechargeable : rechargeable === 'true' ? true : undefined,
            'unknown',
          ),
          withdrawalEnabled: statusOf(
            typeof withdrawable === 'boolean' ? withdrawable : withdrawable === 'true' ? true : undefined,
            'unknown',
          ),
          contractAddress: ch.contractAddress ? String(ch.contractAddress) : undefined,
          source: 'live',
        });
      }
      if (networks.length === 0) continue;
      out.set(currency, {
        networks,
        contractAddress: networks.find((n) => n.contractAddress)?.contractAddress,
        fullName: coin.coin ? String(coin.coin) : undefined,
      });
    }
    for (const [asset, meta] of out) this.store('bitget', asset, meta);
    logger.info('bitget', 'METADATA', `cached ${out.size} assets`);
  }

  // --------------------------------------------------------------------------
  // HTX (Huobi)
  // --------------------------------------------------------------------------
  private async refreshHtx(): Promise<void> {
    const http = new HttpClient({
      baseUrl: 'https://api.huobi.pro',
      requestsPerSecond: 3,
      maxConcurrent: 2,
      name: 'htx-metadata',
      timeoutMs: 15000,
    });
    const { data } = await http.get<{ data?: Array<Record<string, unknown>> }>('/v2/reference/currencies');
    const rows = Array.isArray(data?.data) ? data.data : [];
    const out = new Map<string, AssetMeta>();
    for (const row of rows) {
      const currency = String(row.currency ?? '').toUpperCase();
      if (!currency) continue;
      const chains = Array.isArray(row.chains) ? (row.chains as Array<Record<string, unknown>>) : [];
      const networks: NetworkDescriptor[] = [];
      for (const ch of chains) {
        const baseChain = String(ch.baseChain ?? ch.displayName ?? '');
        const id = canonicalNetworkId(baseChain, currency);
        if (id === 'UNKNOWN') continue;
        const fee = String(ch.transactFeeWithdraw ?? '');
        networks.push({
          id,
          chain: chainDisplayName(id),
          withdrawalFee: fee && fee !== '0' ? fee : fee === '0' ? '0' : undefined,
          minWithdrawal: ch.minWithdrawAmt ? String(ch.minWithdrawAmt) : undefined,
          minDeposit: ch.minDepositAmt ? String(ch.minDepositAmt) : undefined,
          depositEnabled: statusOf(ch.depositStatus === 'allowed', 'closed'),
          withdrawalEnabled: statusOf(ch.withdrawStatus === 'allowed', 'closed'),
          contractAddress: ch.contractAddress ? String(ch.contractAddress) : undefined,
          source: 'live',
        });
      }
      if (networks.length === 0) continue;
      out.set(currency, {
        networks,
        contractAddress: networks.find((n) => n.contractAddress)?.contractAddress,
        fullName: row.currency ? String(row.currency) : undefined,
      });
    }
    for (const [asset, meta] of out) this.store('htx', asset, meta);
    logger.info('htx', 'METADATA', `cached ${out.size} assets`);
  }

  // --------------------------------------------------------------------------
  // Poloniex
  // --------------------------------------------------------------------------
  private async refreshPoloniex(): Promise<void> {
    const http = new HttpClient({
      baseUrl: 'https://api.poloniex.com',
      requestsPerSecond: 3,
      maxConcurrent: 2,
      name: 'poloniex-metadata',
      timeoutMs: 15000,
    });
    const { data } = await http.get<Array<Record<string, Record<string, unknown>>>>('/currencies');
    if (!Array.isArray(data)) return;
    const out = new Map<string, AssetMeta>();
    for (const group of data) {
      for (const [currency, c] of Object.entries(group)) {
        const asset = currency.toUpperCase();
        if (!asset) continue;
        const blockchain = String(c.blockchain ?? '');
        const id = canonicalNetworkId(blockchain, asset);
        if (id === 'UNKNOWN') continue;
        const fee = String(c.withdrawalFee ?? '');
        const walletDeposit = c.walletDepositState ?? c.depositEnabled;
        const walletWithdraw = c.walletWithdrawalState ?? c.withdrawalEnabled;
        const depositState = walletDeposit;
        const withdrawState = walletWithdraw;
        out.set(asset, {
          networks: [
            {
              id,
              chain: chainDisplayName(id),
              withdrawalFee: fee && fee !== '0' ? fee : fee === '0' ? '0' : undefined,
              minWithdrawal: c.withdrawalMin ? String(c.withdrawalMin) : undefined,
              minDeposit: c.depositMin ? String(c.depositMin) : undefined,
              depositEnabled: statusOf(
                typeof depositState === 'boolean' ? depositState : depositState === 'ENABLED' ? true : undefined,
                typeof depositState === 'boolean' ? 'closed' : 'unknown',
              ),
              withdrawalEnabled: statusOf(
                typeof withdrawState === 'boolean' ? withdrawState : withdrawState === 'ENABLED' ? true : undefined,
                typeof withdrawState === 'boolean' ? 'closed' : 'unknown',
              ),
              contractAddress: c.contractAddress ? String(c.contractAddress) : undefined,
              source: 'live',
            },
          ],
          contractAddress: c.contractAddress ? String(c.contractAddress) : undefined,
          fullName: c.name ? String(c.name) : undefined,
        });
      }
    }
    for (const [asset, meta] of out) this.store('poloniex', asset, meta);
    logger.info('poloniex', 'METADATA', `cached ${out.size} assets`);
  }

  // --------------------------------------------------------------------------
  // LBank (bulk withdrawal config: chains + fees + status)
  // --------------------------------------------------------------------------
  private async refreshLbank(): Promise<void> {
    const http = new HttpClient({
      baseUrl: 'https://api.lbkex.com',
      requestsPerSecond: 3,
      maxConcurrent: 2,
      name: 'lbank-metadata',
      timeoutMs: 20000,
    });
    try {
      // lbkex v1 returns the withdraw-config table as a BARE array (not {data}).
      const { data } = await http.get<Array<Record<string, unknown>>>('/v1/withdrawConfigs.do');
      const rows = Array.isArray(data) ? data : [];
      const out = new Map<string, AssetMeta>();
      for (const row of rows) {
        const asset = String(row.assetCode ?? '').toUpperCase();
        if (!asset) continue;
        const rawChain = String(row.chain ?? '');
        const id = canonicalNetworkId(rawChain, asset);
        if (id === 'UNKNOWN') continue;
        const fee = row.fee !== undefined && row.fee !== null ? String(row.fee) : '';
        const canWithdraw = row.canWithDraw;
        const existing = out.get(asset) ?? { networks: [] };
        existing.networks.push({
          id,
          chain: chainDisplayName(id),
          withdrawalFee: fee && fee !== '0' ? fee : fee === '0' ? '0' : undefined,
          minWithdrawal: row.min ? String(row.min) : undefined,
          depositEnabled: 'unknown',
          withdrawalEnabled: statusOf(
            typeof canWithdraw === 'boolean' ? canWithdraw : canWithdraw === 'true' ? true : undefined,
            'unknown',
          ),
          source: 'live',
        });
        out.set(asset, existing);
      }
      for (const [asset, meta] of out) {
        if (meta.networks.length === 0) continue;
        this.store('lbank', asset, meta);
      }
      logger.info('lbank', 'METADATA', `cached ${out.size} assets`);
    } catch (err) {
      logger.debug('lbank', 'METADATA', 'bulk fetch failed', { error: String(err) });
    }
  }

  // --------------------------------------------------------------------------
  // WhiteBIT (bulk: deposit/withdraw networks per asset, no fee field)
  // --------------------------------------------------------------------------
  private async refreshWhitebit(): Promise<void> {
    const http = new HttpClient({
      baseUrl: 'https://whitebit.com',
      requestsPerSecond: 2,
      maxConcurrent: 1,
      name: 'whitebit-metadata',
      timeoutMs: 20000,
    });
    try {
      const { data } = await http.get<Record<string, Record<string, unknown>>>(`/api/v4/public/assets`);
      if (!data || typeof data !== 'object') return;
      const out = new Map<string, AssetMeta>();
      for (const [currency, c] of Object.entries(data)) {
        const asset = currency.toUpperCase();
        if (!asset) continue;
        const networksRaw = c.networks as { deposits?: string[]; withdraws?: string[]; default?: string } | undefined;
        const deposits = Array.isArray(networksRaw?.deposits) ? networksRaw.deposits : [];
        const withdraws = Array.isArray(networksRaw?.withdraws) ? networksRaw.withdraws : [];
        const all = [...new Set([...deposits, ...withdraws])].filter(Boolean);
        const networks: NetworkDescriptor[] = [];
        for (const n of all) {
          const id = canonicalNetworkId(String(n), asset);
          if (id === 'UNKNOWN') continue;
          const canDep = deposits.includes(n);
          const canWd = withdraws.includes(n);
          networks.push({
            id,
            chain: chainDisplayName(id),
            minDeposit: undefined,
            minWithdrawal: undefined,
            depositEnabled: statusOf(canDep, 'unknown'),
            withdrawalEnabled: statusOf(canWd, 'unknown'),
            source: 'live',
          });
        }
        if (networks.length === 0) continue;
        out.set(asset, {
          networks,
          fullName: c.name ? String(c.name) : undefined,
        });
      }
      for (const [asset, meta] of out) this.store('whitebit', asset, meta);
      logger.info('whitebit', 'METADATA', `cached ${out.size} assets`);
    } catch (err) {
      logger.debug('whitebit', 'METADATA', 'bulk fetch failed', { error: String(err) });
    }
  }

  // --------------------------------------------------------------------------
  // BitMart (bulk: asset exists + deposit/withdraw status, no chains/fees)
  // --------------------------------------------------------------------------
  private async refreshBitmart(): Promise<void> {
    const http = new HttpClient({
      baseUrl: 'https://api-cloud.bitmart.com',
      requestsPerSecond: 2,
      maxConcurrent: 1,
      name: 'bitmart-metadata',
      timeoutMs: 20000,
    });
    try {
      const { data } = await http.get<{ data?: { currencies?: Array<Record<string, unknown>> } }>(`/spot/v1/currencies`);
      const rows = Array.isArray(data?.data?.currencies) ? data.data.currencies : [];
      const out = new Map<string, AssetMeta>();
      for (const row of rows) {
        const asset = String(row.id ?? '').toUpperCase();
        if (!asset) continue;
        const dep = row.deposit_enabled;
        const wd = row.withdraw_enabled;
        const nativeId = canonicalNetworkId(asset, asset);
        const networks: NetworkDescriptor[] =
          nativeId === 'UNKNOWN'
            ? []
            : [
                {
                  id: nativeId,
                  chain: chainDisplayName(nativeId),
                  depositEnabled: statusOf(typeof dep === 'boolean' ? dep : undefined, 'unknown'),
                  withdrawalEnabled: statusOf(typeof wd === 'boolean' ? wd : undefined, 'unknown'),
                  source: 'live',
                },
              ];
        out.set(asset, {
          networks,
          fullName: row.name ? String(row.name) : undefined,
        });
      }
      for (const [asset, meta] of out) this.store('bitmart', asset, meta);
      logger.info('bitmart', 'METADATA', `cached ${out.size} assets`);
    } catch (err) {
      logger.debug('bitmart', 'METADATA', 'bulk fetch failed', { error: String(err) });
    }
  }

  // --------------------------------------------------------------------------
  // HitBTC (bulk: single chain + payoutFee per asset)
  // --------------------------------------------------------------------------
  private async refreshHitbtc(): Promise<void> {
    const http = new HttpClient({
      baseUrl: 'https://api.hitbtc.com',
      requestsPerSecond: 2,
      maxConcurrent: 1,
      name: 'hitbtc-metadata',
      timeoutMs: 20000,
    });
    try {
      const { data } = await http.get<Array<Record<string, unknown>>>(`/api/2/public/currency`);
      const rows = Array.isArray(data) ? data : [];
      const out = new Map<string, AssetMeta>();
      for (const row of rows) {
        const asset = String(row.id ?? '').toUpperCase();
        if (!asset) continue;
        const nativeId = canonicalNetworkId(asset, asset);
        if (nativeId === 'UNKNOWN') continue;
        const fee = String(row.payoutFee ?? '');
        const dep = row.payinEnabled;
        const wd = row.payoutEnabled;
        out.set(asset, {
          networks: [
            {
              id: nativeId,
              chain: chainDisplayName(nativeId),
              withdrawalFee: fee && fee !== '0' ? fee : fee === '0' ? '0' : undefined,
              depositEnabled: statusOf(typeof dep === 'boolean' ? dep : undefined, 'unknown'),
              withdrawalEnabled: statusOf(typeof wd === 'boolean' ? wd : undefined, 'unknown'),
              source: 'live',
            },
          ],
          fullName: row.fullName ? String(row.fullName) : undefined,
        });
      }
      for (const [asset, meta] of out) this.store('hitbtc', asset, meta);
      logger.info('hitbtc', 'METADATA', `cached ${out.size} assets`);
    } catch (err) {
      logger.debug('hitbtc', 'METADATA', 'bulk fetch failed', { error: String(err) });
    }
  }

  // --------------------------------------------------------------------------
  // CoinEx (per-asset, on demand)
  // --------------------------------------------------------------------------
  private async fetchCoinex(asset: string): Promise<void> {
    const http = new HttpClient({
      baseUrl: 'https://api.coinex.com',
      requestsPerSecond: 2,
      maxConcurrent: 2,
      name: 'coinex-metadata',
      timeoutMs: 15000,
    });
    try {
      const { data } = await http.get<{
        data?: {
          asset?: { ccy?: string; deposit_enabled?: boolean; withdraw_enabled?: boolean };
          chains?: Array<Record<string, unknown>>;
        };
      }>(`/v2/assets/deposit-withdraw-config?ccy=${encodeURIComponent(asset)}`);
      const d = data?.data;
      if (!d || !d.chains) return;
      const currency = String(d.asset?.ccy ?? asset).toUpperCase();
      const chains = d.chains;
      const networks: NetworkDescriptor[] = [];
      for (const ch of chains) {
        const rawName = String(ch.chain ?? '');
        const id = canonicalNetworkId(rawName, currency);
        if (id === 'UNKNOWN') continue;
        const fee = String(ch.withdrawal_fee ?? '');
        const depEnabled = ch.deposit_enabled;
        const wdEnabled = ch.withdraw_enabled;
        networks.push({
          id,
          chain: chainDisplayName(id),
          withdrawalFee: fee && fee !== '0' ? fee : fee === '0' ? '0' : undefined,
          minWithdrawal: ch.min_withdraw_amount ? String(ch.min_withdraw_amount) : undefined,
          minDeposit: ch.min_deposit_amount ? String(ch.min_deposit_amount) : undefined,
          depositEnabled: statusOf(typeof depEnabled === 'boolean' ? depEnabled : undefined, 'unknown'),
          withdrawalEnabled: statusOf(typeof wdEnabled === 'boolean' ? wdEnabled : undefined, 'unknown'),
          contractAddress: ch.contract_address ? String(ch.contract_address) : undefined,
          source: 'live',
        });
      }
      if (networks.length === 0) return;
      this.store('coinex', currency, {
        networks,
        contractAddress: networks.find((n) => n.contractAddress)?.contractAddress,
      });
    } catch (err) {
      logger.debug('coinex', 'METADATA', `fetch failed for ${asset}`, { error: String(err) });
      if (!this.cache.has('coinex')) this.cache.set('coinex', new Map());
      this.lastRefresh.set('coinex', Date.now());
    }
  }

  // --------------------------------------------------------------------------
  // KuCoin (per-asset, on demand)
  // --------------------------------------------------------------------------
  private async fetchKucoin(asset: string): Promise<void> {
    const http = new HttpClient({
      baseUrl: 'https://api.kucoin.com',
      requestsPerSecond: 2,
      maxConcurrent: 2,
      name: 'kucoin-metadata',
      timeoutMs: 15000,
    });
    try {
      const { data } = await http.get<{ data?: { currency: string; name?: string; fullName?: string; chains?: Array<Record<string, unknown>> } }>(
        `/api/v2/currencies/${encodeURIComponent(asset)}`,
      );
      const d = data?.data;
      if (!d) return;
      const currency = String(d.currency ?? asset).toUpperCase();
      const chains = Array.isArray(d.chains) ? d.chains : [];
      const networks: NetworkDescriptor[] = [];
      for (const ch of chains) {
        const rawName = String(ch.chainName ?? ch.chain ?? '');
        const id = canonicalNetworkId(rawName, currency);
        if (id === 'UNKNOWN') continue;
        const fee = String(ch.withdrawalMinFee ?? '');
        const depEnabled = ch.isDepositEnabled;
        const wdEnabled = ch.isWithdrawEnabled;
        networks.push({
          id,
          chain: chainDisplayName(id),
          withdrawalFee: fee && fee !== '0' ? fee : fee === '0' ? '0' : undefined,
          minWithdrawal: ch.withdrawalMinSize ? String(ch.withdrawalMinSize) : undefined,
          minDeposit: ch.depositMinSize ? String(ch.depositMinSize) : undefined,
          depositEnabled: statusOf(typeof depEnabled === 'boolean' ? depEnabled : undefined, 'unknown'),
          withdrawalEnabled: statusOf(typeof wdEnabled === 'boolean' ? wdEnabled : undefined, 'unknown'),
          contractAddress: ch.contractAddress ? String(ch.contractAddress) : undefined,
          source: 'live',
        });
      }
      if (networks.length === 0) return;
      this.store('kucoin', currency, {
        networks,
        contractAddress: networks.find((n) => n.contractAddress)?.contractAddress,
        fullName: d.fullName ?? d.name ?? undefined,
      });
    } catch (err) {
      logger.debug('kucoin', 'METADATA', `fetch failed for ${asset}`, { error: String(err) });
      if (!this.cache.has('kucoin')) this.cache.set('kucoin', new Map());
      this.lastRefresh.set('kucoin', Date.now());
    }
  }

  // --------------------------------------------------------------------------
  // MEXC (bulk, signed, key REQUIRED)
  // --------------------------------------------------------------------------
  private async refreshMexc(): Promise<void> {
    const cred = getCredential('mexc');
    if (!cred?.apiSecret) {
      logger.debug('mexc', 'METADATA', 'no read-only key configured - skipping');
      return;
    }
    const http = new HttpClient({
      baseUrl: 'https://api.mexc.com',
      requestsPerSecond: 3,
      maxConcurrent: 1,
      name: 'mexc-metadata',
      timeoutMs: 20000,
    });
    try {
      const ts = Date.now().toString();
      const recvWindow = '5000';
      // MEXC requires the signature over the QUERY string in the URL (like
      // Binance), not via X-MEXC-SIGNATURE headers (which MEXC rejects 400).
      const query = `timestamp=${ts}&recvWindow=${recvWindow}`;
      const signature = hmacSha256(cred.apiSecret, query);
      const { data } = await http.get<Array<Record<string, unknown>>>(
        `/api/v3/capital/config/getall?${query}&signature=${signature}`,
        { headers: { 'X-MEXC-APIKEY': cred.apiKey } },
      );
      const rows = Array.isArray(data) ? data : [];
      const out = new Map<string, AssetMeta>();
      for (const coin of rows) {
        const currency = String(coin.coin ?? '').toUpperCase();
        if (!currency) continue;
        const networkList = Array.isArray(coin.networkList) ? (coin.networkList as Array<Record<string, unknown>>) : [];
        const networks: NetworkDescriptor[] = [];
        for (const ch of networkList) {
          const rawName = String(ch.network ?? ch.networkShortName ?? '');
          const id = canonicalNetworkId(rawName, currency);
          if (id === 'UNKNOWN') continue;
          const fee = String(ch.withdrawFee ?? '');
          const dep = ch.isDepositEnabled;
          const wd = ch.isWithdrawEnabled;
          networks.push({
            id,
            chain: chainDisplayName(id),
            withdrawalFee: fee && fee !== '0' ? fee : fee === '0' ? '0' : undefined,
            minWithdrawal: ch.minWithdraw ? String(ch.minWithdraw) : undefined,
            minDeposit: ch.minDeposit ? String(ch.minDeposit) : undefined,
            depositEnabled: statusOf(typeof dep === 'boolean' ? dep : undefined, 'unknown'),
            withdrawalEnabled: statusOf(typeof wd === 'boolean' ? wd : undefined, 'unknown'),
            contractAddress: ch.contractAddress ? String(ch.contractAddress) : undefined,
            source: 'live',
          });
        }
        if (networks.length === 0) continue;
        out.set(currency, {
          networks,
          contractAddress: networks.find((n) => n.contractAddress)?.contractAddress,
          fullName: coin.name ? String(coin.name) : undefined,
        });
      }
      for (const [asset, meta] of out) this.store('mexc', asset, meta);
      logger.info('mexc', 'METADATA', `cached ${out.size} assets`);
    } catch (err) {
      logger.debug('mexc', 'METADATA', 'bulk fetch failed', { error: String(err) });
    }
  }

  // --------------------------------------------------------------------------
  // Bybit (bulk, signed v5, key REQUIRED)
  // --------------------------------------------------------------------------
  private async refreshBybit(): Promise<void> {
    const cred = getCredential('bybit');
    if (!cred?.apiSecret) {
      logger.debug('bybit', 'METADATA', 'no read-only key configured - skipping');
      return;
    }
    const http = new HttpClient({
      baseUrl: 'https://api.bybit.com',
      requestsPerSecond: 3,
      maxConcurrent: 1,
      name: 'bybit-metadata',
      timeoutMs: 20000,
    });
    try {
      const ts = Date.now().toString();
      const recvWindow = '20000';
      const sign = hmacSha256(cred.apiSecret, `${ts}${cred.apiKey}${recvWindow}`);
      const { data } = await http.get<{ retCode?: number; result?: { rows?: Array<Record<string, unknown>> } }>(
        '/v5/asset/coin/query-info',
        {
          headers: {
            'X-BAPI-API-KEY': cred.apiKey,
            'X-BAPI-TIMESTAMP': ts,
            'X-BAPI-RECV-WINDOW': recvWindow,
            'X-BAPI-SIGN': sign,
            'X-BAPI-TYPE': '4',
          },
        },
      );
      const rows = Array.isArray(data?.result?.rows) ? data.result.rows : [];
      const out = new Map<string, AssetMeta>();
      for (const coin of rows) {
        const currency = String(coin.coin ?? '').toUpperCase();
        if (!currency) continue;
        const chains = Array.isArray(coin.chains) ? (coin.chains as Array<Record<string, unknown>>) : [];
        const networks: NetworkDescriptor[] = [];
        for (const ch of chains) {
          const rawName = String(ch.chainType ?? ch.chain ?? '');
          const id = canonicalNetworkId(rawName, currency);
          if (id === 'UNKNOWN') continue;
          const fee = String(ch.withdrawFee ?? '');
          const dep = ch.depositEnable;
          const wd = ch.withdrawEnable;
          networks.push({
            id,
            chain: chainDisplayName(id),
            withdrawalFee: fee && fee !== '0' ? fee : fee === '0' ? '0' : undefined,
            minWithdrawal: ch.minWithdrawAmount ? String(ch.minWithdrawAmount) : undefined,
            minDeposit: ch.minDeposit ? String(ch.minDeposit) : undefined,
            depositEnabled: statusOf(typeof dep === 'boolean' ? dep : undefined, 'unknown'),
            withdrawalEnabled: statusOf(typeof wd === 'boolean' ? wd : undefined, 'unknown'),
            contractAddress: ch.contractAddress ? String(ch.contractAddress) : undefined,
            source: 'live',
          });
        }
        if (networks.length === 0) continue;
        out.set(currency, {
          networks,
          contractAddress: networks.find((n) => n.contractAddress)?.contractAddress,
          fullName: coin.name ? String(coin.name) : undefined,
        });
      }
      for (const [asset, meta] of out) this.store('bybit', asset, meta);
      logger.info('bybit', 'METADATA', `cached ${out.size} assets`);
    } catch (err) {
      logger.debug('bybit', 'METADATA', 'bulk fetch failed', { error: String(err) });
    }
  }

  // --------------------------------------------------------------------------
  // Bitrue (best-effort, key optional). Bitrue currently exposes no wallet
  // network/fee data through an unauthenticated or read-only endpoint, so this
  // hook degrades to UNKNOWN rather than inventing fees. Wired for the day a
  // usable metadata endpoint becomes available.
  // --------------------------------------------------------------------------
  private async refreshBitrue(): Promise<void> {
    const cred = getCredential('bitrue');
    if (!cred) {
      logger.debug('bitrue', 'METADATA', 'no read-only key configured - skipping');
      return;
    }
    try {
      const http = new HttpClient({
        baseUrl: 'https://api.bitrue.com',
        requestsPerSecond: 2,
        maxConcurrent: 1,
        name: 'bitrue-metadata',
        timeoutMs: 15000,
      });
      const { data } = await http.get<Record<string, unknown>>('/api/v1/exchangeInfo', {
        headers: { 'X-MBX-APIKEY': cred.apiKey },
      });
      void data; // exchangeInfo reports symbols, not wallet networks/fees.
      if (!this.cache.has('bitrue')) this.cache.set('bitrue', new Map());
      this.lastRefresh.set('bitrue', Date.now());
      logger.debug('bitrue', 'METADATA', 'endpoint has no wallet network/fee data');
    } catch (err) {
      logger.debug('bitrue', 'METADATA', 'bulk fetch failed', { error: String(err) });
      if (!this.cache.has('bitrue')) this.cache.set('bitrue', new Map());
      this.lastRefresh.set('bitrue', Date.now());
    }
  }

  // --------------------------------------------------------------------------
  // DigiFinex (bulk, PUBLIC: chains + fee + deposit/withdraw status)
  // --------------------------------------------------------------------------
  private async refreshDigifinex(): Promise<void> {
    const http = new HttpClient({
      baseUrl: 'https://openapi.digifinex.com',
      requestsPerSecond: 3,
      maxConcurrent: 2,
      name: 'digifinex-metadata',
      timeoutMs: 20000,
    });
    try {
      const { data } = await http.get<{ code?: number; data?: Array<Record<string, unknown>> }>('/v3/currencies');
      const rows = Array.isArray(data?.data) ? data.data : [];
      const out = new Map<string, AssetMeta>();
      for (const row of rows) {
        const currency = String(row.currency ?? '').toUpperCase();
        if (!currency) continue;
        const rawChain = String(row.chain ?? '');
        const id = canonicalNetworkId(rawChain, currency);
        if (id === 'UNKNOWN') continue;
        const fee = String(row.min_withdraw_fee ?? '');
        const existing = out.get(currency) ?? { networks: [] as NetworkDescriptor[] };
        existing.networks.push({
          id,
          chain: chainDisplayName(id),
          withdrawalFee: fee && fee !== '0' ? fee : fee === '0' ? '0' : undefined,
          minWithdrawal: row.min_withdraw_amount ? String(row.min_withdraw_amount) : undefined,
          minDeposit: row.min_deposit_amount ? String(row.min_deposit_amount) : undefined,
          depositEnabled: statusOf(Number(row.deposit_status) === 1, 'unknown'),
          withdrawalEnabled: statusOf(Number(row.withdraw_status) === 1, 'unknown'),
          source: 'live',
        });
        out.set(currency, existing);
      }
      for (const [asset, meta] of out) {
        if (!meta.networks.length) continue;
        this.store('digifinex', asset, meta);
      }
      logger.info('digifinex', 'METADATA', `cached ${out.size} assets`);
    } catch (err) {
      logger.debug('digifinex', 'METADATA', 'bulk fetch failed', { error: String(err) });
    }
  }

  // --------------------------------------------------------------------------
  // Binance (bulk, signed, key REQUIRED)
  //   GET /sapi/v1/capital/config/getall?timestamp=..&signature=..
  // --------------------------------------------------------------------------
  private async refreshBinance(): Promise<void> {
    const cred = getCredential('binance');
    if (!cred?.apiSecret) {
      logger.debug('binance', 'METADATA', 'no read-only key configured - skipping');
      return;
    }
    const http = new HttpClient({
      baseUrl: 'https://api.binance.com',
      requestsPerSecond: 3,
      maxConcurrent: 1,
      name: 'binance-metadata',
      timeoutMs: 60000,
    });
    try {
      const ts = Date.now().toString();
      const query = `timestamp=${ts}`;
      const signature = hmacSha256(cred.apiSecret, query);
      const { data } = await http.get<Array<Record<string, unknown>>>(`/sapi/v1/capital/config/getall?${query}&signature=${signature}`, {
        headers: { 'X-MBX-APIKEY': cred.apiKey },
      });
      const rows = Array.isArray(data) ? data : [];
      const out = new Map<string, AssetMeta>();
      for (const coin of rows) {
        const currency = String(coin.coin ?? '').toUpperCase();
        if (!currency) continue;
        const networkList = Array.isArray(coin.networkList) ? (coin.networkList as Array<Record<string, unknown>>) : [];
        const networks: NetworkDescriptor[] = [];
        for (const n of networkList) {
          const rawName = String(n.network ?? '');
          const id = canonicalNetworkId(rawName, currency);
          if (id === 'UNKNOWN') continue;
          const fee = String(n.withdrawFee ?? '');
          const dep = n.depositEnable;
          const wd = n.withdrawEnable;
          networks.push({
            id,
            chain: chainDisplayName(id),
            withdrawalFee: fee && fee !== '0' ? fee : fee === '0' ? '0' : undefined,
            minWithdrawal: n.withdrawMin ? String(n.withdrawMin) : undefined,
            minDeposit: n.depositDust ? String(n.depositDust) : undefined,
            depositEnabled: statusOf(typeof dep === 'boolean' ? dep : undefined, 'unknown'),
            withdrawalEnabled: statusOf(typeof wd === 'boolean' ? wd : undefined, 'unknown'),
            contractAddress: n.contractAddress ? String(n.contractAddress) : undefined,
            source: 'live',
          });
        }
        if (networks.length === 0) continue;
        out.set(currency, {
          networks,
          contractAddress: networks.find((x) => x.contractAddress)?.contractAddress,
          fullName: coin.name ? String(coin.name) : undefined,
        });
      }
      for (const [asset, meta] of out) this.store('binance', asset, meta);
      logger.info('binance', 'METADATA', `cached ${out.size} assets`);
    } catch (err) {
      logger.debug('binance', 'METADATA', 'bulk fetch failed', { error: String(err) });
    }
  }

  // --------------------------------------------------------------------------
  // OKX (bulk, signed v5, key REQUIRED)
  //   GET /api/v5/asset/currencies
  // --------------------------------------------------------------------------
  private async refreshOkx(): Promise<void> {
    const cred = getCredential('okx');
    if (!cred?.apiSecret || !cred.apiPassphrase) {
      logger.debug('okx', 'METADATA', 'no read-only key/passphrase configured - skipping');
      return;
    }
    const http = new HttpClient({
      baseUrl: 'https://www.okx.com',
      requestsPerSecond: 3,
      maxConcurrent: 1,
      name: 'okx-metadata',
      timeoutMs: 45000,
    });
    try {
      const ts = new Date().toISOString();
      const method = 'GET';
      const path = '/api/v5/asset/currencies';
      const sign = hmacSha256Base64(cred.apiSecret, `${ts}${method}${path}`);
      const { data } = await http.get<{ code?: string; data?: Array<Record<string, unknown>> }>(path, {
        headers: {
          'OK-ACCESS-KEY': cred.apiKey,
          'OK-ACCESS-SIGN': sign,
          'OK-ACCESS-TIMESTAMP': ts,
          'OK-ACCESS-PASSPHRASE': cred.apiPassphrase,
        },
      });
      // OKX returns a FLAT list, one row per (currency, chain) pair:
      //   [{ ccy: "USDT", chain: "USDT-ERC20", canDep, canWd, fee, minWd, ... }, ...]
      const rows = Array.isArray(data?.data) ? data.data : [];
      const out = new Map<string, AssetMeta>();
      for (const cur of rows) {
        const currency = String(cur.ccy ?? '').toUpperCase();
        if (!currency) continue;
        const rawChain = String(cur.chain ?? cur.chainId ?? '');
        // Chain names come back prefixed with the currency ("USDT-ERC20",
        // "BTC-Bitcoin") — strip "<CCY>-" so canonicalization sees the real
        // chain (ERC20, Bitcoin, …). Parenthetical variants like "X Layer
        // (USDT0)" are bridged tokens; drop the qualifier for matching.
        const base = rawChain.replace(/^[A-Z0-9]{1,12}-/i, '').replace(/\s*\(.*\)\s*$/, '').trim();
        const id = canonicalNetworkId(base, currency);
        if (id === 'UNKNOWN') continue;
        const fee = String(cur.fee ?? cur.withdrawFee ?? '');
        const canDep = cur.canDep;
        const canWd = cur.canWd;
        const existing = out.get(currency) ?? { networks: [] as NetworkDescriptor[] };
        existing.networks.push({
          id,
          chain: chainDisplayName(id),
          withdrawalFee: fee && fee !== '0' ? fee : fee === '0' ? '0' : undefined,
          minWithdrawal: cur.minWd ? String(cur.minWd) : cur.minWithdraw ? String(cur.minWithdraw) : undefined,
          minDeposit: cur.minDep ? String(cur.minDep) : cur.minDeposit ? String(cur.minDeposit) : undefined,
          depositEnabled: statusOf(typeof canDep === 'boolean' ? canDep : undefined, 'unknown'),
          withdrawalEnabled: statusOf(typeof canWd === 'boolean' ? canWd : undefined, 'unknown'),
          contractAddress: cur.ctAddr ? String(cur.ctAddr) : undefined,
          source: 'live',
        });
        out.set(currency, existing);
      }
      for (const [asset, meta] of out) {
        if (meta.networks.length === 0) continue;
        this.store('okx', asset, {
          networks: meta.networks,
          contractAddress: meta.networks.find((x) => x.contractAddress)?.contractAddress,
        });
      }
      logger.info('okx', 'METADATA', `cached ${out.size} assets`);
    } catch (err) {
      logger.debug('okx', 'METADATA', 'bulk fetch failed', { error: String(err) });
    }
  }

  // --------------------------------------------------------------------------
  // XT.com (bulk, PUBLIC: chains + fees + deposit/withdraw status)
  //   GET /v4/public/wallet/support/currency
  // --------------------------------------------------------------------------
  private async refreshXt(): Promise<void> {
    const http = new HttpClient({
      baseUrl: 'https://sapi.xt.com',
      requestsPerSecond: 3,
      maxConcurrent: 2,
      name: 'xt-metadata',
      timeoutMs: 20000,
    });
    try {
      const { data } = await http.get<{ rc?: number; result?: Array<Record<string, unknown>> }>('/v4/public/wallet/support/currency');
      const rows = Array.isArray(data?.result) ? data.result : [];
      const out = new Map<string, AssetMeta>();
      for (const cur of rows) {
        const currency = String(cur.currency ?? '').toUpperCase();
        if (!currency) continue;
        const chains = Array.isArray(cur.supportChains) ? (cur.supportChains as Array<Record<string, unknown>>) : [];
        const networks: NetworkDescriptor[] = [];
        for (const ch of chains) {
          const rawName = String(ch.chain ?? '');
          const id = canonicalNetworkId(rawName, currency);
          if (id === 'UNKNOWN') continue;
          const fee = String(ch.withdrawFeeAmount ?? '');
          const dep = ch.depositEnabled;
          const wd = ch.withdrawEnabled;
          networks.push({
            id,
            chain: chainDisplayName(id),
            withdrawalFee: fee && fee !== '0' ? fee : fee === '0' ? '0' : undefined,
            minWithdrawal: ch.withdrawMinAmount ? String(ch.withdrawMinAmount) : undefined,
            minDeposit: ch.depositMinAmount ? String(ch.depositMinAmount) : undefined,
            depositEnabled: statusOf(typeof dep === 'boolean' ? dep : undefined, 'unknown'),
            withdrawalEnabled: statusOf(typeof wd === 'boolean' ? wd : undefined, 'unknown'),
            contractAddress: ch.contract ? String(ch.contract) : undefined,
            source: 'live',
          });
        }
        if (networks.length === 0) continue;
        out.set(currency, {
          networks,
          contractAddress: networks.find((n2) => n2.contractAddress)?.contractAddress,
          fullName: cur.currencyName ? String(cur.currencyName) : undefined,
        });
      }
      for (const [asset, meta] of out) this.store('xt', asset, meta);
      logger.info('xt', 'METADATA', `cached ${out.size} assets`);
    } catch (err) {
      logger.debug('xt', 'METADATA', 'bulk fetch failed', { error: String(err) });
    }
  }

  // --------------------------------------------------------------------------
  // BTSE (public/deprecated; chains + fees + status). Per-asset, on a cycle.
  // --------------------------------------------------------------------------
  private async refreshBtse(): Promise<void> {
    const http = new HttpClient({
      baseUrl: 'https://api.btse.com',
      requestsPerSecond: 3,
      maxConcurrent: 2,
      name: 'btse-metadata',
      timeoutMs: 20000,
    });
    // BTSE exposes a per-currency endpoint. We query a rotating slice of the
    // scanned assets instead of every single one to bound load.
    const assets = this.scannedAssets();
    const out = new Map<string, AssetMeta>();
    const chunk = 30;
    for (let i = 0; i < assets.length; i += chunk) {
      const batch = assets.slice(i, i + chunk);
      await Promise.allSettled(
        batch.map(async (asset) => {
          try {
            const { data } = await http.get<{ code?: number; msg?: string; data?: Array<Record<string, unknown>> }>(
              `/public-api/wallet/v1/crypto/networks?crypto=${encodeURIComponent(String(asset))}`,
            );
            const rows = Array.isArray(data?.data) ? data.data : [];
            const networks: NetworkDescriptor[] = [];
            for (const n of rows) {
              const rawName = String(n.network ?? '');
              const id = canonicalNetworkId(rawName, String(asset));
              if (id === 'UNKNOWN') continue;
              const dep = n.depositEnable;
              const wd = n.withdrawEnable;
              networks.push({
                id,
                chain: chainDisplayName(id),
                withdrawalFee: n.withdrawFee ? String(n.withdrawFee) : undefined,
                minWithdrawal: n.withdrawAmtMin ? String(n.withdrawAmtMin) : undefined,
                depositEnabled: statusOf(typeof dep === 'boolean' ? dep : undefined, 'unknown'),
                withdrawalEnabled: statusOf(typeof wd === 'boolean' ? wd : undefined, 'unknown'),
                source: 'live',
              });
            }
            if (networks.length) out.set(String(asset).toUpperCase(), { networks });
          } catch {
            /* per-asset errors isolated */
          }
        }),
      );
    }
    for (const [asset, meta] of out) this.store('btse', asset, meta);
    logger.info('btse', 'METADATA', `cached ${out.size} assets`);
  }

  // --------------------------------------------------------------------------
  // BingX (signed, key REQUIRED)
  //   GET /openApi/wallets/v1/capital/config/getall
  // --------------------------------------------------------------------------
  private async refreshBingx(): Promise<void> {
    const cred = getCredential('bingx');
    if (!cred?.apiSecret) {
      logger.debug('bingx', 'METADATA', 'no read-only key configured - skipping');
      return;
    }
    const http = new HttpClient({
      baseUrl: 'https://open-api.bingx.com',
      requestsPerSecond: 3,
      maxConcurrent: 1,
      name: 'bingx-metadata',
      timeoutMs: 20000,
    });
    try {
      const ts = Date.now().toString();
      const method = 'GET';
      const requestPath = '/openApi/wallets/v1/capital/config/getall';
      const sign = hmacSha256(cred.apiSecret, `${ts}${method}${requestPath}`);
      const { data } = await http.get<{ data?: Array<Record<string, unknown>> }>(requestPath, {
        headers: { 'X-CH-APIKEY': cred.apiKey, 'X-CH-TIMESTAMP': ts, 'X-CH-SIGN': sign },
      });
      const rows = Array.isArray(data?.data) ? data.data : [];
      const out = new Map<string, AssetMeta>();
      for (const coin of rows) {
        const currency = String(coin.coin ?? '').toUpperCase();
        if (!currency) continue;
        const networkList = Array.isArray(coin.networkList) ? (coin.networkList as Array<Record<string, unknown>>) : [];
        const networks: NetworkDescriptor[] = [];
        for (const n of networkList) {
          const rawName = String(n.network ?? '');
          const id = canonicalNetworkId(rawName, currency);
          if (id === 'UNKNOWN') continue;
          const fee = String(n.withdrawFee ?? '');
          const dep = n.depositEnable;
          const wd = n.withdrawEnable;
          networks.push({
            id,
            chain: chainDisplayName(id),
            withdrawalFee: fee && fee !== '0' ? fee : fee === '0' ? '0' : undefined,
            minWithdrawal: n.withdrawMin ? String(n.withdrawMin) : undefined,
            minDeposit: n.depositMin ? String(n.depositMin) : undefined,
            depositEnabled: statusOf(typeof dep === 'boolean' ? dep : undefined, 'unknown'),
            withdrawalEnabled: statusOf(typeof wd === 'boolean' ? wd : undefined, 'unknown'),
            source: 'live',
          });
        }
        if (networks.length === 0) continue;
        out.set(currency, { networks, fullName: coin.name ? String(coin.name) : undefined });
      }
      for (const [asset, meta] of out) this.store('bingx', asset, meta);
      logger.info('bingx', 'METADATA', `cached ${out.size} assets`);
    } catch (err) {
      logger.debug('bingx', 'METADATA', 'bulk fetch failed', { error: String(err) });
    }
  }

  // --------------------------------------------------------------------------
  // Crypto.com (signed, key REQUIRED). POST private/get-currency-networks.
  // --------------------------------------------------------------------------
  private async refreshCryptoCom(): Promise<void> {
    const cred = getCredential('cryptocom');
    // Crypto.com requires a secret for signing and a nonce; if absent we skip.
    if (!cred?.apiSecret) {
      logger.debug('cryptocom', 'METADATA', 'no read-only key configured - skipping');
      return;
    }
    const http = new HttpClient({
      baseUrl: 'https://api.crypto.com',
      requestsPerSecond: 2,
      maxConcurrent: 1,
      name: 'cryptocom-metadata',
      timeoutMs: 20000,
    });
    try {
      const id = Date.now();
      const method = 'private/get-currency-networks';
      const nonce = Date.now();
      const params = '{}';
      const sig = hmacSha256(cred.apiSecret, `${nonce}${method}${id}${cred.apiKey}${params}`);
      const { data } = await http.post<{ code?: number; result?: { currency_map?: Record<string, Record<string, unknown>> } }>(
        `/v2/private/get-currency-networks`,
        {
          headers: { 'Content-Type': 'application/json' },
          body: { id, method, nonce, params: {}, api_key: cred.apiKey, sig },
        },
      );
      const map = data?.result?.currency_map;
      if (!map) return;
      const out = new Map<string, AssetMeta>();
      for (const [currency, c] of Object.entries(map)) {
        const asset = currency.toUpperCase();
        const networkList = Array.isArray(c.network_list) ? (c.network_list as Array<Record<string, unknown>>) : [];
        const networks: NetworkDescriptor[] = [];
        for (const n of networkList) {
          const rawName = String(n.network_id ?? '');
          const id2 = canonicalNetworkId(rawName, asset);
          if (id2 === 'UNKNOWN') continue;
          const dep = n.deposit_enabled;
          const wd = n.withdraw_enabled;
          const fee = n.withdrawal_fee;
          networks.push({
            id: id2,
            chain: chainDisplayName(id2),
            withdrawalFee: fee === null || fee === undefined ? undefined : String(fee),
            minWithdrawal: n.min_withdrawal_amount ? String(n.min_withdrawal_amount) : undefined,
            depositEnabled: statusOf(typeof dep === 'boolean' ? dep : undefined, 'unknown'),
            withdrawalEnabled: statusOf(typeof wd === 'boolean' ? wd : undefined, 'unknown'),
            source: 'live',
          });
        }
        if (!networks.length) continue;
        out.set(asset, { networks, fullName: c.full_name ? String(c.full_name) : undefined });
      }
      for (const [asset, meta] of out) this.store('cryptocom', asset, meta);
      logger.info('cryptocom', 'METADATA', `cached ${out.size} assets`);
    } catch (err) {
      logger.debug('cryptocom', 'METADATA', 'bulk fetch failed', { error: String(err) });
    }
  }

  // --------------------------------------------------------------------------
  // Phemex (signed, key REQUIRED). GET /phemex-withdraw/wallets/api/asset/info
  // --------------------------------------------------------------------------
  private async refreshPhemex(): Promise<void> {
    const cred = getCredential('phemex');
    if (!cred?.apiSecret) {
      logger.debug('phemex', 'METADATA', 'no read-only key configured - skipping');
      return;
    }
    const http = new HttpClient({
      baseUrl: 'https://api.phemex.com',
      requestsPerSecond: 2,
      maxConcurrent: 1,
      name: 'phemex-metadata',
      timeoutMs: 20000,
    });
    try {
      const assets = this.scannedAssets();
      const out = new Map<string, AssetMeta>();
      for (const asset of assets) {
        try {
          const path = `/phemex-withdraw/wallets/api/asset/info?currency=${encodeURIComponent(String(asset))}`;
          const expiry = (Date.now() + 60).toString();
          const sign = hmacSha256(cred.apiSecret, `${path}${expiry}`);
          const { data } = await http.get<{ code?: number; data?: { currency?: string; chainInfos?: Array<Record<string, unknown>> } }>(path, {
            headers: { 'x-phemex-request-signature': sign, 'x-phemex-request-expiry': expiry, 'x-phemex-access-token': cred.apiKey },
          });
          const chainInfos = Array.isArray(data?.data?.chainInfos) ? data.data.chainInfos : [];
          const networks: NetworkDescriptor[] = [];
          for (const ch of chainInfos) {
            const rawName = String(ch.chainName ?? ch.chainCode ?? '');
            const id = canonicalNetworkId(rawName, String(asset));
            if (id === 'UNKNOWN') continue;
            const status = String(ch.status ?? '');
            networks.push({
              id,
              chain: chainDisplayName(id),
              withdrawalFee: ch.withdrawFeeRv ? String(ch.withdrawFeeRv) : undefined,
              minWithdrawal: ch.minWithdrawAmountRv ? String(ch.minWithdrawAmountRv) : undefined,
              depositEnabled: 'unknown',
              withdrawalEnabled: status.toUpperCase() === 'ACTIVE' ? 'open' : status ? 'closed' : 'unknown',
              contractAddress: ch.contractAddress ? String(ch.contractAddress) : undefined,
              source: 'live',
            });
          }
          if (networks.length) out.set(String(asset).toUpperCase(), { networks });
        } catch {
          /* per-asset errors isolated */
        }
      }
      for (const [asset, meta] of out) this.store('phemex', asset, meta);
      logger.info('phemex', 'METADATA', `cached ${out.size} assets`);
    } catch (err) {
      logger.debug('phemex', 'METADATA', 'bulk fetch failed', { error: String(err) });
    }
  }
}

const SUPPORTED = new Set(['gate', 'bitget', 'htx', 'poloniex', 'kucoin', 'lbank', 'coinex', 'whitebit', 'bitmart', 'hitbtc', 'mexc', 'bybit', 'bitrue', 'digifinex', 'binance', 'okx', 'xt', 'btse', 'bingx', 'cryptocom', 'phemex']);

export const liveMetadataService = new LiveMetadataService();
