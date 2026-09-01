import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config';
import { logger } from './logger';
import { feeService } from './fees/feeService';
import { engine } from './arbitrage/engine';
import { liveMetadataService } from './networks/liveMetadataService';
import { registerRoutes } from './routes/api';

async function main(): Promise<void> {
  const app = Fastify({ logger: false });

  await app.register(cors, {
    origin: true,
  });

  registerRoutes(app);

  app.get('/', async () => ({ name: 'arbihunt-scanner', status: 'ok', demoMode: config.demoMode }));

  // Bind the HTTP port FIRST so /api/health and the dashboard are reachable
  // immediately, regardless of how long the initial market/metadata load takes.
  // All heavy startup work (fee refresh, live metadata, ticker polling, engine
  // scan loop) is kicked off in the background so one slow exchange can never
  // block the API from responding.
  try {
    await app.listen({ port: config.backendPort, host: '0.0.0.0' });
    logger.info(undefined, 'SERVER', `listening on http://localhost:${config.backendPort}`, { status: 'SUCCESS' });
  } catch (err) {
    logger.error(undefined, 'SERVER', 'failed to bind', err);
    process.exit(1);
  }

  void (async () => {
    try {
      await feeService.refresh();
    } catch (err) {
      logger.error(undefined, 'SERVER', 'fee refresh failed (continuing)', err);
    }
    if (config.liveMetadataEnabled) {
      // Fire-and-forget: never block the engine/scanner startup on a slow or
      // unreachable metadata source (e.g. Gate timing out). It populates in the
      // background and refreshes on its own interval.
      void liveMetadataService.start(config.assetMetadataRefreshMs).catch((err) =>
        logger.error(undefined, 'SERVER', 'live metadata start failed (continuing)', err),
      );
      logger.info(undefined, 'SERVER', 'live asset metadata service started (background refresh)');
    }
    await engine.start();
    logger.info(undefined, 'SERVER', 'engine started (background scan loop)');
    if (config.demoMode) {
      logger.warn(undefined, 'SERVER', 'DEMO MODE is enabled - opportunities are DEMO DATA only', { status: 'WARN' });
    }
  })();

  const shutdown = async (): Promise<void> => {
    logger.info(undefined, 'SERVER', 'shutting down');
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // -----------------------------------------------------------------
  // Keep-alive self-ping: Render's free tier spins the service down
  // after 15 minutes without inbound traffic. Pinging our own public
  // /api/health URL every 14 minutes counts as traffic, so the service
  // stays warm. Disabled when KEEP_ALIVE_URL is not set (local dev).
  // -----------------------------------------------------------------
  if (config.keepAliveUrl) {
    const ping = async (): Promise<void> => {
      try {
        const res = await fetch(`${config.keepAliveUrl.replace(/\/$/, '')}/api/health`);
        logger.info(undefined, 'KEEPALIVE', `self-ping ${res.ok ? 'ok' : `HTTP ${res.status}`}`);
      } catch (err) {
        logger.warn(undefined, 'KEEPALIVE', `self-ping failed (will retry): ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    // First ping shortly after boot so the initial 15-min window starts
    // counting from real traffic, then every 14 minutes.
    setTimeout(() => {
      void ping();
      setInterval(() => void ping(), config.keepAliveMs);
    }, 30_000);
    logger.info(undefined, 'KEEPALIVE', `self-ping every ${Math.round(config.keepAliveMs / 60000)} min -> ${config.keepAliveUrl}`);
  }
}

main();