import { useEffect, useRef, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  HelpCircle,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import AuthField from './AuthField';
import { isValidEmail } from './authUtils';
import type { ResetChallenge } from '../../services/appInviteAuth';

export type AuthForgotFormProps = {
  onResetStart: (identifier: string) => Promise<ResetChallenge>;
  onResetResend: (identifier: string) => Promise<ResetChallenge>;
  onResetComplete: (identifier: string, code: string, password: string) => Promise<void>;
  onSwitchToSignIn: () => void;
};

const RESEND_SECONDS = 45;

function isValidIdentifier(value: string) {
  return isValidEmail(value) || /^[6-9]\d{9}$/.test(value.replace(/\D/g, '').slice(-10));
}

/**
 * Reset runs on the mobile number saved with the account: identify → OTP → new
 * password. A cleared code signs the user straight back in.
 */
export default function AuthForgotForm({
  onResetStart,
  onResetResend,
  onResetComplete,
  onSwitchToSignIn,
}: AuthForgotFormProps) {
  const [step, setStep] = useState<'identify' | 'reset'>('identify');
  const [identifier, setIdentifier] = useState('');
  const [identifierTouched, setIdentifierTouched] = useState(false);
  const [challenge, setChallenge] = useState<ResetChallenge | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const otpInputRef = useRef<HTMLInputElement>(null);

  const identifierValid = isValidIdentifier(identifier);
  const showIdentifierError = identifierTouched && identifier.length > 0 && !identifierValid;

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (step === 'reset') otpInputRef.current?.focus();
  }, [step]);

  const handleIdentify = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!identifierValid) {
      setErrorMessage('Enter the email or mobile number on your account.');
      return;
    }

    setIsLoading(true);
    try {
      const next = await onResetStart(identifier);
      setChallenge(next);
      setCode(next.devCode ?? '');
      setCooldown(RESEND_SECONDS);
      setStep('reset');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not send the reset code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!/^\d{6}$/.test(code)) {
      setErrorMessage('Enter the 6-digit code from the SMS.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('New password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setErrorMessage('Both passwords must match.');
      return;
    }

    setIsLoading(true);
    try {
      await onResetComplete(identifier, code, password);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not reset the password.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setErrorMessage('');
    setIsLoading(true);
    try {
      const next = await onResetResend(identifier);
      setChallenge(next);
      setCode(next.devCode ?? '');
      setCooldown(RESEND_SECONDS);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not resend the code.');
    } finally {
      setIsLoading(false);
    }
  };

  const errorBanner = errorMessage ? (
    <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
      <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <span>{errorMessage}</span>
    </div>
  ) : null;

  const backToSignIn = (
    <p className="mt-6 text-center text-[11px] text-slate-500 leading-relaxed">
      Remembered it?{' '}
      <button type="button" className="auth-inline-link" onClick={onSwitchToSignIn}>
        Back to sign in
      </button>
    </p>
  );

  if (step === 'reset') {
    return (
      <div className="auth-form-panel relative z-[1]">
        <div className="auth-kicker mb-5">
          <ShieldCheck className="w-3 h-3" />
          Verify &amp; set a new password
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
        >
          <h1 className="auth-title auth-title-gold">
            Choose a new <span>password</span>
          </h1>
          <p className="auth-subtitle">
            We sent a 6-digit code to{' '}
            <strong className="text-slate-200">{challenge?.phoneMasked || 'your mobile'}</strong>.
            It is valid for {Math.round((challenge?.expiresInSec ?? 600) / 60)} minutes.
          </p>
        </motion.div>

        <form onSubmit={(e) => void handleReset(e)} className="mt-7 space-y-5">
          <AuthField
            ref={otpInputRef}
            label="Reset code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            maxLength={6}
            className="tracking-[0.45em] text-center text-lg"
            valid={/^\d{6}$/.test(code)}
            icon={<ShieldCheck className="w-4 h-4" />}
          />

          {challenge?.devMode ? (
            <p className="auth-otp-devnote">
              SMS provider not configured — test code <strong>{challenge.devCode}</strong> filled in
              for you.
            </p>
          ) : null}

          <AuthField
            label="New password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Minimum 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
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

          <AuthField
            label="Confirm new password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Type it again"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            autoComplete="new-password"
            icon={<Lock className="w-4 h-4" />}
            valid={confirm.length > 0 && confirm === password}
            error={confirm.length > 0 && confirm !== password ? 'Passwords do not match' : undefined}
          />

          {errorBanner}

          <button type="submit" disabled={isLoading} className="auth-submit-btn w-full">
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <KeyRound className="w-4 h-4" />
                Save password &amp; sign in
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <button
              type="button"
              className="auth-inline-link inline-flex items-center gap-1"
              onClick={() => {
                setStep('identify');
                setErrorMessage('');
              }}
            >
              <ArrowLeft className="w-3 h-3" />
              Use another account
            </button>
            <button
              type="button"
              className="auth-inline-link disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => void handleResend()}
              disabled={cooldown > 0 || isLoading}
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
            </button>
          </div>
        </form>

        {backToSignIn}
      </div>
    );
  }

  return (
    <div className="auth-form-panel relative z-[1]">
      <div className="auth-kicker mb-5">
        <KeyRound className="w-3 h-3" />
        Password help
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
      >
        <h1 className="auth-title auth-title-gold">
          Forgot your <span>password</span>
        </h1>
        <p className="auth-subtitle">
          Enter your email or mobile number. We text a code to the mobile number saved on the
          account, and you pick a new password yourself.
        </p>
      </motion.div>

      <form onSubmit={(e) => void handleIdentify(e)} className="mt-7 space-y-5">
        <AuthField
          label="Email or mobile"
          type="text"
          placeholder="name@company.com or 9876543210"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          onBlur={() => setIdentifierTouched(true)}
          required
          autoComplete="username"
          valid={identifier.length > 0 && identifierValid}
          error={showIdentifierError ? 'Enter a valid email or 10-digit mobile number' : undefined}
          icon={<Mail className="w-4 h-4" />}
        />

        {errorBanner}

        <button type="submit" disabled={isLoading} className="auth-submit-btn w-full">
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <ShieldCheck className="w-4 h-4" />
              Send reset code
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <p className="auth-forgot-note">
        <HelpCircle className="w-3 h-3" aria-hidden />
        No mobile number on your account? Contact the desk and the admin will reset it for you.
      </p>

      {backToSignIn}
    </div>
  );
}
