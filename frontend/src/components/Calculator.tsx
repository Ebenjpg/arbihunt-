import { useMemo, useState } from 'react';
import type { CalculatorResult } from '@arbihunt/shared';
import { api } from '../services/api';
import { TradeBreakdown } from './TradeBreakdown';
import { fmtPct, fmtUsd, fmtSigned } from '../utils/format';

const PRESETS = [
  { label: '$100 x 10→10.5', value: { capital: 100, buyPrice: 10, sellPrice: 10.5, buyFeePct: 0.1, sellFeePct: 0.1, withdrawalFeeAsset: 0.01, slippagePct: 0.2 } },
  { label: 'GLM Gate→MEXC', value: { capital: 100, buyPrice: 0.1234, sellPrice: 0.1264, buyFeePct: 0.1, sellFeePct: 0.1, withdrawalFeeAsset: 1, slippagePct: 0.3 } },
  { label: '$1,000 deep book', value: { capital: 1000, buyPrice: 0.5, sellPrice: 0.505, buyFeePct: 0.1, sellFeePct: 0.1, withdrawalFeeAsset: 0.5, slippagePct: 0.1 } },
];

const EMPTY: CalculatorResult = {
  tokenQuantity: 0,
  grossProfit: 0,
  totalFees: 0,
  finalValue: 0,
  netProfit: 0,
  netProfitPct: 0,
  buyCost: 0,
  buyFeeUsd: 0,
  withdrawalFeeUsd: 0,
  sellGross: 0,
  sellFeeUsd: 0,
  slippageUsd: 0,
  breakdown: [],
};

export function Calculator() {
  const [form, setForm] = useState({ capital: 100, buyPrice: 0.1234, sellPrice: 0.1264, buyFeePct: 0.1, sellFeePct: 0.1, withdrawalFeeAsset: 1, slippagePct: 0.2 });
  const [result, setResult] = useState<CalculatorResult>(EMPTY);
  const [loading, setLoading] = useState(false);

  const pieces = useMemo(
    () => [
      { key: 'capital', label: 'Capital ($)', step: '1' },
      { key: 'buyPrice', label: 'Buy price', step: 'any' },
      { key: 'sellPrice', label: 'Sell price', step: 'any' },
      { key: 'buyFeePct', label: 'Buy fee %', step: '0.01' },
      { key: 'sellFeePct', label: 'Sell fee %', step: '0.01' },
      { key: 'withdrawalFeeAsset', label: 'Withdrawal fee (token)', step: 'any' },
      { key: 'slippagePct', label: 'Slippage %', step: '0.01' },
    ],
    [],
  );

  async function run() {
    setLoading(true);
    try {
      const res = await api.calculate({ ...form });
      setResult(res);
    } finally {
      setLoading(false);
    }
  }

  const set = (key: string, value: number) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-100">Arbitrage Calculator</h2>
        <p className="mb-4 text-xs text-muted">
          Uses the <span className="text-slate-300">same calculation engine</span> as the live scanner (shared package — no duplicated formulas).
        </p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => setForm({ ...p.value })}
              className="rounded border border-edge bg-panel2 px-2 py-1 text-xs text-slate-300 hover:border-accent/50"
            >
              {p.label}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
          className="grid grid-cols-2 gap-3"
        >
          {pieces.map((p) => (
            <label key={p.key} className="flex flex-col gap-1">
              <span className="text-[11px] uppercase text-muted">{p.label}</span>
              <input
                type="number"
                step={p.step === 'any' ? 'any' : p.step}
                value={(form as Record<string, number>)[p.key]}
                onChange={(e) => set(p.key, Number(e.target.value) || 0)}
                className="rounded border border-edge bg-panel2 px-2 py-1.5 text-sm outline-none focus:border-accent/60"
              />
            </label>
          ))}
          <div className="col-span-2 mt-1">
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded bg-accent px-3 py-2 text-sm font-semibold text-bg transition hover:brightness-110 disabled:opacity-50"
            >
              {loading ? 'Calculating…' : 'Calculate'}
            </button>
          </div>
        </form>
      </div>

      <div className="card p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-100">Result</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Metric label="Token quantity" value={result.tokenQuantity.toFixed(6)} />
          <Metric label="Buy cost" value={fmtUsd(result.buyCost)} />
          <Metric label="Buy fee" value={fmtUsd(result.buyFeeUsd)} />
          <Metric label="Withdrawal fee" value={fmtUsd(result.withdrawalFeeUsd)} />
          <Metric label="Slippage" value={fmtUsd(result.slippageUsd)} />
          <Metric label="Sell fee" value={fmtUsd(result.sellFeeUsd)} />
          <Metric label="Gross profit" value={fmtUsd(result.grossProfit)} />
          <Metric label="Total fees" value={fmtUsd(result.totalFees)} />
          <Metric label="Final value" value={fmtUsd(result.finalValue)} accent />
          <Metric label="Net profit" value={fmtSigned(result.netProfit)} valueClass={result.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'} />
          <Metric label="Net profit %" value={fmtPct(result.netProfitPct)} valueClass={result.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'} />
        </div>
        <div className="mt-4 rounded border border-edge bg-panel2 p-3">
          <h3 className="mb-2 text-[11px] font-semibold uppercase text-muted">Trade Breakdown</h3>
          <TradeBreakdown items={result.breakdown} netProfit={result.netProfit} />
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, valueClass, accent }: { label: string; value: string; valueClass?: string; accent?: boolean }) {
  return (
    <div className="rounded border border-edge bg-panel2 p-2">
      <div className="text-[10px] uppercase text-muted">{label}</div>
      <div className={(accent ? 'text-accent ' : '') + 'mono mt-0.5 text-sm font-semibold ' + (valueClass ?? 'text-slate-100')}>{value}</div>
    </div>
  );
}