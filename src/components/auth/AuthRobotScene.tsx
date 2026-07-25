import { motion } from 'framer-motion';

/** Advanced mech patrol unit — walk cycle, thrusters, scan laser, HUD */
export default function AuthRobotScene() {
  return (
    <div className="auth-robot-stage auth-robot-stage--mech" aria-hidden="true">
      {/* Perspective arena */}
      <div className="auth-mech-arena">
        <div className="auth-mech-grid" />
        <div className="auth-mech-horizon" />
        <div className="auth-mech-ring auth-mech-ring--a" />
        <div className="auth-mech-ring auth-mech-ring--b" />
      </div>

      {/* Energy trail particles */}
      <div className="auth-mech-trail">
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} className="auth-mech-spark" style={{ animationDelay: `${i * 0.35}s` }} />
        ))}
      </div>

      {/* Walking mech */}
      <div className="auth-walker-track auth-walker-track--mech">
        <div className="auth-walker auth-walker--mech">
          {/* Back thruster plume */}
          <div className="auth-mech-thruster">
            <span className="auth-mech-flame" />
            <span className="auth-mech-flame auth-mech-flame--mid" />
            <span className="auth-mech-flame auth-mech-flame--side" />
          </div>

          <div className="auth-walker-body">
            {/* Shoulder pads */}
            <div className="auth-mech-shoulder auth-mech-shoulder--l" />
            <div className="auth-mech-shoulder auth-mech-shoulder--r" />

            {/* Head + scan laser */}
            <div className="auth-walker-head auth-walker-head--mech">
              <div className="auth-walker-visor auth-walker-visor--mech">
                <span className="auth-walker-eye" />
                <span className="auth-walker-eye" />
                <div className="auth-mech-laser" />
              </div>
              <div className="auth-walker-antenna" />
              <div className="auth-mech-helmet-ridge" />
            </div>

            {/* Torso with armor plates */}
            <div className="auth-walker-torso auth-walker-torso--mech">
              <div className="auth-mech-plate auth-mech-plate--l" />
              <div className="auth-mech-plate auth-mech-plate--r" />
              <div className="auth-walker-core auth-walker-core--mech">
                <span className="auth-mech-core-ring" />
              </div>
              <span className="auth-walker-badge">TX·X1</span>
              <div className="auth-mech-vent" />
            </div>

            {/* Arms with blades */}
            <div className="auth-walker-arm auth-walker-arm--l auth-walker-arm--mech">
              <div className="auth-walker-forearm">
                <span className="auth-mech-blade" />
              </div>
            </div>
            <div className="auth-walker-arm auth-walker-arm--r auth-walker-arm--mech">
              <div className="auth-walker-forearm">
                <span className="auth-mech-blade" />
              </div>
            </div>

            {/* Legs with hydraulic joints */}
            <div className="auth-walker-leg auth-walker-leg--l auth-walker-leg--mech">
              <div className="auth-mech-joint" />
              <div className="auth-walker-shin">
                <div className="auth-walker-foot auth-walker-foot--mech" />
                <span className="auth-mech-step-ring" />
              </div>
            </div>
            <div className="auth-walker-leg auth-walker-leg--r auth-walker-leg--mech">
              <div className="auth-mech-joint" />
              <div className="auth-walker-shin">
                <div className="auth-walker-foot auth-walker-foot--mech" />
                <span className="auth-mech-step-ring auth-mech-step-ring--delay" />
              </div>
            </div>
          </div>
          <div className="auth-walker-shadow" />
        </div>
      </div>

      {/* Advanced HUD */}
      <div className="auth-mech-hud">
        <motion.div
          className="auth-hud-chip auth-hud-chip--tl"
          animate={{ opacity: [0.65, 1, 0.65] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          STATUS
          <span>COMBAT PATROL</span>
        </motion.div>
        <motion.div
          className="auth-hud-chip auth-hud-chip--tr"
          animate={{ opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 1.8, repeat: Infinity, delay: 0.2 }}
        >
          UNIT
          <span>TX·MECH X1</span>
        </motion.div>
        <div className="auth-hud-chip auth-hud-chip--bl">
          POWER
          <div className="auth-mech-bar">
            <i style={{ width: '86%' }} />
          </div>
        </div>
        <div className="auth-hud-chip auth-hud-chip--br">
          SHIELD
          <div className="auth-mech-bar auth-mech-bar--cyan">
            <i style={{ width: '72%' }} />
          </div>
        </div>
      </div>

      <div className="auth-mech-radar">
        <span className="auth-mech-radar-sweep" />
        <span className="auth-mech-radar-blip" />
      </div>
    </div>
  );
}
