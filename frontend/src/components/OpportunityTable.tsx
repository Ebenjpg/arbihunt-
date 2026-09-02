import type { Opportunity } from '../types';
import { FeeSourceBadge } from './badges';
import { fmtPrice, fmtPct, fmtUsd, fmtSigned, fmtCompact, classNames } from '../utils/format';

export type SortKey =
  | 'netProfitPct'
  | 'netProfitUsd'
  | 'grossSpreadPct'
  | 'buyLiquidityUsd'
  | 'sellLiquidityUsd'
  | 'capital'
  | 'slippagePct'
  | 'withdrawalFeeUsd'
  | 'dataAgeMs'
  | 'symbol';

interface Props {
  opportunities: Opportunity[];
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
  onSelect: (opp: Opportunity) => void;
  selectedId?: string;
  freshMaxMs: number;
  staleMaxMs: number;
}

const COLUMNS: { key: SortKey | null; label: string; className?: string }[] = [
  { key: 'symbol', label: 'TOKEN' },
  { key: null, label: 'BUY EX' },
  { key: null, label: 'SELL EX' },
  { key: null, label: 'BUY PRICE' },
  { key: null, label: 'SELL PRICE' },
  { key: 'grossSpreadPct', label: 'GROSS' },
  { key: null, label: 'FEES', className: 'hidden md:table-cell' },
  { key: 'withdrawalFeeUsd', label: 'WDRW', className: 'hidden lg:table-cell' },
  { key: null, label: 'NETWORK' },
  { key: null, label: 'LIQUIDITY A/B' },
  { key: 'slippagePct', label: 'SLIP', className: 'hidden md:table-cell' },
  { key: 'capital', label: 'CAP', className: 'hidden sm:table-cell' },
  { key: 'netProfitUsd', label: 'NET $' },
] as const;

function SortHeader({ label, active, dir, onClick }: { label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void }) {
  return (
    <button onClick={onClick} className={classNames('flex items-center justify-center gap-1 text-center hover:text-slate-100', active && 'text-accent')}>
      {label}
      {active && <span className="text-[10px]">{dir === 'desc' ? '▼' : '▲'}</span>}
    </button>
  );
}

export function OpportunityTable({ opportunities, sortKey, sortDir, onSort, onSelect, selectedId, freshMaxMs, staleMaxMs }: Props) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full table-fixed min-w-[640px] text-center text-xs md:min-w-[920px]">
        <thead>
          <tr className="border-b border-edge bg-panel2 text-[11px] uppercase tracking-wide text-muted">
            {COLUMNS.map((c, i) => (
              <th key={i} className={'whitespace-nowrap px-1.5 py-2 text-center ' + (c.className ?? '')}>
                {c.key ? (
                  <SortHeader label={c.label} active={sortKey === c.key} dir={sortDir} onClick={() => onSort(c.key!)} />
                ) : (
                  <span>{c.label}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {opportunities.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length} className="px-3 py-10 text-center text-sm text-muted">
                No opportunities match the current filters. Widening the scan as live market data arrives…
              </td>
            </tr>
          )}
          {opportunities.map((o) => {
            const profitClass = o.netProfitUsd >= 0 ? 'text-emerald-400' : 'text-rose-400';
            return (
              <tr
                key={o.id}
                onClick={() => onSelect(o)}
                className={classNames(
                  'cursor-pointer border-b border-edge/50 transition-colors hover:bg-white/[0.03]',
                  selectedId === o.id && 'bg-accent/5',
                )}
              >
                <td className="px-2 py-2 text-center">
                  <div className="font-semibold text-slate-100">{o.symbol}</div>
                  <div className="text-[10px] text-muted">{o.base}</div>
                </td>
                <td className="px-2 py-2 text-center font-medium text-slate-300">{o.buyExchange}</td>
                <td className="px-2 py-2 text-center font-medium text-slate-300">{o.sellExchange}</td>
                <td className="mono px-2 py-2 text-center text-slate-300">{fmtPrice(o.buyPrice)}</td>
                <td className="mono px-2 py-2 text-center text-slate-300">{fmtPrice(o.sellPrice)}</td>
                <td className="mono px-2 py-2 text-center text-emerald-400">{fmtPct(o.grossSpreadPct)}</td>
                <td className="hidden px-2 py-2 text-center md:table-cell">
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-slate-400">{o.buyFeePct.toFixed(2)}%</span>
                    <span className="text-muted">/</span>
                    <span className="text-slate-400">{o.sellFeePct.toFixed(2)}%</span>
                  </div>
                  <div className="flex items-center justify-center gap-1 pt-0.5">
                    <FeeSourceBadge source={o.buyFeeSource} />
                    <FeeSourceBadge source={o.sellFeeSource} />
                  </div>
                </td>
                <td className="hidden px-2 py-2 text-center text-slate-300 lg:table-cell">
                  {o.withdrawalFeeKnown ? (
                    <>
                      <div className="mono">{fmtUsd(o.withdrawalFeeUsd)}</div>
                      <div className="text-[10px] text-muted">
                        {o.withdrawalFeeAsset} {o.base}
                        {o.network ? ` @ ${o.network}` : ''}
                      </div>
                    </>
                  ) : (
                    <span className="text-amber-400">A VERIFIER</span>
                  )}
                </td>
                <td className="px-2 py-2 text-center">
                  <div className="font-medium text-slate-200">
                    {o.transferStatus === 'NO COMMON NETWORK' ? (
                      <span className="text-rose-400">NO COMMON NETWORK</span>
                    ) : o.network ? (
                      <>
                        {o.network}
                        {o.networkMatch === 'yes' && <span className="text-emerald-400"> ✓</span>}
                      </>
                    ) : o.transferStatus === 'NETWORK UNKNOWN' || o.transferStatus === 'TRANSFER COST UNKNOWN' ? (
                      <span className="text-amber-400">A VERIFIER</span>
                    ) : (
                      '—'
                    )}
                  </div>
                  <div className="text-[10px] uppercase text-muted">
                    {o.transferStatus === 'NO COMMON NETWORK' ? '' : o.networkMatch}
                  </div>
                </td>
                <td className="mono px-2 py-2 text-center text-slate-200">
                  <span className="text-emerald-400">${fmtCompact(o.buyLiquidityUsd)}</span>
                  <span className="text-muted"> / </span>
                  <span className="text-sky-400">${fmtCompact(o.sellLiquidityUsd)}</span>
                </td>
                <td className="hidden mono px-2 py-2 text-center text-slate-300 md:table-cell">{o.slippagePct.toFixed(2)}%</td>
                <td className="hidden mono px-2 py-2 text-center text-slate-300 sm:table-cell">${o.capital.toLocaleString()}</td>
                <td className={classNames('mono px-2 py-2 text-center font-semibold', profitClass)}>{fmtSigned(o.netProfitUsd)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}