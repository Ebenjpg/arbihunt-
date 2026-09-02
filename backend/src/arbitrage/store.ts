import type { Opportunity } from '@arbihunt/shared';

/** Hard user requirement: a token may NEVER appear more than MAX_ROWS_PER_TOKEN
 *  times in the scanner — and those rows are always the best buy/sell routes. */
const MAX_ROWS_PER_TOKEN = 2;

export class OpportunityStore {
  private map = new Map<string, Opportunity>();

  set(opp: Opportunity): void {
    this.map.set(opp.id, opp);
    this.enforcePerTokenCap(opp.base);
  }

  /** Keeps only the `MAX_ROWS_PER_TOKEN` most profitable rows per base token,
   *  dropping weaker/duplicate rows so no token shows 3, 4+ times. */
  private enforcePerTokenCap(base: string): void {
    const rows = [...this.map.values()].filter((o) => o.base === base);
    if (rows.length <= MAX_ROWS_PER_TOKEN) return;
    rows.sort((a, b) => b.netProfitPct - a.netProfitPct);
    for (const row of rows.slice(MAX_ROWS_PER_TOKEN)) this.map.delete(row.id);
  }

  get(id: string): Opportunity | undefined {
    return this.map.get(id);
  }

  getOrUpdate(id: string, updater: (existing: Opportunity) => Opportunity): Opportunity {
    const existing = this.map.get(id);
    const next = existing ? updater(existing) : updater(undefined as unknown as Opportunity);
    this.map.set(id, next);
    return next;
  }

  getAll(): Opportunity[] {
    return [...this.map.values()];
  }

  remove(id: string): void {
    this.map.delete(id);
  }

  clear(): void {
    this.map.clear();
  }

  size(): number {
    return this.map.size;
  }

  /** removes opportunities whose last update is older than maxAgeMs */
  prune(maxAgeMs: number): string[] {
    const now = Date.now();
    const removed: string[] = [];
    for (const [id, opp] of this.map) {
      if (now - opp.lastUpdatedAt > maxAgeMs) {
        this.map.delete(id);
        removed.push(id);
      }
    }
    return removed;
  }
}
