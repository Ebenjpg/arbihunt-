import type { KpiSnapshot } from '@arbihunt/shared';
import { fmtPct, fmtSigned, fmtAge, fmtCompact } from '../utils/format';

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="card p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={'mt-1 text-lg font-bold sm:text-2xl ' + (accent ? 'text-accent' : 'text-slate-100')}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function KpiCards({ kpis, demoMode }: { kpis: KpiSnapshot | null; demoMode: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <KpiCard
        label="Live Opportunities"
        value={kpis ? String(kpis.liveOpportunities) : '—'}
        sub={demoMode ? 'DEMO DATA' : undefined}
        accent
      />
      <KpiCard
        label="Best Net Profit"
        value={kpis?.bestNetProfitPct != null ? fmtPct(kpis.bestNetProfitPct) : '—'}
        sub={kpis?.bestNetProfitUsd != null ? `${fmtSigned(kpis.bestNetProfitUsd)}` : undefined}
      />
      <KpiCard label="Total Markets" value={kpis ? fmtCompact(kpis.totalMarkets) : '—'} sub="across all exchanges" />
      <KpiCard label="Active Exchanges" value={kpis ? String(kpis.activeExchanges) : '—'} sub="delivering data" />
      <KpiCard label="Last Scan" value={kpis?.lastScan ? fmtAge(Date.now() - kpis.lastScan) + ' ago' : '—'} />
      <KpiCard
        label="Data Latency"
        value={kpis ? `${(kpis.dataLatencyMs / 1000).toFixed(1)}s` : '—'}
        sub={kpis && kpis.dataLatencyMs < 15000 ? 'LIVE' : undefined}
      />
    </div>
  );
}