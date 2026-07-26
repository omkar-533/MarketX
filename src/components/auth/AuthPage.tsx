import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import brandLogoUrl from '../../assets/brand/brand-logo.png';
import AuthForm, { type AuthFormProps } from './AuthForm';
import AuthFeatureGrid from './AuthFeatureGrid';
import BrandMark from '../BrandMark';
import ThemeToggle from '../ThemeToggle';
import { BRAND, BRAND_SHORT } from '../../constants/brandLabels';

type AuthPageProps = Omit<AuthFormProps, 'headerExtra'> & {
  initialMode?: AuthFormProps['mode'];
};

/**
 * LuxAlgo-style landing: fixed brand + Sign In.
 * Login form opens ONLY from Sign In button (modal) — not on the page by default.
 */
export default function AuthPage(props: AuthPageProps) {
  const [signInOpen, setSignInOpen] = useState(false);

  useEffect(() => {
    if (!signInOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSignInOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [signInOpen]);

  const openSignIn = () => setSignInOpen(true);
  const closeSignIn = () => setSignInOpen(false);

  return (
    <div className="auth-lux min-h-screen flex flex-col relative">
      <div className="auth-lux__bg" aria-hidden="true">
        <div className="auth-lux__glow auth-lux__glow--a" />
        <div className="auth-lux__glow auth-lux__glow--b" />
        <div className="auth-lux__grid" />
      </div>

      <header className="auth-lux__nav">
        <div className="auth-lux__nav-inner">
          <div className="flex items-center gap-3 min-w-0" title={BRAND}>
            <BrandMark size="md" />
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <ThemeToggle />
            <button type="button" className="auth-lux__signin-btn" onClick={openSignIn}>
              Sign In
            </button>
          </div>
        </div>
      </header>

      <main className="auth-lux__main relative z-20">
        <section className="auth-lux__hero">
          <motion.div
            className="auth-lux__hero-copy"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <p className="auth-lux__eyebrow">{BRAND_SHORT} · AI Market Platform</p>
            <h1 className="auth-lux__headline">
              Trade with
              <br />
              <span>smart intelligence</span>
            </h1>
            <p className="auth-lux__sub">
              Live NSE workspace for bias, heatmaps, scanners, journals, and Master AI — built for serious traders.
            </p>
            <button type="button" className="auth-lux__hero-cta" onClick={openSignIn}>
              Sign In
            </button>
          </motion.div>

          <motion.div
            className="auth-lux__hero-mark"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.08 }}
          >
            <img
              className="auth-lux__hero-mark-img"
              src={brandLogoUrl}
              alt="AI Powered Market Intelligence"
              width={1024}
              height={558}
              decoding="async"
              fetchPriority="high"
            />
          </motion.div>
        </section>

        <section className="auth-lux__features" id="features">
          <div className="auth-lux__features-inner">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4 }}
              className="auth-lux__features-head"
            >
              <p className="auth-lux__eyebrow">Explore the platform</p>
              <h2 className="auth-lux__features-title">
                Everything you need to
                <br />
                <span>read the market</span>
              </h2>
              <p className="auth-lux__features-sub">
                Six core modules — live data, structure, and AI in one invite-only workspace.
              </p>
            </motion.div>
            <AuthFeatureGrid />
          </div>
        </section>

        <footer className="auth-lux__footer">
          <p>
            {BRAND} · Invite-only access
          </p>
        </footer>
      </main>

      {/* Sign In modal — only entry to login */}
      <AnimatePresence>
        {signInOpen && (
          <motion.div
            className="auth-lux-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <button
              type="button"
              className="auth-lux-modal__backdrop"
              aria-label="Close sign in"
              onClick={closeSignIn}
            />
            <motion.div
              className="auth-lux-modal__panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="auth-signin-title"
              initial={{ opacity: 0, y: 24, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.22 }}
            >
              <button
                type="button"
                className="auth-lux-modal__close"
                aria-label="Close"
                onClick={closeSignIn}
              >
                <X className="w-5 h-5" />
              </button>
              <div id="auth-signin-title" className="sr-only">
                Sign In
              </div>
              <AuthForm {...props} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
