import { useEffect, useRef } from 'react';
import { playArenaSfx } from '../../services/mentorArena';
import type { QuestMode } from '../../services/mentorArenaCampaign';

export type TapeGameResult = {
  cleared: boolean;
  score: number;
  coins: number;
  livesLeft: number;
  livesMax: number;
  distance: number;
  gatesCorrect: number;
  gatesTotal: number;
  comboMax: number;
};

export type TapeGameConfig = {
  levelId: number;
  title: string;
  mode: QuestMode;
  lives: number;
  /** world length in px before finish */
  trackLength: number;
  speed: number;
  theme: 'candle' | 'structure' | 'liquidity' | 'mind' | 'mixed';
  /** short gate challenges — pick pad by jumping onto it */
  gates: { prompt: string; options: string[]; correctIndex: number }[];
};

type WolfTapeGameProps = {
  config: TapeGameConfig;
  onFinish: (result: TapeGameResult) => void;
};

type Entity =
  | { kind: 'spike'; x: number; w: number; h: number; label: string; hit?: boolean }
  | { kind: 'pit'; x: number; w: number; label: string; hit?: boolean }
  | { kind: 'coin'; x: number; y: number; r: number; taken?: boolean }
  | { kind: 'orb'; x: number; y: number; r: number; taken?: boolean; label: string }
  | { kind: 'platform'; x: number; y: number; w: number; h: number }
  | {
      kind: 'gate';
      x: number;
      prompt: string;
      options: string[];
      correctIndex: number;
      resolved?: boolean;
      pads: { x: number; y: number; w: number; h: number; i: number }[];
    }
  | { kind: 'flag'; x: number };

function themeHazards(theme: TapeGameConfig['theme']): string[] {
  if (theme === 'candle') return ['FOMO candle', 'Long wick trap', 'Chase spike'];
  if (theme === 'structure') return ['Broken HL', 'Fake BOS', 'LH trap'];
  if (theme === 'liquidity') return ['Stop hunt', 'Sweep pit', 'Equal-high trap'];
  if (theme === 'mind') return ['Revenge', 'Tilt spike', 'Impatience'];
  return ['Fakeout', 'FOMO', 'No-plan'];
}

function buildWorld(cfg: TapeGameConfig): Entity[] {
  const ents: Entity[] = [];
  const haz = themeHazards(cfg.theme);
  const len = cfg.trackLength;
  let x = 420;

  // starter platforms / rhythm
  while (x < len - 280) {
    const roll = Math.random();
    if (roll < 0.28) {
      ents.push({
        kind: 'spike',
        x,
        w: 34 + Math.random() * 20,
        h: 28 + Math.random() * 22,
        label: haz[Math.floor(Math.random() * haz.length)],
      });
      x += 160 + Math.random() * 120;
    } else if (roll < 0.4) {
      ents.push({
        kind: 'pit',
        x,
        w: 70 + Math.random() * 50,
        label: haz[Math.floor(Math.random() * haz.length)],
      });
      x += 200 + Math.random() * 80;
    } else if (roll < 0.55) {
      const py = 210 - Math.random() * 70;
      ents.push({ kind: 'platform', x, y: py, w: 70 + Math.random() * 50, h: 14 });
      if (Math.random() > 0.35) {
        ents.push({ kind: 'coin', x: x + 30, y: py - 28, r: 9 });
      }
      x += 140 + Math.random() * 90;
    } else if (roll < 0.78) {
      ents.push({
        kind: 'coin',
        x,
        y: 160 + Math.random() * 80,
        r: 9,
      });
      if (Math.random() > 0.5) {
        ents.push({
          kind: 'orb',
          x: x + 55,
          y: 140 + Math.random() * 60,
          r: 11,
          label: cfg.theme === 'candle' ? 'Wick' : 'Edge',
        });
      }
      x += 90 + Math.random() * 70;
    } else {
      x += 60 + Math.random() * 40;
    }
  }

  // place gates along track
  const gateCount = Math.min(cfg.gates.length, cfg.mode === 'boss' ? 3 : 2);
  for (let g = 0; g < gateCount; g++) {
    const gx = Math.floor((len / (gateCount + 1)) * (g + 1));
    const gate = cfg.gates[g];
    const pads = gate.options.map((_, i) => ({
      x: gx + i * 95,
      y: 150 - i * 8,
      w: 78,
      h: 18,
      i,
    }));
    ents.push({
      kind: 'gate',
      x: gx,
      prompt: gate.prompt,
      options: gate.options,
      correctIndex: gate.correctIndex,
      pads,
    });
  }

  ents.push({ kind: 'flag', x: len });
  return ents;
}

export default function WolfTapeGame({ config, onFinish }: WolfTapeGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const finishedRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    finishedRef.current = false;
    let W = 800;
    let H = 360;
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      W = Math.max(320, Math.floor(r.width));
      H = Math.max(280, Math.floor(r.height));
      canvas.width = W * devicePixelRatio;
      canvas.height = H * devicePixelRatio;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const groundY = () => H - 54;
    const player = {
      x: 90,
      y: 0,
      w: 28,
      h: 36,
      vy: 0,
      onGround: false,
      jumps: 0,
      invuln: 0,
    };
    player.y = groundY() - player.h;

    const ents = buildWorld(config);
    let camX = 0;
    let score = 0;
    let coins = 0;
    let lives = config.lives;
    const livesMax = config.lives;
    let combo = 0;
    let comboMax = 0;
    let gatesCorrect = 0;
    let gatesTotal = 0;
    let activeGate: Extract<Entity, { kind: 'gate' }> | null = null;
    let gateTimer = 0;
    let speed = config.speed;
    let shake = 0;
    let t = 0;
    let last = performance.now();
    let raf = 0;

    const keys = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['arrowup', ' ', 'w', 'arrowdown', 's', 'arrowleft', 'a', 'arrowright', 'd'].includes(k) || e.code === 'Space') {
        e.preventDefault();
      }
      keys.add(k);
      if (e.code === 'Space') keys.add(' ');
      if ((k === 'arrowup' || k === 'w' || k === ' ') && player.jumps < 2) {
        player.vy = player.jumps === 0 ? -11.2 : -9.2;
        player.onGround = false;
        player.jumps += 1;
        playArenaSfx('hit');
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.key.toLowerCase());
      if (e.code === 'Space') keys.delete(' ');
    };
    const jumpTouch = () => {
      if (player.jumps < 2) {
        player.vy = player.jumps === 0 ? -11.2 : -9.2;
        player.onGround = false;
        player.jumps += 1;
        playArenaSfx('hit');
      }
    };
    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('pointerdown', jumpTouch);

    const hurt = (label: string) => {
      if (player.invuln > 0) return;
      lives -= 1;
      player.invuln = 1.1;
      combo = 0;
      shake = 10;
      playArenaSfx('miss');
      floatTexts.push({ x: player.x, y: player.y, text: label, life: 1, bad: true });
      if (lives <= 0) {
        end(false);
      }
    };

    const floatTexts: { x: number; y: number; text: string; life: number; bad?: boolean }[] = [];

    const end = (cleared: boolean) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      playArenaSfx(cleared ? 'wave' : 'over');
      onFinishRef.current({
        cleared,
        score,
        coins,
        livesLeft: Math.max(0, lives),
        livesMax,
        distance: camX + player.x,
        gatesCorrect,
        gatesTotal,
        comboMax,
      });
    };

    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      t += dt;
      if (shake > 0) shake *= 0.85;

      // gate slow-mo
      const timeScale = activeGate && !activeGate.resolved ? 0.35 : 1;
      const runSpeed = speed * timeScale;

      // horizontal run (auto + slight steer)
      let steer = 0;
      if (keys.has('arrowright') || keys.has('d')) steer = 40;
      if (keys.has('arrowleft') || keys.has('a')) steer = -25;
      camX += (runSpeed * 60 + steer) * dt;

      // gravity
      const g = 28;
      player.vy += g * dt * (keys.has('arrowdown') || keys.has('s') ? 1.8 : 1);
      player.y += player.vy * 60 * dt;

      const gy = groundY();
      // platforms
      player.onGround = false;
      let floor = gy;
      for (const e of ents) {
        if (e.kind !== 'platform') continue;
        const px = e.x - camX;
        if (
          player.x + player.w > px &&
          player.x < px + e.w &&
          player.vy >= 0 &&
          player.y + player.h >= e.y &&
          player.y + player.h <= e.y + e.h + 12 &&
          player.y < e.y
        ) {
          floor = Math.min(floor, e.y);
        }
      }

      // gate pads as platforms
      if (activeGate && !activeGate.resolved) {
        for (const pad of activeGate.pads) {
          const px = pad.x - camX;
          if (
            player.x + player.w > px &&
            player.x < px + pad.w &&
            player.vy >= 0 &&
            player.y + player.h >= pad.y &&
            player.y + player.h <= pad.y + pad.h + 14
          ) {
            floor = Math.min(floor, pad.y);
            // resolve choice
            activeGate.resolved = true;
            gatesTotal += 1;
            if (pad.i === activeGate.correctIndex) {
              gatesCorrect += 1;
              score += 250;
              combo += 1;
              comboMax = Math.max(comboMax, combo);
              playArenaSfx('combo');
              floatTexts.push({ x: player.x, y: player.y - 10, text: 'CORRECT GATE +250', life: 1.2 });
            } else {
              hurt('Wrong gate');
              floatTexts.push({
                x: player.x,
                y: player.y - 10,
                text: `Ans: ${activeGate.options[activeGate.correctIndex]}`,
                life: 1.4,
                bad: true,
              });
            }
            activeGate = null;
            gateTimer = 0;
          }
        }
      }

      if (player.y + player.h >= floor) {
        player.y = floor - player.h;
        player.vy = 0;
        player.onGround = true;
        player.jumps = 0;
      }

      // pit fall
      for (const e of ents) {
        if (e.kind !== 'pit' || e.hit) continue;
        const px = e.x - camX;
        if (player.x + player.w > px + 8 && player.x < px + e.w - 8 && player.y + player.h >= gy - 2) {
          e.hit = true;
          hurt(e.label);
          player.vy = -8;
        }
      }

      if (player.invuln > 0) player.invuln -= dt;

      // collisions spikes / coins / orbs / gates / flag
      for (const e of ents) {
        if (e.kind === 'spike' && !e.hit) {
          const px = e.x - camX;
          const sy = gy - e.h;
          if (
            player.x + player.w > px + 4 &&
            player.x < px + e.w - 4 &&
            player.y + player.h > sy + 4 &&
            player.y < gy
          ) {
            e.hit = true;
            hurt(e.label);
          }
        }
        if (e.kind === 'coin' && !e.taken) {
          const px = e.x - camX;
          const dx = player.x + player.w / 2 - (px + e.r);
          const dy = player.y + player.h / 2 - e.y;
          if (dx * dx + dy * dy < (e.r + 16) * (e.r + 16)) {
            e.taken = true;
            coins += 1;
            score += 40 + combo * 5;
            combo += 1;
            comboMax = Math.max(comboMax, combo);
            playArenaSfx('hit');
            floatTexts.push({ x: player.x, y: player.y, text: '+COIN', life: 0.7 });
          }
        }
        if (e.kind === 'orb' && !e.taken) {
          const px = e.x - camX;
          const dx = player.x + player.w / 2 - px;
          const dy = player.y + player.h / 2 - e.y;
          if (dx * dx + dy * dy < (e.r + 18) * (e.r + 18)) {
            e.taken = true;
            score += 80;
            combo += 1;
            comboMax = Math.max(comboMax, combo);
            playArenaSfx('star');
            floatTexts.push({ x: player.x, y: player.y, text: e.label.toUpperCase(), life: 0.9 });
          }
        }
        if (e.kind === 'gate' && !e.resolved && !activeGate) {
          if (e.x - camX < W * 0.55 && e.x - camX > -40) {
            activeGate = e;
            gateTimer = 6;
            speed *= 0.92;
            playArenaSfx('go');
          }
        }
        if (e.kind === 'flag') {
          if (e.x - camX < player.x + 40) {
            score += 500 + lives * 100;
            end(true);
            return;
          }
        }
      }

      if (activeGate && !activeGate.resolved) {
        gateTimer -= dt;
        if (gateTimer <= 0) {
          activeGate.resolved = true;
          gatesTotal += 1;
          hurt('Missed gate');
          activeGate = null;
        }
      }

      // progressive speed
      speed = Math.min(config.speed * 1.55, speed + dt * 0.02);

      // DRAW
      const sx = shake ? (Math.random() - 0.5) * shake : 0;
      const sy = shake ? (Math.random() - 0.5) * shake : 0;
      ctx.save();
      ctx.translate(sx, sy);

      // sky
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      if (config.theme === 'mind') {
        grad.addColorStop(0, '#1a1030');
        grad.addColorStop(1, '#0b1220');
      } else if (config.theme === 'liquidity') {
        grad.addColorStop(0, '#0c1a2e');
        grad.addColorStop(1, '#061018');
      } else if (config.theme === 'structure') {
        grad.addColorStop(0, '#102018');
        grad.addColorStop(1, '#0a1210');
      } else {
        grad.addColorStop(0, '#0f172a');
        grad.addColorStop(1, '#020617');
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // parallax candles / city
      ctx.globalAlpha = 0.35;
      for (let i = 0; i < 24; i++) {
        const bx = ((i * 90 - camX * 0.3) % (W + 100)) + 40;
        const bh = 40 + ((i * 37) % 90);
        const bull = i % 3 !== 0;
        ctx.fillStyle = bull ? '#14532d' : '#7f1d1d';
        ctx.fillRect(bx, gy - bh - 8, 16, bh);
        ctx.fillStyle = bull ? '#22c55e' : '#ef4444';
        ctx.fillRect(bx + 6, gy - bh - 20, 4, bh + 20);
      }
      ctx.globalAlpha = 1;

      // ground
      ctx.fillStyle = '#111827';
      ctx.fillRect(0, gy, W, H - gy);
      ctx.fillStyle = '#34d399';
      ctx.fillRect(0, gy, W, 3);
      // tape dashes
      ctx.fillStyle = 'rgba(212,175,55,0.35)';
      for (let i = 0; i < 20; i++) {
        const dx = ((i * 70 - camX) % (W + 70)) + 10;
        ctx.fillRect(dx, gy + 18, 36, 4);
      }

      // entities
      for (const e of ents) {
        if (e.kind === 'platform') {
          const px = e.x - camX;
          if (px < -100 || px > W + 40) continue;
          ctx.fillStyle = '#d4af37';
          ctx.fillRect(px, e.y, e.w, e.h);
          ctx.fillStyle = 'rgba(15,23,42,0.5)';
          ctx.fillRect(px + 2, e.y + 2, e.w - 4, 4);
        }
        if (e.kind === 'spike' && !e.hit) {
          const px = e.x - camX;
          if (px < -60 || px > W + 40) continue;
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.moveTo(px, gy);
          ctx.lineTo(px + e.w / 2, gy - e.h);
          ctx.lineTo(px + e.w, gy);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#fecaca';
          ctx.font = 'bold 9px sans-serif';
          ctx.fillText(e.label, px - 4, gy - e.h - 6);
        }
        if (e.kind === 'pit') {
          const px = e.x - camX;
          if (px < -80 || px > W + 40) continue;
          ctx.fillStyle = '#020617';
          ctx.fillRect(px, gy - 2, e.w, 40);
          ctx.strokeStyle = '#f59e0b';
          ctx.strokeRect(px, gy - 2, e.w, 8);
          ctx.fillStyle = '#fbbf24';
          ctx.font = 'bold 9px sans-serif';
          ctx.fillText(e.label, px + 4, gy - 8);
        }
        if (e.kind === 'coin' && !e.taken) {
          const px = e.x - camX;
          if (px < -20 || px > W + 20) continue;
          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          ctx.arc(px, e.y + Math.sin(t * 6 + e.x) * 3, e.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#92400e';
          ctx.stroke();
        }
        if (e.kind === 'orb' && !e.taken) {
          const px = e.x - camX;
          if (px < -20 || px > W + 20) continue;
          ctx.fillStyle = '#34d399';
          ctx.shadowColor = '#34d399';
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(px, e.y + Math.sin(t * 5) * 4, e.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
        if (e.kind === 'gate') {
          const visible = e.x - camX < W && e.x - camX > -200;
          if (!visible) continue;
          if (!e.resolved) {
            ctx.fillStyle = 'rgba(52,211,153,0.12)';
            ctx.fillRect(e.x - camX - 20, 40, 300, 100);
            ctx.fillStyle = '#ecfdf5';
            ctx.font = 'bold 13px sans-serif';
            ctx.fillText(e.prompt, e.x - camX, 62);
            ctx.font = '10px sans-serif';
            ctx.fillStyle = '#94a3b8';
            ctx.fillText('JUMP onto the correct pad', e.x - camX, 78);
          }
          for (const pad of e.pads) {
            const px = pad.x - camX;
            const correct = e.resolved && pad.i === e.correctIndex;
            const wrong = e.resolved && pad.i !== e.correctIndex;
            ctx.fillStyle = correct ? '#34d399' : wrong ? '#64748b' : '#3b82f6';
            ctx.fillRect(px, pad.y, pad.w, pad.h);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px sans-serif';
            const label = e.options[pad.i] || '';
            ctx.fillText(label.slice(0, 14), px + 4, pad.y - 4);
          }
        }
        if (e.kind === 'flag') {
          const px = e.x - camX;
          if (px < -20 || px > W + 40) continue;
          ctx.fillStyle = '#d4af37';
          ctx.fillRect(px, gy - 90, 5, 90);
          ctx.fillStyle = '#34d399';
          ctx.beginPath();
          ctx.moveTo(px + 5, gy - 90);
          ctx.lineTo(px + 45, gy - 75);
          ctx.lineTo(px + 5, gy - 60);
          ctx.fill();
          ctx.fillStyle = '#fbbf24';
          ctx.font = 'bold 12px sans-serif';
          ctx.fillText('FINISH', px - 8, gy - 98);
        }
      }

      // player wolf
      const blink = player.invuln > 0 && Math.floor(t * 20) % 2 === 0;
      if (!blink) {
        const bob = player.onGround ? Math.sin(t * 14) * 2 : 0;
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(player.x, player.y + bob, player.w, player.h);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(player.x + 6, player.y + 8 + bob, 6, 6);
        ctx.fillRect(player.x + 16, player.y + 8 + bob, 6, 6);
        ctx.fillStyle = '#d4af37';
        ctx.fillRect(player.x + 4, player.y + bob - 6, 20, 6);
        // ears
        ctx.fillStyle = '#94a3b8';
        ctx.beginPath();
        ctx.moveTo(player.x + 2, player.y + bob);
        ctx.lineTo(player.x + 8, player.y + bob - 10);
        ctx.lineTo(player.x + 12, player.y + bob);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(player.x + 16, player.y + bob);
        ctx.lineTo(player.x + 22, player.y + bob - 10);
        ctx.lineTo(player.x + 26, player.y + bob);
        ctx.fill();
      }

      // float texts
      for (let i = floatTexts.length - 1; i >= 0; i--) {
        const f = floatTexts[i];
        f.life -= dt;
        f.y -= 30 * dt;
        if (f.life <= 0) {
          floatTexts.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = Math.max(0, f.life);
        ctx.fillStyle = f.bad ? '#fca5a5' : '#86efac';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(f.text, f.x, f.y);
        ctx.globalAlpha = 1;
      }

      // HUD
      ctx.fillStyle = 'rgba(2,6,23,0.55)';
      ctx.fillRect(0, 0, W, 44);
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(`SCORE ${score}`, 12, 28);
      ctx.fillStyle = '#34d399';
      ctx.fillText(`COINS ${coins}`, 120, 28);
      ctx.fillStyle = '#f43f5e';
      ctx.fillText(`${'♥'.repeat(Math.max(0, lives))}${'♡'.repeat(Math.max(0, livesMax - lives))}`, 220, 28);
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(config.title, W - 160, 18);
      const prog = Math.min(1, camX / config.trackLength);
      ctx.fillStyle = 'rgba(148,163,184,0.25)';
      ctx.fillRect(W - 160, 26, 140, 6);
      ctx.fillStyle = '#d4af37';
      ctx.fillRect(W - 160, 26, 140 * prog, 6);
      if (combo >= 2) {
        ctx.fillStyle = '#fb923c';
        ctx.fillText(`COMBO x${combo}`, 320, 28);
      }
      if (activeGate && !activeGate.resolved) {
        ctx.fillStyle = 'rgba(59,130,246,0.2)';
        ctx.fillRect(0, 44, W, 28);
        ctx.fillStyle = '#93c5fd';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(`GATE · ${activeGate.prompt}`, 12, 63);
      }

      // controls hint
      ctx.fillStyle = 'rgba(148,163,184,0.7)';
      ctx.font = '10px sans-serif';
      ctx.fillText('SPACE / TAP = JUMP (double jump) · ↓ = fast fall · ← → steer', 12, H - 12);

      ctx.restore();

      if (!finishedRef.current) raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('pointerdown', jumpTouch);
      ro.disconnect();
    };
  }, [config]);

  return (
    <div className="wm-tape" ref={wrapRef}>
      <canvas ref={canvasRef} className="wm-tape__canvas" />
    </div>
  );
}

/** Build runner config from campaign level metadata. */
export function tapeConfigFromLevel(input: {
  id: number;
  title: string;
  mode: QuestMode;
  lives: number;
  topics: string[];
}): TapeGameConfig {
  const topics = input.topics.join(' ');
  let theme: TapeGameConfig['theme'] = 'mixed';
  if (/candle/i.test(topics)) theme = 'candle';
  else if (/trend|structure|sr/i.test(topics)) theme = 'structure';
  else if (/liquidity/i.test(topics)) theme = 'liquidity';
  else if (/psych|chart_psych|risk/i.test(topics)) theme = 'mind';

  const gates =
    theme === 'candle'
      ? [
          {
            prompt: 'Candle BODY = distance between…',
            options: ['High-Low', 'Open-Close', 'Bid-Ask'],
            correctIndex: 1,
          },
          {
            prompt: 'Long UPPER wick usually means…',
            options: ['Buy FOMO', 'Rejection/sell pressure', 'Guaranteed up'],
            correctIndex: 1,
          },
          {
            prompt: 'Doji mainly shows…',
            options: ['Indecision', 'Always long', 'Broker error'],
            correctIndex: 0,
          },
        ]
      : theme === 'structure'
        ? [
            {
              prompt: 'Uptrend structure is…',
              options: ['HH + HL', 'LH + LL', 'Only dojis'],
              correctIndex: 0,
            },
            {
              prompt: 'BOS means…',
              options: ['Instant buy', 'Structure break clue', 'Ignore risk'],
              correctIndex: 1,
            },
          ]
        : theme === 'liquidity'
          ? [
              {
                prompt: 'Equal highs often hide…',
                options: ['Stop liquidity', 'Free money', 'No traders'],
                correctIndex: 0,
              },
              {
                prompt: 'A sweep typically…',
                options: ['Grabs stops then reacts', 'Guarantees trend', 'Ends market'],
                correctIndex: 0,
              },
            ]
          : theme === 'mind'
            ? [
                {
                  prompt: 'FOMO usually causes…',
                  options: ['Chase without confirm', 'Better risk', 'Patience'],
                  correctIndex: 0,
                },
                {
                  prompt: 'After a loss, best move…',
                  options: ['Revenge size up', 'Review → reset', 'Delete journal'],
                  correctIndex: 1,
                },
              ]
            : [
                {
                  prompt: 'Unclear setup → best choice…',
                  options: ['No trade', 'Max leverage', 'Blind average'],
                  correctIndex: 0,
                },
                {
                  prompt: 'Wolf Mentor teaches…',
                  options: ['Exact signals only', 'Process / AOI', 'WhatsApp tips'],
                  correctIndex: 1,
                },
              ];

  const trackLength =
    input.mode === 'boss' ? 4200 : input.mode === 'rush' ? 3200 : 2600;
  const speed = input.mode === 'boss' ? 4.2 : input.mode === 'rush' ? 4.6 : 3.6;

  return {
    levelId: input.id,
    title: input.title,
    mode: input.mode,
    lives: input.lives,
    trackLength,
    speed,
    theme,
    gates,
  };
}
