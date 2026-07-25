import { motion } from 'framer-motion';

function FlyingDrone({
  className,
  delay = 0,
  size = 'md',
}: {
  className: string;
  delay?: number;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <div
      className={`auth-drone auth-drone--${size} ${className}`}
      style={{ animationDelay: `${delay}s` }}
      aria-hidden="true"
    >
      <div className="auth-drone-body">
        <span className="auth-drone-eye" />
        <span className="auth-drone-arm auth-drone-arm--tl" />
        <span className="auth-drone-arm auth-drone-arm--tr" />
        <span className="auth-drone-arm auth-drone-arm--bl" />
        <span className="auth-drone-arm auth-drone-arm--br" />
        <span className="auth-drone-rotor auth-drone-rotor--tl" />
        <span className="auth-drone-rotor auth-drone-rotor--tr" />
        <span className="auth-drone-rotor auth-drone-rotor--bl" />
        <span className="auth-drone-rotor auth-drone-rotor--br" />
        <span className="auth-drone-beam" />
      </div>
      <div className="auth-drone-shadow" />
    </div>
  );
}

/** Full-screen advanced mech + swarm of flying drones */
export default function AuthRobotScene({ fullscreen = false }: { fullscreen?: boolean }) {
  return (
    <div
      className={`auth-robot-stage auth-robot-stage--mech ${fullscreen ? 'auth-robot-stage--fullscreen' : ''}`}
      aria-hidden="true"
    >
      <div className="auth-mech-arena">
        <div className="auth-mech-grid" />
        <div className="auth-mech-horizon" />
        <div className="auth-mech-ring auth-mech-ring--a" />
        <div className="auth-mech-ring auth-mech-ring--b" />
        <div className="auth-mech-ring auth-mech-ring--c" />
      </div>

      {/* Drone swarm */}
      <div className="auth-drone-swarm">
        <FlyingDrone className="auth-drone-path--1" delay={0} size="md" />
        <FlyingDrone className="auth-drone-path--2" delay={0.8} size="sm" />
        <FlyingDrone className="auth-drone-path--3" delay={1.4} size="lg" />
        <FlyingDrone className="auth-drone-path--4" delay={0.3} size="sm" />
        <FlyingDrone className="auth-drone-path--5" delay={1.1} size="md" />
        <FlyingDrone className="auth-drone-path--6" delay={2} size="sm" />
        <FlyingDrone className="auth-drone-path--7" delay={0.5} size="md" />
        <FlyingDrone className="auth-drone-path--8" delay={1.7} size="sm" />
      </div>

      <div className="auth-mech-trail">
        {Array.from({ length: 10 }).map((_, i) => (
          <span key={i} className="auth-mech-spark" style={{ animationDelay: `${i * 0.3}s` }} />
        ))}
      </div>

      <div className="auth-walker-track auth-walker-track--mech">
        <div className="auth-walker auth-walker--mech auth-walker--xl">
          <div className="auth-mech-thruster">
            <span className="auth-mech-flame" />
            <span className="auth-mech-flame auth-mech-flame--mid" />
            <span className="auth-mech-flame auth-mech-flame--side" />
          </div>

          <div className="auth-walker-body">
            <div className="auth-mech-shoulder auth-mech-shoulder--l" />
            <div className="auth-mech-shoulder auth-mech-shoulder--r" />

            <div className="auth-walker-head auth-walker-head--mech">
              <div className="auth-walker-visor auth-walker-visor--mech">
                <span className="auth-walker-eye" />
                <span className="auth-walker-eye" />
                <div className="auth-mech-laser" />
              </div>
              <div className="auth-walker-antenna" />
              <div className="auth-mech-helmet-ridge" />
            </div>

            <div className="auth-walker-torso auth-walker-torso--mech">
              <div className="auth-mech-plate auth-mech-plate--l" />
              <div className="auth-mech-plate auth-mech-plate--r" />
              <div className="auth-walker-core auth-walker-core--mech">
                <span className="auth-mech-core-ring" />
              </div>
              <span className="auth-walker-badge">TX·X1</span>
              <div className="auth-mech-vent" />
            </div>

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
          DRONES
          <span>8 ACTIVE</span>
        </motion.div>
        <div className="auth-hud-chip auth-hud-chip--bl">
          POWER
          <div className="auth-mech-bar">
            <i style={{ width: '86%' }} />
          </div>
        </div>
        <div className="auth-hud-chip auth-hud-chip--br">
          SWARM
          <div className="auth-mech-bar auth-mech-bar--cyan">
            <i style={{ width: '94%' }} />
          </div>
        </div>
      </div>

      <div className="auth-mech-radar">
        <span className="auth-mech-radar-sweep" />
        <span className="auth-mech-radar-blip" />
        <span className="auth-mech-radar-blip auth-mech-radar-blip--2" />
        <span className="auth-mech-radar-blip auth-mech-radar-blip--3" />
      </div>
    </div>
  );
}
