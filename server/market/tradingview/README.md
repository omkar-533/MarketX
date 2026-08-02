# TradingView market feed

Unofficial quote WebSocket client adapted from
[`tradingview-scraper`](https://github.com/mnwato/tradingview-scraper) (`RealTimeData` / `Streamer`).

- Connects to `wss://data.tradingview.com/socket.io/websocket`
- No broker OAuth / API keys
- Protocol may change if TradingView updates their socket — treat as best-effort

Does **not** provide NSE option chain, FNO OI, or FII/DII.
