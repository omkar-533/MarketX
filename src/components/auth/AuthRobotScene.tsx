import { motion } from 'framer-motion';

/** Full-body walking robot — CSS walk cycle + patrol path */
export default function AuthRobotScene() {
  return (
    <div className="auth-robot-stage auth-robot-stage--walker" aria-hidden="true">
      <div className="auth-robot-floor" />
      <div className="auth-robot-floor-glow" />

      {/* Patrol: left → right → flip → left */}
      <div className="auth-walker-track">
        <div className="auth-walker">
          <div className="auth-walker-body">
            {/* Head */}
            <div className="auth-walker-head">
              <div className="auth-walker-visor">
                <span className="auth-walker-eye" />
                <span className="auth-walker-eye" />
              </div>
              <div className="auth-walker-antenna" />
            </div>

            {/* Torso */}
            <div className="auth-walker-torso">
              <div className="auth-walker-core" />
              <span className="auth-walker-badge">TX</span>
            </div>

            {/* Arms */}
            <div className="auth-walker-arm auth-walker-arm--l">
              <div className="auth-walker-forearm" />
            </div>
            <div className="auth-walker-arm auth-walker-arm--r">
              <div className="auth-walker-forearm" />
            </div>

            {/* Legs */}
            <div className="auth-walker-leg auth-walker-leg--l">
              <div className="auth-walker-shin" />
              <div className="auth-walker-foot" />
            </div>
            <div className="auth-walker-leg auth-walker-leg--r">
              <div className="auth-walker-shin" />
              <div className="auth-walker-foot" />
            </div>
          </div>
          <div className="auth-walker-shadow" />
        </div>
      </div>

      <motion.div
        className="auth-hud-chip auth-hud-chip--tl"
        animate={{ opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 2.5, repeat: Infinity }}
      >
        STATUS
        <span>WALKING</span>
      </motion.div>
      <motion.div
        className="auth-hud-chip auth-hud-chip--tr"
        animate={{ opacity: [0.55, 1, 0.55] }}
        transition={{ duration: 2.2, repeat: Infinity, delay: 0.3 }}
      >
        UNIT
        <span>TX·BOT</span>
      </motion.div>
      <motion.div className="auth-hud-chip auth-hud-chip--bl">
        MODE
        <span>PATROL</span>
      </motion.div>
      <motion.div className="auth-hud-chip auth-hud-chip--br">
        LINK
        <span>LIVE</span>
      </motion.div>
    </div>
  );
}
