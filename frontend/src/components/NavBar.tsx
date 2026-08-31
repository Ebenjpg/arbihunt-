import { Activity } from 'lucide-react';

export function NavBar({ active, onChange, demoMode }: { active: string; onChange: (tab: string) => void; demoMode: boolean }) {
  const tabs = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'exchanges', label: 'Exchanges' },
    { id: 'calculator', label: 'Calculator' },
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-edge bg-panel/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <Activity size={18} />
          </div>
          <div>
            <div className="text-sm font-bold leading-none tracking-tight">Arbi<span className="text-accent">Hunt</span> Scanner</div>
            <div className="hidden text-[11px] text-muted sm:block">Cross-exchange arbitrage intelligence</div>
          </div>
        </div>
        <nav className="flex items-center gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              className={
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors ' +
                (active === t.id ? 'bg-accent/10 text-accent' : 'text-slate-300 hover:bg-white/5')
              }
            >
              {t.label}
            </button>
          ))}
          {demoMode && (
            <span className="ml-2 rounded border border-amber-500/40 bg-amber-500/15 px-2 py-1 text-xs font-bold text-amber-400">
              DEMO MODE
            </span>
          )}
        </nav>
      </div>
    </header>
  );
}