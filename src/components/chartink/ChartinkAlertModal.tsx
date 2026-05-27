import { BellRing, X } from 'lucide-react';

interface ChartinkAlertModalProps {
  open: boolean;
  scanName: string;
  formula: string;
  onClose: () => void;
  onCreate: (channel: 'Telegram' | 'Push' | 'Email') => void;
}

export default function ChartinkAlertModal({ open, scanName, formula, onClose, onCreate }: ChartinkAlertModalProps) {
  if (!open) return null;

  return (
    <div className="ci-modal-overlay" role="dialog" aria-modal="true">
      <div className="ci-modal">
        <div className="ci-modal-head">
          <div className="flex items-center gap-2">
            <BellRing className="h-5 w-5 text-gold" />
            <h3 className="text-sm font-bold text-[var(--tf-text)]">Alert on scan</h3>
          </div>
          <button type="button" onClick={onClose} className="ci-btn-ghost p-1">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-dark-muted mt-2">
          Get notified when <strong className="text-gold">{scanName}</strong> finds new matches (Chartink-style alert).
        </p>
        <pre className="ci-modal-formula">{formula || 'No conditions yet'}</pre>
        <div className="ci-modal-actions">
          {(['Telegram', 'Push', 'Email'] as const).map((ch) => (
            <button key={ch} type="button" className="ci-btn-primary flex-1 justify-center" onClick={() => onCreate(ch)}>
              {ch}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
