/**
 * One-shot TradingView chart session to pull OHLC bars (timescale_update).
 * Protocol adapted from tradingview-scraper Streamer.
 */
import WebSocket from 'ws';
import { toTvSymbol } from './symbolMap.mjs';

const WS_URL = 'wss://data.tradingview.com/socket.io/websocket?from=chart%2F';

const INTERVAL_MAP = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '1h': '60',
  '2h': '120',
  '4h': '240',
  '1d': '1D',
  '1w': '1W',
};

function sessionId(prefix) {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  let out = prefix;
  for (let i = 0; i < 12; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function prependHeader(message) {
  return `~m~${message.length}~m~${message}`;
}

function createMessage(func, paramList) {
  return prependHeader(JSON.stringify({ m: func, p: paramList }));
}

function round(n) {
  return Math.round(Number(n) * 100) / 100;
}

function candleCountFor(timeframe, rangeOverride) {
  if (rangeOverride === '1y') return 365;
  if (rangeOverride === '6mo') return 180;
  if (rangeOverride === '3mo') return 90;
  if (timeframe === '1d' || timeframe === '1w') return 250;
  if (timeframe === '1h') return 200;
  return 120;
}

/**
 * @returns {Promise<{ bars: Array<{time:number,open:number,high:number,low:number,close:number,volume:number}> }>}
 */
export function fetchTvOhlcBars(symbol, timeframe = '15m', rangeOverride) {
  const tvSym = toTvSymbol(symbol);
  if (!tvSym) return Promise.reject(new Error(`Unknown symbol ${symbol}`));

  const resolution = INTERVAL_MAP[timeframe] || INTERVAL_MAP['15m'];
  const numbCandles = candleCountFor(timeframe, rangeOverride);

  return new Promise((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(WS_URL, {
      headers: {
        Origin: 'https://www.tradingview.com',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      perMessageDeflate: false,
    });

    const timer = setTimeout(() => {
      finish(reject, new Error('TradingView OHLC timeout'));
    }, 18_000);

    function finish(fn, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      fn(value);
    }

    function send(func, args) {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(createMessage(func, args));
    }

    ws.on('open', () => {
      const quoteSession = sessionId('qs_');
      const chartSession = sessionId('cs_');
      send('set_auth_token', ['unauthorized_user_token']);
      send('set_locale', ['en', 'US']);
      send('chart_create_session', [chartSession, '']);
      send('quote_create_session', [quoteSession]);
      const resolveSymbol = JSON.stringify({ adjustment: 'splits', symbol: tvSym });
      send('quote_add_symbols', [quoteSession, `=${resolveSymbol}`]);
      send('resolve_symbol', [chartSession, 'sds_sym_1', `=${resolveSymbol}`]);
      send('create_series', [chartSession, 'sds_1', 's1', 'sds_sym_1', resolution, numbCandles, '']);
      send('quote_fast_symbols', [quoteSession, tvSym]);
    });

    ws.on('message', (data) => {
      const text = String(data || '');
      if (/^~m~\d+~m~~h~\d+$/.test(text) || text.includes('~h~')) {
        try {
          ws.send(text.includes('~h~') ? text : prependHeader(text));
        } catch {
          /* ignore */
        }
        return;
      }

      const parts = text.split(/~m~\d+~m~/).filter(Boolean);
      for (const part of parts) {
        if (part.startsWith('~h~')) {
          try {
            ws.send(prependHeader(part));
          } catch {
            /* ignore */
          }
          continue;
        }
        let pkt;
        try {
          pkt = JSON.parse(part);
        } catch {
          continue;
        }
        if (pkt?.m !== 'timescale_update') continue;
        const series = pkt?.p?.[1]?.sds_1?.s;
        if (!Array.isArray(series) || !series.length) continue;

        const bars = series
          .map((entry) => {
            const v = entry?.v || [];
            return {
              time: Number(v[0]),
              open: round(v[1]),
              high: round(v[2]),
              low: round(v[3]),
              close: round(v[4]),
              volume: Math.floor(Number(v[5] ?? 0)),
            };
          })
          .filter((b) => Number.isFinite(b.time) && Number.isFinite(b.close));

        if (bars.length) finish(resolve, { bars });
      }
    });

    ws.on('error', (err) => {
      finish(reject, err instanceof Error ? err : new Error(String(err)));
    });

    ws.on('close', () => {
      if (!settled) finish(reject, new Error('TradingView OHLC connection closed'));
    });
  });
}
