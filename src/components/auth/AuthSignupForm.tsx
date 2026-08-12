import { useEffect, useRef, useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
} from 'lucide-react';
import AuthField from './AuthField';
import PasswordRevealButton from './PasswordRevealButton';
import { isValidEmail } from './authUtils';
import { planById, type PlanId } from '../../constants/plans';
import { usePlansCatalog } from '../../hooks/usePlansCatalog';
import type { OtpChallenge, SignupStartResult } from '../../services/appInviteAuth';

export type AuthSignupFormProps = {
  onSignupStart: (input: {
    name: string;
    email: string;
    phone: string;
    password: string;
  }) => Promise<SignupStartResult>;
  onSignupVerify: (email: string, code: string) => Promise<void>;
  onSignupResend: (email: string) => Promise<OtpChallenge>;
  onSwitchToSignIn: () => void;
  /** Plan the visitor clicked — paid plans still start on the free trial. */
  selectedPlan?: PlanId;
};

const RESEND_SECONDS = 45;

function isValidMobile(value: string) {
  return /^[6-9]\d{9}$/.test(value.replace(/\D/g, ''));
}

/** Two steps: details → mobile OTP. The account only exists once the OTP clears. */
export default function AuthSignupForm({
  onSignupStart,
  onSignupVerify,
  onSignupResend,
  onSwitchToSignIn,
  selectedPlan = 'monthly',
}: AuthSignupFormProps) {
  const [step, setStep] = useState<'details' | 'otp'>('details');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [mobileTouched, setMobileTouched] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const otpInputRef = useRef<HTMLInputElement>(null);

  const { plans, skipOtp } = usePlansCatalog();
  const plan = planById(selectedPlan === 'trial' ? 'monthly' : selectedPlan, plans);
  const isPaidIntent = plan.price > 0;
  const emailValid = isValidEmail(email);
  const mobileValid = isValidMobile(mobile);
  const showEmailError = emailTouched && email.length > 0 && !emailValid;
  const showMobileError = mobileTouched && mobile.length > 0 && !mobileValid;

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (step === 'otp') otpInputRef.current?.focus();
  }, [step]);

  const handleDetails = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (name.trim().length < 2) {
      setErrorMessage('Enter your name.');
      return;
    }
    if (!emailValid) {
      setErrorMessage('Enter a valid email address.');
      return;
    }
    if (!mobileValid) {
      setErrorMessage('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }

    setIsLoading(true);
    try {
      const next = await onSignupStart({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: mobile.replace(/\D/g, ''),
        password,
      });
      if (next.kind === 'done') return;
      setChallenge(next.challenge);
      setCode(next.challenge.devCode ?? '');
      setCooldown(RESEND_SECONDS);
      setStep('otp');
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : skipOtp
            ? 'Could not create the account.'
            : 'Could not send the OTP.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!/^\d{6}$/.test(code)) {
      setErrorMessage('Enter the 6-digit OTP.');
      return;
    }

    setIsLoading(true);
    try {
      await onSignupVerify(challenge?.phone || mobile, code);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not verify the OTP.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setErrorMessage('');
    setIsLoading(true);
    try {
      const next = await onSignupResend(challenge?.phone || mobile);
      setChallenge(next);
      setCode(next.devCode ?? '');
      setCooldown(RESEND_SECONDS);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not resend the OTP.');
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

  if (step === 'otp') {
    return (
      <div className="auth-form-panel relative z-[1]">
        <div className="auth-kicker auth-kicker--ai mb-5">
          <ShieldCheck className="w-3 h-3" />
          Verify your mobile
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
        >
          <h1 className="auth-title auth-title-gold">
            Enter the <span>OTP</span>
          </h1>
          <p className="auth-subtitle">
            We sent a 6-digit code to <strong className="text-slate-200">{challenge?.phone}</strong>.
            It is valid for {Math.round((challenge?.expiresInSec ?? 600) / 60)} minutes.
          </p>
        </motion.div>

        <form onSubmit={(e) => void handleVerify(e)} className="mt-7 space-y-5">
          <AuthField
            ref={otpInputRef}
            label="OTP"
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
              SMS / Twilio not configured — test code <strong>{challenge.devCode}</strong> filled in
              for you.
            </p>
          ) : null}

          {errorBanner}

          <button type="submit" disabled={isLoading} className="auth-submit-btn w-full">
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Verify & create account
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <button
              type="button"
              className="auth-inline-link inline-flex items-center gap-1"
              onClick={() => {
                setStep('details');
                setErrorMessage('');
              }}
            >
              <ArrowLeft className="w-3 h-3" />
              Change details
            </button>
            <button
              type="button"
              className="auth-inline-link disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => void handleResend()}
              disabled={cooldown > 0 || isLoading}
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend OTP'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="auth-form-panel relative z-[1]">
      <div className="auth-kicker auth-kicker--ai mb-5">
        <Sparkles className="w-3 h-3" />
        Create account
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
      >
        <h1 className="auth-title auth-title-gold">
          Create your <span>account</span>
        </h1>
        <p className="auth-subtitle">
          {isPaidIntent
            ? `After signup, Call or WhatsApp us to activate your ${plan.name} plan — payment gateway coming soon.`
            : 'Create your account, then Call or WhatsApp the desk to activate a plan — or use desk verification.'}
        </p>
      </motion.div>

      <form onSubmit={(e) => void handleDetails(e)} className="mt-7 space-y-5">
        <AuthField
          label="Full name"
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          autoComplete="name"
          icon={<UserIcon className="w-4 h-4" />}
        />

        <AuthField
          label="Email"
          type="email"
          placeholder="name@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setEmailTouched(true)}
          required
          autoComplete="email"
          valid={email.length > 0 && emailValid}
          error={showEmailError ? 'Enter a valid email address' : undefined}
          icon={<Mail className="w-4 h-4" />}
        />

        <AuthField
          label="Mobile number"
          type="tel"
          inputMode="numeric"
          placeholder="10-digit number"
          value={mobile}
          onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
          onBlur={() => setMobileTouched(true)}
          required
          autoComplete="tel-national"
          maxLength={10}
          valid={mobileValid}
          error={showMobileError ? 'Enter a valid 10-digit mobile number' : undefined}
          hint={
            skipOtp
              ? 'Used for account recovery and support.'
              : 'We send a one-time OTP to confirm this number.'
          }
          prefix={<span className="auth-field-prefix">+91</span>}
          icon={<Phone className="w-4 h-4" />}
        />

        <AuthField
          label="Password"
          type={showPassword ? 'text' : 'password'}
          placeholder="Minimum 6 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
          icon={<Lock className="w-4 h-4" />}
          hint="Sign in later with this email or mobile number."
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
          ) : skipOtp ? (
            <>
              <Sparkles className="w-4 h-4" />
              Create account
              <ArrowRight className="w-4 h-4" />
            </>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4" />
              Send OTP
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <ul className="auth-signup-perks">
        {plan.features.slice(0, 4).map((feature) => (
          <li key={feature}>
            <Check className="w-3 h-3" aria-hidden />
            {feature}
          </li>
        ))}
      </ul>

      <p className="mt-5 text-center text-[11px] text-slate-500 leading-relaxed">
        Already have a login?{' '}
        <button type="button" className="auth-inline-link" onClick={onSwitchToSignIn}>
          Sign in instead
        </button>
      </p>
    </div>
  );
}
