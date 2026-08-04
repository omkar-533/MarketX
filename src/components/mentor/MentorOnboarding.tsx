import { useState, type FormEvent } from 'react';
import { GraduationCap, Sparkles } from 'lucide-react';
import {
  CAPITAL_OPTIONS,
  EXPERIENCE_OPTIONS,
  GOAL_OPTIONS,
  MARKET_OPTIONS,
  WEAK_AREA_OPTIONS,
  type CapitalBand,
  type MentorGoal,
  type MentorMarket,
  type MentorStudentProfile,
  type TradingExperience,
} from '../../services/mentorStudentProfile';

type MentorOnboardingProps = {
  defaultName?: string;
  defaultLanguage?: string;
  onComplete: (profile: MentorStudentProfile) => void;
};

export default function MentorOnboarding({
  defaultName = '',
  defaultLanguage = 'en-IN',
  onComplete,
}: MentorOnboardingProps) {
  const [name, setName] = useState(defaultName);
  const [language, setLanguage] = useState(defaultLanguage);
  const [experience, setExperience] = useState<TradingExperience>('none');
  const [capital, setCapital] = useState<CapitalBand>('paper');
  const [market, setMarket] = useState<MentorMarket>('nse_fno');
  const [goal, setGoal] = useState<MentorGoal>('learn');
  const [minutesPerDay, setMinutesPerDay] = useState(30);
  const [weakAreas, setWeakAreas] = useState<string[]>([]);
  const [error, setError] = useState('');

  const toggleWeak = (area: string) => {
    setWeakAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area].slice(0, 6),
    );
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (clean.length < 2) {
      setError('Please enter your name');
      return;
    }
    onComplete({
      name: clean,
      language,
      experience,
      capital,
      market,
      goal,
      minutesPerDay: Math.max(10, Math.min(180, minutesPerDay)),
      weakAreas,
      onboardedAt: new Date().toISOString(),
    });
  };

  return (
    <form className="wm-learn wm-learn--onboard" onSubmit={submit}>
      <div className="wm-learn__hero">
        <div className="wm-learn__hero-mark" aria-hidden>
          <GraduationCap className="h-5 w-5" />
        </div>
        <div>
          <p className="wm-learn__eyebrow">
            <Sparkles className="h-3 w-3" />
            Module 1 · Wolf AI Mentor
          </p>
          <h2 className="wm-learn__title">
            Hi{name.trim() ? ` ${name.trim()}` : ''} — welcome to your AI Teacher
          </h2>
          <p className="wm-learn__lead">
            Complete your profile so we can personalize your learning path. Levels are locked in
            sequence — no skipping. Education and process only — no Entry, Stop, or Target calls.
          </p>
        </div>
      </div>

      <div className="wm-learn__grid">
        <label className="wm-learn__field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={40} />
        </label>
        <label className="wm-learn__field">
          <span>Preferred language</span>
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            <option value="en-IN">English (India)</option>
            <option value="hi-IN">Hindi</option>
            <option value="hinglish">Hinglish</option>
          </select>
        </label>
        <label className="wm-learn__field">
          <span>Trading experience</span>
          <select
            value={experience}
            onChange={(e) => setExperience(e.target.value as TradingExperience)}
          >
            {EXPERIENCE_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="wm-learn__field">
          <span>Capital</span>
          <select value={capital} onChange={(e) => setCapital(e.target.value as CapitalBand)}>
            {CAPITAL_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="wm-learn__field">
          <span>Market</span>
          <select value={market} onChange={(e) => setMarket(e.target.value as MentorMarket)}>
            {MARKET_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="wm-learn__field">
          <span>Goal</span>
          <select value={goal} onChange={(e) => setGoal(e.target.value as MentorGoal)}>
            {GOAL_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="wm-learn__field">
          <span>Available time (minutes / day)</span>
          <input
            type="number"
            min={10}
            max={180}
            value={minutesPerDay}
            onChange={(e) => setMinutesPerDay(Number(e.target.value) || 30)}
          />
        </label>
      </div>

      <div className="wm-learn__weak">
        <span className="wm-learn__label">Weak areas (optional)</span>
        <div className="wm-learn__chips">
          {WEAK_AREA_OPTIONS.map((area) => (
            <button
              key={area}
              type="button"
              className={`wm-learn__chip ${weakAreas.includes(area) ? 'wm-learn__chip--on' : ''}`}
              onClick={() => toggleWeak(area)}
            >
              {area}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="wm-learn__error">{error}</p> : null}

      <button type="submit" className="wm-learn__cta">
        Build my learning roadmap
      </button>
    </form>
  );
}
