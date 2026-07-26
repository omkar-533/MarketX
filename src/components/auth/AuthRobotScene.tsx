import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

const LOGIN_VIDEO = '/auth/215500_medium.mp4?v=4k1';
const LOGIN_POSTER = '/auth/ai-thinker-poster.jpg?v=4k1';

/** Full-screen looping login video — exact user-provided clip */
export default function AuthRobotScene({ fullscreen = false }: { fullscreen?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.playbackRate = 1;
    el.defaultMuted = true;
    el.muted = true;

    const play = () => {
      void el.play().catch(() => setFailed(true));
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && el.paused) play();
    };
    const onStalled = () => play();

    el.addEventListener('stalled', onStalled);
    document.addEventListener('visibilitychange', onVisibility);
    play();

    return () => {
      el.removeEventListener('stalled', onStalled);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <div
      className={`auth-robot-stage auth-robot-stage--thinker ${fullscreen ? 'auth-robot-stage--fullscreen' : ''}`}
      aria-hidden="true"
    >
      <div className="auth-thinker-bg">
        <div className="auth-thinker-glow auth-thinker-glow--a" />
        <div className="auth-thinker-glow auth-thinker-glow--b" />
      </div>

      <div className="auth-thinker-video-wrap">
        {!failed ? (
          <video
            ref={videoRef}
            className="auth-thinker-video"
            src={LOGIN_VIDEO}
            autoPlay
            muted
            loop
            playsInline
            disablePictureInPicture
            preload="auto"
            poster={LOGIN_POSTER}
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="auth-thinker-portrait auth-thinker-portrait--fallback">
            <img src={LOGIN_POSTER} alt="" className="auth-thinker-img" draggable={false} />
          </div>
        )}
        <div className="auth-thinker-vignette" />
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
      </div>
    </div>
  );
}
