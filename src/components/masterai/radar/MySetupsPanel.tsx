import { useMemo, useState } from 'react';
import { BookMarked, Plus, ScanSearch, Trash2, Wand2 } from 'lucide-react';
import {
  CONDITION_LABELS,
  createUserSetup,
  deleteUserSetup,
  loadUserSetups,
} from '../../../services/radar/radarStore';
import type { RadarTimeframe, UserSetup, UserSetupCondition } from '../../../services/radar/radarTypes';

type Props = {
  onScanSetup: () => void;
};

const ALL_CONDITIONS = Object.keys(CONDITION_LABELS) as UserSetupCondition[];

export default function MySetupsPanel({ onScanSetup }: Props) {
  const [setups, setSetups] = useState<UserSetup[]>(() => loadUserSetups());
  const [name, setName] = useState('My Liquidity Setup');
  const [timeframe, setTimeframe] = useState<RadarTimeframe>('5m');
  const [selected, setSelected] = useState<UserSetupCondition[]>([
    'liquidity_sweep',
    'structure_shift',
    'volume_expansion',
    'htf_bullish',
  ]);
  const [teachOpen, setTeachOpen] = useState(false);
  const [teachText, setTeachText] = useState('');
  const [teachNote, setTeachNote] = useState('');

  const canSave = name.trim().length > 0 && selected.length > 0;

  const toggle = (c: UserSetupCondition) => {
    setSelected((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  };

  const save = () => {
    if (!canSave) return;
    setSetups(createUserSetup({ name, conditions: selected, timeframe }));
  };

  const parseTeach = () => {
    // Phase 2: deterministic keyword parser only — no arbitrary LLM execution
    const t = teachText.toLowerCase();
    const found: UserSetupCondition[] = [];
    if (/liquidity|sweep/.test(t)) found.push('liquidity_sweep');
    if (/structure|shift|mss|bos/.test(t)) found.push('structure_shift');
    if (/volume/.test(t)) found.push('volume_expansion');
    if (/htf.*bull|higher timeframe.*bull|bullish/.test(t)) found.push('htf_bullish');
    if (/htf.*bear|bearish/.test(t)) found.push('htf_bearish');
    if (/breakout/.test(t)) found.push('breakout');
    if (/breakdown/.test(t)) found.push('breakdown');
    if (/reversal/.test(t)) found.push('reversal');
    const unique = [...new Set(found)];
    if (!unique.length) {
      setTeachNote('No supported conditions matched. Use allowed phrases like liquidity sweep, structure shift, volume.');
      return;
    }
    setSelected(unique);
    setTeachNote(`Mapped to ${unique.length} allowed condition(s). Review and save.`);
    setTeachOpen(false);
  };

  const empty = useMemo(() => setups.length === 0, [setups.length]);

  return (
    <div className="wolf-radar-desk wolf-radar-desk--panel">
      <header className="wolf-radar-desk__header">
        <div className="wolf-radar-desk__brand">
          <div className="wolf-radar-desk__title-row">
            <BookMarked size={18} className="text-gold" />
            <h1>MY SETUPS</h1>
          </div>
          <p className="wolf-radar-desk__subtitle">
            Teach WOLF what to hunt — only predefined conditions are executable.
          </p>
        </div>
      </header>

      <section className="wolf-setups__builder">
        <label className="wolf-setups__field">
          <span>SETUP NAME</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={64} />
        </label>
        <label className="wolf-setups__field">
          <span>TIMEFRAME</span>
          <select value={timeframe} onChange={(e) => setTimeframe(e.target.value as RadarTimeframe)}>
            {(['5m', '15m', '1h', '1D'] as RadarTimeframe[]).map((tf) => (
              <option key={tf} value={tf}>
                {tf.toUpperCase()}
              </option>
            ))}
          </select>
        </label>

        <div className="wolf-setups__conditions">
          <span>CONDITIONS</span>
          <div className="wolf-setups__chips">
            {ALL_CONDITIONS.map((c) => (
              <button
                key={c}
                type="button"
                className={selected.includes(c) ? 'on' : ''}
                onClick={() => toggle(c)}
              >
                {CONDITION_LABELS[c]}
              </button>
            ))}
          </div>
        </div>

        <div className="wolf-radar-desk__card-actions">
          <button type="button" className="primary" disabled={!canSave} onClick={save}>
            <Plus size={14} /> SAVE SETUP
          </button>
          <button type="button" className="ghost" onClick={() => setTeachOpen((v) => !v)}>
            <Wand2 size={14} /> TEACH WOLF
          </button>
        </div>

        {teachOpen && (
          <div className="wolf-setups__teach">
            <textarea
              value={teachText}
              onChange={(e) => setTeachText(e.target.value)}
              placeholder='e.g. "15 minute low swept, 5 minute structure shifts bullish with volume confirmation"'
              rows={3}
            />
            <button type="button" className="primary" onClick={parseTeach}>
              Convert to conditions
            </button>
            <small>Natural language → validated condition JSON only. No arbitrary code execution.</small>
          </div>
        )}
        {teachNote && <p className="wolf-setups__note">{teachNote}</p>}
      </section>

      <section className="wolf-setups__list">
        {empty ? (
          <div className="wolf-radar-desk__empty">
            <p>No saved setups yet</p>
            <span>Define conditions above — WOLF will only hunt what you allow.</span>
          </div>
        ) : (
          setups.map((s) => (
            <article key={s.id} className="wolf-radar-desk__card">
              <div className="wolf-radar-desk__card-main" style={{ cursor: 'default' }}>
                <div className="wolf-radar-desk__card-top">
                  <div>
                    <h3>{s.name}</h3>
                    <span className="price">
                      {s.conditions.length} conditions · {s.timeframe.toUpperCase()}
                    </span>
                  </div>
                </div>
                <ul className="tags">
                  {s.conditions.map((c) => (
                    <li key={c}>{CONDITION_LABELS[c]}</li>
                  ))}
                </ul>
              </div>
              <div className="wolf-radar-desk__card-actions">
                <button type="button" className="primary" onClick={onScanSetup}>
                  <ScanSearch size={14} /> SCAN THIS SETUP
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setSetups(deleteUserSetup(s.id))}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
