import { config } from '../config';
import { BinanceAdapter } from './binance';
import { BybitAdapter } from './bybit';
import { OkxAdapter } from './okx';
import { KucoinAdapter } from './kucoin';
import { GateAdapter } from './gate';
import { MexcAdapter } from './mexc';
import { BitgetAdapter } from './bitget';
import { HtxAdapter } from './htx';
import { CryptoComAdapter } from './cryptocom';
import { BitfinexAdapter } from './bitfinex';
import { PoloniexAdapter } from './poloniex';
import { BitmartAdapter } from './bitmart';
import { WhitebitAdapter } from './whitebit';
import { HitbtcAdapter } from './hitbtc';
import { PhemexAdapter } from './phemex';
import { AscendexAdapter } from './ascendex';
import { BingxAdapter } from './bingx';
import { CoinexAdapter } from './coinex';
import { DigifinexAdapter } from './digifinex';
import { BitrueAdapter } from './bitrue';
import { LbankAdapter } from './lbank';
import { XtAdapter } from './xt';
import { LatokenAdapter } from './latoken';
import { BtseAdapter } from './btse';
import { ToobitAdapter } from './toobit';
import type { ExchangeAdapter } from './types';

function buildAll(): ExchangeAdapter[] {
  return [
    new BinanceAdapter(),
    new BybitAdapter(),
    new OkxAdapter(),
    new KucoinAdapter(),
    new GateAdapter(),
    new MexcAdapter(),
    new BitgetAdapter(),
    new HtxAdapter(),
    new CryptoComAdapter(),
    new BitfinexAdapter(),
    new PoloniexAdapter(),
    new BitmartAdapter(),
    new WhitebitAdapter(),
    new HitbtcAdapter(),
    new PhemexAdapter(),
    new AscendexAdapter(),
    new BingxAdapter(),
    new CoinexAdapter(),
    new DigifinexAdapter(),
    new BitrueAdapter(),
    new LbankAdapter(),
    new XtAdapter(),
    new LatokenAdapter(),
    new BtseAdapter(),
    new ToobitAdapter(),
  ];
}

function filterAdapters(list: ExchangeAdapter[]): ExchangeAdapter[] {
  const disabled = new Set(config.disabledExchanges);
  if (config.enabledExchanges && config.enabledExchanges.length > 0) {
    const enabled = new Set(config.enabledExchanges);
    return list.filter((a) => enabled.has(a.id) && !disabled.has(a.id));
  }
  return list.filter((a) => !disabled.has(a.id));
}

export const adapters: ExchangeAdapter[] = filterAdapters(buildAll());

const byId = new Map<string, ExchangeAdapter>();
for (const a of adapters) byId.set(a.id, a);

export function getAdapter(id: string): ExchangeAdapter | undefined {
  return byId.get(id);
}

export function getAdapters(): ExchangeAdapter[] {
  return adapters;
}
