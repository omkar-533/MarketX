import { HeartHandshake } from 'lucide-react';

export const TRADE_EMOTIONS = [
  'Calm',
  'Confident',
  'Anxious',
  'Fearful',
  'Greedy',
  'Frustrated',
  'Focused',
  'Overtrading',
] as const;

export type TradePsychologyForm = {
  beforeEmotion: string;
  afterEmotion: string;
  confidence: string;
  discipline: string;
  fearGreed: string;
  psychologyNote: string;
};

export const DEFAULT_TRADE_PSYCHOLOGY: TradePsychologyForm = {
  beforeEmotion: 'Calm',
  afterEmotion: 'Confident',
  confidence: '78',
  discipline: '80',
  fearGreed: '28',
  psychologyNote: '',
};

interface TradePsychologyFieldsProps {
  value: TradePsychologyForm;
  onChange: (patch: Partial<TradePsychologyForm>) => void;
  inputClass: string;
}

export default function TradePsychologyFields({ value, onChange, inputClass }: TradePsychologyFieldsProps) {
  return (
    <div className="md:col-span-2 rounded-xl border border-[#24324b] bg-[#0d1728] p-4 space-y-3">
      <div className="flex items-center gap-2">
        <HeartHandshake className="w-4 h-4 text-[#d4af37]" />
        <h3 className="text-sm font-bold text-white">Trading Psychology</h3>
        <span className="text-[10px] text-slate-500">(with this trade)</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-[10px] uppercase text-slate-500 mb-1 block">Before trade</label>
          <select
            value={value.beforeEmotion}
            onChange={(e) => onChange({ beforeEmotion: e.target.value })}
            className={inputClass}
          >
            {TRADE_EMOTIONS.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] uppercase text-slate-500 mb-1 block">After trade</label>
          <select
            value={value.afterEmotion}
            onChange={(e) => onChange({ afterEmotion: e.target.value })}
            className={inputClass}
          >
            {TRADE_EMOTIONS.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] uppercase text-slate-500">Confidence {value.confidence}%</label>
        <input
          type="range"
          min={0}
          max={100}
          value={value.confidence}
          onChange={(e) => onChange({ confidence: e.target.value })}
          className="w-full accent-[#d4af37]"
        />
        <label className="text-[10px] uppercase text-slate-500">Discipline {value.discipline}%</label>
        <input
          type="range"
          min={0}
          max={100}
          value={value.discipline}
          onChange={(e) => onChange({ discipline: e.target.value })}
          className="w-full accent-[#d4af37]"
        />
        <label className="text-[10px] uppercase text-slate-500">Fear / Greed {value.fearGreed}%</label>
        <input
          type="range"
          min={0}
          max={100}
          value={value.fearGreed}
          onChange={(e) => onChange({ fearGreed: e.target.value })}
          className="w-full accent-[#d4af37]"
        />
      </div>

      <textarea
        value={value.psychologyNote}
        onChange={(e) => onChange({ psychologyNote: e.target.value })}
        className={inputClass}
        rows={2}
        placeholder="Mindset notes for this trade (optional)"
      />
    </div>
  );
}
