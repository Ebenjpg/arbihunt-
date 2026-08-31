import { useState } from 'react';
import { NavBar } from './components/NavBar';
import { Dashboard } from './pages/Dashboard';
import { Exchanges } from './pages/Exchanges';
import { CalculatorPage } from './pages/CalculatorPage';
import { api } from './services/api';
import { usePolling } from './hooks/usePolling';
import type { ScannerConfig, SetConfigBody } from './types';

const FRESH_MAX = 5000;
const STALE_MAX = 15000;

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const config = usePolling(() => api.config(), 15000);
  const demoMode = config.data?.demoMode ?? false;

  async function updateConfig(patch: SetConfigBody) {
    try {
      await api.setConfig(patch);
      await config.refresh();
    } catch {
      /* ignore transient errors */
    }
  }

  return (
    <div className="min-h-screen">
      <NavBar active={tab} onChange={setTab} demoMode={demoMode} />
      <main className="mx-auto max-w-[1600px] p-3 sm:p-4">
        {tab === 'dashboard' && (
          <Dashboard
            config={config.data ?? null}
            onConfig={(patch) => void updateConfig(patch)}
            freshMaxMs={FRESH_MAX}
            staleMaxMs={STALE_MAX}
          />
        )}
        {tab === 'exchanges' && <Exchanges />}
        {tab === 'calculator' && <CalculatorPage />}
      </main>
    </div>
  );
}