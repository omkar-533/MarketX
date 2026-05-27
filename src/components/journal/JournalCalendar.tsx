import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarRange } from 'lucide-react';
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

function cellStyles(cell: CalendarCell): string {
  const base =
    'relative min-h-[88px] sm:min-h-[96px] p-2 text-left transition-all border-r border-b border-[#1a1f2e] last:border-r-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]/50';

  if (!cell.inMonth) return `${base} bg-[#0a0e14]/80 opacity-50`;
  if (!cell.summary || cell.summary.trades === 0) {
    if (cell.isToday) return `${base} bg-[#d4af37]/5 ring-1 ring-inset ring-[#d4af37]/40`;
    if (cell.isFuture) return `${base} bg-[#0b0e17]`;
    return `${base} bg-[#0b0e17] hover:bg-[#121520]`;
  }
  if (cell.summary.pnl > 0) {
    return `${base} bg-emerald-500/15 hover:bg-emerald-500/22 border-emerald-500/20`;
  }
  if (cell.summary.pnl < 0) {
    return `${base} bg-red-500/15 hover:bg-red-500/22 border-red-500/20`;
  }
  return `${base} bg-amber-500/10 hover:bg-amber-500/15`;
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

export default function JournalCalendar({ trades, mutedClass = 'text-slate-500' }: JournalCalendarProps) {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

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
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setSelectedDay(null);
  };

  const goToday = () => {
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    setSelectedDay(todayDateKey());
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <CalendarRange className="w-5 h-5 text-[#d4af37]" />
            Trade Calendar
          </h2>
          <p className={`${mutedClass} text-sm mt-0.5`}>
            Har din ka total P&L — green profit, red loss. Past & future months browse karo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="p-2 rounded-lg border border-[#1a1f2e] bg-[#121520] text-slate-400 hover:text-[#d4af37] hover:border-[#d4af37]/40"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="px-3 py-2 rounded-lg border border-[#d4af37]/30 bg-[#d4af37]/10 text-xs font-bold text-[#d4af37]"
          >
            Today
          </button>
          <span className="min-w-[140px] text-center text-sm font-bold text-white">{monthLabel}</span>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="p-2 rounded-lg border border-[#1a1f2e] bg-[#121520] text-slate-400 hover:text-[#d4af37] hover:border-[#d4af37]/40"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-lg border border-[#1a1f2e] bg-[#121520] px-3 py-1.5 text-slate-400">
          Month P&L{' '}
          <strong className={monthStats.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
            {formatCompactPnl(monthStats.totalPnl)}
          </strong>
        </span>
        <span className="rounded-lg border border-[#1a1f2e] bg-[#121520] px-3 py-1.5 text-slate-400">
          Trading days <strong className="text-white">{monthStats.tradeDays}</strong>
        </span>
        <span className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-emerald-400">
          Win days {monthStats.winDays}
        </span>
        <span className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-1.5 text-red-400">
          Loss days {monthStats.lossDays}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#1a1f2e] bg-[#0b0e17]">
        <div className="grid grid-cols-7 bg-[#121520] border-b border-[#1a1f2e]">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500"
            >
              {day}
            </div>
          ))}
        </div>

        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7">
            {week.map((cell) => {
              const hasTrades = cell.summary && cell.summary.trades > 0;
              const pnl = cell.summary?.pnl ?? 0;
              const dayTrades = hasTrades
                ? trades.filter((t) => tradeDateKey(t) === cell.dateKey)
                : [];
              const dayCurrency = dayTrades[0] ? tradePnlCurrency(dayTrades[0]) : 'INR';

              return (
                <button
                  key={cell.dateKey}
                  type="button"
                  onClick={() => setSelectedDay(cell.dateKey)}
                  className={`${cellStyles(cell)} ${
                    selectedDay === cell.dateKey ? 'ring-2 ring-[#d4af37] z-[1]' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span
                      className={`text-xs font-bold tabular-nums ${
                        cell.isToday ? 'text-[#d4af37]' : cell.inMonth ? 'text-slate-200' : 'text-slate-600'
                      }`}
                    >
                      {cell.day}
                    </span>
                    {hasTrades && (
                      <span className="text-[9px] font-semibold text-slate-500 tabular-nums">
                        {cell.summary!.trades}t
                      </span>
                    )}
                  </div>

                  {hasTrades ? (
                    <div className="mt-1.5 space-y-0.5">
                      <p
                        className={`text-[11px] sm:text-xs font-black tabular-nums leading-tight ${
                          pnl > 0 ? 'text-emerald-400' : pnl < 0 ? 'text-red-400' : 'text-amber-400'
                        }`}
                      >
                        {formatCompactPnl(pnl, dayCurrency)}
                      </p>
                      {cell.summary!.wins > 0 && cell.summary!.losses > 0 && (
                        <p className="text-[9px] text-slate-500">
                          <span className="text-emerald-400/90">{cell.summary!.wins}W</span>
                          {' · '}
                          <span className="text-red-400/90">{cell.summary!.losses}L</span>
                        </p>
                      )}
                    </div>
                  ) : (
                    cell.inMonth &&
                    !cell.isFuture && (
                      <p className="mt-2 text-[9px] text-slate-600">—</p>
                    )
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 text-[10px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-emerald-500/30 border border-emerald-500/40" /> Profit day
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-red-500/30 border border-red-500/40" /> Loss day
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded ring-1 ring-[#d4af37]/50 bg-[#d4af37]/10" /> Today
        </span>
      </div>

      {selectedDay && (
        <div className="rounded-xl border border-[#1a1f2e] bg-[#111827] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-white">{formatDayTitle(selectedDay)}</p>
              {selectedSummary && selectedSummary.trades > 0 ? (
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedSummary.trades} trade{selectedSummary.trades === 1 ? '' : 's'} · Day total{' '}
                  <span
                    className={`font-bold ${
                      selectedSummary.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {formatPnlAmount(
                      selectedSummary.pnl,
                      selectedTrades[0] ? tradePnlCurrency(selectedTrades[0]) : 'INR',
                    )}
                  </span>
                </p>
              ) : (
                <p className="text-xs text-slate-500 mt-0.5">No trades logged this day</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setSelectedDay(null)}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              Close
            </button>
          </div>

          {selectedTrades.length > 0 ? (
            <div className="mt-3 space-y-2 max-h-[240px] overflow-y-auto">
              {selectedTrades.map((trade) => (
                <div
                  key={trade.id}
                  className={`rounded-lg border p-3 text-sm ${
                    trade.pnl >= 0
                      ? 'border-emerald-500/25 bg-emerald-500/5'
                      : 'border-red-500/25 bg-red-500/5'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div>
                      <p className="font-semibold text-white">{trade.instrument}</p>
                      <p className="text-[10px] text-slate-500">
                        {trade.side} · {trade.type} · {new Date(trade.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <p
                      className={`font-bold tabular-nums shrink-0 ${
                        trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {formatPnlAmount(trade.pnl, tradePnlCurrency(trade))}
                    </p>
                  </div>
                  {trade.strategy && (
                    <p className="text-[10px] text-slate-500 mt-1">{trade.strategy}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Is din koi trade save nahi hai.</p>
          )}
        </div>
      )}
    </div>
  );
}
