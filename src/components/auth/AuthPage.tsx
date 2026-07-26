import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Quote, Star, X } from 'lucide-react';
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
    title: 'Build your own edge with AI',
    body: 'Use advanced algorithms and a live market copilot to read bias, OI, and structure in real time — then act with clarity when the tape moves.',
    cta: 'Get started now',
    image: `${import.meta.env.BASE_URL}landing/band-quant.svg`,
  },
  {
    id: 'workspace',
    kicker: 'Next-gen workspace',
    title: 'An AI desk for winning sessions',
    body: 'Ask the platform to surface setups, track your journal, and keep heatmaps, scanners, and option intelligence synced in one invite-only terminal.',
    cta: 'Get access now',
    image: `${import.meta.env.BASE_URL}landing/band-ai.png`,
  },
  {
    id: 'alerts',
    kicker: 'Precision tools',
    title: 'Your edge, now on autopilot',
    body: 'Turn live scanners and structure into a disciplined workflow — alerts, journals, and Master AI context so you never trade blind.',
    cta: 'Start now',
    image: `${import.meta.env.BASE_URL}landing/band-tools.png`,
  },
] as const;

const REVIEWS = [
  {
    name: 'Rohan M.',
    role: 'Options trader · Mumbai',
    quote:
      'Finally a desk that feels premium. Heatmaps + OI in one place changed how I plan the open.',
  },
  {
    name: 'Ananya K.',
    role: 'Prop desk · Bengaluru',
    quote:
      'Master AI is actually useful — short, sharp answers with live context. Feels like a senior mentor on call.',
  },
  {
    name: 'Vikram S.',
    role: 'Intraday F&O · Delhi',
    quote:
      'Scanners refresh with the tape. I stopped jumping between five tabs. This is the workflow I wanted.',
  },
  {
    name: 'Neha P.',
    role: 'Swing trader · Pune',
    quote:
      'The UI alone feels expensive. Invite-only access keeps the community serious — love that.',
  },
] as const;

const ease = [0.22, 1, 0.36, 1] as const;

/**
 * LuxAlgo-style premium landing — cinematic hero, story bands, reviews.
 * Login ONLY via Sign In modal (invite-only).
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
        <img className="auth-lux__fx auth-lux__fx--stroke" src={`${import.meta.env.BASE_URL}landing/stroke-tl.png`} alt="" />
        <img className="auth-lux__fx auth-lux__fx--glow" src={`${import.meta.env.BASE_URL}landing/glow-br.png`} alt="" />
        <div className="auth-lux__aurora auth-lux__aurora--1" />
        <div className="auth-lux__aurora auth-lux__aurora--2" />
        <div className="auth-lux__noise" />
        <div className="auth-lux__vignette" />
      </div>

      <header className="auth-lux__nav">
        <div className="auth-lux__nav-inner">
          <a href="#top" className="auth-lux__brand" title={BRAND}>
            <BrandMark size="sm" />
            <span className="auth-lux__brand-text">{BRAND}</span>
          </a>
          <nav className="auth-lux__nav-links" aria-label="Primary">
            <a href="#platform">Features</a>
            <a href="#reviews">Reviews</a>
            <a href="#modules">Library</a>
          </nav>
          <div className="auth-lux__nav-actions">
            <button type="button" className="auth-lux__btn-ghost" onClick={openSignIn}>
              Sign In
            </button>
            <button type="button" className="auth-lux__btn-solid" onClick={openSignIn}>
              Get Access
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="auth-lux__main relative z-20">
        {/* LuxAlgo-style centered hero */}
        <section className="auth-lux__hero">
          <motion.div
            className="auth-lux__hero-product"
            aria-hidden="true"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.15, ease }}
          >
            <img
              src={`${import.meta.env.BASE_URL}landing/hero-product.png`}
              alt=""
              width={1200}
              height={800}
              decoding="async"
              fetchPriority="high"
            />
          </motion.div>

          <motion.div
            className="auth-lux__hero-center"
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, ease }}
          >
            <p className="auth-lux__pill">
              <span className="auth-lux__pill-dot" />
              {BRAND_SHORT} · Live NSE intelligence
            </p>
            <h1 className="auth-lux__headline">
              Start trading like
              <br />
              <em>smart money</em>
            </h1>
            <p className="auth-lux__sub">
              The AI platform to build &amp; deploy your own edge — powered by live bias, heatmaps,
              scanners, journals, and Master AI used by serious Indian traders.
            </p>
            <div className="auth-lux__hero-actions">
              <button type="button" className="auth-lux__btn-solid auth-lux__btn-solid--xl" onClick={openSignIn}>
                Get access now
                <ArrowRight className="w-5 h-5" aria-hidden />
              </button>
              <a href="#reviews" className="auth-lux__link-underline">
                See trader stories
              </a>
            </div>
            <div className="auth-lux__trust">
              <div className="auth-lux__stars" aria-hidden="true">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 fill-current" />
                ))}
              </div>
              <p>Loved by desks that care about process — invite-only access</p>
            </div>
          </motion.div>
        </section>

        {/* Story bands */}
        <section className="auth-lux__stories" id="platform" aria-label="Platform">
          {STORY_BANDS.map((band, i) => (
            <motion.article
              key={band.id}
              className={`auth-lux__band ${i % 2 === 1 ? 'auth-lux__band--flip' : ''}`}
              initial={{ opacity: 0, y: 48 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-100px' }}
              transition={{ duration: 0.65, ease }}
            >
              <div className="auth-lux__band-copy">
                <p className="auth-lux__kicker">{band.kicker}</p>
                <h2 className="auth-lux__band-title">{band.title}</h2>
                <p className="auth-lux__band-body">{band.body}</p>
                <button type="button" className="auth-lux__link-arrow" onClick={openSignIn}>
                  {band.cta}
                  <ArrowRight className="w-4 h-4" aria-hidden />
                </button>
              </div>
              <div className="auth-lux__band-visual">
                <div className="auth-lux__product-frame">
                  <img src={band.image} alt="" className="auth-lux__product-img" loading="lazy" decoding="async" />
                </div>
              </div>
            </motion.article>
          ))}
        </section>

        {/* Reviews — LuxAlgo “real traders” */}
        <section className="auth-lux__reviews" id="reviews">
          <motion.div
            className="auth-lux__reviews-head"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.55, ease }}
          >
            <p className="auth-lux__kicker">Social proof</p>
            <h2 className="auth-lux__section-title">
              Real traders,
              <br />
              <em>real stories</em>
            </h2>
            <p className="auth-lux__section-sub">
              What desks say after switching to a cleaner, smarter NSE workflow.
            </p>
          </motion.div>

          <div className="auth-lux__review-grid">
            {REVIEWS.map((r, i) => (
              <motion.blockquote
                key={r.name}
                className="auth-lux__review"
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ delay: 0.06 * i, duration: 0.5, ease }}
              >
                <Quote className="auth-lux__review-quote" aria-hidden />
                <div className="auth-lux__stars auth-lux__stars--sm" aria-hidden="true">
                  {Array.from({ length: 5 }).map((_, s) => (
                    <Star key={s} className="w-3 h-3 fill-current" />
                  ))}
                </div>
                <p className="auth-lux__review-text">“{r.quote}”</p>
                <footer className="auth-lux__review-meta">
                  <span className="auth-lux__review-avatar">{r.name[0]}</span>
                  <div>
                    <cite>{r.name}</cite>
                    <span>{r.role}</span>
                  </div>
                </footer>
              </motion.blockquote>
            ))}
          </div>
        </section>

        {/* Modules */}
        <section className="auth-lux__features" id="modules">
          <div className="auth-lux__features-inner">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.55, ease }}
              className="auth-lux__features-head"
            >
              <p className="auth-lux__kicker">Explore all features</p>
              <h2 className="auth-lux__section-title">
                Everything you need to
                <br />
                <em>upgrade your desk</em>
              </h2>
              <p className="auth-lux__section-sub">
                Six core modules — live data, structure, and AI in one luxury workspace.
              </p>
            </motion.div>
            <AuthFeatureGrid />
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="auth-lux__bottom-cta">
          <motion.div
            className="auth-lux__bottom-cta-inner"
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.55, ease }}
          >
            <p className="auth-lux__kicker">Invite only</p>
            <h2 className="auth-lux__section-title">
              Plans for every style
              <br />
              <em>of trading</em>
            </h2>
            <p className="auth-lux__section-sub">
              Safe, private access. Sign in with credentials created for your desk — cancel anytime from profile.
            </p>
            <button type="button" className="auth-lux__btn-solid auth-lux__btn-solid--xl" onClick={openSignIn}>
              Sign In to Wolf Trade AI
              <ArrowRight className="w-5 h-5" aria-hidden />
            </button>
          </motion.div>
        </section>

        <footer className="auth-lux__footer">
          <div className="auth-lux__footer-top">
            <div className="auth-lux__footer-brand">
              <BrandMark size="sm" />
              <div>
                <strong>{BRAND}</strong>
                <span>wolftradeai.in</span>
              </div>
            </div>
            <div className="auth-lux__footer-links">
              <a href="#platform">Features</a>
              <a href="#reviews">Reviews</a>
              <a href="#modules">Library</a>
              <button type="button" onClick={openSignIn}>
                Sign In
              </button>
            </div>
          </div>
          <p className="auth-lux__footer-note">
            Trading &amp; investing are risky and many will lose money. Content on this site is not financial
            advice. Past performance does not guarantee future results. Hypothetical results have
            limitations. © {new Date().getFullYear()} {BRAND}.
          </p>
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
              initial={{ opacity: 0, y: 28, scale: 0.98 }}
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
