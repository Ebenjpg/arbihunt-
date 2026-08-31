const KNOWN_QUOTES = [
  'USDT',
  'USDC',
  'BUSD',
  'TUSD',
  'FDUSD',
  'USDD',
  'USD',
  'DAI',
  'EUR',
  'GBP',
  'TRY',
  'BRL',
  'RUB',
  'JPY',
  'AUD',
  'KRW',
  'BTC',
  'ETH',
  'BNB',
  'XRP',
  'USDP',
  'PAXG',
  'USTC',
  'UST',
  'VAI',
  'DOGE',
  'TONCOIN',
];

const KNOWN_BASES = new Set([
  'BTC', 'ETH', 'BNB', 'USDT', 'USDC', 'XRP', 'SOL', 'ADA', 'DOGE', 'TRX',
  'DOT', 'MATIC', 'POL', 'LTC', 'BCH', 'LINK', 'XLM', 'AVAX', 'ATOM', 'ETC',
  'FIL', 'ICP', 'VET', 'APT', 'NEAR', 'ALGO', 'TON', 'TONCOIN', 'SUI', 'ARB',
  'OP', 'PEPE', 'SHIB', 'GLM', 'UNI', 'AAVE', 'MKR', 'CRV', 'LDO', 'INJ',
  'STX', 'RNDR', 'RENDER', 'SEI', 'TIA', 'ORDI', 'WLD', 'AGIX', 'FET', 'GALA',
  'SAND', 'MANA', 'AXS', 'CHZ', 'ENJ', 'ZIL', 'NEO', 'ONT', 'QTUM', 'IOTA',
  'XMR', 'DASH', 'ZEC', 'EOS', 'KSM', 'COMP', 'SNX', 'SUSHI', 'CAKE', '1INCH',
  'GMT', 'APE', 'BLUR', 'JTO', 'JUP', 'WIF', 'BONK', 'FLOKI', 'MEME', 'PEOPLE',
  'GRT', 'IMX', 'MAGIC', 'PYTH', 'STRK', 'ZRO', 'ENA', 'ETHFI', 'OM', 'W',
  'NOT', 'BB', 'LISTA', 'SAGA', 'TAO', 'AIOZ', 'ONDO', 'BEAM', 'DYM', 'ALT',
  'REZ', 'METIS', 'RUNE', 'FLOKI', 'ORDI', 'SATOSHI', 'BABYDOGE', 'CKB',
]);

export interface NormalizedSymbol {
  base: string;
  quote: string;
  canonical: string;
}

/**
 * Normalize any exchange symbol format (BTCUSDT, BTC-USDT, BTC_USDT, BTC/USDT)
 * into a canonical { base, quote, canonical: "BASE/QUOTE" }.
 */
export function normalizeSymbol(raw: string): NormalizedSymbol | null {
  if (!raw) return null;
  let s = raw.trim().toUpperCase();
  if (!s) return null;

  if (s.includes('/')) {
    const [b, q] = s.split('/');
    if (b && q) return { base: b, quote: q, canonical: `${b}/${q}` };
    return null;
  }

  if (s.includes('-')) {
    s = s.replace(/-/g, '_');
  }
  if (s.includes('_')) {
    const parts = s.split('_').filter(Boolean);
    if (parts.length === 2) return { base: parts[0], quote: parts[1], canonical: `${parts[0]}/${parts[1]}` };
    return null;
  }

  // Contiguous format like BTCUSDT, 1000SHIBUSDT
  for (const quote of KNOWN_QUOTES) {
    if (s.length > quote.length && s.endsWith(quote)) {
      const base = s.slice(0, s.length - quote.length);
      if (base && isPlausibleBase(base)) {
        return { base, quote, canonical: `${base}/${quote}` };
      }
    }
  }
  // Fallback: longest known base prefix match
  for (const base of KNOWN_BASES) {
    if (s.length > base.length && s.startsWith(base)) {
      const quote = s.slice(base.length);
      if (KNOWN_QUOTES.includes(quote)) {
        return { base, quote, canonical: `${base}/${quote}` };
      }
    }
  }
  return null;
}

function isPlausibleBase(base: string): boolean {
  // A base is plausible if it starts with a letter/digit and contains only
  // alphanumerics (handles 1000SHIB, 1INCH, MBABYDOGE etc.)
  return /^[A-Z0-9]+$/.test(base) && base.length <= 16;
}

export function canonicalSymbol(raw: string): string | null {
  const n = normalizeSymbol(raw);
  return n ? n.canonical : null;
}

export function sameBaseAsset(a: string, b: string): boolean {
  const A = a.toUpperCase();
  const B = b.toUpperCase();
  return A === B;
}
