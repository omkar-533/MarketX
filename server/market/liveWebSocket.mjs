import { WebSocketServer } from 'ws';
import { getActiveMarketProvider } from './provider.mjs';
import {
  getLiveTickSnapshot as getTickSnapshot,
  subscribeLiveTickBroadcast as subscribeTickBroadcast,
  subscribeLiveWsStatus as subscribeWsStatus,
  subscribeLiveSymbols,
} from './liveFeed.mjs';

function buildPayload() {
  return {
    type: 'tick',
    provider: getActiveMarketProvider(),
    quotes: getTickSnapshot(),
    at: Date.now(),
  };
}

/** Legacy raw WS — relays live ticks (Socket.IO is primary) */
export function attachMarketWebSocket(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/api/market/ws' });

  wss.on('connection', (ws) => {
    const send = () => {
      if (ws.readyState !== 1) return;
      try {
        ws.send(JSON.stringify(buildPayload()));
      } catch {
        /* closed */
      }
    };

    send();
    const unsub = subscribeTickBroadcast(send);
    const unsubStatus = subscribeWsStatus((status) => {
      if (ws.readyState !== 1) return;
      try {
        ws.send(JSON.stringify({ type: 'status', ...status }));
      } catch {
        /* closed */
      }
    });

    const heartbeat = setInterval(() => {
      if (ws.readyState !== 1) return;
      try {
        ws.send(JSON.stringify({ type: 'ping', at: Date.now() }));
      } catch {
        /* ignore */
      }
    }, 25_000);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg?.type === 'subscribe' && Array.isArray(msg.symbols)) {
          void subscribeLiveSymbols(msg.symbols);
          send();
        }
      } catch {
        /* ignore */
      }
    });

    ws.on('close', () => {
      clearInterval(heartbeat);
      unsub();
      unsubStatus();
    });
  });

  return wss;
}
