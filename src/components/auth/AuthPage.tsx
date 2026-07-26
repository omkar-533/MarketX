import { motion } from 'framer-motion';
import { Crown } from 'lucide-react';
import AuthForm, { type AuthFormProps } from './AuthForm';
import AuthFeatureGrid from './AuthFeatureGrid';
import AuthRobotScene from './AuthRobotScene';
import ThemeToggle from '../ThemeToggle';
import { BRAND, BRAND_LINE1, BRAND_LINE2, BRAND_SHORT } from '../../constants/brandLabels';

type AuthPageProps = Omit<AuthFormProps, 'headerExtra'> & {
  initialMode?: AuthFormProps['mode'];
};

/**
 * LuxAlgo-inspired landing login — bold hero, clean CTA, feature modules below.
 * Brand + invite sign-in only (no public signup).
 */
export default function AuthPage(props: AuthPageProps) {
  return (
    <div className="auth-lux min-h-screen flex flex-col relative">
      <div className="auth-lux__bg" aria-hidden="true">
        <AuthRobotScene fullscreen />
        <div className="auth-lux__shade" />
      </div>

      <header className="auth-lux__nav relative z-30">
        <div className="auth-lux__nav-inner">
          <div className="flex items-center gap-3 min-w-0" title={BRAND}>
            <div className="w-10 h-10 sm:w-11 sm:h-11 bg-gold rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-gold/25">
              <Crown className="w-5 h-5 text-dark-surface" />
            </div>
            <div className="min-w-0 leading-none">
              <div className="text-lg sm:text-xl font-extrabold text-gold tracking-tight">{BRAND_LINE1}</div>
              <div className="text-sm sm:text-base font-bold text-slate-100 tracking-wide mt-0.5">{BRAND_LINE2}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
              {BRAND_SHORT}
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Hero — brand, one headline, one line, sign-in CTA */}
      <section className="auth-lux__hero relative z-20">
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
        </motion.div>

        <motion.div
          className="auth-lux__cta"
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.12 }}
        >
          <div className="auth-lux__cta-card">
            <AuthForm {...props} />
          </div>
        </motion.div>
      </section>

      {/* Features — LuxAlgo-style module showcase */}
      <section className="auth-lux__features relative z-20" id="features">
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

      <footer className="auth-lux__footer relative z-20">
        <p>
          {BRAND_LINE1} {BRAND_LINE2} · Invite-only access
        </p>
      </footer>
    </div>
  );
}
