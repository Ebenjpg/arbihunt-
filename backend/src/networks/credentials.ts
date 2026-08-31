/**
 * Optional READ-ONLY exchange API credentials, read from the environment.
 *
 * Some exchanges (MEXC, Bybit, Bitrue, …) do not expose withdrawal/deposit
 * network metadata or fees on unauthenticated endpoints. When the user provides
 * a read-only key in `.env` (e.g. `MEXC_API_KEY`, `MEXC_API_SECRET`) we can
 * fetch that live data. If no key is present the fetcher simply skips and the
 * asset stays `UNKNOWN` — we never invent a fee.
 *
 * Only ever place read-only keys here. Never withdrawal or trading keys.
 */

export interface ExchangeCredential {
  apiKey: string;
  apiSecret?: string;
  /** OKX signs with a passphrase in addition to key+secret. */
  apiPassphrase?: string;
}

/**
 * Return the optional read-only credential for an exchange id, or undefined.
 * Convention: `<EXCHANGE>_API_KEY` / `<EXCHANGE>_API_SECRET` (uppercased id),
 * plus optional `<EXCHANGE>_API_PASSPHRASE` (OKX).
 */
export function getCredential(exchangeId: string): ExchangeCredential | undefined {
  const prefix = exchangeId.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const apiKey = process.env[`${prefix}_API_KEY`];
  if (!apiKey) return undefined;
  return {
    apiKey,
    apiSecret: process.env[`${prefix}_API_SECRET`] || undefined,
    apiPassphrase: process.env[`${prefix}_API_PASSPHRASE`] || undefined,
  };
}