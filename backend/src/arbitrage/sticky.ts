/**
 * Sticky opportunity protection.
 *
 * A single scan cycle can produce a DEGRADED snapshot of a route that is
 * actually still healthy: a rate-limited/empty order book (stale dataAgeMs),
 * or a momentary network-metadata blip that flips an otherwise profitable
 * READY row to NETWORK UNKNOWN. Unconditionally overwriting the stored row
 * with that snapshot makes good tokens "vanish" after one refresh and get
 * replaced by unknown-looking rows, even though the spread still exists.
 *
 * Rules implemented here:
 *  - If the fresh evaluation shows the edge is GENUINELY gone (gross spread
 *    below the display floor), the new row is accepted immediately — the
 *    scanner must move on to new tokens.
 *  - If the edge still exists but the fresh snapshot is degraded (stale data,
 *    or a READY row flipping to a non-READY status), the last-known-good row
 *    RESISTS the overwrite for a grace period / a few consecutive strikes.
 *    Only after repeated confirmation is the degraded reality accepted.
 */

/** True when the freshly evaluated row looks transiently degraded relative
 *  to the healthy row already stored for the same route. */
export function isDegradedNext(
  existing: { transferStatus: string },
  next: { grossSpreadPct: number; dataAgeMs: number; transferStatus: string },
  minProfitPct: number,
  staleMaxMs: number,
): boolean {
  // Edge genuinely closed → NOT degraded, the replacement is the truth.
  if (next.grossSpreadPct < minProfitPct) return false;
  // Edge still exists but this cycle's data is stale (rate-limited book,
  // cached quote) → transient, resist the overwrite.
  if (next.dataAgeMs > staleMaxMs) return true;
  // Profitable + fresh, but a READY row suddenly flipped to a non-READY
  // status (metadata blip) → transient, resist the overwrite.
  if (
    existing.transferStatus === 'READY' &&
    next.transferStatus !== 'READY' &&
    next.transferStatus !== 'EXPIRED'
  ) {
    return true;
  }
  return false;
}

/** True when the stored row is healthy enough to deserve sticky protection:
 *  transfer-ready, still above the display floor, and verified recently. */
export function isResilientRow(
  row: { transferStatus: string; grossSpreadPct: number; lastUpdatedAt: number },
  now: number,
  graceMs: number,
  minProfitPct: number,
): boolean {
  return (
    row.transferStatus === 'READY' &&
    row.grossSpreadPct >= minProfitPct &&
    now - row.lastUpdatedAt < graceMs
  );
}
