import type { InputHTMLAttributes, ReactNode } from 'react';

interface AuthFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label: string;
  icon?: ReactNode;
  suffix?: ReactNode;
  error?: string;
  hint?: string;
  valid?: boolean;
  prefix?: ReactNode;
}

export default function AuthField({
  label,
  icon,
  error,
  hint,
  valid,
  prefix,
  suffix,
  className = '',
  id,
  ...props
}: AuthFieldProps) {
  const fieldId = id ?? label.toLowerCase().replace(/\s/g, '-');

  return (
    <div className="auth-field-wrap">
      <label htmlFor={fieldId} className="auth-label">
        {label}
      </label>
      <div
        className={`auth-field ${prefix ? 'auth-field--has-prefix' : ''} ${error ? 'auth-field--error' : ''} ${valid ? 'auth-field--valid' : ''}`}
      >
        {prefix}
        {icon && <span className="auth-field-icon">{icon}</span>}
        <input id={fieldId} className={`auth-field-input ${suffix ? '!pr-12' : ''} ${className}`} {...props} />
        {suffix && <span className="auth-field-suffix">{suffix}</span>}
      </div>
      {error && <p className="auth-field-error">{error}</p>}
      {hint && !error && <p className="auth-field-hint">{hint}</p>}
    </div>
  );
}
