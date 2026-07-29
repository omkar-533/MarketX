import { useRef, useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, ImageUp, Loader2, Send, X } from 'lucide-react';
import {
  submitAccessRequest,
  type AccessRequestSummary,
} from '../../services/appInviteAuth';
import { ACCESS_PROOF_ACCEPT, prepareAccessProof } from '../../services/accessProofImage';

type AccessProofUploadProps = {
  request: AccessRequestSummary | null;
  onSubmitted: () => unknown | Promise<unknown>;
  /** Prefill from the signed-in account when available. */
  defaults?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
  };
};

/**
 * Full access-request form — name, mobile, TradingView ID, optional details.
 * Desk receives everything; user sees a professional 24-hour confirmation.
 */
export default function AccessProofUpload({
  request,
  onSubmitted,
  defaults,
}: AccessProofUploadProps) {
  const [fullName, setFullName] = useState(defaults?.name?.trim() || '');
  const [phone, setPhone] = useState(defaults?.phone?.trim() || '');
  const [tradingViewId, setTradingViewId] = useState('');
  const [email, setEmail] = useState(defaults?.email?.trim() || '');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pending = request?.status === 'pending';

  const pickFile = async (file?: File | null) => {
    if (!file) return;
    setError('');
    try {
      setPreview(await prepareAccessProof(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that image');
    }
  };

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const name = fullName.trim();
    const mobile = phone.trim();
    const tvId = tradingViewId.trim();
    if (name.length < 2) {
      setError('Please enter your full name');
      return;
    }
    if (mobile.replace(/\D/g, '').length < 10) {
      setError('Please enter a valid mobile number');
      return;
    }
    if (tvId.length < 2) {
      setError('Please enter your TradingView username / ID');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await submitAccessRequest({
        fullName: name,
        phone: mobile,
        tradingViewId: tvId,
        email: email.trim() || undefined,
        message: message.trim() || undefined,
        screenshot: preview || undefined,
      });
      setDone(true);
      setPreview(null);
      await onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setBusy(false);
    }
  };

  if (pending || done) {
    return (
      <div className="access-proof access-proof--pending">
        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
        <div>
          <p className="access-proof__title">Request received</p>
          <p className="access-proof__hint">
            Thank you for submitting your details. Our team will review your request and get back
            to you within 24 hours.
          </p>
          {request?.status === 'pending' ? (
            <button type="button" className="access-proof__relink" onClick={() => setDone(false)}>
              Submit another request
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <form className="access-proof" onSubmit={(e) => void submit(e)}>
      {request?.status === 'rejected' ? (
        <div className="access-proof__rejected">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            Your previous request was not approved
            {request.adminNote ? ` — ${request.adminNote}` : ''}. Please update your details and
            submit again.
          </span>
        </div>
      ) : null}

      <div className="access-proof__grid">
        <div>
          <label className="access-proof__label" htmlFor="access-full-name">
            Full name
          </label>
          <input
            id="access-full-name"
            type="text"
            className="access-proof__note"
            placeholder="Your full name"
            value={fullName}
            maxLength={80}
            autoComplete="name"
            disabled={busy}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <div>
          <label className="access-proof__label" htmlFor="access-phone">
            Mobile number
          </label>
          <input
            id="access-phone"
            type="tel"
            className="access-proof__note"
            placeholder="10-digit mobile number"
            value={phone}
            maxLength={20}
            autoComplete="tel"
            disabled={busy}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label className="access-proof__label" htmlFor="access-tv-id">
          TradingView username / ID
        </label>
        <input
          id="access-tv-id"
          type="text"
          className="access-proof__note"
          placeholder="e.g. your_tv_username"
          value={tradingViewId}
          maxLength={80}
          autoComplete="off"
          disabled={busy}
          onChange={(e) => setTradingViewId(e.target.value)}
        />
        <p className="access-proof__field-hint">
          Open TradingView → profile → copy your username (not email).
        </p>
      </div>

      <div>
        <label className="access-proof__label" htmlFor="access-email">
          Email (optional)
        </label>
        <input
          id="access-email"
          type="email"
          className="access-proof__note"
          placeholder="you@example.com"
          value={email}
          maxLength={120}
          autoComplete="email"
          disabled={busy}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div>
        <label className="access-proof__label" htmlFor="access-message">
          Additional details (optional)
        </label>
        <textarea
          id="access-message"
          className="access-proof__note access-proof__textarea"
          placeholder="Plan preference, payment reference, or any note for the desk"
          value={message}
          maxLength={500}
          rows={3}
          disabled={busy}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCESS_PROOF_ACCEPT}
        className="hidden"
        onChange={(e) => void pickFile(e.target.files?.[0])}
      />

      {preview ? (
        <div className="access-proof__preview">
          <img src={preview} alt="Selected screenshot" />
          <button
            type="button"
            className="access-proof__clear"
            onClick={() => setPreview(null)}
            aria-label="Remove screenshot"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="access-proof__drop"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          <ImageUp className="w-5 h-5" />
          <span className="access-proof__title">Screenshot (optional)</span>
          <span className="access-proof__hint">Payment proof / reference if you have one</span>
        </button>
      )}

      {error ? (
        <p className="access-proof__error">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        className="access-proof__submit"
        disabled={
          busy || fullName.trim().length < 2 || phone.trim().length < 8 || tradingViewId.trim().length < 2
        }
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {busy ? 'Submitting…' : 'Submit request'}
      </button>
    </form>
  );
}
