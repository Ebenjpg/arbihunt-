import type { Opportunity } from '@arbihunt/shared';

export class OpportunityStore {
  private map = new Map<string, Opportunity>();

  set(opp: Opportunity): void {
    this.map.set(opp.id, opp);
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
