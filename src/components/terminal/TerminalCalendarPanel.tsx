import { useMemo, useState } from 'react';
import { getEarnings, getIpos, type EarningsData, type IpoData } from '../../data/marketData';
import TerminalPanelChrome from './TerminalPanelChrome';

export type TerminalCalendarPanelProps = {
  onSelect: (tvSymbol: string) => void;
  onClose: () => void;
};

type CalTab = 'earnings' | 'ipo' | 'macro';

type MacroEvent = {
  id: string;
  title: string;
  country: string;
  date: string;
  time: string;
  impact: 'High' | 'Medium' | 'Low';
  forecast?: string;
  previous?: string;
};

function fmtOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function buildMacro(): MacroEvent[] {
  return [
    {
      id: 'm1',
      title: 'India CPI (YoY)',
      country: 'IN',
      date: fmtOffset(1),
      time: '17:30',
      impact: 'High',
      forecast: '4.2%',
      previous: '4.4%',
    },
    {
      id: 'm2',
      title: 'RBI Policy Rate Decision',
      country: 'IN',
      date: fmtOffset(3),
      time: '10:00',
      impact: 'High',
      forecast: '6.50%',
      previous: '6.50%',
    },
    {
      id: 'm3',
      title: 'India GDP Growth (QoQ)',
      country: 'IN',
      date: fmtOffset(5),
      time: '17:30',
      impact: 'High',
      forecast: '6.8%',
      previous: '6.5%',
    },
    {
      id: 'm4',
      title: 'US Non-Farm Payrolls',
      country: 'US',
      date: fmtOffset(2),
      time: '18:00',
      impact: 'High',
      forecast: '180K',
      previous: '175K',
    },
    {
      id: 'm5',
      title: 'US CPI (MoM)',
      country: 'US',
      date: fmtOffset(4),
      time: '18:00',
      impact: 'High',
      forecast: '0.3%',
      previous: '0.2%',
    },
    {
      id: 'm6',
      title: 'India Manufacturing PMI',
      country: 'IN',
      date: fmtOffset(6),
      time: '10:30',
      impact: 'Medium',
      forecast: '57.0',
      previous: '56.8%',
    },
    {
      id: 'm7',
      title: 'Crude Oil Inventories',
      country: 'US',
      date: fmtOffset(1),
      time: '20:00',
      impact: 'Medium',
      forecast: '-1.2M',
      previous: '-0.8M',
    },
  ];
}

export default function TerminalCalendarPanel({ onSelect, onClose }: TerminalCalendarPanelProps) {
  const [tab, setTab] = useState<CalTab>('earnings');
  const earnings = useMemo(() => getEarnings(), []);
  const ipos = useMemo(() => getIpos(), []);
  const macro = useMemo(() => buildMacro(), []);

  return (
    <TerminalPanelChrome title="Calendar" onClose={onClose}>
      <div className="wolf-term__rp-tabs" role="tablist">
        {(
          [
            ['earnings', 'Earnings'],
            ['ipo', 'IPOs'],
            ['macro', 'Economic'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'on' : ''}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'earnings' ? (
        <ul className="wolf-term__rp-list">
          {earnings.map((row: EarningsData) => (
            <li key={row.symbol}>
              <button
                type="button"
                className="wolf-term__rp-row"
                onClick={() => onSelect(`NSE:${row.symbol}`)}
              >
                <span className="wolf-term__rp-row-main">
                  <b>{row.symbol}</b>
                  <em>
                    {row.name} · {row.time}
                  </em>
                </span>
                <span className="wolf-term__rp-row-side">
                  <strong>{row.date}</strong>
                  <span>
                    EPS {row.expectedEPS}
                    {row.prevEPS != null ? ` · prev ${row.prevEPS}` : ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {tab === 'ipo' ? (
        <ul className="wolf-term__rp-list">
          {ipos.map((row: IpoData) => (
            <li key={row.name}>
              <div className="wolf-term__rp-row wolf-term__rp-row--static">
                <span className="wolf-term__rp-row-main">
                  <b>
                    {row.name}
                    <i
                      className={`wolf-term__pill ${
                        row.status === 'Open' ? 'wolf-term__pill--hot' : 'wolf-term__pill--muted'
                      }`}
                    >
                      {row.status}
                    </i>
                  </b>
                  <em>
                    {row.priceRange} · lot {row.lotSize}
                  </em>
                </span>
                <span className="wolf-term__rp-row-meta">
                  {row.openDate} → {row.closeDate}
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {tab === 'macro' ? (
        <ul className="wolf-term__rp-list">
          {macro.map((ev) => (
            <li key={ev.id}>
              <div className="wolf-term__rp-row wolf-term__rp-row--static">
                <span className="wolf-term__rp-row-main">
                  <b>
                    <i className="wolf-term__flag">{ev.country}</i>
                    {ev.title}
                    <i
                      className={`wolf-term__pill ${
                        ev.impact === 'High'
                          ? 'wolf-term__pill--hot'
                          : ev.impact === 'Medium'
                            ? 'wolf-term__pill--mid'
                            : 'wolf-term__pill--muted'
                      }`}
                    >
                      {ev.impact}
                    </i>
                  </b>
                  <em>
                    Forecast {ev.forecast || '—'} · Prev {ev.previous || '—'}
                  </em>
                </span>
                <span className="wolf-term__rp-row-side">
                  <strong>{ev.date}</strong>
                  <span>{ev.time} IST</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </TerminalPanelChrome>
  );
}
