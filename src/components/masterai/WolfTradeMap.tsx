type Props = {
  entry?: string;
  stopLoss?: string;
  target?: string;
  invalidation?: string;
  onFocus?: (kind: 'entry' | 'sl' | 'target' | 'invalidation') => void;
};

/** Vertical visual trade map — tap nodes to focus chart. */
export default function WolfTradeMap({ entry, stopLoss, target, invalidation, onFocus }: Props) {
  if (!entry && !stopLoss && !target && !invalidation) return null;

  return (
    <div className="wolf-map" aria-label="Trade map">
      <div className="wolf-map__head">TRADE MAP</div>
      <div className="wolf-map__rail">
        {target ? (
          <button type="button" className="wolf-map__node wolf-map__node--target" onClick={() => onFocus?.('target')}>
            <span className="wolf-map__ico">🎯</span>
            <span className="wolf-map__lab">TARGET</span>
            <span className="wolf-map__txt">{target}</span>
          </button>
        ) : null}
        {target && entry ? <div className="wolf-map__line" aria-hidden /> : null}
        {entry ? (
          <button type="button" className="wolf-map__node wolf-map__node--entry" onClick={() => onFocus?.('entry')}>
            <span className="wolf-map__ico">📍</span>
            <span className="wolf-map__lab">ENTRY ZONE</span>
            <span className="wolf-map__txt">{entry}</span>
          </button>
        ) : null}
        {(entry || target) && (stopLoss || invalidation) ? (
          <div className="wolf-map__line wolf-map__line--danger" aria-hidden />
        ) : null}
        {stopLoss || invalidation ? (
          <button
            type="button"
            className="wolf-map__node wolf-map__node--inv"
            onClick={() => onFocus?.(invalidation ? 'invalidation' : 'sl')}
          >
            <span className="wolf-map__ico">🛑</span>
            <span className="wolf-map__lab">{invalidation ? 'INVALIDATION' : 'SL'}</span>
            <span className="wolf-map__txt">{invalidation || stopLoss}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
