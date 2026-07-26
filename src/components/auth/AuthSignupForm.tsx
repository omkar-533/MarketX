import { useState, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  Sparkles,
  User as UserIcon,
} from 'lucide-react';
import AuthField from './AuthField';
import { isValidEmail } from './authUtils';
import { PLAN_FEATURES, TRIAL_DAYS, planById, type PlanId } from '../../constants/plans';

type AuthSignupFormProps = {
  onSignup: (name: string, email: string, password: string, phone?: string) => Promise<void>;
  onSwitchToSignIn: () => void;
  /** Plan the visitor clicked — paid plans still start on the free trial. */
  selectedPlan?: PlanId;
};

/** Free-trial sign-up — on success the session is live and the platform loads. */
export default function AuthSignupForm({
  onSignup,
  onSwitchToSignIn,
  selectedPlan = 'trial',
}: AuthSignupFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const plan = planById(selectedPlan);
  const isPaidIntent = plan.price > 0;
  const emailValid = isValidEmail(email);
  const showEmailError = emailTouched && email.length > 0 && !emailValid;

  const handleSubmit = async (e: FormEvent) => {
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
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }

    setIsLoading(true);
    try {
      await onSignup(name.trim(), email.trim().toLowerCase(), password);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not create your account.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-form-panel relative z-[1]">
      <div className="auth-kicker auth-kicker--ai mb-5">
        <Sparkles className="w-3 h-3" />
        {TRIAL_DAYS}-day free trial
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
            ? `Your ${plan.name.toLowerCase()} plan starts with ${TRIAL_DAYS} free days — the desk activates billing after that.`
            : `Full access to every module for ${TRIAL_DAYS} days. No card, no commitment.`}
        </p>
      </motion.div>

      <form onSubmit={(e) => void handleSubmit(e)} className="mt-7 space-y-5">
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
          label="Password"
          type={showPassword ? 'text' : 'password'}
          placeholder="Minimum 6 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
          icon={<Lock className="w-4 h-4" />}
          hint="You will use this email and password to sign in."
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

        {errorMessage ? (
          <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        <button type="submit" disabled={isLoading} className="auth-submit-btn w-full">
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Start my {TRIAL_DAYS}-day trial
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <ul className="auth-signup-perks">
        {PLAN_FEATURES.slice(0, 4).map((feature) => (
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
