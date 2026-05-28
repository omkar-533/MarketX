import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Link2, Unlink } from 'lucide-react';
import {
  connectFyersAuthCode,
  disconnectFyers,
  fetchFyersLoginUrl,
  fetchFyersStatus,
  type FyersStatus,
} from '../services/fyersApiService';
import { fetchMarketHealth } from '../services/marketApiService';
import {
  BRAND,
  CONNECT_LIVE_LABEL,
  LIVE_DATA_LABEL,
  sanitizeDisplayMessage,
} from '../constants/brandLabels';

export default function FyersConnect() {
  const [status, setStatus] = useState<FyersStatus | null>(null);
  const [provider, setProvider] = useState<string>('');
  const [authCode, setAuthCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const refresh = useCallback(async () => {
    const [fyers, health] = await Promise.all([fetchFyersStatus(), fetchMarketHealth()]);
    setStatus(fyers);
    setProvider(health?.provider || '');
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openLogin = async () => {
    setBusy(true);
    setMsg('');
    const url = await fetchFyersLoginUrl();
    setBusy(false);
    if (!url) {
      setMsg(sanitizeDisplayMessage('Server not configured — restart npm run dev'));
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    setMsg('Login complete hone ke baad login code neeche paste karein');
  };

  const onConnect = async () => {
    if (!authCode.trim()) {
      setMsg('Redirect URL se login code paste karein');
      return;
    }
    setBusy(true);
    setMsg('');
    const res = await connectFyersAuthCode(authCode);
    setBusy(false);
    if (res.ok) {
      setAuthCode('');
      setMsg(`Connected — ${LIVE_DATA_LABEL} active across the site`);
      await refresh();
    } else {
      setMsg(sanitizeDisplayMessage(res.error || 'Failed'));
    }
  };

  const onDisconnect = async () => {
    setBusy(true);
    await disconnectFyers();
    setBusy(false);
    setMsg('Disconnected — reconnect in Profile for live data');
    await refresh();
  };

  const connected = Boolean(status?.connected);
  const active = provider === 'fyers' || provider === 'fyers-ws' || provider === 'fyers-cached';

  return (
    <div className="py-3 px-4 rounded-xl bg-dark-elevated border border-dark-border space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="text-sm text-slate-400 block">Live market data</span>
          <span className="text-[10px] text-slate-500">
            {active
              ? `${BRAND} Live — NSE/BSE`
              : connected
                ? 'Session saved · restart npm run dev if needed'
                : 'Not connected — required for live data'}
          </span>
        </div>
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
            active
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-slate-600 bg-slate-800/80 text-slate-500'
          }`}
        >
          {active ? LIVE_DATA_LABEL : 'Not active'}
        </span>
      </div>

      {!connected ? (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={busy || !status?.configured}
            onClick={() => void openLogin()}
            className="flex items-center justify-center gap-2 w-full py-2 rounded-lg border border-gold/40 text-gold text-xs font-semibold hover:bg-gold/10 disabled:opacity-50"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            {CONNECT_LIVE_LABEL}
          </button>
          <input
            type="text"
            value={authCode}
            onChange={(e) => setAuthCode(e.target.value)}
            placeholder="Paste login code here"
            className="w-full px-3 py-2 rounded-lg bg-dark-surface border border-dark-border text-xs text-slate-200 placeholder:text-slate-600"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConnect()}
            className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-gold/20 text-gold text-xs font-bold hover:bg-gold/30 disabled:opacity-50"
          >
            <Link2 className="w-3.5 h-3.5" />
            Connect
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onDisconnect()}
          className="flex items-center justify-center gap-2 w-full py-2 rounded-lg border border-dark-border text-slate-400 text-xs hover:text-red-400 hover:border-red-500/30"
        >
          <Unlink className="w-3.5 h-3.5" />
          Disconnect
        </button>
      )}

      {msg ? <p className="text-[10px] text-slate-500 leading-snug">{msg}</p> : null}
      {!status?.configured ? (
        <p className="text-[10px] text-amber-500/90">
          Live data setup incomplete — contact admin or restart npm run dev
        </p>
      ) : null}
    </div>
  );
}
