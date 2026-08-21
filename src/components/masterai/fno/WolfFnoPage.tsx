import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, Link2, RefreshCw } from 'lucide-react';
import AppLink from '../../AppLink';
import { PAGE_NAMES } from '../../../constants/brandLabels';
import { fetchWolfFnoDesk } from '../../../services/fno/wolfFnoApi';
import type { WolfFnoCard, WolfFnoDesk } from '../../../services/fno/wolfFnoTypes';
import { requestOpenLiveWolf } from '../../../services/live/liveBridge';
import { liveWolfQuery } from '../../../utils/appNav';
import { getMarketSession } from '../../../utils/marketHours';
import { tradingViewChartUrl } from '../../../utils/tradingViewSymbols';
import './wolf-fno.css';

type Props = {
  onOpenLive: () => void;
  onConnectData?: () => void;
  liveHint?: boolean;
  reloadToken?: number;
  sessionKnown?: boolean;
};

function formatPx(n: number | null | undefined, digits = 2) {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function formatOi(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  const signed = n < 0 ? '-' : '';
  if (abs >= 1e7) return `${signed}${(abs / 1e7).toFixed(2)} Cr`;
  if (abs >= 1e5) return `${signed}${(abs / 1e5).toFixed(2)} L`;
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function formatPct(n: number | null | undefined, digits = 2) {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}%`;
}

function formatIv(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n) || n <= 0) return '—';
  return `${n.toFixed(1)}`;
}

function chgClass(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n) || n === 0) return '';
  return n > 0 ? 'is-up' : 'is-down';
}

function pcrTone(pcr: number | null | undefined) {
  if (pcr == null || !Number.isFinite(pcr)) return '';
  if (pcr > 1.05) return 'is-up';
  if (pcr < 0.95) return 'is-down';
  return '';
}

function Metric({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: string;
  hint?: string;
}) {
  return (
    <div className={`wolf-fno__metric ${tone || ''}`} title={hint}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function IndexCard({
  card,
  onOpenLive,
}: {
  card: WolfFnoCard;
  onOpenLive: () => void;
}) {
  const liveQ = liveWolfQuery({ symbol: card.symbol, exchange: card.exchange, timeframe: '5m' });
  const openLive = () => {
    requestOpenLiveWolf({
      symbol: card.symbol,
      exchange: card.exchange,
      timeframe: '5m',
    });
    onOpenLive();
  };

  return (
    <article className={`wolf-fno__card ${card.available ? 'is-ready' : 'is-empty'}`}>
      <header className="wolf-fno__card-head">
        <div>
          <p className="wolf-fno__sym">{card.symbol}</p>
          <p className="wolf-fno__name">
            {card.name} · {card.exchange}
          </p>
        </div>
        <div className="wolf-fno__spot">
          <b>{formatPx(card.spot)}</b>
          <em className={chgClass(card.dayChangePct)}>{formatPct(card.dayChangePct)}</em>
        </div>
      </header>

      <p className="wolf-fno__exp">
        {card.expiry ? (
          <>
            Expiry {card.expiry}
            {card.daysToExpiry != null ? ` · ${card.daysToExpiry}D` : ''}
            {card.strikeCount ? ` · ${card.strikeCount} strikes` : ''}
          </>
        ) : (
          card.reason || 'Chain unavailable'
        )}
      </p>

      {card.available ? (
        <>
          <div className="wolf-fno__metrics">
            <Metric label="PCR" value={card.pcr != null ? card.pcr.toFixed(2) : '—'} tone={pcrTone(card.pcr)} />
            <Metric
              label="Max pain"
              value={formatPx(card.maxPain, 0)}
              hint={
                card.maxPainVsSpot != null
                  ? `${card.maxPainVsSpot > 0 ? 'Above' : card.maxPainVsSpot < 0 ? 'Below' : 'At'} spot ${formatPx(Math.abs(card.maxPainVsSpot), 0)}`
                  : undefined
              }
            />
            <Metric label="ATM" value={formatPx(card.atmStrike, 0)} />
            <Metric label="ATM IV" value={formatIv(card.atmIv)} />
            <Metric label="ATM straddle" value={formatPx(card.atmStraddle)} />
            <Metric
              label="Fut vs spot"
              value={
                card.basis != null
                  ? `${card.basis > 0 ? '+' : ''}${formatPx(card.basis)}`
                  : '—'
              }
              tone={chgClass(card.basis)}
              hint={card.basisPct != null ? formatPct(card.basisPct) : 'Futures last not in chain'}
            />
          </div>

          <div className="wolf-fno__walls">
            <div>
              <span>Put wall</span>
              <b>{card.putWall ? formatPx(card.putWall.strike, 0) : '—'}</b>
              <em>{card.putWall ? formatOi(card.putWall.oi) : '—'}</em>
            </div>
            <div>
              <span>Call wall</span>
              <b>{card.callWall ? formatPx(card.callWall.strike, 0) : '—'}</b>
              <em>{card.callWall ? formatOi(card.callWall.oi) : '—'}</em>
            </div>
          </div>

          <div className="wolf-fno__oi">
            <span>
              CE OI <b>{formatOi(card.ceOi)}</b>
              <em className={chgClass(card.ceOiChg)}> {formatOi(card.ceOiChg)}</em>
            </span>
            <span>
              PE OI <b>{formatOi(card.peOi)}</b>
              <em className={chgClass(card.peOiChg)}> {formatOi(card.peOiChg)}</em>
            </span>
          </div>
        </>
      ) : (
        <p className="wolf-fno__miss">{card.reason || 'No chain for this index right now.'}</p>
      )}

      <footer className="wolf-fno__actions">
        <a
          className="wolf-fno__btn"
          href={tradingViewChartUrl(card.symbol, '5m', card.exchange)}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={13} /> Chart
        </a>
        <AppLink to="live-wolf" query={liveQ} className="wolf-fno__btn is-pri" onActivate={openLive}>
          Live Wolf
        </AppLink>
      </footer>
    </article>
  );
}

export default function WolfFnoPage({
  onOpenLive,
  onConnectData,
  liveHint,
  reloadToken = 0,
  sessionKnown,
}: Props) {
  const [desk, setDesk] = useState<WolfFnoDesk | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const marketOpen = getMarketSession('NSE:NIFTY').open;
  const brokerOn = Boolean(liveHint);
  const liveStreaming = brokerOn && marketOpen && Boolean(desk?.cards.some((c) => c.available));

  const load = useCallback(
    async (quiet = false) => {
      if (!brokerOn) {
        setError(null);
        if (!quiet) setDesk(null);
        return;
      }
      if (!quiet) setLoading(true);
      try {
        const next = await fetchWolfFnoDesk();
        setDesk(next);
        setError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load Wolf F&O';
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [brokerOn],
  );

  useEffect(() => {
    if (!sessionKnown) return;
    void load(false);
  }, [load, reloadToken, sessionKnown]);

  useEffect(() => {
    if (!brokerOn || !marketOpen) return;
    const id = window.setInterval(() => void load(true), 80_000);
    return () => window.clearInterval(id);
  }, [brokerOn, load, marketOpen]);

  const feedLabel = liveStreaming
    ? 'Live feed'
    : brokerOn && marketOpen
      ? 'Syncing'
      : brokerOn
        ? 'Last session'
        : 'Connect for live';

  return (
    <div className="wolf-fno">
      <div className="wolf-fno__stage" aria-hidden>
        <div className="wolf-fno__fog" />
      </div>

      <motion.header
        className="wolf-fno__hero"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        <div>
          <p className="wolf-fno__eyebrow">Wolf Trade AI</p>
          <h1 className="wolf-fno__title">{PAGE_NAMES['wolf-fno']}</h1>
          <p className="wolf-fno__lede">
            Index option chain facts only — PCR, max pain, ATM, walls, ΔOI. Missing values stay blank.
          </p>
        </div>
        <div className="wolf-fno__pulse">
          <span className={`wolf-fno__mkt ${marketOpen ? 'is-open' : 'is-closed'}`}>
            {marketOpen ? 'Market open' : 'Market closed'}
          </span>
          <span className={`wolf-fno__feed ${liveStreaming ? 'is-live' : ''}`}>
            {feedLabel}
            {loading ? ' · syncing' : ''}
          </span>
          <button
            type="button"
            className="wolf-fno__icon"
            onClick={() => void load(false)}
            disabled={loading || !brokerOn}
            title="Refresh"
          >
            <RefreshCw size={15} className={loading ? 'is-spin' : ''} />
          </button>
          {onConnectData ? (
            // Always reachable: hiding this behind `brokerOn` left no way back in
            // whenever the desk wrongly believed a broker was attached.
            <button
              type="button"
              className={`wolf-fno__cta${brokerOn ? ' wolf-fno__cta--quiet' : ''}`}
              onClick={onConnectData}
              title={
                brokerOn
                  ? 'Market data connection — reconnect or switch broker'
                  : 'Connect your broker for live data'
              }
            >
              <Link2 size={14} /> {brokerOn ? 'Live data' : 'Connect live'}
            </button>
          ) : null}
        </div>
      </motion.header>

      {!sessionKnown ? (
        <div className="wolf-fno__state">Checking live connection…</div>
      ) : !brokerOn ? (
        <div className="wolf-fno__state">
          Connect live market data to load NIFTY, BANKNIFTY, SENSEX, BANKEX, and MIDCPNIFTY chains.
        </div>
      ) : error && !desk ? (
        <div className="wolf-fno__state">{error}</div>
      ) : (
        <section className="wolf-fno__grid">
          {(desk?.cards || []).map((card) => (
            <IndexCard key={card.symbol} card={card} onOpenLive={onOpenLive} />
          ))}
          {loading && !desk ? <div className="wolf-fno__state">Loading index chains…</div> : null}
        </section>
      )}

      {error && desk ? <p className="wolf-fno__warn">{error}</p> : null}
    </div>
  );
}
