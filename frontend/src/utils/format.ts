import { fmtUsd, fmtSigned, fmtPct, fmtPrice, fmtCompact, fmtAge, fmtTime, freshnessLabel } from '@arbihunt/shared';

export { fmtUsd, fmtSigned, fmtPct, fmtPrice, fmtCompact, fmtAge, fmtTime, freshnessLabel };

export function classNames(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}