export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  ts: string;
  exchange?: string;
  op?: string;
  latencyMs?: number;
  status?: string;
  level: LogLevel;
  msg: string;
  error?: string;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';

function write(entry: LogEntry): void {
  if (LEVEL_ORDER[entry.level] < LEVEL_ORDER[CURRENT]) return;
  const parts: string[] = [];
  parts.push(entry.ts);
  if (entry.exchange) parts.push(entry.exchange.toUpperCase());
  if (entry.op) parts.push(entry.op.toUpperCase());
  if (entry.latencyMs !== undefined) parts.push(`${entry.latencyMs}ms`);
  parts.push(entry.status || entry.level.toUpperCase());
  parts.push(entry.msg);
  if (entry.error) parts.push(`err=${entry.error}`);
  const line = parts.join(' ');
  if (entry.level === 'error') console.error(line);
  else if (entry.level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  info(exchange: string | undefined, op: string, msg: string, extra?: Partial<LogEntry>): void {
    write({ level: 'info', ts: new Date().toISOString(), exchange, op, msg, ...extra });
  },
  warn(exchange: string | undefined, op: string, msg: string, extra?: Partial<LogEntry>): void {
    write({ level: 'warn', ts: new Date().toISOString(), exchange, op, msg, ...extra });
  },
  error(exchange: string | undefined, op: string, msg: string, error?: unknown, extra?: Partial<LogEntry>): void {
    write({
      level: 'error',
      ts: new Date().toISOString(),
      exchange,
      op,
      msg,
      error: error instanceof Error ? error.message : String(error),
      ...extra,
    });
  },
  debug(exchange: string | undefined, op: string, msg: string, extra?: Partial<LogEntry>): void {
    write({ level: 'debug', ts: new Date().toISOString(), exchange, op, msg, ...extra });
  },
};

export function timing<T>(exchange: string, op: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  return fn()
    .then((r) => {
      logger.info(exchange, op, 'OK', { latencyMs: Date.now() - start, status: 'SUCCESS' });
      return r;
    })
    .catch((e) => {
      logger.error(exchange, op, 'FAILED', e, { latencyMs: Date.now() - start, status: 'ERROR' });
      throw e;
    });
}
