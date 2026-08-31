import type { ScannerConfig } from '../types';
import { classNames } from '../utils/format';

export function Filters({
  config,
  onChange,
}: {
  config: ScannerConfig;
  onChange: (patch: Partial<ScannerConfig['filters']>) => void;
}) {
  const f = config.filters;
  const row = 'flex flex-wrap items-center gap-2';
  const label = 'text-[11px] font-medium uppercase tracking-wide text-muted';

  return (
    <div className="card flex flex-col gap-3 p-3">
      <div className={row}>
        <span className={label}>View</span>
        {(['only-profitable', 'all', 'ready', 'high'] as const).map((mode) => {
          const active =
            mode === 'only-profitable' ? !f.showAll : mode === 'all' ? f.showAll : mode === 'ready' ? f.showAll && !f.onlyVerifiedNetworks : false;
          return (
            <button
              key={mode}
              onClick={() => {
                if (mode === 'only-profitable') onChange({ showAll: false });
                if (mode === 'all') onChange({ showAll: true, onlyVerifiedNetworks: false });
                if (mode === 'high') onChange({ minConfidence: 'HIGH' });
              }}
              className={classNames(
                'rounded-md border px-2 py-1 text-xs font-medium',
                active ? 'border-accent/50 bg-accent/10 text-accent' : 'border-edge text-slate-400 hover:border-slate-500',
              )}
            >
              {mode === 'only-profitable' ? 'Profitable only' : mode === 'all' ? 'Show all' : mode === 'ready' ? 'Transfer-ready' : 'High confidence'}
            </button>
          );
        })}
      </div>
      <div className={row}>
        <span className={label}>Min profit %</span>
        <input
          type="number"
          step="0.01"
          value={f.minProfitPct}
          onChange={(e) => onChange({ minProfitPct: Number(e.target.value) || 0 })}
          className="w-20 rounded border border-edge bg-panel2 px-2 py-1 text-xs"
        />
        <span className={label}>Max slippage %</span>
        <input
          type="number"
          step="0.1"
          value={f.maxSlippagePct}
          onChange={(e) => onChange({ maxSlippagePct: Number(e.target.value) || 0 })}
          className="w-20 rounded border border-edge bg-panel2 px-2 py-1 text-xs"
        />
        <span className={label}>Min liquidity $</span>
        <input
          type="number"
          step="100"
          value={f.minLiquidityUsd}
          onChange={(e) => onChange({ minLiquidityUsd: Number(e.target.value) || 0 })}
          className="w-24 rounded border border-edge bg-panel2 px-2 py-1 text-xs"
        />
        <span className={label}>Min confidence</span>
        <select
          value={f.minConfidence}
          onChange={(e) => onChange({ minConfidence: e.target.value as ScannerConfig['filters']['minConfidence'] })}
          className="rounded border border-edge bg-panel2 px-2 py-1 text-xs"
        >
          <option value="LOW">LOW</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="HIGH">HIGH</option>
        </select>
      </div>
      <div className={row}>
        <label className="flex items-center gap-1.5 text-xs text-slate-300">
          <input type="checkbox" checked={f.onlyVerifiedNetworks} onChange={(e) => onChange({ onlyVerifiedNetworks: e.target.checked })} />
          Verified networks only
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-300">
          <input type="checkbox" checked={f.onlyVerifiedAssets} onChange={(e) => onChange({ onlyVerifiedAssets: e.target.checked })} />
          Verified assets only
        </label>
      </div>
    </div>
  );
}