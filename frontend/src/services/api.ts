import type { KpiSnapshot, ExchangeStatus, Opportunity, CalculatorRequest, CalculatorResult } from '@arbihunt/shared';
import type { ScannerConfig, SetConfigBody } from '../types';

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  health: () => get<{ ok: boolean; demoMode: boolean }>('/api/health'),
  config: () => get<ScannerConfig>('/api/config'),
  setConfig: (body: SetConfigBody) => post<{ ok: boolean }>('/api/config', body),
  kpis: () => get<KpiSnapshot>('/api/kpis'),
  exchanges: () => get<ExchangeStatus[]>('/api/exchanges'),
  opportunities: () => get<Opportunity[]>('/api/opportunities'),
  opportunity: (id: string) => get<Opportunity>(`/api/opportunities/${encodeURIComponent(id)}`),
  markets: (search = '') => get<{ symbol: string; exchanges: string[] }[]>(`/api/markets?search=${encodeURIComponent(search)}`),
  calculate: (body: CalculatorRequest) => post<CalculatorResult>('/api/calculator', body),
};