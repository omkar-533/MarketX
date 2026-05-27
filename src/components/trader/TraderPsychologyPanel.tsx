import { useState } from 'react';
import { Brain, HeartHandshake, Trash2 } from 'lucide-react';
import type { User } from '../../hooks/useAuth';
import { useTraderPsychology } from '../../hooks/useTraderPsychology';

const EMOTIONS = ['Calm', 'Confident', 'Anxious', 'Fearful', 'Greedy', 'Frustrated', 'Focused', 'Overtrading'];

interface TraderPsychologyPanelProps {
  user: User;
  compact?: boolean;
}

export default function TraderPsychologyPanel({ user, compact = false }: TraderPsychologyPanelProps) {
  const { entries, averages, addEntry, removeEntry, disciplineScore, confidenceScore, fearGreedScore } =
    useTraderPsychology(user);

  const [form, setForm] = useState({
    beforeEmotion: 'Calm',
    afterEmotion: 'Confident',
    confidence: '78',
    discipline: '80',
    fearGreed: '28',
    note: '',
  });
  const [status, setStatus] = useState('');

  const inputClass =
    'w-full rounded-xl border border-[#1a1f2e] bg-[#121520] px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-[#d4af37]/40 focus:outline-none';

  const handleSave = () => {
    const entry = addEntry({
      beforeEmotion: form.beforeEmotion,
      afterEmotion: form.afterEmotion,
      confidence: Number(form.confidence),
      discipline: Number(form.discipline),
      fearGreed: Number(form.fearGreed),
      note: form.note,
    });
    if (!entry) return;
    setStatus('Psychology entry saved to your trader profile.');
    setForm({
      beforeEmotion: 'Calm',
      afterEmotion: 'Confident',
      confidence: '78',
      discipline: '80',
      fearGreed: '28',
      note: '',
    });
    setTimeout(() => setStatus(''), 3000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <HeartHandshake className="w-4 h-4 text-gold" />
            Trading Psychology
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Mindset, emotions, and discipline — synced with your journal coach insights.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Discipline', value: disciplineScore, color: 'text-gold' },
          { label: 'Confidence', value: confidenceScore, color: 'text-emerald-400' },
          { label: 'Fear/Greed', value: fearGreedScore, color: 'text-amber-400' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-dark-elevated border border-dark-border px-3 py-2 text-center">
            <p className="text-[10px] uppercase text-slate-500">{s.label}</p>
            <p className={`text-lg font-bold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {!compact && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[10px] uppercase text-slate-500 mb-1 block">Before trade</label>
              <select
                value={form.beforeEmotion}
                onChange={(e) => setForm({ ...form, beforeEmotion: e.target.value })}
                className={inputClass}
              >
                {EMOTIONS.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase text-slate-500 mb-1 block">After trade</label>
              <select
                value={form.afterEmotion}
                onChange={(e) => setForm({ ...form, afterEmotion: e.target.value })}
                className={inputClass}
              >
                {EMOTIONS.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase text-slate-500">Confidence {form.confidence}%</label>
            <input
              type="range"
              min={0}
              max={100}
              value={form.confidence}
              onChange={(e) => setForm({ ...form, confidence: e.target.value })}
              className="w-full accent-gold"
            />
            <label className="text-[10px] uppercase text-slate-500">Discipline {form.discipline}%</label>
            <input
              type="range"
              min={0}
              max={100}
              value={form.discipline}
              onChange={(e) => setForm({ ...form, discipline: e.target.value })}
              className="w-full accent-gold"
            />
            <label className="text-[10px] uppercase text-slate-500">Fear / Greed index {form.fearGreed}%</label>
            <input
              type="range"
              min={0}
              max={100}
              value={form.fearGreed}
              onChange={(e) => setForm({ ...form, fearGreed: e.target.value })}
              className="w-full accent-gold"
            />
          </div>

          <textarea
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            className={inputClass}
            rows={3}
            placeholder="Session reflection — what went well, what to improve..."
          />

          <button
            type="button"
            onClick={handleSave}
            className="w-full rounded-xl bg-gold py-2.5 text-sm font-bold text-dark-surface hover:bg-gold-light transition-colors"
          >
            Save psychology entry
          </button>

          {status && (
            <p className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
              {status}
            </p>
          )}
        </>
      )}

      <div>
        <p className="text-xs font-bold text-slate-400 mb-2 flex items-center gap-1">
          <Brain className="w-3.5 h-3.5" /> Recent entries ({entries.length})
        </p>
        <div className={`space-y-2 ${compact ? 'max-h-40' : 'max-h-56'} overflow-y-auto`}>
          {entries.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">No entries yet. Log your first session above.</p>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl bg-dark-elevated border border-dark-border p-3 flex gap-2"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-slate-500">{new Date(entry.date).toLocaleString()}</p>
                  <p className="text-sm font-semibold text-slate-200 mt-0.5">
                    {entry.beforeEmotion} → {entry.afterEmotion}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    D {entry.discipline} · C {entry.confidence} · F/G {entry.fearGreed}
                  </p>
                  {entry.note && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{entry.note}</p>}
                </div>
                {!compact && (
                  <button
                    type="button"
                    onClick={() => removeEntry(entry.id)}
                    className="shrink-0 p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-500/10"
                    aria-label="Delete entry"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {entries.length > 0 && (
        <p className="text-[10px] text-slate-600">
          Avg from {entries.length} entries · Discipline {averages.discipline}% · Confidence {averages.confidence}%
        </p>
      )}
    </div>
  );
}
