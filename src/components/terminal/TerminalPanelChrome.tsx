import { X } from 'lucide-react';
import type { ReactNode } from 'react';

export type TerminalPanelChromeProps = {
  title: string;
  onClose: () => void;
  actions?: ReactNode;
  children: ReactNode;
};

/** Shared header + scroll body for terminal right panels. */
export default function TerminalPanelChrome({
  title,
  onClose,
  actions,
  children,
}: TerminalPanelChromeProps) {
  return (
    <aside className="wolf-term__rp" aria-label={title}>
      <div className="wolf-term__rp-head">
        <b>{title}</b>
        <div className="wolf-term__rp-head-actions">
          {actions}
          <button
            type="button"
            className="wolf-term__rp-close"
            title="Close panel"
            aria-label="Close panel"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="wolf-term__rp-body">{children}</div>
    </aside>
  );
}
