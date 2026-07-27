import { useEffect, useRef, useState } from 'react';
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion';
import { ArrowRight, Quote, Star, X } from 'lucide-react';
import AuthForm, { type AuthFormProps } from './AuthForm';
import AuthFeatureGrid from './AuthFeatureGrid';
import AuthPricing from './AuthPricing';
import AuthForgotForm, { type AuthForgotFormProps as ForgotFormProps } from './AuthForgotForm';
import AuthSignupForm, { type AuthSignupFormProps as SignupFormProps } from './AuthSignupForm';
import LiveHeroTerminal from './LiveHeroTerminal';
import BrandMark from '../BrandMark';
import { BRAND, BRAND_TAGLINE, BRAND_TAGLINE_FULL } from '../../constants/brandLabels';
import { TRIAL_DAYS, type PlanId } from '../../constants/plans';
import { Counter, EASE, GradientLine, Marquee, Reveal, Words } from './scrollFx';

type AuthPageProps = Omit<AuthFormProps, 'headerExtra'> & {
  initialMode?: AuthFormProps['mode'];
  onSignupStart: SignupFormProps['onSignupStart'];
  onSignupVerify: SignupFormProps['onSignupVerify'];
  onSignupResend: SignupFormProps['onSignupResend'];
  onResetStart: ForgotFormProps['onResetStart'];
  onResetResend: ForgotFormProps['onResetResend'];
  onResetComplete: ForgotFormProps['onResetComplete'];
};

const STORY_BANDS = [
  {
    id: 'master-ai',
    kicker: 'Master AI',
    title: 'Build your own edge with AI',
    body: 'Ask market questions and get context-aware answers — bias, structure, and session context in one copilot.',
    cta: 'Get started now',
    image: `${import.meta.env.BASE_URL}landing/band-ai-copilot.jpg`,
  },
  {
    id: 'indicators',
    kicker: 'Indicators',
    title: 'A library built for serious charts',
    body: 'Browse published indicator scripts, preview covers, and copy code into your charting workflow in one click.',
    cta: 'Get access now',
    image: `${import.meta.env.BASE_URL}landing/band-workspace.jpg?v=2`,
  },
  {
    id: 'tradingjournal',
    kicker: 'Trading Journal',
    title: 'Process over impulse',
    body: 'Log every trade, review discipline, and track P&L so your edge compounds session after session.',
    cta: 'Start now',
    image: `${import.meta.env.BASE_URL}landing/band-autopilot.jpg`,
  },
] as const;

const avatar = (n: number) => `${import.meta.env.BASE_URL}landing/avatars/trader-${n}.jpg?v=3`;

const REVIEWS = [
  {
    name: 'Rohan Mehta',
    role: 'Options trader · Mumbai',
    rating: 5,
    photo: avatar(1),
    quote:
      'Master AI replaced three group chats for me. I ask what the tape is saying and get a clear answer instead of ten conflicting opinions. That alone was worth signing up.',
  },
  {
    name: 'Ananya Kulkarni',
    role: 'Prop desk · Bengaluru',
    rating: 5,
    photo: avatar(2),
    quote:
      'The Trading Journal is what actually changed things for me. Tagging every entry showed most of my losses came from the first fifteen minutes — so I stopped trading the open.',
  },
  {
    name: 'Vikram Singh',
    role: 'Intraday F&O · Delhi',
    rating: 5,
    photo: avatar(3),
    quote:
      'Indicators library is clean — open a card, read the note, copy the code. I stopped hunting scripts on Telegram and Discord every morning.',
  },
  {
    name: 'Neha Patil',
    role: 'Swing trader · Pune',
    rating: 4,
    photo: avatar(4),
    quote:
      'Master AI will not tell you what to buy, and honestly that is why I trust it. I ask for structure and get a straight answer. Wish the mobile layout was a bit denser.',
  },
  {
    name: 'Karthik Raman',
    role: 'Positional trader · Chennai',
    rating: 5,
    photo: avatar(5),
    quote:
      'I keep the Indicators page bookmarked. New scripts show up with a cover and description — I preview, copy, and I am on my chart in under a minute.',
  },
  {
    name: 'Sneha Desai',
    role: 'Options seller · Hyderabad',
    rating: 4,
    photo: avatar(6),
    quote:
      'End of day I dump every trade into the Journal. Seeing P&L and tags in one place kept me out of revenge trades twice last month.',
  },
  {
    name: 'Aditya Joshi',
    role: 'F&O trader · Ahmedabad',
    rating: 5,
    photo: avatar(7),
    quote:
      'Setup took ten minutes. What sold me was Master AI plus the Journal together — ask a question, then log the trade the same session. Simple loop.',
  },
  {
    name: 'Meera Sharma',
    role: 'Part-time trader · Kolkata',
    rating: 5,
    photo: avatar(8),
    quote:
      'I trade after work, so I need a fast review. Master AI for context and a Journal pass takes me about fifteen minutes instead of the hour it used to.',
  },
] as const;

const TICKER = [
  ['NIFTY', '+0.62%', true],
  ['BANKNIFTY', '+0.94%', true],
  ['FINNIFTY', '-0.18%', false],
  ['RELIANCE', '+1.24%', true],
  ['HDFCBANK', '+0.41%', true],
  ['INFY', '-0.33%', false],
  ['TCS', '+0.58%', true],
  ['ICICIBANK', '+1.06%', true],
  ['SBIN', '+0.72%', true],
  ['TATAMOTORS', '+1.85%', true],
  ['AXISBANK', '-0.21%', false],
  ['LT', '+0.49%', true],
] as const;

const STATS = [
  { to: 3, suffix: '', label: 'core modules' },
  { to: 1, suffix: '', label: 'AI copilot desk' },
  { to: 1, suffix: '', label: 'indicators library' },
  { to: 1, suffix: '', label: 'trading journal' },
] as const;

const ease = EASE;

function Stars({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'lg' }) {
  return (
    <span className={`auth-lux__stars auth-lux__stars--${size}`} aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={i < rating ? 'is-on' : 'is-off'} />
      ))}
    </span>
  );
}

function ReviewCard({ review }: { review: (typeof REVIEWS)[number] }) {
  return (
    <blockquote className="auth-lux__review">
      <div className="auth-lux__review-top">
        <Stars rating={review.rating} />
        <span className="auth-lux__review-score">{review.rating.toFixed(1)}</span>
        <Quote className="auth-lux__review-quote" aria-hidden />
      </div>
      <p className="auth-lux__review-text">“{review.quote}”</p>
      <footer className="auth-lux__review-meta">
        <img
          className="auth-lux__review-photo"
          src={review.photo}
          alt={review.name}
          width={44}
          height={44}
          loading="lazy"
          decoding="async"
        />
        <div>
          <cite>{review.name}</cite>
          <span>{review.role}</span>
        </div>
      </footer>
    </blockquote>
  );
}

/** Story band with scroll-linked parallax on the visual. */
function StoryBand({
  band,
  flip,
  onCta,
}: {
  band: (typeof STORY_BANDS)[number];
  flip: boolean;
  onCta: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  const visualY = useTransform(scrollYProgress, [0, 1], [70, -70]);
  const visualScale = useTransform(scrollYProgress, [0, 0.5, 1], [0.94, 1, 0.94]);
  const tilt = useTransform(scrollYProgress, [0, 1], [flip ? -5 : 5, flip ? 4 : -4]);

  return (
    <article ref={ref} className={`auth-lux__band ${flip ? 'auth-lux__band--flip' : ''}`}>
      <div className="auth-lux__band-copy">
        <Reveal y={30} blur={false}>
          <p className="auth-lux__kicker">{band.kicker}</p>
        </Reveal>
        <h2 className="auth-lux__band-title">
          <Words text={band.title} />
        </h2>
        <Reveal delay={0.18} y={26}>
          <p className="auth-lux__band-body">{band.body}</p>
        </Reveal>
        <Reveal delay={0.28} y={20} blur={false}>
          <button type="button" className="auth-lux__link-arrow" onClick={onCta}>
            {band.cta}
            <ArrowRight className="w-4 h-4" aria-hidden />
          </button>
        </Reveal>
      </div>
      <div className="auth-lux__band-visual">
        <motion.div
          className="auth-lux__product-frame"
          style={{ y: visualY, scale: visualScale, rotateY: tilt }}
        >
          <img
            src={band.image}
            alt=""
            className="auth-lux__product-img"
            loading="lazy"
            decoding="async"
          />
          <span className="auth-lux__product-sheen" aria-hidden="true" />
        </motion.div>
      </div>
    </article>
  );
}

/**
 * LuxAlgo-style premium landing — cinematic hero, story bands, reviews.
 * Login ONLY via Sign In modal (invite-only).
 */
type AuthView = { kind: 'signin' } | { kind: 'signup'; plan: PlanId } | { kind: 'forgot' };

export default function AuthPage(props: AuthPageProps) {
  const {
    onSignupStart,
    onSignupVerify,
    onSignupResend,
    onResetStart,
    onResetResend,
    onResetComplete,
    ...formProps
  } = props;
  const [authView, setAuthView] = useState<AuthView | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const heroRef = useRef<HTMLElement>(null);

  const { scrollY, scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 28, restDelta: 0.001 });

  useMotionValueEvent(scrollY, 'change', (v) => setScrolled(v > 24));

  const { scrollYProgress: heroP } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const stageRotate = useTransform(heroP, [0, 0.34], [12, 0]);
  const stageScale = useTransform(heroP, [0, 0.34, 1], [0.93, 1, 0.94]);
  const stageY = useTransform(heroP, [0.45, 1], [0, -120]);
  const stageOpacity = useTransform(heroP, [0, 0.6, 1], [1, 1, 0.12]);
  const copyY = useTransform(heroP, [0, 1], [0, -140]);
  const copyOpacity = useTransform(heroP, [0, 0.55], [1, 0]);

  useEffect(() => {
    if (!authView) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAuthView(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [authView]);

  const openSignIn = () => setAuthView({ kind: 'signin' });
  const openSignUp = (plan: PlanId = 'trial') => setAuthView({ kind: 'signup', plan });
  const openForgot = () => setAuthView({ kind: 'forgot' });
  const closeAuth = () => {
    setAuthView(null);
    if (/^#(forgot|reset-password|signin)$/i.test(window.location.hash)) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  };

  /** So a "reset your password" link can drop someone straight into the flow. */
  useEffect(() => {
    const openFromHash = () => {
      const hash = window.location.hash.toLowerCase();
      if (hash === '#forgot' || hash === '#reset-password') setAuthView({ kind: 'forgot' });
      else if (hash === '#signin') setAuthView({ kind: 'signin' });
    };
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, []);

  return (
    <div className="auth-lux min-h-screen flex flex-col relative">
      <div className="auth-lux__bg" aria-hidden="true">
        <img className="auth-lux__fx auth-lux__fx--stroke" src={`${import.meta.env.BASE_URL}landing/bg-aurora.jpg`} alt="" />
        <img className="auth-lux__fx auth-lux__fx--glow" src={`${import.meta.env.BASE_URL}landing/bg-aurora.jpg`} alt="" />
        <div className="auth-lux__aurora auth-lux__aurora--1" />
        <div className="auth-lux__aurora auth-lux__aurora--2" />
        <div className="auth-lux__noise" />
        <div className="auth-lux__vignette" />
      </div>

      <motion.div className="auth-lux__progress" style={{ scaleX: progress }} aria-hidden="true" />

      <header className={`auth-lux__nav ${scrolled ? 'is-scrolled' : ''}`}>
        <div className="auth-lux__nav-inner">
          <a href="#top" className="auth-lux__brand" title={BRAND}>
            <BrandMark size="sm" nameClassName="auth-lux__brand-text" />
          </a>
          <nav className="auth-lux__nav-links" aria-label="Primary">
            <a href="#platform">Features</a>
            <a href="#reviews">Reviews</a>
            <a href="#modules">Library</a>
            <a href="#pricing">Pricing</a>
          </nav>
          <div className="auth-lux__nav-actions">
            <button type="button" className="auth-lux__btn-ghost" onClick={openSignIn}>
              Sign In
            </button>
            <button type="button" className="auth-lux__btn-solid" onClick={() => openSignUp()}>
              Start free trial
            </button>
          </div>
        </div>
      </header>

      <main id="top" className="auth-lux__main relative z-20">
        {/* LuxAlgo-style centered hero */}
        <section className="auth-lux__hero" ref={heroRef}>
          <motion.div className="auth-lux__hero-center" style={{ y: copyY, opacity: copyOpacity }}>
            <motion.p
              className="auth-lux__pill"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease }}
            >
              <span className="auth-lux__pill-dot" />
              <span className="auth-lux__pill-brand">{BRAND}</span>
              <span className="auth-lux__pill-sep">·</span>
              <span>{BRAND_TAGLINE}</span>
            </motion.p>
            <h1 className="auth-lux__headline">
              <Words text="Start trading like" mode="mount" delay={0.1} />
              <br />
              <GradientLine text="smart money" mode="mount" delay={0.38} />
            </h1>
            <motion.p
              className="auth-lux__sub"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.55, ease }}
            >
              The AI platform for serious Indian traders — Master AI, Indicators, and Trading
              Journal in one invite-only workspace.
            </motion.p>
            <motion.div
              className="auth-lux__hero-actions"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.68, ease }}
            >
              <button
                type="button"
                className="auth-lux__btn-solid auth-lux__btn-solid--xl"
                onClick={() => openSignUp()}
              >
                Start {TRIAL_DAYS}-day free trial
                <ArrowRight className="w-5 h-5" aria-hidden />
              </button>
              <a href="#pricing" className="auth-lux__link-underline">
                See pricing
              </a>
            </motion.div>
            <motion.div
              className="auth-lux__trust"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.85, ease }}
            >
              <Stars rating={5} size="lg" />
              <p>
                Loved by desks that care about process — {TRIAL_DAYS} days free, no card required
              </p>
            </motion.div>
          </motion.div>

          <motion.div
            className="auth-lux__hero-stage"
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.1, delay: 0.3, ease }}
          >
            <motion.div
              className="auth-lux__hero-stage-inner"
              style={{
                rotateX: stageRotate,
                scale: stageScale,
                y: stageY,
                opacity: stageOpacity,
              }}
            >
              <LiveHeroTerminal />
            </motion.div>
          </motion.div>
        </section>

        {/* Live ticker strip */}
        <div className="auth-lux__ticker" aria-hidden="true">
          <Marquee duration={38}>
            {TICKER.map(([sym, chg, up]) => (
              <span className="auth-lux__tick" key={sym}>
                <b>{sym}</b>
                <i className={up ? 'is-up' : 'is-down'}>{chg}</i>
              </span>
            ))}
          </Marquee>
        </div>

        {/* Story bands */}
        <section className="auth-lux__stories" id="platform" aria-label="Platform">
          {STORY_BANDS.map((band, i) => (
            <StoryBand key={band.id} band={band} flip={i % 2 === 1} onCta={() => openSignUp()} />
          ))}
        </section>

        {/* Counters */}
        <section className="auth-lux__stats" aria-label="Platform coverage">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={0.08 * i} y={34}>
              <div className="auth-lux__stat">
                <strong>
                  <Counter to={s.to} suffix={s.suffix} decimals={'decimals' in s ? s.decimals : 0} />
                </strong>
                <span>{s.label}</span>
              </div>
            </Reveal>
          ))}
        </section>

        {/* Reviews — auto-scrolling trader stories */}
        <section className="auth-lux__reviews" id="reviews">
          <div className="auth-lux__reviews-head">
            <Reveal y={26} blur={false}>
              <p className="auth-lux__kicker">Social proof</p>
            </Reveal>
            <h2 className="auth-lux__section-title">
              <Words text="Real traders," />
              <br />
              <GradientLine text="real stories" delay={0.2} />
            </h2>
            <Reveal delay={0.24} y={22}>
              <p className="auth-lux__section-sub">
                What desks say after switching to a cleaner, smarter NSE workflow.
              </p>
            </Reveal>
            <Reveal delay={0.34} y={18} blur={false}>
              <p className="auth-lux__rating">
                <Stars rating={5} size="lg" />
                <strong>4.8</strong>
                <span>average from invited desks</span>
              </p>
            </Reveal>
          </div>

          <Marquee duration={58}>
            {REVIEWS.slice(0, 4).map((r) => (
              <ReviewCard key={r.name} review={r} />
            ))}
          </Marquee>
          <Marquee duration={72} reverse>
            {REVIEWS.slice(4).map((r) => (
              <ReviewCard key={r.name} review={r} />
            ))}
          </Marquee>
        </section>

        {/* Modules */}
        <section className="auth-lux__features" id="modules">
          <div className="auth-lux__features-inner">
            <div className="auth-lux__features-head">
              <Reveal y={24} blur={false}>
                <p className="auth-lux__kicker">Explore all features</p>
              </Reveal>
              <h2 className="auth-lux__section-title">
                <Words text="Everything you need to" />
                <br />
                <GradientLine text="upgrade your desk" delay={0.22} />
              </h2>
              <Reveal delay={0.26} y={22}>
                <p className="auth-lux__section-sub">
                  Three core modules — Master AI, Indicators, and Trading Journal in one luxury workspace.
                </p>
              </Reveal>
            </div>
            <AuthFeatureGrid />
          </div>
        </section>

        <AuthPricing onStartTrial={() => openSignUp('trial')} onChoosePlan={openSignUp} />

        {/* Bottom CTA */}
        <section className="auth-lux__bottom-cta">
          <div className="auth-lux__bottom-cta-inner">
            <Reveal y={24} blur={false}>
              <p className="auth-lux__kicker">{TRIAL_DAYS} days free</p>
            </Reveal>
            <h2 className="auth-lux__section-title">
              <Words text="Try the whole desk" />
              <br />
              <GradientLine text="before you pay" delay={0.22} />
            </h2>
            <Reveal delay={0.26} y={22}>
              <p className="auth-lux__section-sub">
                Create your account in under a minute — every module unlocks instantly for{' '}
                {TRIAL_DAYS} days. Cancel anytime from profile.
              </p>
            </Reveal>
            <Reveal delay={0.36} y={20} blur={false}>
              <button
                type="button"
                className="auth-lux__btn-solid auth-lux__btn-solid--xl"
                onClick={() => openSignUp()}
              >
                Start free on {BRAND}
                <ArrowRight className="w-5 h-5" aria-hidden />
              </button>
            </Reveal>
            <Reveal delay={0.44} y={16} blur={false}>
              <p className="auth-lux__bottom-cta-alt">
                Already have a login?{' '}
                <button type="button" className="auth-inline-link" onClick={openSignIn}>
                  Sign in
                </button>
              </p>
            </Reveal>
          </div>
        </section>

        <footer className="auth-lux__footer">
          <div className="auth-lux__footer-top">
            <div className="auth-lux__footer-brand">
              <BrandMark size="sm" iconOnly />
              <div>
                <strong>{BRAND}</strong>
                <em>{BRAND_TAGLINE_FULL}</em>
                <span>wolftradeai.in</span>
              </div>
            </div>
            <div className="auth-lux__footer-links">
              <a href="#platform">Features</a>
              <a href="#reviews">Reviews</a>
              <a href="#modules">Library</a>
              <a href="#pricing">Pricing</a>
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
        {authView && (
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
              aria-label="Close"
              onClick={closeAuth}
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
                onClick={closeAuth}
              >
                <X className="w-5 h-5" />
              </button>
              <div id="auth-signin-title" className="sr-only">
                {authView.kind === 'signup'
                  ? 'Create your account'
                  : authView.kind === 'forgot'
                    ? 'Reset your password'
                    : 'Sign In'}
              </div>
              {authView.kind === 'signup' ? (
                <AuthSignupForm
                  onSignupStart={onSignupStart}
                  onSignupVerify={onSignupVerify}
                  onSignupResend={onSignupResend}
                  onSwitchToSignIn={openSignIn}
                  selectedPlan={authView.plan}
                />
              ) : authView.kind === 'forgot' ? (
                <AuthForgotForm
                  onResetStart={onResetStart}
                  onResetResend={onResetResend}
                  onResetComplete={onResetComplete}
                  onSwitchToSignIn={openSignIn}
                />
              ) : (
                <AuthForm {...formProps} onForgotClick={openForgot} />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
