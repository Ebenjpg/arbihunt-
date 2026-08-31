import { api } from '../services/api';
import { usePolling } from '../hooks/usePolling';
import { ExchangeTable } from '../components/ExchangeTable';

export function Exchanges() {
  const { data } = usePolling(() => api.exchanges(), 4000);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-100">Exchange Status</h1>
        <span className="text-xs text-muted">{data?.length ?? 0} exchanges configured</span>
      </div>
      <ExchangeTable exchanges={data ?? []} />
      <p className="px-1 text-[11px] text-muted">
        Each exchange fails independently. One exchange being offline never stops the scanner — only that exchange is marked below.
      </p>
    </div>
  );
}