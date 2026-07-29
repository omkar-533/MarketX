import { HeartHandshake } from 'lucide-react';
import LuxSelect from '../ui/LuxSelect';

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
    <div className="md:col-span-2 tj-psych">
      <div className="flex items-center gap-2 mb-2.5">
        <HeartHandshake className="w-3.5 h-3.5 text-[#d4af37]" />
        <h3 className="tj-psych__title">Trading Psychology</h3>
        <span className="tj-psych__hint">this trade</span>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <LuxSelect
          label="Before trade"
          value={value.beforeEmotion}
          options={TRADE_EMOTIONS}
          onChange={(v) => onChange({ beforeEmotion: v })}
        />
        <LuxSelect
          label="After trade"
          value={value.afterEmotion}
          options={TRADE_EMOTIONS}
          onChange={(v) => onChange({ afterEmotion: v })}
        />
      </div>

      <div className="tj-psych__sliders mt-3 space-y-2.5">
        <label className="tj-psych__slider-label">
          Confidence <em>{value.confidence}%</em>
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={value.confidence}
          onChange={(e) => onChange({ confidence: e.target.value })}
          className="tj-psych__range w-full"
        />
        <label className="tj-psych__slider-label">
          Discipline <em>{value.discipline}%</em>
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={value.discipline}
          onChange={(e) => onChange({ discipline: e.target.value })}
          className="tj-psych__range w-full"
        />
        <label className="tj-psych__slider-label">
          Fear / Greed <em>{value.fearGreed}%</em>
        </label>
        <input
          type="range"
          min={0}
          max={100}
          value={value.fearGreed}
          onChange={(e) => onChange({ fearGreed: e.target.value })}
          className="tj-psych__range w-full"
        />
      </div>

      <textarea
        value={value.psychologyNote}
        onChange={(e) => onChange({ psychologyNote: e.target.value })}
        className={`${inputClass} tj-field mt-2.5`}
        rows={2}
        placeholder="Mindset notes (optional)"
      />
    </div>
  );
}
