import { useEffect, useMemo, useState } from 'react';
import type { Opportunity, ScannerConfig } from '../types';
import type { SortKey } from '../components/OpportunityTable';
import { api } from '../services/api';
import { usePolling } from '../hooks/usePolling';
import { KpiCards } from '../components/KpiCards';
import { Filters } from '../components/Filters';
import { CapitalSelector } from '../components/CapitalSelector';
import { OpportunityTable } from '../components/OpportunityTable';
import { DetailPanel } from '../components/DetailPanel';

const EXCHANGE_OPTIONS = ['binance', 'bybit', 'okx', 'kucoin', 'gate', 'mexc', 'bitget', 'htx', 'cryptocom', 'bitfinex', 'poloniex', 'bitmart', 'whitebit', 'hitbtc', 'phemex', 'ascendex', 'bingx', 'coinex', 'digifinex', 'bitrue', 'lbank', 'xt', 'latoken', 'btse', 'toobit'];

export function Dashboard({ config, onConfig, freshMaxMs, staleMaxMs }: {
  config: ScannerConfig | null;
  onConfig: (patch: Parameters<typeof api.setConfig>[0]) => void;
  freshMaxMs: number;
  staleMaxMs: number;
}) {
  const kpis = usePolling(() => api.kpis(), 4000).data;
  const opps = usePolling(() => api.opportunities(), 4000);
  const [selected, setSelected] = useState<Opportunity | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('netProfitPct');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [buyEx, setBuyEx] = useState<string>('all');
  const [sellEx, setSellEx] = useState<string>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => onConfig({ search }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    onConfig({ buyExchanges: buyEx === 'all' ? null : [buyEx] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyEx]);
  useEffect(() => {
    onConfig({ sellExchanges: sellEx === 'all' ? null : [sellEx] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellEx]);

  const sorted = useMemo(() => {
    const list = [...(opps.data ?? [])];
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => dir * ((a[sortKey] as number) - (b[sortKey] as number)));
    return list;
  }, [opps.data, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const selectClass = 'rounded border border-edge bg-panel2 px-2 py-1 text-xs text-slate-300';
  return (
    <div className="flex flex-col gap-4">
      <KpiCards kpis={kpis} demoMode={!!config?.demoMode} />

      <div className="card flex flex-col gap-3 p-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Capital</span>
          <CapitalSelector
            capital={config?.capital ?? 100}
            onChange={(c) => onConfig({ capital: c })}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase text-muted">Buy</span>
          <select value={buyEx} onChange={(e) => setBuyEx(e.target.value)} className={selectClass}>
            <option value="all">All exchanges</option>
            {EXCHANGE_OPTIONS.map((e) => (
              <option key={e} value={e} className="capitalize">{e}</option>
            ))}
          </select>
          <span className="text-[11px] uppercase text-muted">Sell</span>
          <select value={sellEx} onChange={(e) => setSellEx(e.target.value)} className={selectClass}>
            <option value="all">All exchanges</option>
            {EXCHANGE_OPTIONS.map((e) => (
              <option key={e} value={e} className="capitalize">{e}</option>
            ))}
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search token / exchange…"
            className="w-44 rounded border border-edge bg-panel2 px-2 py-1 text-xs text-slate-300 outline-none focus:border-accent/60"
          />
        </div>
      </div>

      {config && <Filters config={config} onChange={(f) => onConfig({ filters: f })} />}

      <OpportunityTable
        opportunities={sorted}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        onSelect={(o) => setSelected(o)}
        selectedId={selected?.id}
        freshMaxMs={freshMaxMs}
        staleMaxMs={staleMaxMs}
      />

      <p className="px-1 text-[11px] text-muted">
        Arbitrage opportunities are estimates based on live market data. Prices, fees, liquidity and transfer availability can change
        rapidly. Net profit is not guaranteed. This tool is read-only — it never places trades, transfers or withdraws funds.
      </p>

      {config?.demoMode && (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-400">
          DEMO MODE — displayed opportunities are DEMO DATA, not live market data.
        </div>
      )}

      {selected && <DetailPanel opp={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}