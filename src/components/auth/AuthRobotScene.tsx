import { lazy, Suspense, useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const AuthRobot3D = lazy(() => import('./AuthRobot3D'));

function ThinkerFallback() {
  return (
    <div className="auth-thinker-portrait auth-thinker-portrait--fallback">
      <img src="/auth/ai-thinker.png" alt="" className="auth-thinker-img" draggable={false} />
      <div className="auth-thinker-vignette" />
    </div>
  );
}

/** Full-screen moving 3D AI Thinker robot */
export default function AuthRobotScene({ fullscreen = false }: { fullscreen?: boolean }) {
  const [prefer3d, setPrefer3d] = useState(true);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (reduce || saveData) setPrefer3d(false);
  }, []);

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
      </div>

      <div className="auth-thinker-3d-wrap">
        {prefer3d ? (
          <Suspense fallback={<ThinkerFallback />}>
            <AuthRobot3D compact={!fullscreen} />
          </Suspense>
        ) : (
          <ThinkerFallback />
        )}
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
          <span>3D LIVE</span>
        </motion.div>
        <motion.div
          className="auth-thinker-chip auth-thinker-chip--tr"
          animate={{ opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
        >
          MARKET AI
          <span>MOVING</span>
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
