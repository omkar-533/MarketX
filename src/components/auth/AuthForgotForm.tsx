import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  HelpCircle,
  KeyRound,
  Loader2,
  Lock,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import AuthField from './AuthField';
import PasswordRevealButton from './PasswordRevealButton';
import type { ResetChallenge } from '../../services/appInviteAuth';

export type AuthForgotFormProps = {
  onResetStart: (identifier: string) => Promise<ResetChallenge>;
  onResetResend: (identifier: string) => Promise<ResetChallenge>;
  onResetComplete: (identifier: string, resetToken: string, password: string) => Promise<void>;
  onSwitchToSignIn: () => void;
};

function isValidMobile(value: string) {
  return /^[6-9]\d{9}$/.test(value.replace(/\D/g, '').slice(-10));
}

/**
 * Reset: verify registered mobile (no OTP) → set a new password (no current password).
 */
export default function AuthForgotForm({
  onResetStart,
  onResetComplete,
  onSwitchToSignIn,
}: AuthForgotFormProps) {
  const [step, setStep] = useState<'identify' | 'reset'>('identify');
  const [identifier, setIdentifier] = useState('');
  const [identifierTouched, setIdentifierTouched] = useState(false);
  const [challenge, setChallenge] = useState<ResetChallenge | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const identifierValid = isValidMobile(identifier);
  const showIdentifierError = identifierTouched && identifier.length > 0 && !identifierValid;

  const handleIdentify = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!identifierValid) {
      setErrorMessage('Enter the 10-digit mobile number on your account.');
      return;
    }

    setIsLoading(true);
    try {
      const next = await onResetStart(identifier);
      setChallenge(next);
      setPassword('');
      setConfirm('');
      setStep('reset');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not verify the mobile number.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!challenge?.resetToken) {
      setErrorMessage('Verify your mobile number first.');
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
      await onResetComplete(identifier, challenge.resetToken, password);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not reset the password.');
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
          Mobile verified
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
            <strong className="text-slate-200">{challenge?.phoneMasked || 'Your mobile'}</strong>{' '}
            matched a registered account. Set a new password — no OTP or current password needed.
            This window is open for {Math.round((challenge?.expiresInSec ?? 900) / 60)} minutes.
          </p>
        </motion.div>

        <form onSubmit={(e) => void handleReset(e)} className="mt-7 space-y-5">
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
              <PasswordRevealButton
                show={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
              />
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
            suffix={
              <PasswordRevealButton
                show={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
              />
            }
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
                setChallenge(null);
                setErrorMessage('');
              }}
            >
              <ArrowLeft className="w-3 h-3" />
              Use another number
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
          Enter the mobile number you used at signup. If it matches an account, you can set a new
          password right away — no OTP.
        </p>
      </motion.div>

      <form onSubmit={(e) => void handleIdentify(e)} className="mt-7 space-y-5">
        <AuthField
          label="Mobile number"
          type="tel"
          inputMode="numeric"
          placeholder="10-digit mobile number"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value.replace(/\D/g, '').slice(0, 10))}
          onBlur={() => setIdentifierTouched(true)}
          required
          autoComplete="tel"
          maxLength={10}
          valid={identifier.length > 0 && identifierValid}
          error={showIdentifierError ? 'Enter a valid 10-digit Indian mobile number' : undefined}
          icon={<Phone className="w-4 h-4" />}
        />

        {errorBanner}

        <button type="submit" disabled={isLoading} className="auth-submit-btn w-full">
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <ShieldCheck className="w-4 h-4" />
              Verify mobile
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
