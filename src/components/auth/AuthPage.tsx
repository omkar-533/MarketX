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
import LiveHeroTerminal from './LiveHeroTerminal';
import BrandMark from '../BrandMark';
import { BRAND, BRAND_TAGLINE, BRAND_TAGLINE_FULL } from '../../constants/brandLabels';
import { Counter, EASE, GradientLine, Marquee, Reveal, Words } from './scrollFx';

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
    image: `${import.meta.env.BASE_URL}landing/band-ai-copilot.jpg`,
  },
  {
    id: 'workspace',
    kicker: 'Next-gen workspace',
    title: 'An AI desk for winning sessions',
    body: 'Ask the platform to surface setups, track your journal, and keep heatmaps, scanners, and option intelligence synced in one invite-only terminal.',
    cta: 'Get access now',
    image: `${import.meta.env.BASE_URL}landing/band-workspace.jpg`,
  },
  {
    id: 'alerts',
    kicker: 'Precision tools',
    title: 'Your edge, now on autopilot',
    body: 'Turn live scanners and structure into a disciplined workflow — alerts, journals, and Master AI context so you never trade blind.',
    cta: 'Start now',
    image: `${import.meta.env.BASE_URL}landing/band-autopilot.jpg`,
  },
] as const;

const avatar = (n: number) => `${import.meta.env.BASE_URL}landing/avatars/trader-${n}.jpg`;

const REVIEWS = [
  {
    name: 'Rohan Mehta',
    role: 'Options trader · Mumbai',
    rating: 5,
    photo: avatar(1),
    quote:
      'I used to keep five tabs open just to check OI and index bias. Now it is one screen. Took me about a week to stop cross-checking the numbers elsewhere — after that I never went back.',
  },
  {
    name: 'Ananya Kulkarni',
    role: 'Prop desk · Bengaluru',
    rating: 5,
    photo: avatar(2),
    quote:
      'The journal is what actually changed things for me. Tagging every entry showed that most of my losses came from the first fifteen minutes. So I stopped trading the open.',
  },
  {
    name: 'Vikram Singh',
    role: 'Intraday F&O · Delhi',
    rating: 5,
    photo: avatar(3),
    quote:
      'Scanners refresh with the tape, which is rare at this price. I run the breakout scan around 9:45, shortlist three names, and that is my whole morning routine now.',
  },
  {
    name: 'Neha Patil',
    role: 'Swing trader · Pune',
    rating: 4,
    photo: avatar(4),
    quote:
      'Master AI will not tell you what to buy, and honestly that is why I trust it. I ask what changed in OI since yesterday and get a straight answer. Wish the mobile layout was a bit denser.',
  },
  {
    name: 'Karthik Raman',
    role: 'Positional trader · Chennai',
    rating: 5,
    photo: avatar(5),
    quote:
      'The sector heatmap is the first thing I open. Working out which sector is holding up on a red day used to take me twenty minutes of scrolling through lists.',
  },
  {
    name: 'Sneha Desai',
    role: 'Options seller · Hyderabad',
    rating: 4,
    photo: avatar(6),
    quote:
      'Having max pain and PCR in one view kept me out of two bad expiry positions last month. Still waiting on SMS alerts, but the in-app ones do the job.',
  },
  {
    name: 'Aditya Joshi',
    role: 'F&O trader · Ahmedabad',
    rating: 5,
    photo: avatar(7),
    quote:
      'Setup took ten minutes. What sold me was that the quotes matched my broker terminal exactly — I sat and checked it tick by tick for two full sessions before trusting it.',
  },
  {
    name: 'Meera Sharma',
    role: 'Part-time trader · Kolkata',
    rating: 5,
    photo: avatar(8),
    quote:
      'I trade after work, so I need the day reviewed fast. Dashboard bias plus a journal pass takes me about fifteen minutes instead of the hour it used to.',
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
  { to: 220, suffix: '+', label: 'F&O symbols tracked' },
  { to: 24, suffix: '', label: 'ready-made scanners' },
  { to: 6, suffix: '', label: 'core modules' },
  { to: 99.9, suffix: '%', decimals: 1, label: 'data uptime' },
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
export default function AuthPage(props: AuthPageProps) {
  const [signInOpen, setSignInOpen] = useState(false);
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
              The AI platform to build &amp; deploy your own edge — powered by live bias, heatmaps,
              scanners, journals, and Master AI used by serious Indian traders.
            </motion.p>
            <motion.div
              className="auth-lux__hero-actions"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.68, ease }}
            >
              <button type="button" className="auth-lux__btn-solid auth-lux__btn-solid--xl" onClick={openSignIn}>
                Get access now
                <ArrowRight className="w-5 h-5" aria-hidden />
              </button>
              <a href="#reviews" className="auth-lux__link-underline">
                See trader stories
              </a>
            </motion.div>
            <motion.div
              className="auth-lux__trust"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.7, delay: 0.85, ease }}
            >
              <Stars rating={5} size="lg" />
              <p>Loved by desks that care about process — invite-only access</p>
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
            <StoryBand key={band.id} band={band} flip={i % 2 === 1} onCta={openSignIn} />
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
                  Six core modules — live data, structure, and AI in one luxury workspace.
                </p>
              </Reveal>
            </div>
            <AuthFeatureGrid />
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="auth-lux__bottom-cta">
          <div className="auth-lux__bottom-cta-inner">
            <Reveal y={24} blur={false}>
              <p className="auth-lux__kicker">Invite only</p>
            </Reveal>
            <h2 className="auth-lux__section-title">
              <Words text="Plans for every style" />
              <br />
              <GradientLine text="of trading" delay={0.22} />
            </h2>
            <Reveal delay={0.26} y={22}>
              <p className="auth-lux__section-sub">
                Safe, private access. Sign in with credentials created for your desk — cancel anytime from profile.
              </p>
            </Reveal>
            <Reveal delay={0.36} y={20} blur={false}>
              <button type="button" className="auth-lux__btn-solid auth-lux__btn-solid--xl" onClick={openSignIn}>
                Sign In to {BRAND}
                <ArrowRight className="w-5 h-5" aria-hidden />
              </button>
            </Reveal>
          </div>
        </section>

        <footer className="auth-lux__footer">
          <div className="auth-lux__footer-top">
            <div className="auth-lux__footer-brand">
              <BrandMark size="sm" />
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
