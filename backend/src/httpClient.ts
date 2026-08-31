import { logger } from './logger';

export interface HttpClientOptions {
  baseUrl: string;
  timeoutMs?: number;
  maxRetries?: number;
  backoffMs?: number;
  /** max requests per second to this host */
  requestsPerSecond?: number;
  /** max number of in-flight requests on this client (concurrency cap) */
  maxConcurrent?: number;
  headers?: Record<string, string>;
  name?: string;
}

interface HostBucket {
  last: number;
  minIntervalMs: number;
}

const buckets = new Map<string, HostBucket>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class Semaphore {
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.limit <= 0) return task();
    if (this.active < this.limit) {
      this.active++;
      try {
        return await task();
      } finally {
        this.active--;
        this.pump();
      }
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
      this.pump();
    }
  }

  private pump(): void {
    while (this.active < this.limit && this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

const RATE_LIMIT_STATUS = new Set([403, 429]);

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

async function throttle(url: string, rps: number): Promise<void> {
  const host = hostOf(url);
  const minIntervalMs = rps > 0 ? 1000 / rps : 0;
  if (minIntervalMs <= 0) return;
  const now = Date.now();
  const bucket = buckets.get(host) || { last: 0, minIntervalMs };
  bucket.minIntervalMs = Math.min(bucket.minIntervalMs || minIntervalMs, minIntervalMs);
  const wait = bucket.last + bucket.minIntervalMs - now;
  if (wait > 0) await sleep(wait);
  bucket.last = Date.now();
  buckets.set(host, bucket);
}

export interface HttpResult<T> {
  data: T;
  status: number;
  latencyMs: number;
}

export class HttpClient {
  private readonly semaphore: Semaphore;

  constructor(private options: HttpClientOptions) {
    this.semaphore = new Semaphore(options.maxConcurrent ?? 0);
  }

  private buildUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    return this.options.baseUrl.replace(/\/$/, '') + path;
  }

  async get<T>(path: string, opts?: { headers?: Record<string, string> }): Promise<HttpResult<T>> {
    return this.semaphore.run(() => this.getInner<T>(path, opts));
  }

  /** Perform an arbitrary method (POST etc.) with a JSON body. */
  async post<T>(path: string, opts?: { headers?: Record<string, string>; body?: unknown }): Promise<HttpResult<T>> {
    return this.semaphore.run(() =>
      this.getInner<T>(path, { headers: opts?.headers, method: 'POST', body: opts?.body }),
    );
  }

  private async getInner<T>(path: string, opts?: { headers?: Record<string, string>; method?: string; body?: unknown }): Promise<HttpResult<T>> {
    const {
      timeoutMs = 10000,
      maxRetries = 2,
      backoffMs = 500,
      requestsPerSecond = 5,
    } = this.options;

    let lastError: unknown;
    let rateLimited = false;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = backoffMs * 2 ** (attempt - 1);
        logger.warn(this.options.name, 'RETRY', `attempt ${attempt + 1} in ${delay}ms`, { error: String(lastError) });
        await sleep(delay);
      }
      try {
        await throttle(this.buildUrl(path), requestsPerSecond);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const started = Date.now();
        const res = await fetch(this.buildUrl(path), {
          method: opts?.method ?? 'GET',
          body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
          headers: {
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
            'accept': 'application/json, text/plain, */*',
            ...(opts?.body !== undefined ? { 'content-type': 'application/json' } : {}),
            ...this.options.headers,
            ...opts?.headers,
          },
          signal: controller.signal,
        });
        clearTimeout(timer);
        const latencyMs = Date.now() - started;
        if (!res.ok) {
          rateLimited = RATE_LIMIT_STATUS.has(res.status);
          throw new Error(`HTTP ${res.status} for ${path}`);
        }
        const text = await res.text();
        let json: T;
        try {
          json = JSON.parse(text) as T;
        } catch {
          json = text as unknown as T;
        }
        return { data: json, status: res.status, latencyMs };
      } catch (err) {
        lastError = err;
        if (rateLimited) break;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}
