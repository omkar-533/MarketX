import { useEffect, useMemo, useRef, useState } from 'react';
import { PlayCircle, ShieldAlert } from 'lucide-react';
import { loadAppSession } from '../../services/appInviteAuth';

type ProtectedGuideVideoProps = {
  url: string;
  title?: string;
};

type ParsedSource =
  | { kind: 'youtube'; embed: string }
  | { kind: 'vimeo'; embed: string }
  | { kind: 'file'; src: string }
  | { kind: 'unknown'; href: string };

function parseVideoSource(raw: string): ParsedSource | null {
  const href = String(raw || '').trim();
  if (!href) return null;
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return null;
  }

  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  if (host === 'youtu.be') {
    const id = u.pathname.split('/').filter(Boolean)[0];
    if (id) {
      return {
        kind: 'youtube',
        embed: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`,
      };
    }
  }
  if (host.includes('youtube.com')) {
    const id = u.searchParams.get('v') || u.pathname.split('/').filter(Boolean).pop();
    if (id && id !== 'watch' && id !== 'embed') {
      return {
        kind: 'youtube',
        embed: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`,
      };
    }
    if (u.pathname.includes('/embed/')) {
      return { kind: 'youtube', embed: href.replace('youtube.com', 'youtube-nocookie.com') };
    }
  }
  if (host.includes('vimeo.com')) {
    const id = u.pathname.split('/').filter(Boolean).pop();
    if (id && /^\d+$/.test(id)) {
      return {
        kind: 'vimeo',
        embed: `https://player.vimeo.com/video/${id}?title=0&byline=0&portrait=0&dnt=1`,
      };
    }
  }
  if (/\.(mp4|webm|ogg|m3u8)(\?|$)/i.test(u.pathname) || host.includes('supabase')) {
    return { kind: 'file', src: href };
  }
  return { kind: 'unknown', href };
}

function watermarkLabel() {
  const session = loadAppSession();
  const user = session?.user;
  const id = user?.phone || user?.email || user?.name || user?.id || 'member';
  return `${id} · ${BRAND_MARK}`;
}

const BRAND_MARK = 'Wolf Trade AI · view only';

/**
 * How-to guidance player with best-effort anti-download / anti-capture deterrents.
 * True screen-recording block is not possible in browsers; we watermark + pause on blur.
 */
export default function ProtectedGuideVideo({ url, title }: ProtectedGuideVideoProps) {
  const source = useMemo(() => parseVideoSource(url), [url]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [shielded, setShielded] = useState(false);
  const [stamp, setStamp] = useState(() => new Date().toLocaleTimeString('en-IN'));
  const mark = useMemo(() => watermarkLabel(), []);

  useEffect(() => {
    const tick = window.setInterval(() => {
      setStamp(new Date().toLocaleTimeString('en-IN'));
    }, 4000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    // Only pause when the browser TAB is hidden — not on window blur.
    // Clicking a YouTube/Vimeo iframe steals focus and used to false-trigger the shield.
    const onVis = () => {
      if (document.visibilityState !== 'visible') {
        setShielded(true);
        const el = videoRef.current;
        if (el && !el.paused) el.pause();
      } else {
        setShielded(false);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  if (!source) return null;

  return (
    <section className="lux-ind__guide">
      <div className="lux-ind__guide-head">
        <PlayCircle className="w-4 h-4" />
        <div>
          <h2>How to use</h2>
          <p>Watch-only guidance{title ? ` for ${title}` : ''}. Download controls are disabled.</p>
        </div>
      </div>

      <div
        className={`lux-ind__guide-stage ${shielded ? 'is-shielded' : ''}`}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
      >
        {source.kind === 'file' ? (
          <video
            ref={videoRef}
            className="lux-ind__guide-media"
            src={source.src}
            controls
            controlsList="nodownload noplaybackrate noremoteplayback"
            disablePictureInPicture
            playsInline
            preload="metadata"
            onContextMenu={(e) => e.preventDefault()}
          />
        ) : source.kind === 'youtube' || source.kind === 'vimeo' ? (
          <iframe
            className="lux-ind__guide-media lux-ind__guide-media--embed"
            src={source.embed}
            title={title || 'How to use'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <div className="lux-ind__guide-fallback">
            <p>This video host needs an embedded player link.</p>
            <a href={source.href} target="_blank" rel="noreferrer noopener">
              Open guidance link
            </a>
          </div>
        )}

        <div className="lux-ind__guide-watermark" aria-hidden>
          <span>
            {mark}
            <br />
            {stamp}
          </span>
          <span>
            {mark}
            <br />
            {stamp}
          </span>
          <span>
            {mark}
            <br />
            {stamp}
          </span>
        </div>

        {shielded ? (
          <button
            type="button"
            className="lux-ind__guide-shield"
            onClick={() => setShielded(false)}
          >
            <ShieldAlert className="w-5 h-5" />
            <p>Playback paused — tab switch detect hua. Click to continue watching.</p>
          </button>
        ) : null}
      </div>

      <p className="lux-ind__guide-note">
        View-only session. Saving, downloading, or redistributing this guidance is not allowed.
        Your account watermark is shown on the player.
      </p>
    </section>
  );
}
