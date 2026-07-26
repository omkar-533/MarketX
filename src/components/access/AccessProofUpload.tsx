import { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ImageUp, Loader2, Send, X } from 'lucide-react';
import { submitAccessProof, type AccessRequestSummary } from '../../services/appInviteAuth';
import { ACCESS_PROOF_ACCEPT, prepareAccessProof } from '../../services/accessProofImage';

type AccessProofUploadProps = {
  /** Latest request for this account, so a pending review is shown instead of the form. */
  request: AccessRequestSummary | null;
  onSubmitted: () => unknown | Promise<unknown>;
};

/** Screenshot proof → admin review. Compressed client-side before upload. */
export default function AccessProofUpload({ request, onSubmitted }: AccessProofUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [note, setNote] = useState('');
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

  const submit = async () => {
    if (!preview) {
      setError('Attach a screenshot first');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await submitAccessProof(preview, note.trim() || undefined);
      setDone(true);
      setPreview(null);
      setNote('');
      await onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  if (pending || done) {
    return (
      <div className="access-proof access-proof--pending">
        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
        <div>
          <p className="access-proof__title">Screenshot received — under review</p>
          <p className="access-proof__hint">
            We unlock your access as soon as the admin checks it. You will see it here without
            signing in again.
          </p>
          {request?.status === 'pending' ? (
            <button type="button" className="access-proof__relink" onClick={() => setDone(false)}>
              Upload a different screenshot
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="access-proof">
      {request?.status === 'rejected' ? (
        <div className="access-proof__rejected">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            Your last screenshot was not approved
            {request.adminNote ? ` — ${request.adminNote}` : ''}. Please upload a clearer one.
          </span>
        </div>
      ) : null}

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
        <button type="button" className="access-proof__drop" onClick={() => inputRef.current?.click()}>
          <ImageUp className="w-5 h-5" />
          <span className="access-proof__title">Upload your screenshot</span>
          <span className="access-proof__hint">PNG, JPG or WebP — a clear full screenshot</span>
        </button>
      )}

      <input
        type="text"
        className="access-proof__note"
        placeholder="Client ID or a note for the admin (optional)"
        value={note}
        maxLength={200}
        onChange={(e) => setNote(e.target.value)}
      />

      {error ? (
        <p className="access-proof__error">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </p>
      ) : null}

      <button
        type="button"
        className="access-proof__submit"
        onClick={() => void submit()}
        disabled={busy || !preview}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        Send for approval
      </button>
    </div>
  );
}
