import { X } from 'lucide-react';
import { WATCHLIST_LIMIT } from '../../../services/radar/radarStore';

/** Shown when an add would push the watchlist past its cap. */
export default function WatchlistLimitPopup({ onClose }: { onClose: () => void }) {
  return (
    <div className="wolf-watch-limit" role="alertdialog" aria-modal="true">
      <div className="wolf-watch-limit__card">
        <button type="button" className="wolf-watch-limit__close" aria-label="Close" onClick={onClose}>
          <X size={14} />
        </button>
        <p className="wolf-watch-limit__title">Watchlist limit reached</p>
        <p className="wolf-watch-limit__body">
          You can watch {WATCHLIST_LIMIT} symbols at a time. Remove one to make room for another.
        </p>
        <button type="button" className="wolf-watch-limit__ok" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
