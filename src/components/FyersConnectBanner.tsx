import { ExternalLink, X } from 'lucide-react';
import { useBrokerSession } from '../hooks/useBrokerSession';
import { BRAND, CONNECT_LIVE_LABEL, CONNECT_PATH } from '../constants/brandLabels';

export default function FyersConnectBanner() {
  const { session, startBrokerLogin } = useBrokerSession(true);

  if (session.loading || session.brokerConnected || !session.configured) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[120] max-w-lg mx-auto sm:left-auto sm:right-4 sm:mx-0">
      <div className="rounded-xl border border-amber-500/40 bg-[#121520]/95 backdrop-blur-md shadow-xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-amber-200">{BRAND} live data</p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Ek baar connect — phir auto-reconnect
            </p>
          </div>
          <a href={CONNECT_PATH} className="p-1 text-slate-500 hover:text-slate-300" aria-label="Dismiss">
            <X className="w-4 h-4" />
          </a>
        </div>

        <a
          href={CONNECT_PATH}
          onClick={(e) => {
            e.preventDefault();
            startBrokerLogin();
          }}
          className="flex w-full items-center justify-center gap-2 py-2.5 rounded-lg border border-gold/40 text-gold text-sm font-semibold hover:bg-gold/10"
        >
          <ExternalLink className="w-4 h-4" />
          {CONNECT_LIVE_LABEL}
        </a>
      </div>
    </div>
  );
}
