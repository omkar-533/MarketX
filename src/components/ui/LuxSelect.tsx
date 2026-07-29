import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';

export type LuxSelectOption = {
  value: string;
  label: string;
};

type Props = {
  value: string;
  options: LuxSelectOption[] | readonly string[];
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

function normalizeOptions(options: LuxSelectOption[] | readonly string[]): LuxSelectOption[] {
  return options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
}

/** Gold-themed animated select — replaces ugly native OS dropdowns. */
export default function LuxSelect({
  value,
  options,
  onChange,
  label,
  placeholder = 'Select…',
  className = '',
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const opts = normalizeOptions(options);
  const selected = opts.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`lux-select ${open ? 'lux-select--open' : ''} ${className}`} ref={rootRef}>
      {label ? <span className="lux-select__label">{label}</span> : null}
      <button
        type="button"
        className="lux-select__trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => !disabled && setOpen((o) => !o)}
      >
        <span className={`lux-select__value ${selected ? '' : 'is-placeholder'}`}>
          {selected?.label ?? placeholder}
        </span>
        <motion.span
          className="lux-select__chevron"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 28 }}
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </motion.span>
      </button>

      <AnimatePresence>
        {open ? (
          <motion.ul
            id={listId}
            role="listbox"
            className="lux-select__menu"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
          >
            <div className="lux-select__glow" aria-hidden />
            {opts.map((opt, i) => {
              const on = opt.value === value;
              return (
                <motion.li key={opt.value} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.02 + i * 0.025 }}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={on}
                    className={`lux-select__option ${on ? 'is-on' : ''}`}
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                  >
                    <span>{opt.label}</span>
                    {on ? <Check className="w-3.5 h-3.5 lux-select__check" /> : null}
                  </button>
                </motion.li>
              );
            })}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
