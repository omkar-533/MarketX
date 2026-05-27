import { getTickSnapshot, subscribeTickBroadcast } from './fyersSocket.mjs';
import { getActiveMarketProvider } from './provider.mjs';

export function registerLiveStreamRoutes(router) {
  router.get('/ticks', (req, res) => {
    const raw = String(req.query.symbols || '').trim();
    const symbols = raw
      ? raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
      : undefined;
    res.json({
      provider: getActiveMarketProvider(),
      quotes: getTickSnapshot(symbols),
      fetchedAt: new Date().toISOString(),
    });
  });

  router.get('/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const send = () => {
      try {
        const payload = {
          provider: getActiveMarketProvider(),
          quotes: getTickSnapshot(),
          at: Date.now(),
        };
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch {
        /* client gone */
      }
    };

    send();
    const unsub = subscribeTickBroadcast(send);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      unsub();
    });
  });
}
