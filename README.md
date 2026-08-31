# ArbiHunt Scanner

A **read-only** local crypto cross-exchange arbitrage scanner that continuously watches **25 spot exchanges** for the pattern

```
BUY token on Exchange A → transfer → SELL token on Exchange B
```

It computes real profitability using **actual order books**, **trading fees** and
**network (withdrawal/deposit) matching** — not just headline spreads.

> **⚠️ Safety**: This tool is a scanner only. It NEVER places trades, transfers
> funds, withdraws or requests private/withdrawal API keys. It uses public,
> read-only market data.

---

## Features

- **25 exchange adapters** (see list below) with REST polling + WebSocket for Binance/Bybit/OKX.
- **Order-book-based simulation**: it walks ask-side and bid-side liquidity, so `$100 in visible liquidity` is never treated as `$100 tradable at the top price`.
- **Real costs**: buy fee, sell fee, withdrawal/network fee, slippage and price impact.
- **Network matching**: finds compatible withdrawal↔deposit networks, picks the cheapest valid route, detects `TRANSFER BLOCKED` / `NO COMMON NETWORK` / `NETWORK UNKNOWN`.
- **$100 trade breakdown**: a consistent visual list of every cash flow.
- **Capital selector** ($10 … $10,000 + custom) — everything recalculates.
- **Confidence score** (HIGH / MEDIUM / LOW) with reasons.
- **Live dashboard**: KPI cards, sortable opportunity table (incl. separate BUY/SELL liquidity columns), detail panel, exchange status page.
- **No artificial market cap**: the scanner discovers and evaluates the *entire* market universe exposed by every exchange. There is **no** TOP-40/100/1000 whitelist and `staticNetworks.ts` is **not** a scan whitelist — it is only a fallback for safe, unambiguous asset↔network mappings. Candidate evaluation uses a rotating batch so nothing is silently dropped, scaling from thousands to 100k+ markets.
- **Built-in calculator** that shares the same engine as the live scanner (no duplicated formulas).
- **Demo mode** — clearly labelled `DEMO DATA`, never mixed with live data.
- **Independent error isolation**: one exchange failing never stops the rest.

---

## Requirements

- **Node.js 18+** (tested on 20+)
- npm 9+

No cloud services, databases or Redis are required.

---

## Installation & local startup

```bash
npm install
```

Optionally copy the environment template:

```bash
cp .env.example .env
```

Then run everything:

```bash
npm run dev
```

- Backend (data + engine + API): `http://localhost:3001`
- Frontend (dashboard): **http://localhost:3000**

Alternatively run them separately:

```bash
npm run dev:backend     # API on :3001
npm run dev:frontend    # UI on  :3000
```

### Tests & type checking

```bash
npm test          # runs shared + backend unit tests
npm run typecheck # type-checks shared, backend and frontend
```

### Build / run backend only (production-ish)

```bash
npm run build
npm start
```

---

## The 25 exchange adapters

| # | Exchange | Adapter | # | Exchange | Adapter |
|---|----------|---------|---|----------|---------|
| 1 | Binance | `binance.ts` | 14 | HitBTC | `hitbtc.ts` |
| 2 | Bybit | `bybit.ts` | 15 | Phemex | `phemex.ts` |
| 3 | OKX | `okx.ts` | 16 | AscendEX | `ascendex.ts` |
| 4 | KuCoin | `kucoin.ts` | 17 | BingX | `bingx.ts` |
| 5 | Gate.io | `gate.ts` | 18 | CoinEx | `coinex.ts` |
| 6 | MEXC | `mexc.ts` | 19 | DigiFinex | `digifinex.ts` |
| 7 | Bitget | `bitget.ts` | 20 | Bitrue | `bitrue.ts` |
| 8 | HTX | `htx.ts` | 21 | LBank | `lbank.ts` |
| 9 | Crypto.com | `cryptocom.ts` | 22 | XT.com | `xt.ts` |
| 10 | Bitfinex | `bitfinex.ts` | 23 | LATOKEN | `latoken.ts` |
| 11 | Poloniex | `poloniex.ts` | 24 | BTSE | `btse.ts` |
| 12 | BitMart | `bitmart.ts` | 25 | Toobit | `toobit.ts` |
| 13 | WhiteBIT | `whitebit.ts` | | | |

Each adapter implements a common interface:

```ts
fetchTickers()             // best bid/ask for all spot markets
fetchOrderBook(symbol)     // full depth
getDefaultFees()           // taker/maker fee
getStatus()                // connection, latency, errors
```

Plus a shared base class providing **rate limiting, retries, exponential backoff,
timeouts and per-exchange error isolation**.

---

## Configuration (`.env`)

| Variable | Default | Meaning |
|----------|---------|---------|
| `BACKEND_PORT` | `3001` | Backend HTTP port |
| `FRONTEND_PORT` | `3000` | Frontend dev port |
| `ENABLED_EXCHANGES` | *(all)* | Comma list of adapters to enable |
| `DISABLED_EXCHANGES` | *(none)* | Comma list to disable |
| `TICKER_POLL_MS` | `12000` | REST ticker polling interval |
| `ORDERBOOK_POLL_MS` | `1500` | Order-book cache TTL (per pair) |
| `SCAN_INTERVAL_MS` | `5000` | Scanner loop interval |
| `MAX_CANDIDATES_PER_SCAN` | `200` | Candidate pairs per scan **batch** — not a permanent cap; the engine rotates the full universe so no market is dropped |
| `ORDERBOOK_CACHE_CAPACITY` | `200000` | Order-book cache capacity (entries), scales with market count |
| `WS_ENABLED` | `true` | WebSocket market data (Binance/Bybit/OKX) |
| `DEFAULT_CAPITAL` | `100` | Default starting capital (USD) |
| `MIN_PROFIT_PCT` | `0.10` | Default minimum net profit % |
| `FRESH_MAX_MS` / `STALE_MAX_MS` | `5000` / `15000` | Data freshness thresholds |
| `DEMO_MODE` | `false` | Show clearly-labelled demo data only |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |

### Optional read-only keys

A few exchanges (BingX, Bitget, XT) accept an optional **read-only** API key for
stricter public metadata access. They are optional — the scanner runs fine without
them. Never populate withdrawal/trading keys.

---

## Architecture

```
project/
├── shared/                        @arbihunt/shared — single source of truth for math
│   └── src/
│       ├── types.ts
│       └── calc/
│           ├── arbitrage.ts       order-book simulation + $N breakdown
│           ├── orderbook.ts       ask/bid walking, slippage, liquidity
│           ├── networks.ts        network matching
│           ├── confidence.ts      confidence scoring
│           ├── normalize.ts       symbol normalization (BTCUSDT → BTC/USDT)
│           └── __tests__/         unit tests
├── backend/                       @arbihunt/backend — Fastify API + engine
│   └── src/
│       ├── exchanges/             base class + 25 adapters + registry
│       ├── networks/              static network DB (default estimates)
│       ├── fees/                  fee service
│       ├── market-data/           ticker / orderbook / websocket services
│       ├── arbitrage/             opportunity engine + store
│       └── routes/ + server.ts
├── frontend/                      @arbihunt/frontend — React + Vite + Tailwind
│   └── src/
│       ├── components/            table, detail panel, KPIs, filters, calculator…
│       ├── pages/
│       ├── hooks/                 polling hook
│       └── services/              API client
├── .env.example
└── package.json                   npm workspaces
```

### Data pipeline

```
EXCHANGE DATA (REST + WS)
   → ticker normalization → canonical symbol index
   → market intersection (symbols on ≥2 exchanges)
   → candidate screening (best bid/ask spread)
   → order book collection (depth)
   → liquidity simulation → fees → network matching → withdrawal fee
   → slippage → transfer status → net profit → confidence → rank → UI
```

---

## How arbitrage is calculated

For each opportunity:

```
START CAPITAL
 → spend  = capital / (1 + buy_fee)   fills ask side
 → tokens = spend / avg_buy_price
 → buy fee charged on spend           (spend + buy fee exactly == capital)
 → tokens_arriving = tokens − withdrawal_fee(asset)
 → sell_gross = tokens_arriving sold through bids
 → sell_fee = sell_gross × sell_fee
 → FINAL = sell_gross − sell_fee
NET PROFIT = FINAL − START
NET PROFIT % = NET PROFIT / START × 100
```

The headline `(sell − buy) / buy` is shown as the **gross spread**; the real result
after walking both books, fees, withdrawal fee and slippage is shown as
**effective spread** and **net profit**. All math uses `decimal.js` high-precision
arithmetic in `shared/` — the calculator and the live scanner call the same functions.

### Liquidity simulation (`shared/src/calc/orderbook.ts`)

`fillAsks` walks asks from best onward, consuming available quantity until the spend
budget is exhausted; `fillBids` does the same on the sell side. `maxExecutable`
reports how much capital can actually be deployed given both books, so the UI never
shows a fake profit for capital the book cannot absorb.

### Network matching (`shared/src/calc/networks.ts`)

`matchNetworks(from, to)` intersects the withdrawal networks of the buy exchange
with the deposit networks of the sell exchange, removes disabled routes, ranks by
withdrawal fee (converted to USD at the buy price) and returns:
- `ok` + recommended network, or
- `blocked` (TRANSFER BLOCKED), or
- `no-common` (NO COMMON NETWORK), or
- `unknown` (NETWORK UNKNOWN).

**Network resolution precedence** (per exchange+asset): live adapter-reported
withdrawal/deposit metadata → static DEFAULT fallback for safe, unambiguous
assets → `UNKNOWN`. The engine never invents a network and never converts an
unknown withdrawal fee into `$0.00`. An `UNKNOWN` network **does not** stop a
market from being scanned — the raw spread is still simulated and shown, it is
just not presented as transfer-ready until the route is verified.

> **Note on network data**: exchange APIs do not expose withdrawal/deposit network
> details without private keys. The bundled `backend/src/networks/staticNetworks.ts`
> is a clearly-marked **default/fallback** table (source = `DEFAULT`). Fees and
> networks can drift; treat them as estimates. The UI shows `LIVE` vs `DEFAULT`
> on every fee. Contract addresses and live per-exchange network data can be added
> later without changing the engine.

---

## Live vs Demo mode

- **Live mode (default)**: real public market data via REST (+ WS where supported).
  Unavailable exchanges show `UNAVAILABLE` — no fake data is ever substituted.
- **Demo mode** (`DEMO_MODE=true`): gives the UI something to show if there is no
  internet access. A prominent `DEMO MODE` indicator is shown and opportunities are
  labels `DEMO DATA`. **Demo and live data are never mixed.**

---

## Adding a new exchange

1. Create `backend/src/exchanges/<id>.ts` extending `BaseAdapter`.
2. Implement `requestTickers()` (best bid/ask per spot symbol) and `requestOrderBook(symbol, depth)`.
3. Optionally override `getDefaultFees()` and `wsCapable`.
4. Register it in `backend/src/exchanges/registry.ts` (build list).
5. If its bulk ticker lacks bid/ask, add its id to `NEEDS_QUOTE_FALLBACK` in `tickerService.ts`.

Productivity tip: study an existing adapter (e.g. `mexc.ts`) first — most exchanges
share the `[[price, quantity], ...]` book shape parsed by `parseArrayBook`.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Frontend loads but no data | Backend must be running on `:3001`. In a separate terminal run `npm run dev:backend`. |
| `localhost:3000` refused | Vite defaults to port 3000; if taken, Vite picks 3001 and prints the real URL — use that. |
| A single exchange shows `ERROR` | Expected — that adapter failed and was isolated. Check its column in the **Exchanges** page. |
| Rate-limit (`429`) | Lower `requestsPerSecond` in that adapter, or the requests are already throttled per-host. |
| No USDT/ERC20 fee appears live | Fees are `DEFAULT` unless a live public API is wired per exchange — this is intentional and labelled. |
| Many symbols "marketing" scans | The engine only compares symbols present on ≥2 exchanges and screens by bid/ask spread, keeping volume sane. |

---

## Known limitations

- Withdrawal/deposit network data is **static default estimates** (source `DEFAULT`), not live per-exchange data.
- Transfer time estimates are rough guidelines, never guarantees.
- Some smaller exchanges' public metadata change frequently; adapters parse defensively and degrade gracefully.
- Early large-capital scans can take a few seconds while caches warm.
- WebSocket streaming is implemented for Binance, Bybit and OKX; other exchanges poll over REST.
- This is a **read-only intelligence tool** — it is not a trading bot and explicitly does not execute trades.

---

*Disclaimer: Arbitrage opportunities are estimates based on live market data. Prices, fees, liquidity and transfer availability can change rapidly. Net profit is not guaranteed.*