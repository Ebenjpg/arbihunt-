import type { OpportunityBreakdownItem } from '@arbihunt/shared';

function parseSigned(s: string): number {
  const clean = s.replace(/[$,+]/g, '');
  const num = Number(clean);
  return s.trim().startsWith('-') ? -num : num;
}

export function TradeBreakdown({ items, netProfit }: { items: OpportunityBreakdownItem[]; netProfit?: number }) {
  const start = items.length ? Math.abs(parseSigned(items[0].usd)) : 1;
  return (
    <div className="space-y-1.5">
      {items.map((item, i) => {
        const value = parseSigned(item.usd);
        const pct = Math.max(3, Math.min(100, (Math.abs(value) / start) * 100));
        const isProfit = item.label === 'NET PROFIT' || item.label === 'FINAL VALUE';
        const isCost = item.label !== 'START' && !isProfit;
        return (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-24 shrink-0 text-muted">{item.label}</span>
            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/5">
              <div
                className={
                  'h-full rounded-full ' +
                  (item.label === 'START'
                    ? 'bg-slate-500'
                    : isCost
                      ? 'bg-rose-500/70'
                      : isProfit
                        ? 'bg-emerald-500/70'
                        : 'bg-accent/70')
                }
                style={{ width: `${pct}%` }}
              />
            </div>
            <span
              className={
                'mono w-24 shrink-0 text-right ' +
                (item.label === 'START' || item.label === 'FINAL VALUE'
                  ? 'text-slate-100'
                  : value < 0
                    ? 'text-rose-400'
                    : 'text-emerald-400')
              }
            >
              {item.usd}
            </span>
          </div>
        );
      })}
      {netProfit !== undefined && (
        <div className="flex items-center justify-between pt-1 text-xs">
          <span className="text-muted">NET RETURN</span>
          <span className={netProfit >= 0 ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
            {netProfit >= 0 ? '+' : ''}{netProfit.toFixed(2)} ({netProfit >= 0 ? '+' : ''}{(netProfit > 0 ? (netProfit / (start || 1)) * 100 : netProfit / (start || 1) * 100).toFixed(2)}%)
          </span>
        </div>
      )}
    </div>
  );
}