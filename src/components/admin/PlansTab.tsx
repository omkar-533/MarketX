import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Crown,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Star,
  Trash2,
} from 'lucide-react';
import { DEFAULT_PLANS, TRIAL_DAYS, type Plan, type PlanId } from '../../constants/plans';
import {
  adminGetPlans,
  adminSavePlans,
  type SubscriptionCatalog,
} from '../../services/plansCatalog';

type PlansTabProps = {
  adminEmail: string | null;
  adminPassword?: string | null;
};

const FIELD =
  'w-full px-3 py-2 rounded-lg bg-[#121520] border border-[#1a1f2e] text-sm text-slate-200 focus:outline-none focus:border-[#d4af37]/40';
const LABEL = 'block text-[10px] uppercase tracking-wider text-slate-500 mb-1.5 font-bold';

function cloneDefaults(): SubscriptionCatalog {
  return {
    trialDays: TRIAL_DAYS,
    plans: DEFAULT_PLANS.map((p) => ({
      ...p,
      features: [...p.features],
      enabled: p.enabled !== false,
    })),
  };
}

function PreviewCard({ plan }: { plan: Plan }) {
  return (
    <div
      className={`relative rounded-xl border p-4 bg-[#0b0e17] ${
        plan.featured ? 'border-[#d4af37]/40 shadow-lg shadow-[#d4af37]/5' : 'border-[#1a1f2e]'
      }`}
    >
      {plan.badge ? (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-[#d4af37] text-[#0b0e17] text-[9px] font-bold rounded-full flex items-center gap-1 whitespace-nowrap">
          <Star className="w-2.5 h-2.5" />
          {plan.badge}
        </div>
      ) : null}
      {!plan.enabled ? (
        <div className="absolute top-2 right-2 text-[9px] font-bold uppercase tracking-wide text-slate-500 bg-slate-800/80 px-1.5 py-0.5 rounded">
          Hidden
        </div>
      ) : null}
      <div className="text-center mt-1 mb-3">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{plan.name}</div>
        <div className="mt-1.5 text-2xl font-bold text-[#d4af37]">
          {plan.price === 0 ? 'Free' : `₹${Number(plan.price || 0).toLocaleString('en-IN')}`}
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5">{plan.period}</div>
        {plan.equivalent ? <div className="text-[10px] text-emerald-400 mt-0.5">{plan.equivalent}</div> : null}
        {plan.save ? <div className="text-[10px] text-emerald-400 mt-0.5">{plan.save}</div> : null}
      </div>
      <p className="text-[10px] text-slate-500 leading-relaxed mb-3">{plan.tagline}</p>
      <ul className="space-y-1.5 mb-3">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-1.5 text-[10px] text-slate-400">
            <Check className={`w-3 h-3 mt-px shrink-0 ${plan.featured ? 'text-[#d4af37]' : 'text-emerald-400'}`} />
            {f}
          </li>
        ))}
      </ul>
      <div className="w-full py-2 rounded-lg text-[10px] font-bold text-center bg-[#121520] border border-[#1a1f2e] text-slate-300">
        {plan.cta}
      </div>
      <p className="text-[9px] text-slate-600 text-center mt-1.5">{plan.note}</p>
    </div>
  );
}

/** Admin editor for subscription pricing & copy shown on landing + in-app. */
export default function PlansTab({ adminEmail, adminPassword }: PlansTabProps) {
  const [catalog, setCatalog] = useState<SubscriptionCatalog | null>(null);
  const [activeId, setActiveId] = useState<PlanId>('monthly');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminGetPlans(adminEmail, adminPassword);
      setCatalog({ trialDays: data.trialDays, plans: data.plans });
      setDirty(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load plans');
      setCatalog(cloneDefaults());
    } finally {
      setLoading(false);
    }
  }, [adminEmail, adminPassword]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = useMemo(
    () => catalog?.plans.find((p) => p.id === activeId) ?? null,
    [catalog, activeId],
  );

  const patchCatalog = (next: SubscriptionCatalog) => {
    setCatalog(next);
    setDirty(true);
    setMsg('');
  };

  const patchPlan = (id: PlanId, patch: Partial<Plan>) => {
    if (!catalog) return;
    const plans = catalog.plans.map((p) => {
      if (p.id !== id) {
        if (patch.featured === true) return { ...p, featured: false };
        return p;
      }
      return { ...p, ...patch };
    });
    patchCatalog({ ...catalog, plans });
  };

  const setFeature = (id: PlanId, index: number, value: string) => {
    if (!active) return;
    const features = [...active.features];
    features[index] = value;
    patchPlan(id, { features });
  };

  const addFeature = (id: PlanId) => {
    if (!active || active.features.length >= 12) return;
    patchPlan(id, { features: [...active.features, ''] });
  };

  const removeFeature = (id: PlanId, index: number) => {
    if (!active) return;
    patchPlan(id, { features: active.features.filter((_, i) => i !== index) });
  };

  const save = async () => {
    if (!catalog) return;
    setSaving(true);
    setMsg('');
    setError('');
    try {
      const cleaned: SubscriptionCatalog = {
        trialDays: catalog.trialDays,
        plans: catalog.plans.map((p) => ({
          ...p,
          features: p.features.map((f) => f.trim()).filter(Boolean),
        })),
      };
      const saved = await adminSavePlans(cleaned, adminEmail, adminPassword);
      setCatalog(saved);
      setDirty(false);
      setMsg('Saved. Landing page and Subscription now use these prices.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save plans');
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = () => {
    patchCatalog(cloneDefaults());
    setMsg('Defaults loaded — click Save to publish.');
  };

  if (loading || !catalog || !active) {
    return (
      <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-10 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-[#d4af37]" />
        {error || 'Loading plans…'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[#d4af37] flex items-center gap-2">
            <Crown className="w-4 h-4" />
            Subscription plans
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5 max-w-xl">
            Edit prices, copy, and features. Changes go live on the landing page and in-app
            Subscription after you save. Plan IDs stay fixed so signup keeps working.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={resetDefaults}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#1a1f2e] text-[11px] font-bold text-slate-400 hover:text-slate-200"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset defaults
          </button>
          <button
            type="button"
            disabled={saving || !dirty}
            onClick={() => void save()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#d4af37] text-[#0b0e17] text-[11px] font-bold hover:bg-[#e0c15a] disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
          </button>
        </div>
      </div>

      {(msg || error) && (
        <p className={`text-[11px] ${error ? 'text-red-400' : 'text-emerald-400'}`}>{error || msg}</p>
      )}

      <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className={LABEL} htmlFor="trial-days">
            Trial length (days)
          </label>
          <input
            id="trial-days"
            type="number"
            min={1}
            max={90}
            value={catalog.trialDays}
            onChange={(e) =>
              patchCatalog({
                ...catalog,
                trialDays: Math.max(1, Math.min(90, Number(e.target.value) || 1)),
              })
            }
            className={`${FIELD} w-28`}
          />
        </div>
        <p className="text-[10px] text-slate-500 pb-2">
          New signups get this many free days. Shown on pricing cards as the trial period.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {catalog.plans.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setActiveId(p.id)}
            className={`rounded-xl border px-3 py-3 text-left transition ${
              activeId === p.id
                ? 'border-[#d4af37]/50 bg-[#d4af37]/10'
                : 'border-[#1a1f2e] bg-[#0b0e17] hover:border-[#d4af37]/25'
            }`}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{p.id}</span>
              {p.enabled === false ? (
                <EyeOff className="w-3 h-3 text-slate-600" />
              ) : (
                <Eye className="w-3 h-3 text-emerald-500/70" />
              )}
            </div>
            <div className="text-sm font-bold text-slate-200 mt-1 truncate">{p.name}</div>
            <div className="text-xs text-[#d4af37] mt-0.5">
              {p.price === 0 ? 'Free' : `₹${p.price.toLocaleString('en-IN')}`}
            </div>
            {p.featured ? (
              <span className="inline-flex items-center gap-0.5 mt-1.5 text-[9px] font-bold text-[#d4af37]">
                <Star className="w-2.5 h-2.5" /> Featured
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-4">
        <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Edit · {active.name}
            </h4>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-[11px] text-slate-400">
                <input
                  type="checkbox"
                  checked={active.enabled !== false}
                  onChange={(e) => patchPlan(active.id, { enabled: e.target.checked })}
                  className="accent-[#d4af37]"
                />
                Visible on site
              </label>
              <label className="flex items-center gap-2 text-[11px] text-slate-400">
                <input
                  type="radio"
                  name="featured-plan"
                  checked={Boolean(active.featured)}
                  onChange={() => patchPlan(active.id, { featured: true })}
                  className="accent-[#d4af37]"
                />
                Featured
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Name</label>
              <input
                className={FIELD}
                value={active.name}
                onChange={(e) => patchPlan(active.id, { name: e.target.value })}
              />
            </div>
            <div>
              <label className={LABEL}>Price (INR)</label>
              <input
                type="number"
                min={0}
                className={FIELD}
                value={active.price}
                onChange={(e) =>
                  patchPlan(active.id, { price: Math.max(0, Math.round(Number(e.target.value) || 0)) })
                }
              />
            </div>
            <div>
              <label className={LABEL}>Period label</label>
              <input
                className={FIELD}
                value={active.period}
                onChange={(e) => patchPlan(active.id, { period: e.target.value })}
                placeholder="per month"
              />
            </div>
            <div>
              <label className={LABEL}>Equivalent / monthly</label>
              <input
                className={FIELD}
                value={active.equivalent || ''}
                onChange={(e) => patchPlan(active.id, { equivalent: e.target.value || undefined })}
                placeholder="≈ ₹2,000 / month"
              />
            </div>
            <div>
              <label className={LABEL}>Badge</label>
              <input
                className={FIELD}
                value={active.badge || ''}
                onChange={(e) => patchPlan(active.id, { badge: e.target.value || undefined })}
                placeholder="Best value"
              />
            </div>
            <div>
              <label className={LABEL}>Save line</label>
              <input
                className={FIELD}
                value={active.save || ''}
                onChange={(e) => patchPlan(active.id, { save: e.target.value || undefined })}
                placeholder="Save ₹2,998"
              />
            </div>
            <div>
              <label className={LABEL}>CTA button</label>
              <input
                className={FIELD}
                value={active.cta}
                onChange={(e) => patchPlan(active.id, { cta: e.target.value })}
              />
            </div>
            <div>
              <label className={LABEL}>Note under CTA</label>
              <input
                className={FIELD}
                value={active.note}
                onChange={(e) => patchPlan(active.id, { note: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className={LABEL}>Tagline</label>
            <textarea
              className={`${FIELD} min-h-[72px] resize-y`}
              value={active.tagline}
              onChange={(e) => patchPlan(active.id, { tagline: e.target.value })}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={LABEL + ' !mb-0'}>Features</label>
              <button
                type="button"
                onClick={() => addFeature(active.id)}
                disabled={active.features.length >= 12}
                className="inline-flex items-center gap-1 text-[10px] font-bold text-[#d4af37] hover:underline disabled:opacity-40"
              >
                <Plus className="w-3 h-3" />
                Add
              </button>
            </div>
            <div className="space-y-2">
              {active.features.map((f, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className={FIELD}
                    value={f}
                    onChange={(e) => setFeature(active.id, i, e.target.value)}
                    placeholder={`Feature ${i + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeFeature(active.id, i)}
                    className="shrink-0 p-2 rounded-lg border border-[#1a1f2e] text-slate-500 hover:text-red-400"
                    aria-label="Remove feature"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Live preview</p>
          <PreviewCard plan={active} />
        </div>
      </div>
    </div>
  );
}
