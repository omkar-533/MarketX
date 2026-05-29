import { useState, useEffect, type FormEvent, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail,
  Lock,
  Phone,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  LogIn,
  UserPlus,
} from 'lucide-react';
import OtpInput from './OtpInput';
import AuthField from './AuthField';
import { getPasswordStrength, strengthColors, isValidEmail } from './authUtils';

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

function GoogleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function OtpSteps({ step }: { step: number }) {
  const labels = ['Mobile', 'Verify'];
  return (
    <div className="flex items-center gap-3 mb-8">
      {labels.map((label, i) => (
        <div key={label} className="flex items-center gap-2 flex-1">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border transition-all ${
              i <= step
                ? 'bg-gold border-gold text-dark-surface'
                : 'border-dark-border text-slate-600 bg-dark-elevated'
            }`}
          >
            {i < step ? '✓' : i + 1}
          </div>
          <span className={`text-xs font-semibold ${i <= step ? 'text-slate-200' : 'text-slate-600'}`}>
            {label}
          </span>
          {i < labels.length - 1 && (
            <div className={`flex-1 h-px mx-1 ${i < step ? 'bg-gold/40' : 'bg-dark-border'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function AuthForm({
  mode,
  onLogin,
  onSignup,
  onGoogleLogin,
  onOtpLogin,
  onForgotPassword,
  onSwitchMode,
  headerExtra,
}: AuthFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [resendSecs, setResendSecs] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);

  const pwdStrength = getPasswordStrength(password);
  const emailValid = isValidEmail(email);
  const showEmailError = emailTouched && email.length > 0 && !emailValid;

  useEffect(() => {
    setOtpSent(false);
    setOtp('');
    setResendSecs(0);
    setErrorMessage('');
    setStatusMessage('');
    setEmailTouched(false);
  }, [mode]);

  useEffect(() => {
    if (resendSecs <= 0) return;
    const t = setTimeout(() => setResendSecs((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendSecs]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setStatusMessage('');

    if ((mode === 'login' || mode === 'signup' || mode === 'forgot') && !emailValid) {
      setEmailTouched(true);
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    if (mode === 'signup' && !acceptTerms) {
      setErrorMessage('Please accept the Terms of Service to continue.');
      return;
    }
    if (mode === 'otp' && otpSent && otp.length < 6) {
      setErrorMessage('Enter the complete 6-digit OTP.');
      return;
    }

    setIsLoading(true);
    try {
      if (mode === 'login') await onLogin(email, password);
      else if (mode === 'signup') await onSignup(name, email, password, phone || undefined);
      else if (mode === 'forgot') {
        await onForgotPassword(email);
        setStatusMessage('Reset link sent. Check your inbox and spam folder.');
      } else if (!otpSent) {
        await onOtpLogin(phone, '');
        setOtpSent(true);
        setResendSecs(30);
        setStatusMessage('OTP sent successfully.');
      } else await onOtpLogin(phone, otp);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Something went wrong. Please try again.';
      if (msg.includes('confirmation link') || msg.includes('Check your email')) {
        setStatusMessage(msg);
        setErrorMessage('');
      } else {
        setErrorMessage(msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendSecs > 0 || isLoading) return;
    setErrorMessage('');
    setIsLoading(true);
    try {
      await onOtpLogin(phone, '');
      setResendSecs(30);
      setStatusMessage('New OTP sent.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not resend OTP.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogle = async () => {
    setErrorMessage('');
    setIsGoogleLoading(true);
    try {
      await onGoogleLogin();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Google sign-in failed.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const titles = {
    login: 'Welcome back',
    signup: 'Create account',
    otp: 'Phone verification',
    forgot: 'Reset password',
  };

  const subtitles = {
    login: 'Sign in to access your trading workspace.',
    signup: 'Join traders using live TradeX market data.',
    otp: otpSent ? `Enter OTP sent to +91 ${phone}` : 'Sign in with your mobile number.',
    forgot: 'We\'ll send a reset link to your email.',
  };

  return (
    <div className="auth-form-panel relative z-[1]">
      {headerExtra}

      {(mode === 'login' || mode === 'signup') && (
        <div className="auth-tabs mb-7">
          <motion.div
            layoutId="auth-tab-indicator"
            className="auth-tabs-indicator"
            style={{ left: mode === 'login' ? '4px' : 'calc(50%)' }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
          />
          <button
            type="button"
            onClick={() => onSwitchMode('login')}
            className={`auth-tab flex items-center justify-center gap-1.5 ${mode === 'login' ? 'auth-tab--active' : ''}`}
          >
            <LogIn className="w-3.5 h-3.5" />
            Sign In
          </button>
          <button
            type="button"
            onClick={() => onSwitchMode('signup')}
            className={`auth-tab flex items-center justify-center gap-1.5 ${mode === 'signup' ? 'auth-tab--active' : ''}`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Sign Up
          </button>
        </div>
      )}

      {(mode === 'forgot' || mode === 'otp') && (
        <div className="auth-kicker mb-6">
          <ShieldCheck className="w-3 h-3" />
          {mode === 'otp' ? 'Phone OTP' : 'Reset password'}
        </div>
      )}

      {mode === 'otp' && <OtpSteps step={otpSent ? 1 : 0} />}

      <AnimatePresence mode="wait">
        <motion.div
          key={`${mode}-${otpSent}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22 }}
        >
          <h1 className="auth-title auth-title-gold">
            {mode === 'login' ? (
              <>
                Welcome <span>back</span>
              </>
            ) : mode === 'signup' ? (
              <>
                Create <span>account</span>
              </>
            ) : (
              titles[mode]
            )}
          </h1>
          <p className="auth-subtitle">{subtitles[mode]}</p>
        </motion.div>
      </AnimatePresence>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5">
        {mode === 'signup' && (
          <AuthField
            label="Full name"
            type="text"
            placeholder="Rahul Sharma"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
            icon={<User className="w-4 h-4" />}
          />
        )}

        {(mode === 'login' || mode === 'signup' || mode === 'forgot') && (
          <AuthField
            label="Work email"
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
        )}

        {mode === 'otp' && !otpSent && (
          <AuthField
            label="Mobile number"
            type="tel"
            placeholder="98765 43210"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
            required
            prefix={<span className="auth-field-prefix">+91</span>}
            icon={<Phone className="w-4 h-4" />}
          />
        )}

        {mode === 'otp' && otpSent && (
          <div>
            <p className="auth-label text-center mb-4">One-time password</p>
            <div className="p-3 rounded-lg border border-dark-border bg-dark-elevated">
              <OtpInput value={otp} onChange={setOtp} disabled={isLoading} />
            </div>
            <div className="flex justify-center mt-5">
              {resendSecs > 0 ? (
                <span className="text-xs text-slate-500">
                  Resend in <span className="text-[#d4af37] font-mono font-bold tabular-nums">{resendSecs}s</span>
                </span>
              ) : (
                <button type="button" onClick={() => void handleResendOtp()} className="auth-link text-xs">
                  Resend OTP
                </button>
              )}
            </div>
          </div>
        )}

        {(mode === 'login' || mode === 'signup') && (
          <div>
            <AuthField
              label="Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Minimum 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
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
            {mode === 'signup' && password.length > 0 && (
              <div className="mt-3 px-1">
                <div className="flex gap-1.5 mb-1.5">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="h-1 flex-1 rounded-full transition-all duration-500"
                      style={{
                        backgroundColor: pwdStrength.score > i ? strengthColors[pwdStrength.label] : '#1a1f2e',
                      }}
                    />
                  ))}
                </div>
                <p className="text-[11px] text-slate-600">
                  Password strength:{' '}
                  <span className="font-semibold capitalize" style={{ color: strengthColors[pwdStrength.label] }}>
                    {pwdStrength.label}
                  </span>
                </p>
              </div>
            )}
          </div>
        )}

        {mode === 'signup' && (
          <AuthField
            label="Phone (optional)"
            type="tel"
            placeholder="10-digit mobile"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            icon={<Phone className="w-4 h-4" />}
          />
        )}

        {mode === 'login' && (
          <div className="flex items-center justify-between -mt-1">
            <label className="auth-checkbox">
              <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
              <span>Keep me signed in</span>
            </label>
            <button type="button" onClick={() => onSwitchMode('forgot')} className="auth-link text-xs">
              Forgot password?
            </button>
          </div>
        )}

        {mode === 'signup' && (
          <label className="auth-checkbox auth-checkbox--block">
            <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)} />
            <span>
              I agree to the <button type="button" className="auth-link inline">Terms</button> and{' '}
              <button type="button" className="auth-link inline">Privacy Policy</button>
            </span>
          </label>
        )}

        <AnimatePresence>
          {errorMessage && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0 }} className="auth-alert auth-alert--error">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {errorMessage}
            </motion.div>
          )}
          {statusMessage && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0 }} className="auth-alert auth-alert--success">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {statusMessage}
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="submit"
          disabled={isLoading || (mode === 'otp' && otpSent && otp.length < 6)}
          className="auth-submit-btn w-full"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Authenticating…
            </>
          ) : (
            <>
              {mode === 'login' ? 'Access workspace' : mode === 'signup' ? 'Create account' : mode === 'otp' ? (otpSent ? 'Verify & sign in' : 'Send OTP') : 'Send reset link'}
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {(mode === 'login' || mode === 'signup') && (
        <>
          <div className="auth-divider my-6">
            <span>Continue with</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => void handleGoogle()} disabled={isGoogleLoading || isLoading} className="auth-social-btn">
              {isGoogleLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <GoogleIcon />}
              Google
            </button>
            <button type="button" onClick={() => onSwitchMode('otp')} disabled={isLoading} className="auth-social-btn">
              <Phone className="w-4 h-4 text-gold" />
              Phone OTP
            </button>
          </div>
        </>
      )}

      <footer className="auth-footer">
        <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          256-bit TLS · SOC 2 practices
        </div>
        <div className="text-xs text-slate-500">
          {mode === 'forgot' || mode === 'otp' ? (
            <button type="button" onClick={() => onSwitchMode('login')} className="auth-link">
              ← Back to sign in
            </button>
          ) : (
            <>
              {mode === 'login' ? 'No account? ' : 'Registered? '}
              <button type="button" onClick={() => onSwitchMode(mode === 'login' ? 'signup' : 'login')} className="auth-link">
                {mode === 'login' ? 'Create one' : 'Sign in'}
              </button>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}
