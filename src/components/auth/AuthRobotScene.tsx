import { motion } from 'framer-motion';

/** CSS 3D robotic AI core — no WebGL, GPU-friendly transforms */
export default function AuthRobotScene() {
  return (
    <div className="auth-robot-stage" aria-hidden="true">
      <div className="auth-robot-orbit auth-robot-orbit--outer" />
      <div className="auth-robot-orbit auth-robot-orbit--mid" />
      <div className="auth-robot-orbit auth-robot-orbit--inner" />

      <motion.div
        className="auth-robot-core"
        animate={{ rotateY: [0, 8, -6, 0], rotateX: [0, -4, 3, 0] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* Helmet / head shell */}
        <div className="auth-robot-head">
          <div className="auth-robot-visor">
            <div className="auth-robot-eye auth-robot-eye--l" />
            <div className="auth-robot-eye auth-robot-eye--r" />
            <div className="auth-robot-scanline" />
          </div>
          <div className="auth-robot-crest" />
          <div className="auth-robot-chin" />
          <div className="auth-robot-ear auth-robot-ear--l" />
          <div className="auth-robot-ear auth-robot-ear--r" />
        </div>

        {/* Neck + chest plate */}
        <div className="auth-robot-neck" />
        <div className="auth-robot-chest">
          <div className="auth-robot-core-glow" />
          <span className="auth-robot-core-label">TX·AI</span>
        </div>
      </motion.div>

      {/* Floating HUD chips */}
      <motion.div
        className="auth-hud-chip auth-hud-chip--tl"
        animate={{ y: [0, -6, 0], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 3.2, repeat: Infinity }}
      >
        NEURAL LINK
        <span>ONLINE</span>
      </motion.div>
      <motion.div
        className="auth-hud-chip auth-hud-chip--tr"
        animate={{ y: [0, 5, 0], opacity: [0.65, 1, 0.65] }}
        transition={{ duration: 2.8, repeat: Infinity, delay: 0.4 }}
      >
        LATENCY
        <span>12ms</span>
      </motion.div>
      <motion.div
        className="auth-hud-chip auth-hud-chip--bl"
        animate={{ y: [0, 4, 0] }}
        transition={{ duration: 3.5, repeat: Infinity, delay: 0.2 }}
      >
        MODEL
        <span>MASTER·AI</span>
      </motion.div>
      <motion.div
        className="auth-hud-chip auth-hud-chip--br"
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: 3, repeat: Infinity, delay: 0.6 }}
      >
        MARKET
        <span>SYNC</span>
      </motion.div>

      {/* Particles */}
      {Array.from({ length: 12 }).map((_, i) => (
        <span
          key={i}
          className="auth-robot-particle"
          style={{
            left: `${8 + (i * 7) % 84}%`,
            animationDelay: `${i * 0.35}s`,
            animationDuration: `${4 + (i % 4)}s`,
          }}
        />
      ))}
    </div>
  );
}
