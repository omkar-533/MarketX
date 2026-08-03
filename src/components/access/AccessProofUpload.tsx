import { useRef, useState, type FormEvent } from 'react';
import { AlertCircle, CheckCircle2, ImageUp, Loader2, Send, X } from 'lucide-react';
import { submitAccessRequest, type AccessRequestSummary } from '../../services/appInviteAuth';
import { ACCESS_PROOF_ACCEPT, prepareAccessProof } from '../../services/accessProofImage';

type AccessProofUploadProps = {
  request: AccessRequestSummary | null;
  onSubmitted: () => unknown | Promise<unknown>;
  defaults?: {
    name?: string | null;
    phone?: string | null;
  };
};

/** Verification form: name, mobile, demat + first F&O trade screenshot. */
export default function AccessProofUpload({
  request,
  onSubmitted,
  defaults,
}: AccessProofUploadProps) {
  const [fullName, setFullName] = useState(defaults?.name?.trim() || '');
  const [phone, setPhone] = useState(defaults?.phone?.trim() || '');
  const [dematNumber, setDematNumber] = useState('');
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
    const demat = dematNumber.trim();
    if (name.length < 2) {
      setError('Please enter your name');
      return;
    }
    if (mobile.replace(/\D/g, '').length < 10) {
      setError('Please enter a valid registered mobile number');
      return;
    }
    if (demat.length < 4) {
      setError('Please enter your demat account number');
      return;
    }
    if (!preview) {
      setError('Upload your first F&O trade screenshot');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await submitAccessRequest({
        fullName: name,
        phone: mobile,
        dematAccountNumber: demat,
        screenshot: preview,
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
          <p className="access-proof__title">Details received — under review</p>
          <p className="access-proof__hint">
            Our team will verify your F&O trade and unlock access. You will see it here without
            signing in again.
          </p>
          {request?.status === 'pending' ? (
            <button type="button" className="access-proof__relink" onClick={() => setDone(false)}>
              Submit again
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
            {request.adminNote ? ` — ${request.adminNote}` : ''}. Please update details and submit
            again.
          </span>
        </div>
      ) : null}

      <div className="access-proof__grid">
        <div>
          <label className="access-proof__label" htmlFor="access-full-name">
            Name
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
            Registered Mobile Number
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
        <label className="access-proof__label" htmlFor="access-demat">
          Demat Account Number
        </label>
        <input
          id="access-demat"
          type="text"
          className="access-proof__note"
          placeholder="Your demat / client account number"
          value={dematNumber}
          maxLength={40}
          autoComplete="off"
          disabled={busy}
          onChange={(e) => setDematNumber(e.target.value)}
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
          <img src={preview} alt="First F&O trade screenshot" />
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
          <span className="access-proof__title">Upload your first F&O trade screenshot</span>
          <span className="access-proof__hint">PNG, JPG or WebP — clear trade proof</span>
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
          busy ||
          fullName.trim().length < 2 ||
          phone.replace(/\D/g, '').length < 10 ||
          dematNumber.trim().length < 4 ||
          !preview
        }
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {busy ? 'Submitting…' : 'Send for verification'}
      </button>
    </form>
  );
}
