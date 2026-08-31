import { X } from 'lucide-react';
import type { Opportunity } from '../types';
import { ConfidenceBadge, TransferBadge, FeeSourceBadge, NetworkBadge } from './badges';
import { TradeBreakdown } from './TradeBreakdown';
import { fmtPrice, fmtPct, fmtUsd, fmtSigned, fmtAge, fmtCompact, fmtTime } from '../utils/format';

function NetworkSourceBadge({ source }: { source: 'live' | 'default' | undefined }) {
  return source === 'live' ? (
    <span className="text-[10px] font-semibold px-1 py-0.5 bg-sky-500/15 text-sky-400 rounded">LIVE</span>
  ) : (
    <span className="text-[10px] font-semibold px-1 py-0.5 bg-slate-500/15 text-slate-400 rounded">DEFAULT</span>
  );
}

function Row({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-muted">{label}</span>
      <span className={className ? className : 'mono text-xs text-slate-200'}>{value}</span>
    </div>
  );
}

export function DetailPanel({ opp, onClose }: { opp: Opportunity; onClose: () => void }) {
  const profitColor = opp.netProfitUsd >= 0 ? 'text-emerald-400' : 'text-rose-400';
  return (
    <div className="card fixed inset-y-0 right-0 z-40 w-full max-w-md overflow-y-auto rounded-none border-y-0 border-r-0 border-l-1 border-l-edge p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-100">{opp.symbol}</h2>
          <div className="text-xs text-muted">
            {opp.buyExchange} → {opp.sellExchange}
          </div>
        </div>
        <button onClick={onClose} className="rounded p-1 text-muted hover:bg-white/5 hover:text-slate-200">
          <X size={18} />
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <div className="rounded border border-edge bg-panel2 p-2">
          <div className="text-[10px] uppercase text-muted">NET PROFIT</div>
          <div className={profitColor + ' mt-0.5 text-lg font-bold'}>{fmtSigned(opp.netProfitUsd)}</div>
          <div className={profitColor + ' text-xs font-semibold'}>{fmtPct(opp.netProfitPct)}</div>
        </div>
        <div className="rounded border border-edge bg-panel2 p-2">
          <div className="text-[10px] uppercase text-muted">Status</div>
          <div className="mt-1.5"><TransferBadge status={opp.transferStatus} /></div>
          <div className="mt-1.5"><ConfidenceBadge level={opp.confidence} /></div>
        </div>
      </div>

      <section className="border-b border-edge py-3">
        <h3 className="mb-2 text-[11px] font-semibold uppercase text-muted">Execution</h3>
        <Row label="Starting capital" value={fmtUsd(opp.capital)} />
        <Row label="Buy price (top ask)" value={fmtPrice(opp.buyTopAsk)} />
        <Row label="Sell price (top bid)" value={fmtPrice(opp.sellTopBid)} />
        <Row label="Avg buy price" value={fmtPrice(opp.avgBuyPrice)} />
        <Row label="Avg sell price" value={fmtPrice(opp.avgSellPrice)} />
        <Row label="Gross spread" value={<span className="mono text-emerald-400">{fmtPct(opp.grossSpreadPct)}</span>} />
        <Row label="Effective spread" value={<span className="mono text-slate-200">{fmtPct(opp.effectiveSpreadPct)}</span>} />
        <Row
          label="Buy fee"
          value={
            <span className="flex items-center gap-1 text-slate-300">
              {opp.buyFeePct.toFixed(2)}% <FeeSourceBadge source={opp.buyFeeSource} />
            </span>
          }
        />
        <Row
          label="Sell fee"
          value={
            <span className="flex items-center gap-1 text-slate-300">
              {opp.sellFeePct.toFixed(2)}% <FeeSourceBadge source={opp.sellFeeSource} />
            </span>
          }
        />
      </section>

      <section className="border-b border-edge py-3">
        <h3 className="mb-2 text-[11px] font-semibold uppercase text-muted">Transfer & Network</h3>
        <Row
          label="Network"
          value={
                <span className="flex items-center gap-1.5 text-slate-200">
                  {opp.transferStatus === 'NO COMMON NETWORK' ? (
                    <span className="text-rose-400">NO COMMON NETWORK</span>
                  ) : opp.network ? (
                    <>
                      {opp.network} {opp.networkMatch === 'yes' && <span className="text-emerald-400">✓</span>}{' '}
                      {opp.networkChain ? `(${opp.networkChain})` : ''}
                      <NetworkSourceBadge source={opp.matchedNetworks?.[0]?.source} />
                    </>
                  ) : (
                    <span className="text-amber-400">A VERIFIER</span>
                  )}
                </span>
          }
        />
        <Row label="Network match" value={opp.transferStatus === 'NO COMMON NETWORK' ? <span className="text-rose-400">NO COMMON NETWORK</span> : opp.networkMatch.toUpperCase()} />
        <Row
          label="Withdrawal fee"
          value={
            opp.withdrawalFeeKnown && opp.withdrawalFeeAsset != null ? (
              <>
                <span className="text-slate-300">{opp.withdrawalFeeAsset} {opp.base} = {fmtUsd(opp.withdrawalFeeUsd)}</span>
                <span className="text-emerald-400"> (verified)</span>
              </>
            ) : opp.withdrawalFeeKnown && opp.withdrawalFeeUsd === 0 ? (
              <span className="text-emerald-400">$0.00 (verified zero)</span>
            ) : (
              <span className="text-amber-400">A VERIFIER</span>
            )
          }
        />
        <Row
          label="Active networks"
          value={
            opp.matchedNetworks && opp.matchedNetworks.length > 0 ? (
              <span className="text-xs text-slate-300">{opp.matchedNetworks.map((n) => n.id).join(', ')}</span>
            ) : (
              <span className="text-amber-400">A VERIFIER</span>
            )
          }
        />
        <Row label="Deposit status" value={<NetworkBadge status={opp.depositStatus} />} />
        <Row label="Withdrawal status" value={<NetworkBadge status={opp.withdrawalStatus} />} />
        <Row
          label="Network data"
          value={
            <span className="text-slate-300">
              {opp.networkUpdatedAt ? (
                <>
                  <NetworkSourceBadge source="live" /> updated {fmtAge(Date.now() - opp.networkUpdatedAt)} ago
                </>
              ) : (
                <>
                  <NetworkSourceBadge source="default" /> curated table (not fetched live)
                </>
              )}
            </span>
          }
        />
        <Row label="Estimated transfer time" value={<span className="text-slate-300">{opp.transferTimeEstimate}</span>} />
        <Row label="Asset identity" value={opp.assetVerified ? 'VERIFIED' : 'NOT CONFIRMED'} />
        <Row
          label="Contract — buy"
          value={
            opp.buyContractAddress ? (
              <span className="mono break-all text-right text-[10px] leading-tight text-sky-300">{opp.buyContractAddress}</span>
            ) : (
              <span className="text-amber-400">A VERIFIER</span>
            )
          }
        />
        <Row
          label="Contract — sell"
          value={
            opp.sellContractAddress ? (
              <span className="mono break-all text-right text-[10px] leading-tight text-sky-300">{opp.sellContractAddress}</span>
            ) : (
              <span className="text-amber-400">A VERIFIER</span>
            )
          }
        />
        {opp.buyContractAddress && opp.sellContractAddress && (
          <div className="mt-1 text-right text-[11px]">
            {opp.buyContractAddress.toLowerCase() === opp.sellContractAddress.toLowerCase() ? (
              <span className="text-emerald-400">✓ same contract on both exchanges</span>
            ) : (
              <span className="text-rose-400">⚠ contracts differ — verify before any transfer</span>
            )}
          </div>
        )}
      </section>

      <section className="border-b border-edge py-3">
        <h3 className="mb-2 text-[11px] font-semibold uppercase text-muted">Liquidity & Risk</h3>
        <Row label="Buy liquidity" value={fmtUsd(opp.buyLiquidityUsd)} />
        <Row label="Sell liquidity" value={fmtUsd(opp.sellLiquidityUsd)} />
        <Row label="Max executable" value={fmtUsd(opp.maxExecutable)} />
        <Row label="Slippage" value={<span className="mono text-slate-300">{fmtPct(opp.slippagePct)}</span>} />
        <Row label="Capital deployed" value={fmtUsd(opp.capital)} />
        <Row label="Final value" value={fmtUsd(opp.finalValue)} />
      </section>

      <section className="border-b border-edge py-3">
        <h3 className="mb-2 text-[11px] font-semibold uppercase text-muted">$ {opp.capital.toLocaleString()} Trade Breakdown</h3>
        <TradeBreakdown items={opp.breakdown} netProfit={opp.netProfitUsd} />
      </section>

      <section className="border-b border-edge py-3">
        <h3 className="mb-2 text-[11px] font-semibold uppercase text-muted">Data</h3>
        <Row label="Created" value={fmtTime(opp.createdAt)} />
        <Row label="Last updated" value={fmtTime(opp.lastUpdatedAt)} />
        <Row label="Data age" value={fmtAge(opp.dataAgeMs)} />
      </section>

      {opp.confidenceReasons.length > 0 && (
        <section className="py-3">
          <h3 className="mb-2 text-[11px] font-semibold uppercase text-muted">Confidence reasons</h3>
          <ul className="space-y-1">
            {opp.confidenceReasons.map((r, i) => (
              <li key={i} className="flex items-center gap-1.5 text-xs text-slate-300">
                <span className="h-1 w-1 rounded-full bg-accent" /> {r}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}