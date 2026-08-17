import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown } from 'lucide-react';

export type LuxSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type LuxSelectGroup = {
  label: string;
  options: LuxSelectOption[];
};

type Props = {
  value: string;
  options?: LuxSelectOption[] | readonly string[];
  groups?: LuxSelectGroup[];
  onChange: (value: string) => void;
  onOpen?: () => void;
  label?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

function normalizeOptions(options: LuxSelectOption[] | readonly string[] | undefined): LuxSelectOption[] {
  return (options || []).map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
}

function OptionRow({
  opt,
  selected,
  index,
  onPick,
}: {
  opt: LuxSelectOption;
  selected: boolean;
  index: number;
  onPick: (value: string) => void;
}) {
  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(0.02 + index * 0.018, 0.22), duration: 0.22 }}
    >
      <button
        type="button"
        role="option"
        aria-selected={selected}
        disabled={opt.disabled}
        className={`lux-select__option ${selected ? 'is-on' : ''} ${opt.disabled ? 'is-disabled' : ''}`}
        onClick={() => {
          if (opt.disabled) return;
          onPick(opt.value);
        }}
      >
        <span>{opt.label}</span>
        {selected ? <Check className="w-3.5 h-3.5 lux-select__check" /> : null}
      </button>
    </motion.li>
  );
}

/** Gold-themed animated select — replaces ugly native OS dropdowns. */
export default function LuxSelect({
  value,
  options,
  groups,
  onChange,
  onOpen,
  label,
  placeholder = 'Select…',
  className = '',
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const flat = useMemo(() => {
    if (groups?.length) return groups.flatMap((g) => g.options);
    return normalizeOptions(options);
  }, [groups, options]);
  const selected = flat.find((o) => o.value === value && !o.disabled);

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

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
  };

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
        onClick={() => {
          if (disabled) return;
          setOpen((was) => {
            const next = !was;
            if (next) onOpen?.();
            return next;
          });
        }}
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
            initial={{ opacity: 0, y: -10, scale: 0.96, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -8, scale: 0.97, filter: 'blur(4px)' }}
            transition={{ type: 'spring', stiffness: 380, damping: 26 }}
          >
            <div className="lux-select__glow" aria-hidden />
            {groups?.length
              ? groups.map((g, gi) => (
                  <li key={`${g.label}-${gi}`} className="lux-select__group" role="presentation">
                    {g.label ? <div className="lux-select__group-label">{g.label}</div> : null}
                    <ul className="lux-select__group-list">
                      {g.options.map((opt, i) => (
                        <OptionRow
                          key={opt.value || `${gi}-${i}`}
                          opt={opt}
                          selected={opt.value === value}
                          index={i}
                          onPick={pick}
                        />
                      ))}
                    </ul>
                  </li>
                ))
              : flat.map((opt, i) => (
                  <OptionRow
                    key={opt.value || i}
                    opt={opt}
                    selected={opt.value === value}
                    index={i}
                    onPick={pick}
                  />
                ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
