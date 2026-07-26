import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

/** Full-screen looping video of the user's AI Thinker image */
export default function AuthRobotScene({ fullscreen = false }: { fullscreen?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.playbackRate = 1;
    const play = () => {
      void el.play().catch(() => setFailed(true));
    };
    play();
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
      </div>

      <div className="auth-thinker-video-wrap">
        {!failed ? (
          <video
            ref={videoRef}
            className="auth-thinker-video"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            poster="/auth/ai-thinker.png"
            onError={() => setFailed(true)}
          >
            <source src="/auth/ai-thinker.webm" type="video/webm" />
            <source src="/auth/ai-thinker.mp4" type="video/mp4" />
          </video>
        ) : (
          <div className="auth-thinker-portrait auth-thinker-portrait--fallback">
            <img src="/auth/ai-thinker.png" alt="" className="auth-thinker-img" draggable={false} />
          </div>
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
          <span>VIDEO LIVE</span>
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
