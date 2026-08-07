import { useMemo } from 'react';
import type { PineSettingField } from '../../services/pineSettings';

type Props = {
  fields: PineSettingField[];
  values: Record<string, string | number | boolean>;
  onChange: (next: Record<string, string | number | boolean>) => void;
  disabled?: boolean;
  /** Compact for terminal drawer */
  dense?: boolean;
};

const FIELD =
  'w-full px-2.5 py-1.5 rounded-lg border text-sm focus:outline-none focus:border-[#d4af37]/40 wolf-ind-setting__field';
const LABEL = 'block text-[10px] uppercase tracking-wider mb-1 font-bold wolf-ind-setting__label';

export default function IndicatorSettingsForm({
  fields,
  values,
  onChange,
  disabled,
  dense,
}: Props) {
  const groups = useMemo(() => {
    const map = new Map<string, PineSettingField[]>();
    for (const field of fields) {
      const g = field.group || 'Settings';
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(field);
    }
    return [...map.entries()];
  }, [fields]);

  if (!fields.length) {
    return (
      <p className="text-[11px] wolf-ind-setting__empty">
        No adjustable settings for this indicator yet.
      </p>
    );
  }

  const setValue = (key: string, value: string | number | boolean) => {
    onChange({ ...values, [key]: value });
  };

  return (
    <div className={dense ? 'space-y-3' : 'space-y-4'}>
      {groups.map(([group, groupFields]) => (
        <div key={group} className="space-y-2">
          <h4 className="text-[10px] font-bold uppercase tracking-wider wolf-ind-setting__group">
            {group}
          </h4>
          <div className={dense ? 'grid gap-2' : 'grid sm:grid-cols-2 gap-3'}>
            {groupFields.map((field) => {
              const val = values[field.key] ?? field.defaultValue;
              return (
                <div key={field.key} className={field.type === 'bool' ? 'flex items-end' : ''}>
                  {field.type === 'bool' ? (
                    <label className="flex items-center gap-2 text-xs cursor-pointer pb-1 wolf-ind-setting__check">
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={Boolean(val)}
                        onChange={(e) => setValue(field.key, e.target.checked)}
                        className="rounded"
                      />
                      <span>
                        {field.label}
                        {field.tooltip ? (
                          <span className="block text-[10px] mt-0.5 normal-case tracking-normal font-normal wolf-ind-setting__hint">
                            {field.tooltip}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  ) : (
                    <>
                      <label className={LABEL} title={field.tooltip || undefined}>
                        {field.label}
                      </label>
                      {field.options?.length ? (
                        <select
                          className={FIELD}
                          disabled={disabled}
                          value={String(val)}
                          onChange={(e) => setValue(field.key, e.target.value)}
                        >
                          {field.options.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : field.type === 'int' || field.type === 'float' ? (
                        <input
                          type="number"
                          className={FIELD}
                          disabled={disabled}
                          value={val === '' || val == null ? '' : Number(val)}
                          min={field.min}
                          max={field.max}
                          step={field.type === 'int' ? 1 : 'any'}
                          onChange={(e) => {
                            const n = e.target.value === '' ? '' : Number(e.target.value);
                            setValue(field.key, n === '' ? field.defaultValue : n);
                          }}
                        />
                      ) : (
                        <input
                          type="text"
                          className={FIELD}
                          disabled={disabled}
                          value={String(val ?? '')}
                          onChange={(e) => setValue(field.key, e.target.value)}
                          spellCheck={false}
                        />
                      )}
                      {field.tooltip ? (
                        <p className="text-[10px] mt-1 wolf-ind-setting__hint">{field.tooltip}</p>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
