export type PasswordStrength = 'weak' | 'fair' | 'good' | 'strong';

export function getPasswordStrength(password: string): {
  score: number;
  label: PasswordStrength;
  percent: number;
} {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  const label: PasswordStrength =
    score <= 1 ? 'weak' : score === 2 ? 'fair' : score === 3 ? 'good' : 'strong';
  const percent = Math.min(100, (score / 5) * 100);

  return { score, label, percent };
}

export const strengthColors: Record<PasswordStrength, string> = {
  weak: '#ef4444',
  fair: '#f59e0b',
  good: '#22c55e',
  strong: '#d4af37',
};

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
