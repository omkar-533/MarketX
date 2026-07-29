import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, CalendarRange, Sparkles, X } from 'lucide-react';
import type { PnlCurrency, TradeRecord } from '../../types/journal';
import { formatPnlAmount, tradePnlCurrency } from '../../services/globalInstrumentService';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export type DayTradeSummary = {
  dateKey: string;
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
};

function tradeDateKey(trade: TradeRecord): string {
  const d = new Date(trade.date);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function buildTradesByDay(trades: TradeRecord[]): Map<string, DayTradeSummary> {
  const map = new Map<string, DayTradeSummary>();

  for (const trade of trades) {
    const key = tradeDateKey(trade);
    if (!key) continue;

    const existing = map.get(key) ?? {
      dateKey: key,
      pnl: 0,
      trades: 0,
      wins: 0,
      losses: 0,
    };

    existing.pnl += trade.pnl;
    existing.trades += 1;
    if (trade.pnl > 0) existing.wins += 1;
    else if (trade.pnl < 0) existing.losses += 1;
    map.set(key, existing);
  }

  return map;
}

function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export type CalendarCell = {
  day: number;
  dateKey: string;
  inMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
  summary: DayTradeSummary | null;
};

function todayDateKey(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

export function buildMonthGrid(
  year: number,
  month: number,
  tradesByDay: Map<string, DayTradeSummary>,
): CalendarCell[][] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = todayDateKey();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startPad = mondayIndex(new Date(year, month, 1));
  const totalCells = Math.ceil((startPad + daysInMonth) / 7) * 7;

  const cells: CalendarCell[] = [];

  for (let i = 0; i < totalCells; i += 1) {
    let y = year;
    let m = month;
    let day = 1;
    let inMonth = false;

    if (i < startPad) {
      const prevLast = new Date(year, month, 0).getDate();
      day = prevLast - (startPad - 1 - i);
      m = month === 0 ? 11 : month - 1;
      y = month === 0 ? year - 1 : year;
      inMonth = false;
    } else if (i < startPad + daysInMonth) {
      day = i - startPad + 1;
      inMonth = true;
    } else {
      day = i - startPad - daysInMonth + 1;
      m = month === 11 ? 0 : month + 1;
      y = month === 11 ? year + 1 : year;
      inMonth = false;
    }

    const dateKey = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const cellDate = new Date(y, m, day);
    cellDate.setHours(0, 0, 0, 0);

    cells.push({
      day,
      dateKey,
      inMonth,
      isToday: dateKey === todayKey,
      isFuture: cellDate > today,
      summary: tradesByDay.get(dateKey) ?? null,
    });
  }

  const weeks: CalendarCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

function formatCompactPnl(value: number, currency: PnlCurrency = 'INR') {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : value > 0 ? '+' : '';
  if (currency === 'INR') {
    if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(1)}L`;
    if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1)}k`;
    return `${sign}₹${abs.toFixed(0)}`;
  }
  const core = formatPnlAmount(abs, currency).replace(/^[-+]?/, '');
  return `${sign}${core}`;
}

function cellTone(cell: CalendarCell): string {
  if (!cell.inMonth) return 'tj-cal__cell--muted';
  if (!cell.summary || cell.summary.trades === 0) {
    if (cell.isToday) return 'tj-cal__cell--today';
    if (cell.isFuture) return 'tj-cal__cell--future';
    return 'tj-cal__cell--empty';
  }
  if (cell.summary.pnl > 0) return 'tj-cal__cell--win';
  if (cell.summary.pnl < 0) return 'tj-cal__cell--loss';
  return 'tj-cal__cell--flat';
}

function formatDayTitle(dateKey: string) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

interface JournalCalendarProps {
  trades: TradeRecord[];
  mutedClass?: string;
}

export default function JournalCalendar({ trades }: JournalCalendarProps) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [direction, setDirection] = useState(0);

  const tradesByDay = useMemo(() => buildTradesByDay(trades), [trades]);
  const weeks = useMemo(
    () => buildMonthGrid(viewYear, viewMonth, tradesByDay),
    [viewYear, viewMonth, tradesByDay],
  );

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

  const monthStats = useMemo(() => {
    let totalPnl = 0;
    let tradeDays = 0;
    let winDays = 0;
    let lossDays = 0;
    const prefix = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-`;

    tradesByDay.forEach((summary, key) => {
      if (!key.startsWith(prefix)) return;
      if (summary.trades === 0) return;
      tradeDays += 1;
      totalPnl += summary.pnl;
      if (summary.pnl > 0) winDays += 1;
      else if (summary.pnl < 0) lossDays += 1;
    });

    return { totalPnl, tradeDays, winDays, lossDays };
  }, [tradesByDay, viewYear, viewMonth]);

  const selectedTrades = useMemo(() => {
    if (!selectedDay) return [];
    return trades
      .filter((t) => tradeDateKey(t) === selectedDay)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [trades, selectedDay]);

  const selectedSummary = selectedDay ? tradesByDay.get(selectedDay) : null;

  const shiftMonth = (delta: number) => {
    setDirection(delta);
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setSelectedDay(null);
  };

  const goToday = () => {
    const ty = now.getFullYear();
    const tm = now.getMonth();
    setDirection(ty * 12 + tm >= viewYear * 12 + viewMonth ? 1 : -1);
    setViewYear(ty);
    setViewMonth(tm);
    setSelectedDay(todayDateKey());
  };

  const monthKey = `${viewYear}-${viewMonth}`;

  return (
    <div className="tj-cal">
      <div className="tj-cal__hero">
        <div className="tj-cal__hero-orb" aria-hidden />
        <div className="tj-cal__hero-copy">
          <p className="tj-chart__eyebrow">
            <CalendarRange className="w-3 h-3" /> Session map
          </p>
          <h2 className="tj-cal__title">Trade Calendar</h2>
          <p className="tj-cal__sub">Daily heat map · tap a session for the full tape</p>
        </div>

        <div className="tj-cal__nav">
          <motion.button
            type="button"
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => shiftMonth(-1)}
            className="tj-cal__nav-btn"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </motion.button>
          <motion.button
            type="button"
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.95 }}
            onClick={goToday}
            className="tj-cal__today"
          >
            Today
          </motion.button>
          <AnimatePresence mode="wait">
            <motion.span
              key={monthKey}
              className="tj-cal__month"
              initial={{ opacity: 0, y: direction >= 0 ? 10 : -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: direction >= 0 ? -10 : 10 }}
              transition={{ duration: 0.22 }}
            >
              {monthLabel}
            </motion.span>
          </AnimatePresence>
          <motion.button
            type="button"
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => shiftMonth(1)}
            className="tj-cal__nav-btn"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </motion.button>
        </div>
      </div>

      <div className="tj-cal__stats">
        {[
          {
            label: 'Month P&L',
            value: formatCompactPnl(monthStats.totalPnl),
            tone: monthStats.totalPnl >= 0 ? 'up' : 'down',
          },
          { label: 'Sessions', value: String(monthStats.tradeDays), tone: '' },
          { label: 'Win days', value: String(monthStats.winDays), tone: 'up' },
          { label: 'Loss days', value: String(monthStats.lossDays), tone: 'down' },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            className={`tj-cal__stat ${s.tone ? `tj-cal__stat--${s.tone}` : ''}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 + i * 0.05 }}
          >
            <span>{s.label}</span>
            <strong>{s.value}</strong>
          </motion.div>
        ))}
      </div>

      <div className="tj-cal__board">
        <div className="tj-cal__weekdays">
          {WEEKDAYS.map((day) => (
            <div key={day} className="tj-cal__weekday">
              {day}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={monthKey}
            className="tj-cal__grid"
            initial={{ opacity: 0, x: direction >= 0 ? 28 : -28, filter: 'blur(4px)' }}
            animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, x: direction >= 0 ? -24 : 24, filter: 'blur(3px)' }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          >
            {weeks.map((week, weekIndex) =>
              week.map((cell, dayIndex) => {
                const hasTrades = Boolean(cell.summary && cell.summary.trades > 0);
                const pnl = cell.summary?.pnl ?? 0;
                const dayTrades = hasTrades
                  ? trades.filter((t) => tradeDateKey(t) === cell.dateKey)
                  : [];
                const dayCurrency = dayTrades[0] ? tradePnlCurrency(dayTrades[0]) : 'INR';
                const selected = selectedDay === cell.dateKey;
                const idx = weekIndex * 7 + dayIndex;

                return (
                  <motion.button
                    key={cell.dateKey}
                    type="button"
                    onClick={() => setSelectedDay(cell.dateKey)}
                    className={`tj-cal__cell ${cellTone(cell)} ${selected ? 'tj-cal__cell--on' : ''}`}
                    initial={{ opacity: 0, scale: 0.86, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{
                      delay: 0.02 + idx * 0.012,
                      type: 'spring',
                      stiffness: 420,
                      damping: 24,
                    }}
                    whileHover={cell.inMonth ? { y: -3, scale: 1.03, zIndex: 2 } : undefined}
                    whileTap={cell.inMonth ? { scale: 0.97 } : undefined}
                  >
                    {hasTrades && pnl !== 0 ? (
                      <span className="tj-cal__cell-glow" aria-hidden />
                    ) : null}
                    <div className="tj-cal__cell-top">
                      <span className={`tj-cal__day ${cell.isToday ? 'is-today' : ''}`}>{cell.day}</span>
                      {hasTrades ? (
                        <span className="tj-cal__trades">{cell.summary!.trades}t</span>
                      ) : null}
                    </div>

                    {hasTrades ? (
                      <div className="tj-cal__pnl-wrap">
                        <p
                          className={`tj-cal__pnl ${
                            pnl > 0 ? 'is-up' : pnl < 0 ? 'is-down' : 'is-flat'
                          }`}
                        >
                          {formatCompactPnl(pnl, dayCurrency)}
                        </p>
                        {cell.summary!.wins > 0 && cell.summary!.losses > 0 ? (
                          <p className="tj-cal__wl">
                            <span className="is-up">{cell.summary!.wins}W</span>
                            <span>·</span>
                            <span className="is-down">{cell.summary!.losses}L</span>
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      cell.inMonth && !cell.isFuture ? <p className="tj-cal__dash">·</p> : null
                    )}
                  </motion.button>
                );
              }),
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="tj-cal__legend">
        <span>
          <i className="tj-cal__dot tj-cal__dot--win" /> Profit
        </span>
        <span>
          <i className="tj-cal__dot tj-cal__dot--loss" /> Loss
        </span>
        <span>
          <i className="tj-cal__dot tj-cal__dot--today" /> Today
        </span>
      </div>

      <AnimatePresence>
        {selectedDay ? (
          <motion.div
            className="tj-cal__detail"
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 360, damping: 26 }}
          >
            <div className="tj-cal__detail-glow" aria-hidden />
            <div className="tj-cal__detail-head">
              <div>
                <p className="tj-chart__eyebrow">
                  <Sparkles className="w-3 h-3" /> Day tape
                </p>
                <p className="tj-cal__detail-title">{formatDayTitle(selectedDay)}</p>
                {selectedSummary && selectedSummary.trades > 0 ? (
                  <p className="tj-cal__detail-sub">
                    {selectedSummary.trades} trade{selectedSummary.trades === 1 ? '' : 's'} ·{' '}
                    <span className={selectedSummary.pnl >= 0 ? 'is-up' : 'is-down'}>
                      {formatPnlAmount(
                        selectedSummary.pnl,
                        selectedTrades[0] ? tradePnlCurrency(selectedTrades[0]) : 'INR',
                      )}
                    </span>
                  </p>
                ) : (
                  <p className="tj-cal__detail-sub">No trades logged this session</p>
                )}
              </div>
              <motion.button
                type="button"
                className="tj-cal__close"
                whileHover={{ rotate: 90, scale: 1.08 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setSelectedDay(null)}
                aria-label="Close"
              >
                <X className="w-3.5 h-3.5" />
              </motion.button>
            </div>

            {selectedTrades.length > 0 ? (
              <div className="tj-cal__tape">
                {selectedTrades.map((trade, i) => (
                  <motion.div
                    key={trade.id}
                    className={`tj-cal__trade ${trade.pnl >= 0 ? 'is-up' : 'is-down'}`}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 + i * 0.04 }}
                  >
                    <div>
                      <p className="tj-cal__trade-name">{trade.instrument}</p>
                      <p className="tj-cal__trade-meta">
                        {trade.side} · {trade.type} ·{' '}
                        {new Date(trade.date).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {trade.strategy ? ` · ${trade.strategy}` : ''}
                      </p>
                    </div>
                    <p className="tj-cal__trade-pnl">
                      {formatPnlAmount(trade.pnl, tradePnlCurrency(trade))}
                    </p>
                  </motion.div>
                ))}
              </div>
            ) : (
              <p className="tj-cal__empty-note">Quiet day — nothing on the tape.</p>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
