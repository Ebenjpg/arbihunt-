import type { FeeInfo } from '@arbihunt/shared';
import { getAdapter, getAdapters } from '../exchanges/registry';
import type { ExchangeAdapter } from '../exchanges/types';

export class FeeService {
  private cached = new Map<string, FeeInfo>();

  async refresh(): Promise<void> {
    for (const adapter of getAdapters()) {
      this.cached.set(adapter.id, adapter.getDefaultFees());
    }
  }

  getFee(exchangeId: string): FeeInfo {
    const cached = this.cached.get(exchangeId);
    if (cached) return cached;
    const adapter = getAdapter(exchangeId);
    const fee = adapter ? adapter.getDefaultFees() : { taker: 0.001, maker: 0.001, source: 'fallback' as const };
    this.cached.set(exchangeId, fee);
    return fee;
  }

  getTakerFee(exchangeId: string): number {
    return this.getFee(exchangeId).taker;
  }

  getSource(exchangeId: string): 'live' | 'fallback' {
    return this.getFee(exchangeId).source;
  }
}

export const feeService = new FeeService();
