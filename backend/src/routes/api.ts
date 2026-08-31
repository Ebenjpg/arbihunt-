import type { FastifyInstance } from 'fastify';
import type { ExchangeStatus, CalculatorRequest } from '@arbihunt/shared';
import { calculateSimple, toDec, num } from '@arbihunt/shared';
import { config } from '../config';
import { engine } from '../arbitrage/engine';
import { getAdapters, getAdapter } from '../exchanges/registry';
import { tickerService } from '../market-data/tickerService';
import { networkService } from '../networks/networkService';
import { liveMetadataService } from '../networks/liveMetadataService';

export function registerRoutes(app: FastifyInstance): void {
  app.get('/api/health', async () => ({
    ok: true,
    demoMode: config.demoMode,
    ts: Date.now(),
  }));

  app.get('/api/config', async () => ({
    backendPort: config.backendPort,
    demoMode: config.demoMode,
    minProfitPct: config.minProfitPct,
    capital: engine.state.capital,
    filters: engine.state.filters,
    buyExchanges: engine.state.buyExchanges,
    sellExchanges: engine.state.sellExchanges,
    search: engine.state.search,
    availableExchanges: getAdapters().map((a) => ({ id: a.id, name: a.name })),
  }));

  app.post<{ Body: Partial<{ capital: number; filters: Partial<EngineFilters>; buyExchanges: string[] | null; sellExchanges: string[] | null; search: string }> }>(
    '/api/config',
    async (req) => {
      const body = req.body || {};
      if (typeof body.capital === 'number' && body.capital > 0) {
        engine.state.capital = Math.min(100000, Math.max(10, body.capital));
      }
      if (body.filters) {
        engine.state.filters = { ...engine.state.filters, ...body.filters };
      }
      if (body.buyExchanges !== undefined) engine.state.buyExchanges = body.buyExchanges;
      if (body.sellExchanges !== undefined) engine.state.sellExchanges = body.sellExchanges;
      if (typeof body.search === 'string') engine.state.search = body.search;
      return { ok: true, state: engine.state };
    },
  );

  app.get('/api/opportunities', async () => engine.getOpportunities());
  app.get('/api/opportunities/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const opp = engine.store.get(id);
    if (!opp) {
      reply.code(404);
      return { error: 'not found' };
    }
    return opp;
  });

  app.get('/api/kpis', async () => engine.getKpis());

  app.get('/api/stats', async () => {
    const all = tickerService.getAll();
    const intersected = tickerService.getIntersectingSymbols();
    const totalMarkets = all.length;

    const marketsPerExchange: Record<string, number> = {};
    for (const t of all) marketsPerExchange[t.exchange] = (marketsPerExchange[t.exchange] ?? 0) + 1;

    const usdtMarkets = all.filter((t) => t.quote === 'USDT').length;

    const assets = new Set<string>();
    for (const t of all) assets.add(t.base);

    const resolveFor = (exchangeId: string, asset: string) => {
      const live = getAdapter(exchangeId)?.getNetworkInfo?.(asset);
      if (live && live.length > 0) return live;
      return networkService.getNetworks(exchangeId, asset);
    };
    let assetsHasVerified = 0;
    let assetsHasUnknown = 0;
    for (const asset of assets) {
      const any = [...getAdapters()].some((a) => resolveFor(a.id, asset) !== null);
      if (any) assetsHasVerified += 1;
      else assetsHasUnknown += 1;
    }

    const stored = engine.store.getAll();
    const verifiedStored = stored.filter((o) => o.assetVerified).length;
    const readyStored = stored.filter((o) => o.transferStatus === 'READY').length;

    return {
      totalMarkets,
      marketsPerExchange,
      usdtMarkets,
      distinctAssets: assets.size,
      crossExchangePairs: intersected.length,
      opportunities: stored.length,
      verifiedOpportunities: verifiedStored,
      readyOpportunities: readyStored,
      verifiedNetworkAssets: assetsHasVerified,
      unknownNetworkAssets: assetsHasUnknown,
      liveMetadataEnabled: config.liveMetadataEnabled,
      metadata: liveMetadataService.stats(),
    };
  });

  app.get('/api/metadata/status', async () => liveMetadataService.stats());

  app.get('/api/exchanges', async () => {
    const now = Date.now();
    const list: ExchangeStatus[] = [];
    for (const a of getAdapters()) {
      const s = a.getStatus();
      const lastUpdate = tickerService.lastUpdate(a.id);
      const markets = tickerService.marketsCount(a.id);
      let connection = s.connection;
      const freshWindow = config.tickerPollMs * 4;
      if (lastUpdate !== undefined && lastUpdate > 0) {
        const age = now - lastUpdate;
        // Compute connection truthfully from how recently we last heard back.
        if (age <= freshWindow) {
          connection = 'connected';
        } else if (age <= freshWindow * 2) {
          connection = 'error'; // actively reconnecting
        } else {
          connection = 'offline';
        }
      }
      list.push({
        ...s,
        connection,
        lastUpdate,
        lastUpdateAgeMs: lastUpdate !== undefined ? now - lastUpdate : undefined,
        markets,
      });
    }
    return list;
  });

  app.get('/api/markets', async (req) => {
    const query = req.query as { search?: string; limit?: string };
    const search = (query.search || '').toUpperCase().trim();
    const limit = Math.min(500, Number.parseInt(query.limit || '200', 10) || 200);
    const intersected = tickerService.getIntersectingSymbols();
    let list = intersected.map((i) => ({ symbol: i.canonical, exchanges: i.exchanges }));
    if (search) list = list.filter((m) => m.symbol.includes(search));
    list.sort((a, b) => b.exchanges.length - a.exchanges.length || a.symbol.localeCompare(b.symbol));
    return list.slice(0, limit);
  });

  app.post<{ Body: CalculatorRequest }>('/api/calculator', async (req) => {
    const body = req.body;
    const result = calculateSimple({
      capital: num(toDec(body.capital)),
      buyPrice: num(toDec(body.buyPrice)),
      sellPrice: num(toDec(body.sellPrice)),
      buyFeePct: num(toDec(body.buyFeePct)),
      sellFeePct: num(toDec(body.sellFeePct)),
      withdrawalFeeAsset: num(toDec(body.withdrawalFeeAsset)),
      slippagePct: num(toDec(body.slippagePct)),
    });
    return result;
  });
}

type EngineFilters = typeof engine.state.filters;
