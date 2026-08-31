import type { ExchangeStatus } from '../types';
import { StatusDot } from './badges';
import { fmtAge, fmtTime, fmtCompact } from '../utils/format';

function WsBadge({ state }: { state: ExchangeStatus['ws'] }) {
  const map = {
    connected: 'text-emerald-400',
    disconnected: 'text-amber-400',
    none: 'text-slate-500',
  };
  return <span className={'text-xs font-medium ' + map[state]}>{state.toUpperCase()}</span>;
}

export function ExchangeTable({ exchanges }: { exchanges: ExchangeStatus[] }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[380px] text-xs md:min-w-[900px]">
        <thead>
          <tr className="border-b border-edge bg-panel2 text-left text-[11px] uppercase tracking-wide text-muted">
            <th className="px-3 py-2">Exchange</th>
            <th className="px-3 py-2">Connection</th>
            <th className="px-3 py-2">Markets</th>
            <th className="hidden px-3 py-2 md:table-cell">Last Update</th>
            <th className="hidden px-3 py-2 lg:table-cell">WebSocket</th>
            <th className="hidden px-3 py-2 lg:table-cell">REST</th>
            <th className="hidden px-3 py-2 md:table-cell">Latency</th>
            <th className="hidden px-3 py-2 md:table-cell">Errors</th>
          </tr>
        </thead>
        <tbody>
          {exchanges.map((e) => (
            <tr key={e.exchange} className="border-b border-edge/50 hover:bg-white/[0.03]">
              <td className="px-3 py-2 font-semibold capitalize text-slate-100">{e.name}</td>
              <td className="px-3 py-2">
                <StatusDot
                  state={e.connection}
                  label={e.connection.toUpperCase()}
                />
              </td>
              <td className="px-3 py-2 text-slate-300">{fmtCompact(e.markets)}</td>
              <td className="hidden px-3 py-2 text-slate-300 md:table-cell">
                {e.lastUpdate ? fmtTime(e.lastUpdate) : '—'}
                {e.lastUpdateAgeMs !== undefined && <div className="text-[10px] text-muted">{fmtAge(e.lastUpdateAgeMs)} ago</div>}
              </td>
              <td className="hidden px-3 py-2 lg:table-cell"><WsBadge state={e.ws} /></td>
              <td className="hidden px-3 py-2 lg:table-cell">
                <span className={e.rest === 'ok' ? 'text-emerald-400' : 'text-rose-400'}>OK</span>
              </td>
              <td className="hidden mono px-3 py-2 text-slate-300 md:table-cell">{e.latencyMs !== undefined ? `${e.latencyMs}ms` : '—'}</td>
              <td className="hidden px-3 py-2 md:table-cell">
                <span className={e.errorCount > 0 ? 'text-rose-400 font-semibold' : 'text-slate-300'}>{e.errorCount}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}