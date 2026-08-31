import type { ConfidenceLevel, TransferStatus, NetworkStatus, FeeSource } from '@arbihunt/shared';
import { classNames } from '../utils/format';

export function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  const map: Record<ConfidenceLevel, string> = {
    HIGH: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    MEDIUM: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    LOW: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  };
  return (
    <span className={classNames('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold border', map[level])}>
      {level}
    </span>
  );
}

export function TransferBadge({ status }: { status: TransferStatus }) {
  const ready = status === 'READY';
  const color = ready
    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
    : 'bg-rose-500/10 text-rose-400 border-rose-500/20';
  return (
    <span className={classNames('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold border', color)}>
      {ready && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-live" />}
      {status}
    </span>
  );
}

export function NetworkBadge({ status }: { status: NetworkStatus }) {
  const map: Record<NetworkStatus, string> = {
    open: 'text-emerald-400',
    closed: 'text-rose-400',
    unknown: 'text-amber-400',
  };
  return <span className={classNames('text-[11px] font-medium uppercase', map[status] ?? '')}>{status}</span>;
}

export function FeeSourceBadge({ source }: { source: FeeSource }) {
  return source === 'live' ? (
    <span className="text-[10px] font-semibold px-1 py-0.5 bg-sky-500/15 text-sky-400 rounded">LIVE</span>
  ) : (
    <span className="text-[10px] font-semibold px-1 py-0.5 bg-slate-500/15 text-slate-400 rounded">DEFAULT</span>
  );
}

export function StatusDot({ state, label }: { state: 'connected' | 'error' | 'offline'; label?: string }) {
  const map = {
    connected: 'bg-emerald-400',
    error: 'bg-rose-400',
    offline: 'bg-slate-500',
  };
  return (
    <span className="flex items-center gap-1.5">
      <span className={classNames('h-2 w-2 rounded-full', map[state], state === 'connected' && 'animate-live')} />
      {label && <span className="text-xs">{label}</span>}
    </span>
  );
}

export function PropagateIcon() {
  return null;
}