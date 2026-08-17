import { useCallback, useEffect, useState } from 'react';
import { Copy, Loader2, Plus, Ticket, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';
import {
  adminCreatePromoCode,
  adminDeletePromoCode,
  adminListPromoCodes,
  adminUpdatePromoCode,
  type PromoCodeRow,
} from '../../services/promoCodes';
import { TRIAL_DAYS } from '../../constants/plans';

type PromoCodesTabProps = {
  adminEmail: string | null;
  adminPassword?: string | null;
};

const FIELD =
  'w-full px-3 py-2 rounded-lg bg-[#121520] border border-[#1a1f2e] text-sm text-slate-200 focus:outline-none focus:border-[#d4af37]/40';
const LABEL = 'block text-[10px] uppercase tracking-wider text-slate-500 mb-1.5 font-bold';

const PLAN_LABELS: Record<string, string> = {
  trial: '3-day trial',
  monthly: 'Monthly',
  quarterly: '3 Months',
  yearly: 'Yearly',
};

const PLAN_ACCESS_DAYS: Record<string, number> = {
  trial: TRIAL_DAYS,
  monthly: 30,
  quarterly: 90,
  yearly: 365,
};

function randomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = 'WOLF';
  for (let i = 0; i < 6; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function formatExpiry(iso: string | null) {
  if (!iso) return 'No expiry';
  return new Date(iso).toLocaleDateString('en-IN', { dateStyle: 'medium' });
}

function planLabel(planId: string | null | undefined) {
  if (!planId) return null;
  return PLAN_LABELS[planId] || planId;
}

function accessDaysForPlan(planId: string | null | undefined) {
  if (!planId) return 0;
  return PLAN_ACCESS_DAYS[planId] || 0;
}

/** Admin: create / toggle / delete promo codes users can redeem for access. */
export default function PromoCodesTab({ adminEmail, adminPassword }: PromoCodesTabProps) {
  const [rows, setRows] = useState<PromoCodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const [code, setCode] = useState(randomCode);
  const [label, setLabel] = useState('');
  const [planId, setPlanId] = useState<string>('');
  const [discountPercent, setDiscountPercent] = useState<string>('');
  const [maxRedemptions, setMaxRedemptions] = useState<string>('');
  const [expiresAt, setExpiresAt] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await adminListPromoCodes(adminEmail, adminPassword);
      setRows(list);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [adminEmail, adminPassword]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => {
      void adminListPromoCodes(adminEmail, adminPassword).then((list) => {
        setRows(list);
        setLoading(false);
      });
    }, 12_000);
    return () => window.clearInterval(t);
  }, [load, adminEmail, adminPassword]);

  const create = async () => {
    setSaving(true);
    setError('');
    setMsg('');
    try {
      const discount = Math.min(100, Math.max(0, Math.round(Number(discountPercent) || 0)));
      const createdCode = code.trim().toUpperCase();
      const days = accessDaysForPlan(planId || null);
      await adminCreatePromoCode(
        {
          code: createdCode,
          label:
            label.trim() ||
            (discount > 0
              ? `${discount}% off${planId ? ` ${planLabel(planId)}` : ''}`.trim()
              : undefined),
          grantDays: days,
          planId: planId || null,
          discountPercent: discount,
          maxRedemptions: maxRedemptions.trim() ? Number(maxRedemptions) : null,
          expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59`).toISOString() : null,
          enabled: true,
        },
        adminEmail,
        adminPassword,
      );
      setMsg(
        discount > 0
          ? `Created ${createdCode} — ${discount}% off${planId ? ` ${planLabel(planId)}` : ''}${days ? ` · ${days}d access` : ''}.`
          : `Created ${createdCode} — share it with the user.`,
      );
      setCode(randomCode());
      setLabel('');
      setPlanId('');
      setDiscountPercent('');
      setMaxRedemptions('');
      setExpiresAt('');
      await load();
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Could not create promo code';
      setError(
        /cannot get|not found|404/i.test(raw)
          ? 'API is updating — wait ~1 minute, then click Create again.'
          : raw,
      );
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (row: PromoCodeRow) => {
    setError('');
    try {
      await adminUpdatePromoCode(row.id, { enabled: !row.enabled }, adminEmail, adminPassword);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update promo code');
    }
  };

  const remove = async (row: PromoCodeRow) => {
    if (!window.confirm(`Delete promo ${row.code}? This cannot be undone.`)) return;
    setError('');
    try {
      await adminDeletePromoCode(row.id, adminEmail, adminPassword);
      setMsg(`Deleted ${row.code}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete promo code');
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setMsg(`Copied ${value}`);
    } catch {
      setMsg(value);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4 space-y-3">
        <h3 className="text-sm font-bold text-[#d4af37] flex items-center gap-2">
          <Ticket className="w-4 h-4" />
          Create promo code
        </h3>
        <p className="text-[11px] text-slate-500">
          Choose a plan and set % off (0–100). Access length comes from the plan automatically
          (3-day trial · Monthly 30d · 3 Months 90d · Yearly 365d). No plan = signup unlock only
          (lifetime until desk changes it).
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className={LABEL}>Code</label>
            <div className="flex gap-2">
              <input className={FIELD} value={code} onChange={(e) => setCode(e.target.value)} />
              <button
                type="button"
                className="px-2 rounded-lg border border-[#1a1f2e] text-slate-400 text-[10px] font-bold"
                onClick={() => setCode(randomCode())}
              >
                Random
              </button>
            </div>
          </div>
          <div>
            <label className={LABEL}>Label (optional)</label>
            <input
              className={FIELD}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="30% Quarterly offer"
            />
          </div>
          <div>
            <label className={LABEL}>Plan</label>
            <select className={FIELD} value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">Any / none</option>
              <option value="trial">3-day trial ({TRIAL_DAYS} days)</option>
              <option value="monthly">Monthly (30 days)</option>
              <option value="quarterly">3 Months (90 days)</option>
              <option value="yearly">Yearly (365 days)</option>
            </select>
            {planId ? (
              <p className="mt-1 text-[10px] text-emerald-500/80">
                Access = {accessDaysForPlan(planId)} days from this plan
              </p>
            ) : (
              <p className="mt-1 text-[10px] text-slate-600">No plan tag — access days not tied to a plan</p>
            )}
          </div>
          <div>
            <label className={LABEL}>% off (0–100)</label>
            <input
              className={FIELD}
              type="number"
              min={0}
              max={100}
              value={discountPercent}
              onChange={(e) => setDiscountPercent(e.target.value)}
              placeholder="e.g. 30"
            />
          </div>
          <div>
            <label className={LABEL}>Max uses (blank = unlimited)</label>
            <input
              className={FIELD}
              type="number"
              min={1}
              value={maxRedemptions}
              onChange={(e) => setMaxRedemptions(e.target.value)}
              placeholder="Unlimited"
            />
          </div>
          <div>
            <label className={LABEL}>Expires on (optional)</label>
            <input
              className={FIELD}
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
        </div>
        <button
          type="button"
          disabled={saving || code.trim().length < 3}
          onClick={() => void create()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#d4af37] text-[#0b0e17] text-xs font-bold disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Create code
        </button>
        {error ? <p className="text-xs text-rose-400">{error}</p> : null}
        {msg ? <p className="text-xs text-emerald-400">{msg}</p> : null}
      </div>

      <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1a1f2e] flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-200">Active codes</h3>
          <button type="button" onClick={() => void load()} className="text-[10px] text-slate-500 hover:text-gold">
            Refresh
          </button>
        </div>
        {loading ? (
          <div className="p-8 flex justify-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-slate-500 text-center">No promo codes yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-[#1a1f2e]">
                <tr>
                  <th className="px-4 py-2">Code</th>
                  <th className="px-4 py-2">Plan / % off</th>
                  <th className="px-4 py-2">Access</th>
                  <th className="px-4 py-2">Uses</th>
                  <th className="px-4 py-2">Expires</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-[#1a1f2e]/60">
                    <td className="px-4 py-3">
                      <div className="font-bold text-[#d4af37] tracking-wider">{row.code}</div>
                      {row.label ? <div className="text-[10px] text-slate-500">{row.label}</div> : null}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {row.discountPercent > 0 || row.planId ? (
                        <>
                          {row.discountPercent > 0 ? (
                            <div className="font-bold text-emerald-400">{row.discountPercent}% off</div>
                          ) : null}
                          {row.planId ? (
                            <div className="text-[10px] text-slate-500 uppercase">
                              {planLabel(row.planId)}
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-600">Any plan</div>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {row.planId
                        ? `${row.grantDays > 0 ? row.grantDays : accessDaysForPlan(row.planId)}d`
                        : row.grantDays > 0
                          ? `${row.grantDays}d`
                          : 'Lifetime'}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {row.usedCount}
                      {row.maxRedemptions != null ? ` / ${row.maxRedemptions}` : ' / ∞'}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{formatExpiry(row.expiresAt)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          row.enabled
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                        }`}
                      >
                        {row.enabled ? 'On' : 'Off'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          title="Copy"
                          onClick={() => void copy(row.code)}
                          className="p-1.5 rounded-lg border border-[#1a1f2e] text-slate-400 hover:text-gold"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          title={row.enabled ? 'Disable' : 'Enable'}
                          onClick={() => void toggle(row)}
                          className="p-1.5 rounded-lg border border-[#1a1f2e] text-slate-400 hover:text-gold"
                        >
                          {row.enabled ? (
                            <ToggleRight className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <ToggleLeft className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          title="Delete"
                          onClick={() => void remove(row)}
                          className="p-1.5 rounded-lg border border-[#1a1f2e] text-slate-400 hover:text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
