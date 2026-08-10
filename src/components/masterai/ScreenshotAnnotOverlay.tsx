import { useMemo, useRef, useState } from 'react';
import type { ChartLevel, ChartShape } from '../../utils/chartAnnotations';
import type { NormalizedBBox, WolfEvidenceItem } from '../../utils/wolfEvidence';
import {
  primaryAnnotations,
  toProfessionalAnnotations,
  type ProfessionalAnnotation,
} from '../../utils/annotationEngine';

type Props = {
  imageUrl: string;
  levels?: ChartLevel[];
  shapes?: ChartShape[];
  marks?: WolfEvidenceItem[];
  highlightLabel?: string | null;
  focusBbox?: NormalizedBBox | null;
  focusLabel?: string | null;
  dimUnfocused?: boolean;
  showAllMarks?: boolean;
  /** Hide entry zones when no clean setup */
  allowEntry?: boolean;
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

function shrinkWolfchartZone(
  y1: number,
  y2: number,
): { y: number; h: number } {
  const top = Math.min(y1, y2);
  const bot = Math.max(y1, y2);
  let h = bot - top;
  // Cap giant zones — keep near candle scale
  if (h > 8) {
    const mid = (top + bot) / 2;
    h = 4.5;
    return { y: mid - h / 2, h };
  }
  return { y: top, h: Math.max(1.2, h) };
}

function isFocusAnn(
  a: ProfessionalAnnotation,
  focusBbox: NormalizedBBox | null,
  focusLabel: string | null,
): boolean {
  if (focusLabel && (focusLabel === a.label || focusLabel === a.raw.title)) return true;
  if (!focusBbox) return false;
  return (
    Math.abs(a.geometry.y - focusBbox.y) < 0.05 ||
    Math.abs(a.y - (focusBbox.y + focusBbox.height / 2)) < 0.04
  );
}

/** Professional V3 overlay — thin levels / dashed targets / narrow entry zones. */
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
  allowEntry = true,
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

  const professional = useMemo(
    () =>
      toProfessionalAnnotations(marks, {
        allowEntry,
        maxPrimary: showAllMarks || expanded ? 12 : 7,
      }),
    [marks, allowEntry, showAllMarks, expanded],
  );

  const visibleAnnots = useMemo(() => {
    const list = showAllMarks || expanded ? professional : primaryAnnotations(professional);
    return list.slice(0, showAllMarks || expanded ? 12 : 7);
  }, [professional, showAllMarks, expanded]);

  const legend = useMemo(() => {
    const items: { key: string; label: string; tone: string }[] = [];
    levels.forEach((l, i) => {
      items.push({
        key: `l-${i}`,
        label: l.label || (l.kind === 'support' ? 'S' : 'R'),
        tone: l.kind === 'support' ? 'bull' : l.kind === 'resistance' ? 'bear' : 'neutral',
      });
    });
    visibleAnnots.forEach((a) => {
      items.push({ key: `m-${a.id}`, label: a.label, tone: a.tone });
    });
    return items.slice(0, 10);
  }, [levels, visibleAnnots]);

  const hasMarks = levels.length > 0 || shapes.length > 0 || marks.length > 0;
  if (!imageUrl) return null;

  const renderAnnot = (a: ProfessionalAnnotation) => {
    const focused = isFocusAnn(a, focusBbox, focusLabel);
    const dim = dimUnfocused && Boolean(focusBbox) && !focused;
    const g = a.geometry;
    const common = {
      key: a.id,
      type: 'button' as const,
      title: `${a.label}${a.reason ? ` — ${a.reason}` : ''}`,
      onClick: () => onMarkClick?.(a.id),
      className: `wolf-ann wolf-ann--${a.style} wolf-ann--${a.tone} ${focused ? 'is-focus' : ''} ${
        dim ? 'is-dim' : ''
      }`,
    };

    if (a.style === 'zone_narrow') {
      return (
        <button
          {...common}
          style={{
            left: `${g.x * 100}%`,
            top: `${g.y * 100}%`,
            width: `${g.width * 100}%`,
            height: `${Math.max(g.height * 100, 2.2)}%`,
          }}
        >
          <span className="wolf-ann__lab">{a.label}</span>
        </button>
      );
    }

    if (a.style === 'bos_arrow') {
      return (
        <button
          {...common}
          style={{
            left: `${g.x * 100}%`,
            top: `${g.y * 100}%`,
          }}
        >
          <span className="wolf-ann__bos" aria-hidden>
            ↑
          </span>
          <span className="wolf-ann__lab">{a.label}</span>
        </button>
      );
    }

    if (a.style === 'liquidity_dots') {
      return (
        <button
          {...common}
          style={{
            left: `${g.x * 100}%`,
            top: `${a.y * 100}%`,
            width: `${g.width * 100}%`,
          }}
        >
          <span className="wolf-ann__liq-line" aria-hidden />
          <span className="wolf-ann__dot" aria-hidden />
          <span className="wolf-ann__lab">{a.label}</span>
        </button>
      );
    }

    // Horizontal levels (solid / dashed / invalid)
    return (
      <button
        {...common}
        style={{
          left: '3%',
          right: '3%',
          top: `${a.y * 100}%`,
          width: 'auto',
        }}
      >
        <span className="wolf-ann__line" aria-hidden />
        <span className="wolf-ann__lab">{a.label}</span>
        {a.style === 'hline_invalid' ? (
          <span className="wolf-ann__x" aria-hidden>
            ✕
          </span>
        ) : null}
      </button>
    );
  };

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

        {/* WOLF primary layer — professional marks */}
        <div className="wolf-shot__annots" aria-label="Wolf annotations">
          {visibleAnnots.map(renderAnnot)}
        </div>

        {focusBbox ? (
          <div
            className="wolf-shot__focus wolf-shot__focus--slim"
            style={{
              left: `${Math.max(2, focusBbox.x * 100)}%`,
              top: `${(focusBbox.y + focusBbox.height / 2) * 100}%`,
              width: `${Math.min(96, Math.max(focusBbox.width * 100, 40))}%`,
              height: '0',
            }}
          >
            {focusLabel ? <span className="wolf-shot__focus-lab">{focusLabel}</span> : null}
          </div>
        ) : null}

        {canMap ? (
          <svg className="wolf-shot__svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            {shapes.map((s, i) => {
              if (s.type === 'zone' && s.p1 != null && s.p2 != null) {
                const rawY1 = yOf(Math.max(s.p1, s.p2));
                const rawY2 = yOf(Math.min(s.p1, s.p2));
                const { y, h } = shrinkWolfchartZone(rawY1, rawY2);
                const hi = highlightLabel && s.label && highlightLabel === s.label;
                // Prefer thin band for non-entry labels
                const isEntryLike = /entry|ob|fvg|demand|supply/i.test(s.label || '');
                if (!isEntryLike && h > 3.5) {
                  const mid = y + h / 2;
                  return (
                    <g key={`z-${i}`}>
                      <line
                        x1={8}
                        y1={mid}
                        x2={94}
                        y2={mid}
                        className={`wolf-shot__line ${toneClass(s.tone)} ${hi ? 'is-hi' : ''}`}
                      />
                      {s.label ? (
                        <text x={9} y={mid - 1.1} className={`wolf-shot__label ${toneClass(s.tone)}`}>
                          {s.label}
                        </text>
                      ) : null}
                    </g>
                  );
                }
                return (
                  <g key={`z-${i}`}>
                    <rect
                      x={18}
                      y={y}
                      width={48}
                      height={Math.max(1.4, Math.min(h, 5.5))}
                      className={`wolf-shot__zone wolf-shot__zone--narrow ${toneClass(s.tone)} ${
                        hi ? 'is-hi' : ''
                      }`}
                    />
                    {s.label ? (
                      <text x={19} y={y - 0.8} className={`wolf-shot__label ${toneClass(s.tone)}`}>
                        {s.label}
                      </text>
                    ) : null}
                  </g>
                );
              }
              if ((s.type === 'hline' || s.type === 'hray' || s.type === 'label') && s.p1 != null) {
                const y = yOf(s.p1);
                const hi = highlightLabel && s.label && highlightLabel === s.label;
                const dashed = /target|tp|t1|t2/i.test(s.label || '');
                return (
                  <g key={`h-${i}`} className={hi ? 'is-hi' : undefined}>
                    <line
                      x1={s.type === 'hray' ? 35 : 4}
                      y1={y}
                      x2={96}
                      y2={y}
                      className={`wolf-shot__line ${toneClass(s.tone)} ${dashed ? 'is-dashed' : ''}`}
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
                  {l.label || (l.kind === 'support' ? 'S' : 'R')}
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
          {professional.length > 7 && !expanded && !showAllMarks ? (
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
