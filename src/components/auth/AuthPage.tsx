import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, X } from 'lucide-react';
import brandLogoUrl from '../../assets/brand/brand-logo.png';
import AuthForm, { type AuthFormProps } from './AuthForm';
import AuthFeatureGrid from './AuthFeatureGrid';
import BrandMark from '../BrandMark';
import { BRAND, BRAND_SHORT } from '../../constants/brandLabels';

type AuthPageProps = Omit<AuthFormProps, 'headerExtra'> & {
  initialMode?: AuthFormProps['mode'];
};

const STORY_BANDS = [
  {
    id: 'master-ai',
    kicker: 'Master AI',
    title: 'Build your edge with AI',
    body: 'Ask market questions, surface structure, and get context-aware answers across bias, OI, and live tape — a copilot for serious NSE traders.',
    cta: 'Sign In to continue',
  },
  {
    id: 'workspace',
    kicker: 'Live workspace',
    title: 'One terminal for the full session',
    body: 'Dashboard bias, heatmaps, option intelligence, and journals in a single invite-only workspace — built for speed when the market moves.',
    cta: 'Enter the platform',
  },
  {
    id: 'scanners',
    kicker: 'Scanners & heatmaps',
    title: 'Your edge, now on the tape',
    body: 'Momentum, breakout, volume, and F&O screeners refresh with live quotes. Spot strength by sector and stock before the crowd catches up.',
    cta: 'Get access',
  },
] as const;

/**
 * LuxAlgo-inspired premium landing.
 * Login opens ONLY from Sign In (modal) — invite-only.
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
        <div className="auth-lux__glow auth-lux__glow--c" />
        <div className="auth-lux__grid" />
        <div className="auth-lux__vignette" />
      </div>

      <header className="auth-lux__nav">
        <div className="auth-lux__nav-inner">
          <a href="#top" className="auth-lux__brand" title={BRAND}>
            <BrandMark size="md" />
          </a>
          <nav className="auth-lux__nav-links" aria-label="Primary">
            <a href="#features">Features</a>
            <a href="#platform">Platform</a>
          </nav>
          <div className="auth-lux__nav-actions">
            <button type="button" className="auth-lux__signin-btn" onClick={openSignIn}>
              Sign In
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="auth-lux__main relative z-20">
        {/* Hero — LuxAlgo cadence */}
        <section className="auth-lux__hero">
          <motion.div
            className="auth-lux__hero-copy"
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="auth-lux__eyebrow">{BRAND_SHORT} · AI algorithmic trading</p>
            <h1 className="auth-lux__headline">
              Start trading with
              <br />
              <span>smart intelligence</span>
            </h1>
            <p className="auth-lux__sub">
              The AI platform to read NSE structure and deploy your edge — live bias, heatmaps,
              scanners, journals, and Master AI in one invite-only workspace.
            </p>
            <div className="auth-lux__hero-actions">
              <button type="button" className="auth-lux__cta-primary" onClick={openSignIn}>
                Sign In
                <ArrowRight className="w-4 h-4" aria-hidden />
              </button>
              <a href="#features" className="auth-lux__cta-ghost">
                Explore features
              </a>
            </div>
          </motion.div>

          <motion.div
            className="auth-lux__hero-mark"
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="auth-lux__hero-mark-ring" aria-hidden="true" />
            <img
              className="auth-lux__hero-mark-img"
              src={brandLogoUrl}
              alt="Wolf Trade AI"
              width={1024}
              height={1024}
              decoding="async"
              fetchPriority="high"
            />
          </motion.div>
        </section>

        {/* Story bands */}
        <section className="auth-lux__stories" id="platform" aria-label="Platform stories">
          {STORY_BANDS.map((band, i) => (
            <motion.article
              key={band.id}
              className={`auth-lux__band ${i % 2 === 1 ? 'auth-lux__band--flip' : ''}`}
              initial={{ opacity: 0, y: 36 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="auth-lux__band-copy">
                <p className="auth-lux__eyebrow">{band.kicker}</p>
                <h2 className="auth-lux__band-title">{band.title}</h2>
                <p className="auth-lux__band-body">{band.body}</p>
                <button type="button" className="auth-lux__cta-text" onClick={openSignIn}>
                  {band.cta}
                  <ArrowRight className="w-4 h-4" aria-hidden />
                </button>
              </div>
              <div className="auth-lux__band-visual" aria-hidden="true">
                <div className="auth-lux__band-panel">
                  <span className="auth-lux__band-panel-label">{band.kicker}</span>
                  <span className="auth-lux__band-panel-glow" />
                </div>
              </div>
            </motion.article>
          ))}
        </section>

        {/* Modules grid */}
        <section className="auth-lux__features" id="features">
          <div className="auth-lux__features-inner">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5 }}
              className="auth-lux__features-head"
            >
              <p className="auth-lux__eyebrow">Explore all features</p>
              <h2 className="auth-lux__features-title">
                Everything you need to
                <br />
                <span>read the market</span>
              </h2>
              <p className="auth-lux__features-sub">
                Six core modules — live data, structure, and AI in one premium workspace.
              </p>
            </motion.div>
            <AuthFeatureGrid />
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="auth-lux__bottom-cta">
          <motion.div
            className="auth-lux__bottom-cta-inner"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="auth-lux__bottom-cta-title">
              Ready to trade with
              <br />
              <span>smart intelligence</span>
            </h2>
            <p className="auth-lux__bottom-cta-sub">
              Invite-only access. Sign in with the credentials created for your desk.
            </p>
            <button type="button" className="auth-lux__cta-primary auth-lux__cta-primary--lg" onClick={openSignIn}>
              Sign In
              <ArrowRight className="w-4 h-4" aria-hidden />
            </button>
          </motion.div>
        </section>

        <footer className="auth-lux__footer">
          <div className="auth-lux__footer-brand">
            <BrandMark size="sm" />
            <span>{BRAND}</span>
          </div>
          <p className="auth-lux__footer-note">
            Trading involves risk. Content on this site is not financial advice. Past performance does
            not guarantee future results. Invite-only platform · wolftradeai.in
          </p>
          <p className="auth-lux__footer-copy">© {new Date().getFullYear()} {BRAND_SHORT}</p>
        </footer>
      </main>

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
