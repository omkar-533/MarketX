import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

export interface StrikePricePickerProps {
  value: number;
  strikes: number[];
  atmStrike?: number;
  interval?: number;
  onChange: (strike: number) => void;
  className?: string;
  placeholder?: string;
}

function snapStrike(strike: number, interval: number) {
  if (!interval || interval <= 0) return strike;
  return Math.round(strike / interval) * interval;
}

export default function StrikePricePicker({
  value,
  strikes,
  atmStrike,
  interval = 50,
  onChange,
  className = '',
  placeholder = 'Strike',
}: StrikePricePickerProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const atmItemRef = useRef<HTMLLIElement>(null);
  const [open, setOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });

  const sortedStrikes = useMemo(() => {
    const unique = [...new Set(strikes.filter((s) => s > 0))].sort((a, b) => a - b);
    if (unique.length > 0) return unique;
    const atm = atmStrike ?? interval * 500;
    return Array.from({ length: 21 }, (_, i) => atm + (i - 10) * interval);
  }, [strikes, atmStrike, interval]);

  const filtered = useMemo(() => {
    if (!isEditing || !query.trim()) return sortedStrikes;
    return sortedStrikes.filter((s) => String(s).includes(query.trim()));
  }, [sortedStrikes, query, isEditing]);

  const displayValue = isEditing ? query : value > 0 ? String(value) : '';

  const close = useCallback(() => {
    setOpen(false);
    setIsEditing(false);
    setQuery('');
  }, []);

  const updateMenuPosition = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  const openList = useCallback(() => {
    setIsEditing(false);
    setQuery('');
    updateMenuPosition();
    setOpen(true);
  }, [updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (listRef.current?.contains(t)) return;
      close();
    };
    const onReposition = () => updateMenuPosition();
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, close, updateMenuPosition]);

  useEffect(() => {
    if (!open || !atmItemRef.current || !listRef.current) return;
    const list = listRef.current;
    const item = atmItemRef.current;
    list.scrollTop = item.offsetTop - list.clientHeight / 2 + item.clientHeight / 2;
  }, [open, atmStrike, filtered.length]);

  const pickStrike = (strike: number) => {
    onChange(strike);
    close();
  };

  const commitManual = (raw: string) => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      close();
      return;
    }
    onChange(snapStrike(n, interval));
    close();
  };

  const focusInput = () => {
    inputRef.current?.focus({ preventScroll: true });
  };

  const handleInputMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!open) openList();
    focusInput();
  };

  const dropdown =
    open &&
    createPortal(
      <ul
        id={listId}
        ref={listRef}
        role="listbox"
        style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
        className="fixed z-[9999] max-h-48 overflow-y-auto rounded-lg border border-[#1a1f2e] bg-[#0b0e17] shadow-xl py-1 overscroll-contain"
      >
        {filtered.length === 0 ? (
          <li className="px-3 py-2 text-xs text-slate-500">No matching strike</li>
        ) : (
          filtered.map((strike) => {
            const isAtm = atmStrike != null && strike === atmStrike;
            const isSelected = strike === value;
            return (
              <li
                key={strike}
                ref={isAtm ? atmItemRef : undefined}
                role="option"
                aria-selected={isSelected}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickStrike(strike)}
                className={`px-3 py-1.5 text-sm cursor-pointer tabular-nums flex items-center justify-between gap-2 ${
                  isSelected
                    ? 'bg-[#d4af37]/15 text-[#d4af37]'
                    : 'text-slate-200 hover:bg-[#121520]'
                }`}
              >
                <span>{strike.toLocaleString('en-IN')}</span>
                {isAtm && (
                  <span className="text-[9px] font-bold uppercase text-[#d4af37]/80">ATM</span>
                )}
              </li>
            );
          })
        )}
      </ul>,
      document.body,
    );

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={displayValue}
          placeholder={placeholder}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          className="w-full bg-[#0b0e17] border border-[#1a1f2e] text-slate-200 text-sm rounded px-2 py-1 pr-7 focus:outline-none focus:border-[#d4af37]/50 cursor-pointer"
          onMouseDown={handleInputMouseDown}
          onFocus={() => {
            if (!open) openList();
          }}
          onChange={(e) => {
            setIsEditing(true);
            setQuery(e.target.value);
            if (!open) {
              updateMenuPosition();
              setOpen(true);
            }
            const n = Number(e.target.value);
            if (Number.isFinite(n) && n > 0) onChange(n);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close();
            if (e.key === 'Enter') {
              e.preventDefault();
              if (filtered.length === 1) pickStrike(filtered[0]);
              else commitManual(isEditing ? query : String(value));
            }
            if (e.key === 'ArrowDown' && !open) openList();
          }}
          onBlur={() => {
            window.setTimeout(() => {
              const active = document.activeElement;
              if (rootRef.current?.contains(active)) return;
              if (listRef.current?.contains(active)) return;
              commitManual(isEditing ? query : String(value));
            }, 180);
          }}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Show strike prices"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (open) close();
            else {
              openList();
              focusInput();
            }
          }}
          className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-slate-500 hover:text-[#d4af37]"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {dropdown}
    </div>
  );
}
