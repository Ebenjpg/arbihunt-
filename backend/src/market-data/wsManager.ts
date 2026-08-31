import WebSocket from 'ws';
import type { TickerSnapshot } from '@arbihunt/shared';
import { config } from '../config';
import { logger } from '../logger';
import { getAdapter } from '../exchanges/registry';
import { snap } from '../exchanges/utils';
import type { TickerService } from './tickerService';

interface WsConfig {
  url: string;
  subscribe: (symbols: string[]) => string;
  parse: (raw: unknown) => TickerSnapshot | null;
  exchangeSymbol: (symbol: string) => string;
}

const CONFIGS: Record<string, WsConfig> = {
  binance: {
    url: 'wss://stream.binance.com:9443/ws',
    subscribe: (symbols) =>
      JSON.stringify({ method: 'SUBSCRIBE', params: symbols.map((s) => `${s.toLowerCase()}@bookTicker`), id: Date.now() }),
    exchangeSymbol: (s) => s,
    parse: (raw) => {
      const m = raw as { e?: string; s?: string; b?: string; a?: string };
      if (m?.e !== 'bookTicker' || !m.s) return null;
      return snap('binance', m.s, { bid: m.b, ask: m.a });
    },
  },
  bybit: {
    url: 'wss://stream.bybit.com/v5/public/spot',
    subscribe: (symbols) => JSON.stringify({ op: 'subscribe', args: symbols.map((s) => `bookTicker.${s}`) }),
    exchangeSymbol: (s) => s,
    parse: (raw) => {
      const m = raw as { topic?: string; data?: { s?: string; bp?: string; ap?: string } };
      if (m?.topic !== 'bookTicker.BTCUSDT' && !m.topic?.startsWith('bookTicker.')) return null;
      const d = m.data;
      if (!d || !d.s) return null;
      return snap('bybit', d.s, { bid: d.bp, ask: d.ap });
    },
  },
  okx: {
    url: 'wss://ws.okx.com:8443/ws/v5/public',
    subscribe: (symbols) =>
      JSON.stringify({ op: 'subscribe', args: symbols.map((s) => ({ channel: 'bookticker', instId: s })) }),
    exchangeSymbol: (s) => s,
    parse: (raw) => {
      const m = raw as { arg?: { channel?: string; instId?: string }; data?: { instId?: string; bidPx?: string; askPx?: string }[] };
      if (m?.arg?.channel !== 'bookticker') return null;
      const d = m.data?.[0];
      if (!d?.instId) return null;
      return snap('okx', d.instId, { bid: d.bidPx, ask: d.askPx });
    },
  },
};

interface ActiveSocket {
  ws: WebSocket;
  exchange: string;
  symbols: string[];
  reconnectDelay: number;
  timer?: ReturnType<typeof setTimeout>;
  failed: number;
}

export class WsManager {
  private sockets = new Map<string, ActiveSocket>();
  private started = false;

  constructor(private tickers: TickerService) {}

  start(): void {
    if (!config.wsEnabled || this.started) return;
    this.started = true;
    for (const [exchange, cfg] of Object.entries(CONFIGS)) {
      const adapter = getAdapter(exchange);
      if (!adapter) continue;
      const socket: ActiveSocket = {
        ws: null as unknown as WebSocket,
        exchange,
        symbols: [],
        reconnectDelay: 1000,
        failed: 0,
      };
      this.sockets.set(exchange, socket);
      adapter.setWs('disconnected');
      void this.connect(exchange, cfg, socket);
    }
  }

  updateSymbols(exchange: string, symbols: string[]): void {
    const socket = this.sockets.get(exchange);
    const cfg = CONFIGS[exchange];
    if (!socket || !cfg || !symbols.length) return;
    socket.symbols = symbols;
    if (socket.ws && socket.ws.readyState === WebSocket.OPEN) {
      try {
        socket.ws.send(cfg.subscribe(symbols));
      } catch {
        // ignore transient send errors
      }
    }
  }

  private connect(exchange: string, cfg: WsConfig, socket: ActiveSocket): void {
    const adapter = getAdapter(exchange);
    const ws = new WebSocket(cfg.url);
    socket.ws = ws;

    ws.on('open', () => {
      socket.failed = 0;
      socket.reconnectDelay = 1000;
      if (socket.symbols.length) {
        try {
          ws.send(cfg.subscribe(socket.symbols));
        } catch {
          /* ignore */
        }
      }
      adapter?.setWs('connected');
      adapter?.setConnection('connected');
      logger.info(exchange, 'WS', 'connected', { status: 'SUCCESS' });
    });

    ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        const t = cfg.parse(parsed);
        if (t) this.tickers.updateFromWs(t);
      } catch {
        // non-JSON keepalive pings etc.
      }
    });

    ws.on('pong', () => {
      /* connection healthy */
    });

    ws.on('error', (err) => {
      adapter?.setWs('disconnected');
      adapter?.recordError(err);
      logger.warn(exchange, 'WS', 'socket error', { error: String(err.message || err) });
    });

    ws.on('close', () => {
      adapter?.setWs('disconnected');
      if (socket.failed < 10) socket.failed += 1;
      socket.reconnectDelay = Math.min(60000, socket.reconnectDelay * 2);
      logger.warn(exchange, 'WS', `closed, reconnecting in ${socket.reconnectDelay}ms`);
      socket.timer = setTimeout(() => this.connect(exchange, cfg, socket), socket.reconnectDelay);
    });
  }

  stop(): void {
    for (const [exchange, socket] of this.sockets) {
      if (socket.timer) clearTimeout(socket.timer);
      try {
        socket.ws.close();
      } catch {
        /* ignore */
      }
      const adapter = getAdapter(exchange);
      adapter?.setWs('none');
    }
    this.sockets.clear();
    this.started = false;
  }
}
