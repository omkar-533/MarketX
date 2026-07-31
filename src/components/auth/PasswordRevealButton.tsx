import { Eye, EyeOff } from 'lucide-react';

type PasswordRevealButtonProps = {
  show: boolean;
  onToggle: () => void;
};

/** Gold Show/Hide control for password fields — large enough for mobile tap. */
export default function PasswordRevealButton({ show, onToggle }: PasswordRevealButtonProps) {
  return (
    <button
      type="button"
      className="auth-reveal-btn"
      onClick={onToggle}
      aria-label={show ? 'Hide password' : 'Show password'}
      title={show ? 'Hide password' : 'Show password'}
    >
      {show ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
      <span>{show ? 'Hide' : 'Show'}</span>
    </button>
  );
}
