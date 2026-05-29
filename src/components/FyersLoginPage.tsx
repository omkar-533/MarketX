import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink, Link2 } from 'lucide-react';
import { apiFetch } from '../config/api';
import {
  connectFyersAuthCode,
  fetchFyersLoginUrl,
  fetchFyersStatus,
  type FyersStatus,
} from '../services/fyersApiService';
import { clearFyersAuthFromUrl, normalizeFyersAuthInput, stripAuthCodeSuffix } from '../utils/fyersAuthUrl';
import { BRAND, CONNECT_LIVE_LABEL, SERVER_OFFLINE_MSG, sanitizeDisplayMessage } from '../constants/brandLabels';

export default function FyersLoginPage() {
  const [status, setStatus] = useState<FyersStatus | null>(null);
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [loginUrl, setLoginUrl] = useState('');
  const [apiOffline, setApiOffline] = useState(false);

  const refresh = useCallback(async () => {
    const s = await fetchFyersStatus();
    setStatus(s);
    if (s?.connected) {
      setMsg('Connected ✓ — opening TradeX…');
      setTimeout(() => {
        window.location.href = '/';
      }, 1200);
    }
    return s;
  }, []);

  useEffect(() => {
    void refresh();
    void apiFetch('/api/health')
      .then((r) => {
        setApiOffline(!r.ok);
        if (!r.ok) setMsg(SERVER_OFFLINE_MSG);
      })
      .catch(() => {
        setApiOffline(true);
        setMsg(SERVER_OFFLINE_MSG);
      });
    void fetchFyersLoginUrl().then((u) => u && setLoginUrl(u));
    const code = normalizeFyersAuthInput(window.location.href);
    if (code) {
      setBusy(true);
      void connectFyersAuthCode(code).then((res) => {
        setBusy(false);
        clearFyersAuthFromUrl();
        if (res.ok) void refresh();
        else setMsg(sanitizeDisplayMessage(res.error || 'Connect failed'));
      });
    }
  }, [refresh]);

  const startLogin = () => {
    const base =
      import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '') || 'http://127.0.0.1:5000';
    window.location.href = loginUrl || `${base}/api/fyers/go`;
  };

  const onConnectPaste = async () => {
    const code = normalizeFyersAuthInput(stripAuthCodeSuffix(paste));
    if (!code) {
      setMsg('Login code nahi mila — poori redirect URL paste karein');
      return;
    }
    setBusy(true);
    const res = await connectFyersAuthCode(code);
    setBusy(false);
    if (res.ok) {
      setPaste('');
      await refresh();
    } else {
      setMsg(sanitizeDisplayMessage(res.error || 'Failed'));
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0e17] text-slate-200 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-5">
        <a href="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-gold">
          <ArrowLeft className="w-4 h-4" /> Back to {BRAND}
        </a>

        <div>
          <h1 className="text-xl font-bold text-gold">{BRAND} — {CONNECT_LIVE_LABEL}</h1>
          <p className="text-sm text-slate-500 mt-1">Ek baar connect — phir har baar auto live data</p>
        </div>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
          {apiOffline ? (
            <p className="text-xs text-red-400/90 text-center">{SERVER_OFFLINE_MSG}</p>
          ) : null}

          <button
            type="button"
            disabled={busy || apiOffline}
            onClick={startLogin}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-gold/25 text-gold font-bold hover:bg-gold/35 disabled:opacity-50"
          >
            <ExternalLink className="w-4 h-4" />
            {CONNECT_LIVE_LABEL}
          </button>
          <p className="text-[11px] text-slate-500 leading-relaxed text-center">
            Login complete na dikhe to button dubara dabayein — phir auto connect ho jayega.
          </p>
        </div>

        <details className="rounded-lg border border-dark-border bg-[#121520] p-4 space-y-2">
          <summary className="text-[12px] font-semibold text-slate-300 cursor-pointer">
            Manual paste (optional)
          </summary>
          <input
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder="Paste redirect URL after login"
            className="w-full mt-2 px-3 py-2 rounded-lg bg-dark-surface border border-dark-border text-sm"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConnectPaste()}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-gold/40 text-gold text-sm font-semibold"
          >
            <Link2 className="w-4 h-4" />
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        </details>

        {msg ? <p className="text-sm text-center text-slate-400">{msg}</p> : null}
        {status?.connected ? (
          <p className="text-xs text-emerald-400 text-center">Live data active ✓</p>
        ) : null}
      </div>
    </div>
  );
}
