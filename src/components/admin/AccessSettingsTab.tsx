import { useCallback, useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import {
  adminGetSettings,
  adminSaveSettings,
  type AccessPopupSettings,
} from '../../services/appInviteAuth';

type AccessSettingsTabProps = {
  adminEmail: string | null;
  adminPassword?: string | null;
  onSaved?: (popup: AccessPopupSettings) => void;
};

const FIELD =
  'w-full px-3 py-2 rounded-lg bg-[#121520] border border-[#1a1f2e] text-sm text-slate-200';
const LABEL = 'block text-[10px] uppercase tracking-wider text-slate-500 mb-1.5 font-bold';

/** The popup users see when their trial ends: link, copy and default grant length. */
export default function AccessSettingsTab({
  adminEmail,
  adminPassword,
  onSaved,
}: AccessSettingsTabProps) {
  const [popup, setPopup] = useState<AccessPopupSettings | null>(null);
  const [sms, setSms] = useState<{ provider: string; devMode: boolean } | null>(null);
  const [trialDays, setTrialDays] = useState(3);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await adminGetSettings(adminEmail, adminPassword);
      setPopup(data.popup);
      setSms(data.sms);
      setTrialDays(data.trialDays);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load settings');
    } finally {
      setLoading(false);
    }
  }, [adminEmail, adminPassword]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = (next: Partial<AccessPopupSettings>) =>
    setPopup((prev) => (prev ? { ...prev, ...next } : prev));

  const save = async () => {
    if (!popup) return;
    setSaving(true);
    setMsg('');
    setError('');
    try {
      const saved = await adminSaveSettings(popup, adminEmail, adminPassword);
      setPopup(saved);
      setMsg('Saved. Users see this the next time the popup opens.');
      onSaved?.(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !popup) {
    return (
      <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-8 text-center text-xs text-slate-500">
        {error || 'Loading settings…'}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-[#d4af37]">Approval access</h3>
            <p className="text-[11px] text-slate-500">
              Users request access with a screenshot. You approve in Access requests — no payment
              gateway required.
            </p>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-slate-400 shrink-0">
            <input
              type="checkbox"
              checked={popup.enabled}
              onChange={(e) => patch({ enabled: e.target.checked })}
              className="accent-[#d4af37]"
            />
            Enabled
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className={LABEL} htmlFor="popup-title">
              Title
            </label>
            <input
              id="popup-title"
              className={FIELD}
              value={popup.title}
              onChange={(e) => patch({ title: e.target.value })}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="popup-button">
              Button text
            </label>
            <input
              id="popup-button"
              className={FIELD}
              value={popup.buttonLabel}
              onChange={(e) => patch({ buttonLabel: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className={LABEL} htmlFor="popup-message">
            Message
          </label>
          <textarea
            id="popup-message"
            className={`${FIELD} min-h-[5rem] resize-y`}
            value={popup.message}
            onChange={(e) => patch({ message: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className={LABEL} htmlFor="popup-url">
              Optional help link (not payment)
            </label>
            <input
              id="popup-url"
              className={FIELD}
              placeholder="https://… instructions / form (optional)"
              value={popup.url}
              onChange={(e) => patch({ url: e.target.value })}
            />
            <p className="text-[10px] text-slate-600 mt-1">
              Leave blank if users only need to upload a screenshot for approval.
            </p>
          </div>
          <div>
            <label className={LABEL} htmlFor="popup-whatsapp">
              WhatsApp number
            </label>
            <input
              id="popup-whatsapp"
              className={FIELD}
              placeholder="919876543210"
              value={popup.whatsapp}
              onChange={(e) => patch({ whatsapp: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className={LABEL} htmlFor="popup-days">
              Default grant on approve (days)
            </label>
            <input
              id="popup-days"
              type="number"
              min={1}
              className={FIELD}
              value={popup.defaultGrantDays}
              onChange={(e) => patch({ defaultGrantDays: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-gold/15 border border-gold/30 text-gold text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save settings
          </button>
          {msg ? <span className="text-[11px] text-emerald-400">{msg}</span> : null}
          {error ? <span className="text-[11px] text-red-400">{error}</span> : null}
        </div>
      </div>

      <div className="bg-[#0b0e17] border border-[#1a1f2e] rounded-xl p-4 text-[11px] text-slate-400 space-y-1.5">
        <p className="text-sm font-bold text-slate-200">System</p>
        <p>
          Free trial length: <span className="text-slate-200 font-bold">{trialDays} days</span>{' '}
          (server env <code className="text-slate-500">TRIAL_DAYS</code>)
        </p>
        <p>
          OTP SMS provider: <span className="text-slate-200 font-bold">{sms?.provider}</span>
          {sms?.devMode
            ? ' — no key configured, so the OTP is shown on screen instead of being texted.'
            : ' — codes are texted to the user.'}
        </p>
      </div>
    </div>
  );
}
