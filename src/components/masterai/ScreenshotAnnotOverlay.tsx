import { useMemo, useRef, useState } from 'react';
import type { ChartLevel, ChartShape } from '../../utils/chartAnnotations';
import type { NormalizedBBox, WolfEvidenceItem } from '../../utils/wolfEvidence';

type Props = {
  imageUrl: string;
  levels?: ChartLevel[];
  shapes?: ChartShape[];
  /** Wolf evidence markings (normalized 0–1). */
  marks?: WolfEvidenceItem[];
  highlightLabel?: string | null;
  focusBbox?: NormalizedBBox | null;
  focusLabel?: string | null;
  dimUnfocused?: boolean;
  showAllMarks?: boolean;
  onMarkClick?: (id: string) => void;
};

function collectPrices(levels: ChartLevel[], shapes: ChartShape[]): number[] {
  const out: number[] = [];
  for (const l of levels) {
    if (Number.isFinite(l.price) && l.price > 0) out.push(l.price);
  }
  for (const s of shapes) {
    if (s.p1 != null && Number.isFinite(s.p1) && s.p1 > 0) out.push(s.p1);
    if (s.p2 != null && Number.isFinite(s.p2) && s.p2 > 0) out.push(s.p2);
  }
  return out;
}

function toneClass(tone?: string): string {
  if (tone === 'bull') return 'is-bull';
  if (tone === 'bear') return 'is-bear';
  return 'is-neutral';
}

function markTone(type: string): string {
  if (/entry|target|support|bos|liquidity/.test(type)) return 'bull';
  if (/invalid|resist|sweep|choch/.test(type)) return 'bear';
  return 'neutral';
}

/** Maps wolfchart prices + wolfevidence bboxes onto the screenshot. */
export default function ScreenshotAnnotOverlay({
  imageUrl,
  levels = [],
  shapes = [],
  marks = [],
  highlightLabel = null,
  focusBbox = null,
  focusLabel = null,
  dimUnfocused = false,
  showAllMarks = false,
  onMarkClick,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [expanded, setExpanded] = useState(false);

  const prices = useMemo(() => collectPrices(levels, shapes), [levels, shapes]);
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 0;
  const span = max - min;
  const canMap = span > 0 && prices.length >= 2;

  const yOf = (price: number) => {
    if (!canMap) return 50;
    const t = (max - price) / span;
    return 8 + t * 84;
  };

  const visibleMarks = useMemo(() => {
    const list = marks || [];
    if (showAllMarks || expanded) return list.slice(0, 12);
    return list.slice(0, 7);
  }, [marks, showAllMarks, expanded]);

  const legend = useMemo(() => {
    const items: { key: string; label: string; tone: string; y?: number }[] = [];
    levels.forEach((l, i) => {
      items.push({
        key: `l-${i}`,
        label: l.label || l.kind,
        tone: l.kind === 'support' ? 'bull' : l.kind === 'resistance' ? 'bear' : 'neutral',
        y: canMap ? yOf(l.price) : undefined,
      });
    });
    shapes.forEach((s, i) => {
      const mid =
        s.p1 != null && s.p2 != null ? (s.p1 + s.p2) / 2 : s.p1 != null ? s.p1 : s.p2;
      items.push({
        key: `s-${i}`,
        label: s.label || s.type,
        tone: s.tone || 'neutral',
        y: mid != null && canMap ? yOf(mid) : undefined,
      });
    });
    visibleMarks.forEach((m) => {
      items.push({
        key: `m-${m.id}`,
        label: m.title,
        tone: markTone(m.type),
      });
    });
    return items.slice(0, 14);
  }, [levels, shapes, canMap, min, max, visibleMarks]);

  const hasMarks = levels.length > 0 || shapes.length > 0 || marks.length > 0;
  if (!imageUrl) return null;

  return (
    <div className="wolf-shot" ref={wrapRef}>
      <div className="wolf-shot__frame">
        <img
          src={imageUrl}
          alt=""
          className="wolf-shot__img"
          onLoad={(e) => {
            const img = e.currentTarget;
            setNatural({ w: img.naturalWidth, h: img.naturalHeight });
          }}
        />

        <div className="wolf-shot__marks" aria-label="Wolf marks">
          {visibleMarks.map((m) => {
            const isFocus =
              Boolean(
                focusBbox &&
                  Math.abs(m.bbox.x - focusBbox.x) < 0.03 &&
                  Math.abs(m.bbox.y - focusBbox.y) < 0.03,
              ) || Boolean(focusLabel && focusLabel === m.title);
            const dim = dimUnfocused && Boolean(focusBbox) && !isFocus;
            return (
              <button
                key={m.id}
                type="button"
                className={`wolf-shot__mark wolf-shot__mark--${m.type} ${toneClass(markTone(m.type))} ${
                  isFocus ? 'is-focus' : ''
                } ${dim ? 'is-dim' : ''}`}
                style={{
                  left: `${m.bbox.x * 100}%`,
                  top: `${m.bbox.y * 100}%`,
                  width: `${m.bbox.width * 100}%`,
                  height: `${m.bbox.height * 100}%`,
                }}
                title={m.title}
                onClick={() => onMarkClick?.(m.id)}
              >
                <span className="wolf-shot__mark-lab">{m.title}</span>
              </button>
            );
          })}
        </div>

        {focusBbox ? (
          <div
            className="wolf-shot__focus"
            style={{
              left: `${focusBbox.x * 100}%`,
              top: `${focusBbox.y * 100}%`,
              width: `${focusBbox.width * 100}%`,
              height: `${focusBbox.height * 100}%`,
            }}
          >
            {focusLabel ? <span className="wolf-shot__focus-lab">{focusLabel}</span> : null}
          </div>
        ) : null}

        {canMap ? (
          <svg className="wolf-shot__svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            {shapes.map((s, i) => {
              if (s.type === 'zone' && s.p1 != null && s.p2 != null) {
                const y1 = yOf(Math.max(s.p1, s.p2));
                const y2 = yOf(Math.min(s.p1, s.p2));
                const hi = highlightLabel && s.label && highlightLabel === s.label;
                return (
                  <rect
                    key={`z-${i}`}
                    x={4}
                    y={y1}
                    width={92}
                    height={Math.max(1.2, y2 - y1)}
                    className={`wolf-shot__zone ${toneClass(s.tone)} ${hi ? 'is-hi' : ''}`}
                  />
                );
              }
              if ((s.type === 'hline' || s.type === 'hray' || s.type === 'label') && s.p1 != null) {
                const y = yOf(s.p1);
                const hi = highlightLabel && s.label && highlightLabel === s.label;
                return (
                  <g key={`h-${i}`} className={hi ? 'is-hi' : undefined}>
                    <line
                      x1={s.type === 'hray' ? 35 : 4}
                      y1={y}
                      x2={96}
                      y2={y}
                      className={`wolf-shot__line ${toneClass(s.tone)}`}
                    />
                    {s.label ? (
                      <text x={6} y={y - 1.2} className={`wolf-shot__label ${toneClass(s.tone)}`}>
                        {s.label}
                      </text>
                    ) : null}
                  </g>
                );
              }
              if ((s.type === 'trend' || s.type === 'ray' || s.type === 'arrow') && s.p1 != null && s.p2 != null) {
                return (
                  <line
                    key={`t-${i}`}
                    x1={12}
                    y1={yOf(s.p1)}
                    x2={88}
                    y2={yOf(s.p2)}
                    className={`wolf-shot__line wolf-shot__line--diag ${toneClass(s.tone)}`}
                  />
                );
              }
              return null;
            })}
            {levels.map((l, i) => (
              <g key={`lv-${i}`}>
                <line
                  x1={4}
                  y1={yOf(l.price)}
                  x2={96}
                  y2={yOf(l.price)}
                  className={`wolf-shot__line ${
                    l.kind === 'support' ? 'is-bull' : l.kind === 'resistance' ? 'is-bear' : 'is-neutral'
                  }`}
                />
                <text
                  x={6}
                  y={yOf(l.price) - 1.2}
                  className={`wolf-shot__label ${
                    l.kind === 'support' ? 'is-bull' : l.kind === 'resistance' ? 'is-bear' : 'is-neutral'
                  }`}
                >
                  {l.label || l.kind}
                </text>
              </g>
            ))}
          </svg>
        ) : null}

        {!canMap && (levels.length > 0 || shapes.length > 0) && !marks.length ? (
          <div className="wolf-shot__note">
            Marks listed below — exact overlay needs a clearer price scale on the screenshot.
          </div>
        ) : null}
      </div>

      {hasMarks ? (
        <ul className="wolf-shot__legend">
          {legend.map((item) => (
            <li
              key={item.key}
              className={`wolf-shot__chip ${toneClass(item.tone)} ${
                highlightLabel && item.label === highlightLabel ? 'is-hi' : ''
              }`}
            >
              {item.label}
            </li>
          ))}
          {marks.length > 7 && !expanded && !showAllMarks ? (
            <li>
              <button type="button" className="wolf-shot__more" onClick={() => setExpanded(true)}>
                SHOW MORE
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
      {natural.w > 0 ? <span className="sr-only">{`${natural.w}×${natural.h}`}</span> : null}
    </div>
  );
}
