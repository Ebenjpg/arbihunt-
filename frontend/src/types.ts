import type { Opportunity, KpiSnapshot, ExchangeStatus, CalculatorRequest, CalculatorResult } from '@arbihunt/shared';

export type { Opportunity, KpiSnapshot, ExchangeStatus, CalculatorRequest, CalculatorResult };

export interface ScannerConfig {
  backendPort: number;
  demoMode: boolean;
  minProfitPct: number;
  capital: number;
  buyExchanges: string[] | null;
  sellExchanges: string[] | null;
  search: string;
  availableExchanges: { id: string; name: string }[];
  filters: {
    minProfitPct: number;
    minProfitUsd: number;
    minLiquidityUsd: number;
    maxSlippagePct: number;
    minConfidence: 'LOW' | 'MEDIUM' | 'HIGH';
    onlyVerifiedNetworks: boolean;
    onlyVerifiedAssets: boolean;
    showAll: boolean;
  };
}

export type SetConfigBody = Partial<{
  capital: number;
  search: string;
  buyExchanges: string[] | null;
  sellExchanges: string[] | null;
  filters: Partial<ScannerConfig['filters']>;
}>;