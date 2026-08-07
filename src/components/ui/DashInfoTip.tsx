import { useId, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';

export type DashInfoTipProps = {
  /** Short plain-language explanation shown in the floating popup. */
  tip: string;
  /** Optional title above the tip body. */
  title?: string;
  className?: string;
  /** Smaller hit target for dense cards */
  dense?: boolean;
};

/**
 * Tiny ⓘ control — hover / focus opens a floating tip explaining the metric or section.
 */
export default function DashInfoTip({ tip, title, className = '', dense }: DashInfoTipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    <span
      className={`dash-info ${dense ? 'dash-info--dense' : ''} ${open ? 'is-open' : ''} ${className}`.trim()}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <button
        type="button"
        className="dash-info__btn"
        aria-label={title ? `About ${title}` : 'More info'}
        aria-describedby={open ? id : undefined}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Info className="dash-info__ico" strokeWidth={2.25} />
      </button>
      {open ? (
        <span id={id} role="tooltip" className="dash-info__pop">
          {title ? <b className="dash-info__pop-title">{title}</b> : null}
          <span className="dash-info__pop-body">{tip}</span>
        </span>
      ) : null}
    </span>
  );
}

/** Heading row with optional info tip — keeps layouts consistent. */
export function DashInfoLabel({
  children,
  tip,
  title,
  className = '',
}: {
  children: ReactNode;
  tip: string;
  title?: string;
  className?: string;
}) {
  return (
    <span className={`dash-info-label ${className}`.trim()}>
      {children}
      <DashInfoTip tip={tip} title={title} dense />
    </span>
  );
}
