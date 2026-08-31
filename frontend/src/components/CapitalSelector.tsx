import { classNames } from '../utils/format';

const OPTIONS = [10, 25, 50, 100, 250, 500, 1000, 5000, 10000];

export function CapitalSelector({ capital, onChange }: { capital: number; onChange: (v: number) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {OPTIONS.map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={classNames(
            'rounded-md px-2.5 py-1 text-xs font-semibold border transition-colors',
            capital === v
              ? 'border-accent/60 bg-accent/15 text-accent'
              : 'border-edge bg-panel2 text-slate-300 hover:border-slate-500',
          )}
        >
          ${v.toLocaleString()}
        </button>
      ))}
      <div className="ml-1 flex items-center rounded-md border border-edge bg-panel2">
        <span className="pl-2 text-xs text-muted">$</span>
        <input
          type="number"
          value={capital}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v > 0) onChange(Math.min(100000, Math.round(v)));
          }}
          className="w-20 bg-transparent px-1 py-1 text-xs font-semibold text-accent outline-none"
        />
      </div>
    </div>
  );
}