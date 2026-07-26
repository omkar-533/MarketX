import { useState, type FormEvent, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  LogIn,
  ShieldCheck,
} from 'lucide-react';
import AuthField from './AuthField';
import { isValidEmail } from './authUtils';

export interface AuthFormProps {
  mode: 'login' | 'signup' | 'forgot' | 'otp';
  onLogin: (email: string, password: string) => Promise<void>;
  onSignup: (name: string, email: string, password: string, phone?: string) => Promise<void>;
  onGoogleLogin: () => Promise<void>;
  onOtpLogin: (phone: string, otp: string) => Promise<'sent' | 'verified'>;
  onForgotPassword: (email: string) => Promise<void>;
  onSwitchMode: (mode: 'login' | 'signup' | 'forgot' | 'otp') => void;
  headerExtra?: ReactNode;
}

/** Invite-only login — admin creates email/password; no public signup */
export default function AuthForm({
  onLogin,
  onSwitchMode: _onSwitchMode,
  headerExtra,
}: AuthFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);

  /** Trial accounts verify a mobile number, so either identifier signs in. */
  const identifierValid =
    isValidEmail(email) || /^[6-9]\d{9}$/.test(email.replace(/\D/g, '').slice(-10));
  const showEmailError = emailTouched && email.length > 0 && !identifierValid;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setStatusMessage('');
    if (!identifierValid) {
      setErrorMessage('Enter your email or 10-digit mobile number.');
      return;
    }
    if (!password) {
      setErrorMessage('Enter your password.');
      return;
    }
    setIsLoading(true);
    try {
      await onLogin(email, password);
      if (rememberMe) {
        /* session already persisted by auth hook */
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Login failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-form-panel relative z-[1]">
      {headerExtra}

      <div className="auth-kicker mb-5">
        <ShieldCheck className="w-3 h-3" />
        Member sign in
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
      >
        <h1 className="auth-title auth-title-gold">
          Sign <span>in</span>
        </h1>
        <p className="auth-subtitle">
          Sign in with your email or mobile number and password.
        </p>
      </motion.div>

      <form onSubmit={(e) => void handleSubmit(e)} className="mt-8 space-y-5">
        <AuthField
          label="Email or mobile"
          type="text"
          placeholder="name@company.com or 9876543210"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setEmailTouched(true)}
          required
          autoComplete="username"
          valid={email.length > 0 && identifierValid}
          error={showEmailError ? 'Enter a valid email or 10-digit mobile number' : undefined}
          icon={<Mail className="w-4 h-4" />}
        />

        <AuthField
          label="Password"
          type={showPassword ? 'text' : 'password'}
          placeholder="Password from admin"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          icon={<Lock className="w-4 h-4" />}
          suffix={
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-slate-500 hover:text-slate-200 transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          }
        />

        <div className="flex items-center justify-between -mt-1">
          <label className="auth-checkbox">
            <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
            <span>Keep me signed in</span>
          </label>
        </div>

        {errorMessage ? (
          <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        ) : null}
        {statusMessage ? (
          <div className="flex items-start gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
            <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        ) : null}

        <button type="submit" disabled={isLoading} className="auth-submit-btn w-full">
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <LogIn className="w-4 h-4" />
              Sign in
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-[11px] text-slate-500 leading-relaxed">
        No account yet? Start the free trial from the pricing section.
      </p>
    </div>
  );
}
