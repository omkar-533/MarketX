import { motion } from 'framer-motion';

/** Full-screen AI Thinker robot — sleek blue neural aesthetic */
export default function AuthRobotScene({ fullscreen = false }: { fullscreen?: boolean }) {
  return (
    <div
      className={`auth-robot-stage auth-robot-stage--thinker ${fullscreen ? 'auth-robot-stage--fullscreen' : ''}`}
      aria-hidden="true"
    >
      <div className="auth-thinker-bg">
        <div className="auth-thinker-glow auth-thinker-glow--a" />
        <div className="auth-thinker-glow auth-thinker-glow--b" />
        <div className="auth-thinker-grid" />
        <div className="auth-thinker-orbit auth-thinker-orbit--a" />
        <div className="auth-thinker-orbit auth-thinker-orbit--b" />
        {Array.from({ length: 18 }).map((_, i) => (
          <span
            key={i}
            className="auth-thinker-particle"
            style={{
              left: `${6 + ((i * 17) % 88)}%`,
              top: `${10 + ((i * 23) % 75)}%`,
              animationDelay: `${i * 0.35}s`,
            }}
          />
        ))}
      </div>

      <div className="auth-thinker-portrait">
        <img
          src="/auth/ai-thinker.png"
          alt=""
          className="auth-thinker-img"
          draggable={false}
        />
        <div className="auth-thinker-vignette" />
        <div className="auth-thinker-scan" />
      </div>

      <div className="auth-thinker-hud">
        <motion.div
          className="auth-thinker-chip auth-thinker-chip--tl"
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 2.4, repeat: Infinity }}
        >
          NEURAL CORE
          <span>ANALYZING</span>
        </motion.div>
        <motion.div
          className="auth-thinker-chip auth-thinker-chip--tr"
          animate={{ opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
        >
          MARKET AI
          <span>ONLINE</span>
        </motion.div>
        <div className="auth-thinker-chip auth-thinker-chip--bl">
          DEPTH
          <div className="auth-thinker-bar">
            <i style={{ width: '78%' }} />
          </div>
        </div>
        <div className="auth-thinker-chip auth-thinker-chip--br">
          SIGNAL
          <div className="auth-thinker-bar auth-thinker-bar--cyan">
            <i style={{ width: '91%' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
