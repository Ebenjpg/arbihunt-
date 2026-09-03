import type {
  Opportunity,
  KpiSnapshot,
  OpportunityBreakdownItem,
  NetworkDescriptor,
} from '@arbihunt/shared';
import {
  simulateArbitrage,
  computeConfidence,
  matchNetworks,
  num,
  toDec,
  Decimal,
} from '@arbihunt/shared';
import { config } from '../config';
import { logger } from '../logger';
import { tickerService } from '../market-data/tickerService';
import { orderBookService } from '../market-data/orderbookService';
import { WsManager } from '../market-data/wsManager';
import { feeService } from '../fees/feeService';
import { networkService } from '../networks/networkService';
import { liveMetadataService } from '../networks/liveMetadataService';
import { verifyAssetIdentity } from '../networks/assetIdentity';
import { getAdapter } from '../exchanges/registry';
import { OpportunityStore } from './store';
import { isDegradedNext, isResilientRow } from './sticky';
import { computeTransferStatus, transferStatusDetail, transferTimeEstimate } from './status';

/** Smallest transferable amount (in base-asset units) from the recommended network.
 *  Prefers the min withdrawal, then min deposit, when the network provides them. */
function parseMinAmount(rec?: NetworkDescriptor): number | undefined {
  if (!rec) return undefined;
  for (const raw of [rec.minWithdrawal, rec.minDeposit]) {
    if (raw === undefined || raw === null || raw.trim() === '') continue;
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

/** First known on-chain contract address for an asset on an exchange. Live
 *  per-network contract fields take priority over the metadata service's
 *  top-level contract; both derive from the same live exchange metadata. */
function contractFor(
  networks: NetworkDescriptor[] | null,
  exchangeId: string,
  asset: string,
): string | undefined {
  const fromNetworks = (networks ?? []).find((n) => n.contractAddress)?.contractAddress;
  return fromNetworks ?? networkService.getContractAddress(exchangeId, asset);
}

/** Conservative greed flag: a quote that deviates a lot from the cross-exchange
 *  median (stale book, partial book, mis-scaled symbol) is suspected. Only used
 *  to downgrade confidence — never a hard block — so real thin-market edges are
 *  still surfaced, just honestly flagged. */
function midMarketSuspicious(buyPrice: number, sellPrice: number, medianMid: number): boolean {
  // Flag any quote that deviates >15% from the cross-exchange median in
  // EITHER direction: inflated buy prices, deflated sell prices (already caught
  // below) — AND inflated sell prices, deflated buy prices (added to catch
  // stale/inverted books from exchanges like LATOKEN whose cached bids/asks can
  // drift far from the market median while still reporting a recent timestamp).
  const ratio = buyPrice / medianMid;
  const sellRatio = sellPrice / medianMid;
  return ratio > 1.15 || ratio < 1 / 1.15 || sellRatio > 1.15 || sellRatio < 1 / 1.15;
}

export interface ScannerFilters {
  minProfitPct: number;
  minProfitUsd: number;
  minLiquidityUsd: number;
  maxSlippagePct: number;
  minConfidence: 'LOW' | 'MEDIUM' | 'HIGH';
  onlyVerifiedNetworks: boolean;
  onlyVerifiedAssets: boolean;
  showAll: boolean;
}

export interface EngineState {
  capital: number;
  filters: ScannerFilters;
  buyExchanges: string[] | null; // null = all
  sellExchanges: string[] | null;
  search: string;
}

export class ArbitrageEngine {
  readonly store = new OpportunityStore();
  state: EngineState = {
    capital: config.defaultCapital,
    filters: {
      minProfitPct: config.minProfitPct,
      minProfitUsd: 0,
      minLiquidityUsd: 0,
      maxSlippagePct: 5,
      minConfidence: 'LOW',
      onlyVerifiedNetworks: false,
      onlyVerifiedAssets: false,
      showAll: true,
    },
    buyExchanges: null,
    sellExchanges: null,
    search: '',
  };

  lastScan = 0;
  running = false;
  private ws?: WsManager;
  private scanTick = 0;
  private lastSelectTick = new Map<string, number>();
  /** Consecutive degraded evaluations per route id (sticky protection). */
  private degradedStrikes = new Map<string, number>();

  constructor() {
    this.ws = new WsManager(tickerService);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await tickerService.start();
    this.ws?.start();
    if (config.demoMode) {
      logger.info(undefined, 'ENGINE', 'demo mode enabled - live data scanning disabled');
      void this.demoLoop();
    } else {
      void this.scanLoop();
    }
  }

  getKpis(): KpiSnapshot {
    const opps = this.store.getAll();
    // Only current, transfer-ready opportunities count as "live" — anything with
    // a stale (off-market) quote is not actionable regardless of its status.
    const live = opps.filter((o) => o.transferStatus === 'READY' && o.dataAgeMs <= config.staleMaxMs);
    let bestPct: number | null = null;
    let bestUsd: number | null = null;
    for (const o of live) {
      if (bestPct === null || o.netProfitPct > bestPct) {
        bestPct = o.netProfitPct;
        bestUsd = o.netProfitUsd;
      }
    }
    let totalMarkets = 0;
    for (const ex of tickerService.getExchanges()) totalMarkets += tickerService.marketsCount(ex);
    const active = tickerService.getExchanges().filter((ex) => {
      const s = tickerService.lastUpdate(ex);
      return s !== undefined && Date.now() - s < config.tickerPollMs * 4;
    }).length;

    let dataLatencyMs = 0;
    let count = 0;
    for (const ex of tickerService.getExchanges()) {
      const lu = tickerService.lastUpdate(ex);
      if (lu !== undefined && lu > 0) {
        dataLatencyMs += Date.now() - lu;
        count += 1;
      }
    }
    if (count) dataLatencyMs = Math.round(dataLatencyMs / count);

    return {
      liveOpportunities: live.length,
      bestNetProfitPct: bestPct !== null ? Number(bestPct.toFixed(3)) : null,
      bestNetProfitUsd: bestUsd !== null ? Number(bestUsd.toFixed(2)) : null,
      totalMarkets,
      activeExchanges: active,
      lastScan: this.lastScan,
      dataLatencyMs,
      demoMode: config.demoMode,
    };
  }

  private async scanLoop(): Promise<void> {
    while (true) {
      const started = Date.now();
      try {
        await this.scanOnce();
      } catch (err) {
        logger.error(undefined, 'ENGINE', 'scan failed', err);
      }
      this.lastScan = Date.now();
      const elapsed = Date.now() - started;
      const wait = Math.max(2000, config.scanIntervalMs - elapsed);
      await sleep(wait);
    }
  }

  private async scanOnce(): Promise<void> {
    const intersecting = tickerService.getIntersectingSymbols();
    const now = Date.now();

    const candidates: { canonical: string; buy: string; sell: string; screen: number }[] = [];

    for (const { canonical } of intersecting) {
      const tickers = tickerService.getByCanonical(canonical);
      if (canonical === 'ERG/USDT' || canonical === 'ICP/USDT' || canonical === 'VELO/USDT' || canonical === 'HEART/USDT' || canonical === 'GAIB/USDT') {
        logger.info(undefined, 'DBG', `[TRACE] ${canonical}: intersecting, ${tickers.length} tickers, exchanges=[${tickers.map((t) => t.exchange).join(',')}] bids=[${tickers.map((t) => t.bid).join(',')}] asks=[${tickers.map((t) => t.ask).join(',')}]`);
      }
      if (tickers.length < 2) continue;
      const withQuote = tickers.filter((t) => t.bid && t.ask);
      if (canonical === 'ERG/USDT' || canonical === 'ICP/USDT' || canonical === 'VELO/USDT' || canonical === 'HEART/USDT' || canonical === 'GAIB/USDT') {
        logger.info(undefined, 'DBG', `[TRACE] ${canonical}: withQuote=${withQuote.length} exchanges=[${withQuote.map((t) => t.exchange).join(',')}]`);
      }
      if (withQuote.length < 2) continue;

      // Anti-fake-spread guard: some dead markets quote absurd prices (e.g.
      // Poloniex TOKAMAK $2.20 while the real price is $0.26). We protect against
      // these with a PRICE sanity filter rather than a volume>0 gate — the
      // volume gate wrongly drops healthy tokens whose 24h volume is reported as
      // undefined by the bulk ticker (e.g. FEG, DOS, FTL). Only quotes that
      // deviate wildly from the group's median mid (an absurd ~8x outlier) are
      // dropped; legitimate edges (a few % off median) are kept and scanned.
      const mids = withQuote.map((t) => (Number(t.ask) + Number(t.bid)) / 2).filter((n) => Number.isFinite(n) && n > 0);
      const median = medianOf(mids);
      const traded = withQuote.filter((t) => {
        const ask = Number(t.ask);
        const bid = Number(t.bid);
        if (!ask || !bid) return false;
        if (!Number.isFinite(median) || median <= 0) return true;
        const mid = (ask + bid) / 2;
        const ratio = Math.max(mid / median, median / mid);
        // A healthy cross-exchange edge is a few % around the median. Beyond ~3x
        // the quote is a stale/dead market (e.g. a single good bid then fantasy
        // prices) that would flood the scan with unexecutable pairs. Dropping
        // them early keeps the candidate set small enough that the whole
        // universe is covered within the retention window.
        return ratio < 3;
      });
      if (traded.length < 2) continue;
      if (canonical === 'ERG/USDT' || canonical === 'ICP/USDT' || canonical === 'VELO/USDT' || canonical === 'HEART/USDT' || canonical === 'GAIB/USDT') {
        logger.info(undefined, 'DBG', `[TRACE] ${canonical}: traded=${traded.length} exchanges=[${traded.map((t) => t.exchange).join(',')}] median=${median}`);
      }

      // Collect EVERY viable buy-LOW / sell-HIGH pair for this token across the
      // exchanges that quote it, so one token can produce MULTIPLE opportunity
      // rows — each with its own buy/sell exchange, price edge and liquidity.
      // The user then sees every market that pays less and every market that
      // pays more, instead of only the single largest pair.
      const pairs: { buy: string; sell: string; screen: number }[] = [];
      for (const buy of traded) {
        for (const sell of traded) {
          if (buy.exchange === sell.exchange) continue;
          const ask = Number(buy.ask);
          const bid = Number(sell.bid);
          if (!ask || !bid) continue;
          const screen = ((bid - ask) / ask) * 100;
          pairs.push({ buy: buy.exchange, sell: sell.exchange, screen });
        }
      }
      pairs.sort((a, b) => b.screen - a.screen);
      // Keep the best MAX_PAIRS_PER_TOKEN routes per token so the table stays
      // readable while still surfacing many distinct buy/sell opportunities and
      // their liquidity pools.
      const keep = Math.min(pairs.length, config.maxPairsPerToken);
      if (canonical === 'ERG/USDT' || canonical === 'ICP/USDT' || canonical === 'VELO/USDT' || canonical === 'HEART/USDT' || canonical === 'GAIB/USDT') {
        logger.info(undefined, 'DBG', `[TRACE] ${canonical}: pairs=${pairs.length} top3=${pairs.slice(0,3).map((p) => p.buy + '->' + p.sell + ' ' + p.screen.toFixed(2) + '%').join(' | ')}`);
      }
      for (let i = 0; i < keep; i++) {
        const p = pairs[i];
        if (p.screen > this.screenFloor() && p.screen <= 25) {
          candidates.push({ canonical, buy: p.buy, sell: p.sell, screen: p.screen });
        }
      }
    }

    // Prioritize the largest spreads. The per-scan budget is a *batch*, not a
    // permanent cap: we always monitor the hottest candidates and rotate through
    // the entire tail, so every candidate in the universe is evaluated over time
    // and nothing is silently dropped, regardless of total market count.
    candidates.sort((a, b) => b.screen - a.screen);
    const selected = this.selectCandidateWindow(candidates);

    // Keep the most promising symbols streamed over WebSocket.
    this.updateWsSymbols(selected.map((c) => c.canonical));

    const opps: Opportunity[] = [];
    // Bound concurrent evaluation so per-exchange HTTP limiters are shared
    // fairly between the scanner and the (independent) ticker polls. Without
    // this cap, ~2×budget order-book fetches per cycle starve ticker polling
    // and exchanges silently age out of the ACTIVE list.
    const results = new Array<PromiseSettledResult<Opportunity | null>>(selected.length);
    let cursor = 0;
    const workers = Math.min(selected.length, Math.max(8, Math.floor(config.maxCandidatesPerScan / 8)));
    const worker = async (): Promise<void> => {
      while (cursor < selected.length) {
        const i = cursor++;
        results[i] = await Promise.resolve(this.evaluate(selected[i], now)).then(
          (v) => ({ status: 'fulfilled' as const, value: v }),
          (e) => ({ status: 'rejected' as const, reason: e }),
        );
      }
    };
    await Promise.all(Array.from({ length: workers }, worker));
    for (let i = 0; i < results.length; i++) {
      const res = results[i];
      if (res.status === 'fulfilled' && res.value) opps.push(res.value);
    }

    for (const opp of opps) {
      // Sticky protection: a stored row that is READY + profitable resists
      // being overwritten by a transiently degraded snapshot (stale book,
      // metadata blip). The degraded result must repeat stickyMaxStrikes
      // consecutive times (or the grace period must lapse) before it wins.
      // A genuinely closed edge (gross < minProfitPct) is accepted at once.
      const existing = this.store.get(opp.id);
      if (
        existing &&
        isResilientRow(existing, now, config.stickyGraceMs, config.minProfitPct) &&
        isDegradedNext(existing, opp, config.minProfitPct, config.staleMaxMs)
      ) {
        const strikes = (this.degradedStrikes.get(opp.id) ?? 0) + 1;
        this.degradedStrikes.set(opp.id, strikes);
        if (strikes < config.stickyMaxStrikes) continue;
      }
      this.degradedStrikes.delete(opp.id);
      this.store.set(opp);
    }
    this.store.prune(config.opportunityRetentionMs);
    this.pruneExpired(now);
    this.lastScan = now;
    logger.info(undefined, 'ENGINE', `scanned ${selected.length}/${candidates.length} candidates this cycle, ${opps.length} stored`, { status: 'SUCCESS' });
  }

  /**
   * Full-coverage candidate selection. Instead of always monopolising the batch
   * with the largest spreads, we FAIRLY rotate through the whole universe by
   * (re)evaluating first the candidates that have been waiting longest. Stored
   * opportunities survive across several cycles thanks to the retention window,
   * so even a small spread (>= minProfitPct) is picked, evaluated and shown
   * once its turn arrives — no token is ever silently starved out of the scan.
   */
  private selectCandidateWindow(
    candidates: { canonical: string; buy: string; sell: string; screen: number }[],
  ): { canonical: string; buy: string; sell: string; screen: number }[] {
    const budget = Math.max(1, Math.floor(config.maxCandidatesPerScan));
    if (candidates.length <= budget) return candidates;
    const tick = this.scanTick;
    const scored = candidates.map((c) => {
      const key = `${c.canonical}|${c.buy}->${c.sell}`;
      const last = this.lastSelectTick.get(key) ?? 0;
      // The longer a candidate has been waiting, the higher its priority so we
      // guarantee every token is revisited within the retention window. Ties are
      // broken by spread (hottest first) so edge quality still leads.
      return { c, key, age: tick - last };
    });
    scored.sort((a, b) => b.age - a.age || b.c.screen - a.c.screen);
    const selected = scored.slice(0, budget).map((s) => {
      this.lastSelectTick.set(s.key, tick);
      return s.c;
    });
    this.scanTick += 1;
    return selected;
  }

  /**
   * Resolves withdrawal/deposit network metadata for an asset on an exchange,
   * preferring LIVE exchange data (contracts, chains, fees, deposit/withdraw
   * status) over the static DEFAULT fallback. Returns null when the
   * information is genuinely unavailable (→ UNKNOWN).
   */
  private async resolveExchangeNetworks(exchangeId: string, asset: string): Promise<NetworkDescriptor[] | null> {
    await liveMetadataService.ensure(exchangeId, asset);
    const adapter = getAdapter(exchangeId);
    const live = adapter?.getNetworkInfo?.(asset);
    if (live && live.length > 0) return live.map((n) => ({ ...n }));
    return networkService.getNetworks(exchangeId, asset);
  }

  private pruneExpired(now: number): void {
    for (const opp of this.store.getAll()) {
      if (now - opp.lastUpdatedAt > config.opportunityRetentionMs * 0.95 && opp.transferStatus !== 'EXPIRED') {
        this.store.set({ ...opp, transferStatus: 'EXPIRED' });
      }
      if (now - opp.lastUpdatedAt > config.opportunityRetentionMs) {
        this.store.remove(opp.id);
      }
    }
  }

  private updateWsSymbols(canonicals: string[]): void {
    if (!this.ws) return;
    const top = canonicals.slice(0, 50);
    for (const ex of ['binance', 'bybit', 'okx']) {
      const symbols = top
        .map((c) => {
          const t = tickerService.getByCanonical(c).find((x) => x.exchange === ex);
          return t?.exchangeSymbol;
        })
        .filter((s): s is string => Boolean(s));
      if (symbols.length) this.ws.updateSymbols(ex, symbols);
    }
  }

  private screenFloor(): number {
    // The scanner's whole point is to buy LOW and sell HIGH: every candidate is
    // selected only when the spread (sell bid - buy ask) is strictly positive,
    // i.e. the buy ticker is cheaper than the sell ticker. We NEVER evaluate or
    // display a pair where we'd buy expensive and sell cheap (negative gross
    // spread). The screen floor is therefore ZERO (any pair with bid <= ask is
    // a no-trade and skipped entirely). The per-scan batch budget + tail
    // rotation keeps the load bounded while still covering the full universe.
    return 0;
  }

  private async evaluate(
    candidate: { canonical: string; buy: string; sell: string },
    now: number,
  ): Promise<Opportunity | null> {
    const { canonical, buy, sell } = candidate;
    if (['ERG/USDT','ICP/USDT','VELO/USDT','HEART/USDT','GAIB/USDT'].includes(canonical)) {
      logger.info(undefined, 'DBG', `[EVAL] ${canonical} ${buy}->${sell} called at tick ${this.scanTick}`);
    }
    const base = canonical.split('/')[0];
    const quote = canonical.split('/')[1];

    const canonTick = tickerService.getByCanonical(canonical);
    const buyT = canonTick.find((t) => t.exchange === buy);
    const sellT = canonTick.find((t) => t.exchange === sell);
    if (!buyT || !sellT) return null;

    let buyBook;
    let sellBook;
    try {
      [buyBook, sellBook] = await Promise.all([
        orderBookService.get(buy, buyT.exchangeSymbol),
        orderBookService.get(sell, sellT.exchangeSymbol),
      ]);
    } catch (err) {
      logger.debug(buy, 'ENGINE', `order book fetch failed for ${canonical}`, { error: String(err) });
      return null;
    }

    const buyFee = feeService.getFee(buy);
    const sellFee = feeService.getFee(sell);

    // Network resolution precedence:
    //   1. LIVE exchange metadata (withdrawal/deposit networks, fees, contracts)
    //      fetched from public exchange APIs (Gate, Bitget, HTX, Poloniex,
    //      KuCoin, …). This is the PRIMARY source.
    //   2. Static DEFAULT fallback for safe, unambiguous asset mappings.
    //   3. null → reported as UNKNOWN below. We NEVER invent a network and NEVER
    //      convert an unknown withdrawal fee into $0.00. An UNKNOWN network does
    //      not stop the market from being scanned and its raw spread evaluated.
    const [buyNetworks, sellNetworks] = await Promise.all([
      this.resolveExchangeNetworks(buy, base),
      this.resolveExchangeNetworks(sell, base),
    ]);
    // Asset identity is verified via contract-address match or a common
    // canonical network (exchange-native identifiers/chain metadata), NOT by
    // "staticNetworks knows the ticker". A listing is only verified when both
    // exchanges provably refer to the same underlying asset. The status is a
    // tri-state: 'unverified' (positive conflict) blocks; 'unknown' (no
    // evidence either way) does NOT — the pair is still evaluated and shown.
    const assetIdentity = verifyAssetIdentity(buy, sell, base, buyNetworks, sellNetworks);
    const assetVerified = assetIdentity === 'verified';

    const topAsk = num(buyBook.asks[0]?.price ?? 0);
    const sellTopBid = num(sellBook.bids[0]?.price ?? 0);
    const buyContractAddress = contractFor(buyNetworks, buy, base);
    const sellContractAddress = contractFor(sellNetworks, sell, base);

    const netMatch = matchNetworks({
      from: buyNetworks ?? [],
      to: sellNetworks ?? [],
      price: topAsk || undefined,
    });
    const rec = netMatch.recommended;
    const matchedNetworks = netMatch.matched;
    // Freshness stamp for the network/withdrawal-fee data behind this row:
    // LIVE metadata is timestamped by the metadata service's last refresh;
    // curated DEFAULT data has no age (it is a maintained table, not a fetch).
    const networkUpdatedAt =
      rec?.source === 'live'
        ? (liveMetadataService.lastUpdated(buy) ?? liveMetadataService.lastUpdated(sell) ?? now)
        : undefined;

    // A withdrawal fee is only "known" when the source genuinely provides it.
    // Do NOT default a missing/unknown/null fee to 0.
    const withdrawalFeeKnown =
      matchedNetworks.length > 0 &&
      rec !== undefined &&
      rec.withdrawalFee !== undefined &&
      rec.withdrawalFee !== null &&
      rec.withdrawalFee.trim() !== '' &&
      Number.isFinite(Number(rec.withdrawalFee));

    // Simulate at the user's configured capital first so we know the maximum
    // deployable amount from BOTH books. For very illiquid tokens (e.g. FEG)
    // the $100 default capital far exceeds what the book can absorb, which would
    // otherwise produce a misleading net of ~-98% (money that was never actually
    // deployed). When the configured capital cannot be fully executed, we
    // re-simulate on the real executable capital so the net profit honestly
    // reflects the amount that CAN be traded.
    const simFull = simulateArbitrage({
      capital: this.state.capital,
      asks: buyBook.asks,
      bids: sellBook.bids,
      buyFeeRate: buyFee.taker,
      sellFeeRate: sellFee.taker,
      withdrawalFeeAsset: withdrawalFeeKnown ? rec?.withdrawalFee : undefined,
      withdrawalFeeKnown,
      minWithdrawal: rec?.minWithdrawal,
    });

    const executableCapital = Decimal.min(this.state.capital, simFull.maxExecutableCapital);
    const sim =
      executableCapital.lt(this.state.capital)
        ? simulateArbitrage({
            capital: executableCapital,
            asks: buyBook.asks,
            bids: sellBook.bids,
            buyFeeRate: buyFee.taker,
            sellFeeRate: sellFee.taker,
            withdrawalFeeAsset: withdrawalFeeKnown ? rec?.withdrawalFee : undefined,
            withdrawalFeeKnown,
            minWithdrawal: rec?.minWithdrawal,
          })
        : simFull;

    // Data freshness must reflect the time the EXCHANGE says its quote is from —
    // not just when we fetched it. LATOKEN serves cached quotes that can be
    // hours old, so including the exchange-reported ticker timestamps lets the
    // existing freshness rules downgrade stale quotes to LOW/EXPIRED.
    const dataAgeMs = Math.max(0, now - Math.min(buyBook.ts, sellBook.ts, buyT.ts, sellT.ts));

        // Quote sanity vs. the cross-exchange median: grossly off-market quotes
    // (stale/partial books, mis-scaled listings) lower confidence — this makes
    // LATOKEN-style phantoms surface as LOW, not HIGH/READY.
    // IMPORTANT: exclude the buy/sell exchanges themselves from the median so
    // that a stale price on the buy or sell side doesn't skew the baseline.
    // The median is computed from all OTHER exchanges, so a deviant buy or sell
    // price will properly stand out against the "clean" external median.
    const medianMid = (() => {
      const mids = canonTick
        .filter((q) => q.exchange !== buy && q.exchange !== sell)
        .map((q) => (Number(q.bid) + Number(q.ask)) / 2)
        .filter((v) => Number.isFinite(v) && v > 0);
      return mids.length >= 3 ? medianOf(mids) : undefined;
    })();
    const offMarket =
      medianMid !== undefined && midMarketSuspicious(topAsk, sellTopBid, medianMid);
    const transferStatus = computeTransferStatus({
      networkStatus: netMatch.status,
      assetStatus: assetIdentity,
      withdrawalFeeKnown,
      executable: sim.executable,
      executableFlag: sim.executableFlag,
    });
    const statusDetail = transferStatusDetail({
      networkStatus: netMatch.status,
      assetStatus: assetIdentity,
      withdrawalFeeKnown,
      fromNetworks: buyNetworks,
      toNetworks: sellNetworks,
      recommended: rec,
      buy,
      sell,
    });

    const liquidityOk = sim.maxExecutableCapital.gte(this.state.capital);
    const confidence = computeConfidence({
      dataAgeMs,
      networkStatus: netMatch.status,
      assetVerified,
      buyFeeSource: buyFee.source,
      sellFeeSource: sellFee.source,
      slippagePct: num(sim.slippagePct),
      executable: sim.executable,
      liquidityOk,
      withdrawalFeeKnown,
      freshMaxMs: config.freshMaxMs,
      staleMaxMs: config.staleMaxMs,
      offMarket,
    });

    const id = `${buy}->${sell}:${canonical}`;
    const existing = this.store.get(id);

    const opportunity: Opportunity = {
      id,
      symbol: canonical,
      base,
      quote,
      buyExchange: buy,
      sellExchange: sell,
      buyPrice: topAsk,
      sellPrice: sellTopBid,
      buyTopAsk: topAsk,
      sellTopBid,
      grossSpreadPct: num(sim.grossSpreadPct),
      effectiveSpreadPct: num(sim.effectiveSpreadPct),
      buyFeePct: buyFee.taker * 100,
      sellFeePct: sellFee.taker * 100,
      buyFeeSource: buyFee.source,
      sellFeeSource: sellFee.source,
      network: rec?.id,
      networkChain: rec?.chain,
      networkMatch: netMatch.status === 'ok' ? 'yes' : netMatch.status === 'unknown' ? 'unknown' : 'no',
      matchedNetworks,
      withdrawalFeeAsset: withdrawalFeeKnown ? rec?.withdrawalFee : undefined,
      withdrawalFeeUsd: num(sim.withdrawalFeeUsd),
      withdrawalFeeKnown,
      depositStatus: rec?.depositEnabled ?? 'unknown',
      withdrawalStatus: rec?.withdrawalEnabled ?? 'unknown',
      buyLiquidityUsd: num(sim.buyLiquidityUsd),
      sellLiquidityUsd: num(sim.sellLiquidityUsd),
      slippageUsd: num(sim.slippageUsd),
      slippagePct: num(sim.slippagePct),
      capital: this.state.capital,
      finalValue: num(sim.finalCapital),
      netProfitUsd: num(sim.netProfitUsd),
      netProfitPct: num(sim.netProfitPct),
      transferStatus,
      transferStatusDetail: statusDetail,
      transferTimeEstimate: transferTimeEstimate(rec?.id),
      networkUpdatedAt,
      minOrderAmount: parseMinAmount(rec),
      dataAgeMs,
      confidence: confidence.level,
      confidenceReasons: confidence.reasons,
      lastUpdatedAt: now,
      createdAt: existing?.createdAt ?? now,
      assetVerified,
      buyContractAddress,
      sellContractAddress,
      maxExecutable: num(sim.maxExecutableCapital),
      avgBuyPrice: num(sim.avgBuyPrice),
      avgSellPrice: num(sim.avgSellPrice),
      breakdown: sim.breakdown.map((b: OpportunityBreakdownItem) => ({ ...b })),
    };

    return opportunity;
  }

  async getOpportunities(): Promise<Opportunity[]> {
    const f = this.state.filters;
    const search = this.state.search.trim().toLowerCase();
    const buyFilter = this.state.buyExchanges;
    const sellFilter = this.state.sellExchanges;

    let list = this.store.getAll();
    const filteredReasons = new Map<string, string[]>();
    list = list.filter((o) => {
      const why: string[] = [];
      const add = (r: string) => why.push(r);
      if (buyFilter && !buyFilter.includes(o.buyExchange)) add(`buy-exchange not in ${buyFilter.join(',')}`);
      if (sellFilter && !sellFilter.includes(o.sellExchange)) add(`sell-exchange not in ${sellFilter.join(',')}`);
      if (
        search &&
        !(o.symbol.toLowerCase().includes(search) || o.base.toLowerCase().includes(search) || o.buyExchange.toLowerCase().includes(search) || o.sellExchange.toLowerCase().includes(search))
      ) {
        add(`search "${search}" no match`);
      }
      if (o.transferStatus === 'EXPIRED') add('EXPIRED');
      if (o.transferStatus === 'NO COMMON NETWORK') add('NO COMMON NETWORK');
      // Hard staleness: quotes up to `staleMaxMs` (default 15s) still show as
      // LOW/AGING, but anything older than 4x that is not an opportunity at all
      // (LATOKEN has cached quotes hours old) — drop it instead of surfacing a
      // phantom in the UI.
      if (o.dataAgeMs > config.staleMaxMs * 4) add(`data stale ${(o.dataAgeMs / 1000).toFixed(0)}s`);
      // HARD RULE: the scanner only surfaces buy-LOW / sell-HIGH routes. Any
      // row where the buy price is not strictly below the sell price (or the
      // gross spread isn't positive) is a no-trade and is filtered out in every
      // view mode — we never buy expensive to sell cheap.
      if (!(o.sellPrice > o.buyPrice)) add('sell price not above buy price (no edge)');
      if (!(o.grossSpreadPct > 0)) add('no positive gross spread');
      // Display floor: only show routes with a meaningful GROSS edge (>= 0.10%),
      // the real exploitable differential between the best buy ask and best sell
      // bid. Hard rule in all modes. This mirrors how the official scanner ranks
      // every market — a coin with a real spread >= 0.10% is always surfaced even
      // when deep-book/fee simulation makes the net look negative.
      if (o.grossSpreadPct < config.minProfitPct) add(`gross ${o.grossSpreadPct.toFixed(3)}% < min display ${config.minProfitPct}%`);
      // Net profit is an honest informational column (not a hard gate) in
      // "show all" mode, so real edge is never hidden. Only the explicit
      // "profitable-only" view (showAll=false) requires a positive net, along
      // with the user's min-profit / min-liquidity thresholds.
      if (!f.showAll && f.minProfitPct > 0 && o.netProfitPct < f.minProfitPct) add(`net ${o.netProfitPct.toFixed(3)}% < min ${f.minProfitPct}%`);
      if (!f.showAll && f.minProfitUsd > 0 && o.netProfitUsd < f.minProfitUsd) add(`net $${o.netProfitUsd.toFixed(2)} < min $${f.minProfitUsd}`);
      // The dashboard's Min Profit, Max Slippage and Min Liquidity sliders are
      // hard, always-on filters regardless of view mode — when the user raises
      // them the rows must disappear immediately.
      if (o.grossSpreadPct < f.minProfitPct) add(`gross ${o.grossSpreadPct.toFixed(3)}% < min profit ${f.minProfitPct}%`);
      if (o.netProfitPct < f.minProfitPct) add(`net ${o.netProfitPct.toFixed(3)}% < min profit ${f.minProfitPct}%`);
      if (o.slippagePct > f.maxSlippagePct) add(`slippage ${o.slippagePct.toFixed(2)}% > ${f.maxSlippagePct}%`);
      if (f.minLiquidityUsd > 0 && Math.max(o.buyLiquidityUsd, o.sellLiquidityUsd) < f.minLiquidityUsd) add('below min liquidity');
      if (o.confidence === 'LOW' && f.minConfidence === 'MEDIUM') add('confidence LOW < MEDIUM');
      if (o.confidence !== 'HIGH' && f.minConfidence === 'HIGH') add('confidence not HIGH');
      if (f.onlyVerifiedNetworks && o.networkMatch !== 'yes') add('network unverified');
      if (f.onlyVerifiedAssets && !o.assetVerified) add('asset unverified');
      if (!f.showAll && o.transferStatus !== 'READY') add(`profitable-only requires READY (got ${o.transferStatus})`);
      // HARD RULE (every view mode): a route whose recommended network has its
      // withdrawal (buy side) or deposit (sell side) SUSPENDED/closed — or whose
      // every common route is blocked — can never complete today. Block those
             // coins from the scanner entirely.
      // HARD BLOCK: coins with suspended deposits or withdrawals are ALWAYS
      // removed from the opportunity list, regardless of showAll setting.
      const suspended: string[] = [];
      if (o.depositStatus === 'closed') suspended.push('deposit suspended on sell exchange');
      if (o.withdrawalStatus === 'closed') suspended.push('withdrawal suspended on buy exchange');
      if (suspended.length) {
        filteredReasons.set(o.symbol, suspended);
        return false;
      }
      // soft flags (only hidden when showAll=false)
      if (o.transferStatus === 'TRANSFER BLOCKED') add('every transfer route blocked');
      if (why.length) filteredReasons.set(o.symbol, Array.from(new Set(why)));
      return why.length === 0;
    });

    if (filteredReasons.size && list.length < this.store.size()) {
      for (const [sym, reasons] of filteredReasons) logger.debug(undefined, 'ENGINE', `filtered out ${sym}`, { error: reasons.join('; ') });
    }

    list.sort((a, b) => b.netProfitPct - a.netProfitPct);
    return list;
  }

  private async demoLoop(): Promise<void> {
    let counter = 0;
    while (true) {
      const now = Date.now();
      const demo = demoOpportunities(this.state.capital, now, counter);
      counter += 1;
      for (const opp of demo) this.store.set(opp);
      this.lastScan = now;
      await sleep(config.scanIntervalMs);
    }
  }
}

function demoOpportunities(capital: number, now: number, n: number): Opportunity[] {
  const templates: Omit<Opportunity, 'id' | 'createdAt' | 'lastUpdatedAt'>[] = [
    {
      symbol: 'GLM/USDT', base: 'GLM', quote: 'USDT',
      buyExchange: 'gate', sellExchange: 'mexc',
      buyPrice: 0.1234, sellPrice: 0.1264, buyTopAsk: 0.1234, sellTopBid: 0.1264,
      grossSpreadPct: 2.43, effectiveSpreadPct: 1.9,
      buyFeePct: 0.1, sellFeePct: 0.1, buyFeeSource: 'fallback', sellFeeSource: 'fallback',
      network: 'ERC20', networkChain: 'Ethereum', networkMatch: 'yes',
      withdrawalFeeAsset: '1', withdrawalFeeUsd: 0.12, withdrawalFeeKnown: true,
      depositStatus: 'open', withdrawalStatus: 'open',
      buyLiquidityUsd: 850, sellLiquidityUsd: 900,
      slippageUsd: 0.31, slippagePct: 0.31,
      capital, finalValue: capital * 1.012, netProfitUsd: capital * 0.012, netProfitPct: 1.2,
      transferStatus: 'READY', transferTimeEstimate: '~2–5 min',
      dataAgeMs: 1200, confidence: 'HIGH',
      confidenceReasons: ['DEMO DATA', 'Fresh price data', 'Compatible network found'],
      assetVerified: true, maxExecutable: 850,
      avgBuyPrice: 0.1235, avgSellPrice: 0.1262,
      breakdown: demoBreakdown(capital),
    },
  ];
  return templates.map((t, i) => ({
    ...t,
    id: `demo-${n}-${i}`,
    createdAt: now,
    lastUpdatedAt: now,
  }));
}

function demoBreakdown(capital: number): OpportunityBreakdownItem[] {
  return [
    { label: 'START', usd: `$${capital.toFixed(2)}` },
    { label: 'BUY', usd: `-$${capital.toFixed(2)}` },
    { label: 'BUY FEE', usd: `-$${(capital * 0.001).toFixed(2)}` },
    { label: 'WITHDRAWAL', usd: `-$${0.12.toFixed(2)}` },
    { label: 'SLIPPAGE', usd: `-$${(capital * 0.0031).toFixed(2)}` },
    { label: 'SELL FEE', usd: `-$${(capital * 0.001).toFixed(2)}` },
    { label: 'FINAL VALUE', usd: `$${(capital * 1.012).toFixed(2)}` },
    { label: 'NET PROFIT', usd: `+$${(capital * 0.012).toFixed(2)}` },
  ];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function medianOf(values: number[]): number {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export const engine = new ArbitrageEngine();
