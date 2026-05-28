# Backend location

This project uses **`server.mjs` + `server/`** as the production backend (not a separate `backend/` package).

| Spec path | Actual path |
|-----------|-------------|
| `backend/server.js` | `server.mjs` |
| `backend/routes/` | `server/fyers/`, `server/market/`, `server/auth/` |
| `backend/websocket/fyersSocket.js` | `server/market/fyersWsManager.mjs` |
| `backend/services/` | `server/market/*.mjs`, `server/services/` |
| `backend/middleware/` | `server/middleware/` |
| `backend/config/` | `server/config/` |

Run locally: `npm run server` or `npm run dev` (auto-starts API).
