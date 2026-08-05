import { useEffect, useRef, useState } from 'react';
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
  trackLength: number;
  speed: number;
  theme: 'candle' | 'structure' | 'liquidity' | 'mind' | 'mixed';
  gates: { prompt: string; options: string[]; correctIndex: number }[];
};

type WolfTapeGameProps = {
  config: TapeGameConfig;
  onFinish: (result: TapeGameResult) => void;
};

type Obj =
  | { kind: 'car'; z: number; lane: number; label: string; color: string; hit?: boolean }
  | { kind: 'cone'; z: number; lane: number; label: string; hit?: boolean }
  | { kind: 'coin'; z: number; lane: number; taken?: boolean }
  | { kind: 'boost'; z: number; lane: number; taken?: boolean }
  | {
      kind: 'gate';
      z: number;
      prompt: string;
      options: [string, string, string];
      correct: number;
      done?: boolean;
    }
  | { kind: 'finish'; z: number };

function labelsFor(theme: TapeGameConfig['theme']): string[] {
  if (theme === 'candle') return ['FOMO', 'WICK TRAP', 'CHASE'];
  if (theme === 'structure') return ['FAKE BOS', 'BAD HL', 'LH TRAP'];
  if (theme === 'liquidity') return ['STOP HUNT', 'SWEEP', 'EQ HIGH'];
  if (theme === 'mind') return ['REVENGE', 'TILT', 'IMPATIENCE'];
  return ['FAKEOUT', 'NO PLAN', 'OVERSIZE'];
}

function accentFor(theme: TapeGameConfig['theme']) {
  if (theme === 'mind') return '#c084fc';
  if (theme === 'liquidity') return '#38bdf8';
  if (theme === 'structure') return '#4ade80';
  return '#fb923c';
}

function buildCourse(cfg: TapeGameConfig): Obj[] {
  const out: Obj[] = [];
  const tags = labelsFor(cfg.theme);
  const endZ = 2400 + (cfg.mode === 'boss' ? 900 : cfg.mode === 'rush' ? 500 : 0);
  let z = 280;
  while (z < endZ - 350) {
    const r = Math.random();
    const lane = Math.floor(Math.random() * 3);
    if (r < 0.38) {
      out.push({
        kind: 'car',
        z,
        lane,
        label: tags[Math.floor(Math.random() * tags.length)],
        color: Math.random() > 0.5 ? '#ef4444' : '#2563eb',
      });
      z += 200 + Math.random() * 140;
    } else if (r < 0.52) {
      out.push({
        kind: 'cone',
        z,
        lane,
        label: tags[Math.floor(Math.random() * tags.length)],
      });
      z += 170 + Math.random() * 100;
    } else if (r < 0.78) {
      out.push({ kind: 'coin', z, lane });
      if (Math.random() > 0.5) out.push({ kind: 'boost', z: z + 50, lane: (lane + 1) % 3 });
      z += 120 + Math.random() * 80;
    } else z += 60;
  }

  const nGates = Math.min(cfg.gates.length, cfg.mode === 'boss' ? 3 : 2);
  for (let i = 0; i < nGates; i++) {
    const g = cfg.gates[i];
    const opts = [g.options[0] || 'A', g.options[1] || 'B', g.options[2] || 'C'] as [
      string,
      string,
      string,
    ];
    out.push({
      kind: 'gate',
      z: Math.floor((endZ / (nGates + 1)) * (i + 1)),
      prompt: g.prompt,
      options: opts,
      correct: Math.max(0, Math.min(2, g.correctIndex)),
    });
  }
  out.push({ kind: 'finish', z: endZ });
  return out;
}

/** Draw player car from behind — big, obvious, hard to miss. */
function drawPlayerCar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  nitro: boolean,
  accent: string,
) {
  const s = scale;
  ctx.save();
  ctx.translate(x, y);

  if (nitro) {
    ctx.fillStyle = 'rgba(56,189,248,0.55)';
    ctx.beginPath();
    ctx.moveTo(-18 * s, 20 * s);
    ctx.lineTo(18 * s, 20 * s);
    ctx.lineTo(0, 70 * s);
    ctx.fill();
  }

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.ellipse(0, 28 * s, 40 * s, 12 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // rear bumper / body
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3 * s;
  roundRect(ctx, -36 * s, -8 * s, 72 * s, 36 * s, 8 * s);
  ctx.fill();
  ctx.stroke();

  // cabin
  ctx.fillStyle = '#0ea5e9';
  roundRect(ctx, -22 * s, -28 * s, 44 * s, 24 * s, 6 * s);
  ctx.fill();
  ctx.fillStyle = 'rgba(15,23,42,0.55)';
  roundRect(ctx, -16 * s, -24 * s, 32 * s, 14 * s, 4 * s);
  ctx.fill();

  // spoiler
  ctx.fillStyle = accent;
  ctx.fillRect(-30 * s, -34 * s, 60 * s, 6 * s);
  ctx.fillRect(-4 * s, -40 * s, 8 * s, 8 * s);

  // wheels
  ctx.fillStyle = '#020617';
  ctx.fillRect(-40 * s, 8 * s, 12 * s, 22 * s);
  ctx.fillRect(28 * s, 8 * s, 12 * s, 22 * s);
  ctx.fillStyle = '#64748b';
  ctx.fillRect(-38 * s, 12 * s, 8 * s, 6 * s);
  ctx.fillRect(30 * s, 12 * s, 8 * s, 6 * s);

  // taillights
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(-32 * s, 0, 14 * s, 6 * s);
  ctx.fillRect(18 * s, 0, 14 * s, 6 * s);

  // wolf mark
  ctx.fillStyle = accent;
  ctx.font = `bold ${Math.max(10, 12 * s)}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText('WOLF', 0, 18 * s);

  ctx.restore();
}

function drawRivalCar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  color: string,
  label: string,
) {
  const s = Math.max(0.4, scale);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 16 * s, 28 * s, 8 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  roundRect(ctx, -26 * s, -6 * s, 52 * s, 26 * s, 6 * s);
  ctx.fill();
  ctx.fillStyle = '#0f172a';
  roundRect(ctx, -16 * s, -20 * s, 32 * s, 16 * s, 4 * s);
  ctx.fill();
  ctx.fillStyle = '#fde68a';
  ctx.fillRect(-22 * s, 4 * s, 10 * s, 5 * s);
  ctx.fillRect(12 * s, 4 * s, 10 * s, 5 * s);
  ctx.fillStyle = '#fecaca';
  ctx.font = `bold ${Math.max(9, 11 * s)}px ui-sans-serif, system-ui`;
  ctx.textAlign = 'center';
  ctx.fillText(label, 0, -26 * s);
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

type Hud = {
  mph: number;
  score: number;
  lives: number;
  livesMax: number;
  nitro: number;
  heat: number;
  prog: number;
  combo: number;
  banner: string;
  bannerColor: string;
  gatePrompt: string;
  started: boolean;
  over: boolean;
};

const emptyHud = (lives: number): Hud => ({
  mph: 0,
  score: 0,
  lives,
  livesMax: lives,
  nitro: 0.5,
  heat: 0,
  prog: 0,
  combo: 0,
  banner: '',
  bannerColor: '#fff',
  gatePrompt: '',
  started: false,
  over: false,
});

export default function WolfTapeGame({ config, onFinish }: WolfTapeGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef({ left: false, right: false, nitro: false, brake: false });
  const laneRef = useRef(1);
  const startedRef = useRef(false);
  const finishRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const [hud, setHud] = useState<Hud>(() => emptyHud(config.lives));
  const [gateOpts, setGateOpts] = useState<string[] | null>(null);

  const goLeft = () => {
    laneRef.current = Math.max(0, laneRef.current - 1);
    startedRef.current = true;
    playArenaSfx('hit');
  };
  const goRight = () => {
    laneRef.current = Math.min(2, laneRef.current + 1);
    startedRef.current = true;
    playArenaSfx('hit');
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    finishRef.current = false;
    startedRef.current = false;
    laneRef.current = 1;

    let W = 800;
    let H = 420;
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      W = Math.max(320, Math.floor(r.width));
      H = Math.max(280, Math.floor(Math.min(r.height, 520)));
      canvas.width = W * devicePixelRatio;
      canvas.height = H * devicePixelRatio;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const accent = accentFor(config.theme);
    const course = buildCourse(config);
    const endZ = course.find((o) => o.kind === 'finish')!.z;

    let z = 0;
    let laneX = 1; // visual
    let speed = 0;
    const topSpeed = 160 + config.speed * 22;
    let nitro = 0.55;
    let heat = 0;
    let lives = config.lives;
    const livesMax = config.lives;
    let score = 0;
    let coins = 0;
    let combo = 0;
    let comboMax = 0;
    let gatesOk = 0;
    let gatesTot = 0;
    let inv = 0;
    let shake = 0;
    let banner = '';
    let bannerColor = '#fff';
    let bannerT = 0;
    let gatePrompt = '';
    let activeGate: Extract<Obj, { kind: 'gate' }> | null = null;
    let hudTick = 0;
    let last = performance.now();
    let raf = 0;

    const end = (cleared: boolean) => {
      if (finishRef.current) return;
      finishRef.current = true;
      playArenaSfx(cleared ? 'wave' : 'over');
      setHud((h) => ({ ...h, over: true, started: true, banner: cleared ? 'FINISH!' : 'BUSTED' }));
      onFinishRef.current({
        cleared,
        score: Math.round(score),
        coins,
        livesLeft: Math.max(0, lives),
        livesMax,
        distance: z,
        gatesCorrect: gatesOk,
        gatesTotal: gatesTot,
        comboMax,
      });
    };

    const hit = (msg: string) => {
      if (inv > 0) return;
      lives -= 1;
      inv = 1.2;
      heat = Math.min(1, heat + 0.25);
      speed *= 0.4;
      combo = 0;
      shake = 12;
      banner = msg;
      bannerColor = '#f87171';
      bannerT = 1.1;
      playArenaSfx('miss');
      if (lives <= 0) end(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['arrowleft', 'a', 'arrowright', 'd', ' ', 'shift', 'arrowdown', 's', 'arrowup', 'w'].includes(k)) {
        e.preventDefault();
      }
      if (k === 'arrowleft' || k === 'a') goLeft();
      if (k === 'arrowright' || k === 'd') goRight();
      if (k === ' ' || k === 'shift') {
        inputRef.current.nitro = true;
        startedRef.current = true;
      }
      if (k === 'arrowdown' || k === 's') inputRef.current.brake = true;
      if (k === 'arrowup' || k === 'w') startedRef.current = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'shift') inputRef.current.nitro = false;
      if (k === 'arrowdown' || k === 's') inputRef.current.brake = false;
    };
    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);

    const project = (objZ: number, lane: number) => {
      const rel = objZ - z;
      if (rel < 20 || rel > 1400) return null;
      const t = 1 - rel / 1400;
      const y = H * 0.42 + t * t * (H * 0.45);
      const roadW = 40 + t * t * (W * 0.78);
      const x = W / 2 + (lane - 1) * roadW * 0.32;
      const scale = 0.25 + t * 1.35;
      return { x, y, scale, roadW, rel, t };
    };

    const loop = (now: number) => {
      const dt = Math.min(0.04, (now - last) / 1000);
      last = now;
      if (shake > 0) shake *= 0.85;
      if (inv > 0) inv -= dt;
      if (bannerT > 0) bannerT -= dt;

      laneX += (laneRef.current - laneX) * Math.min(1, dt * 12);

      const started = startedRef.current;
      const boosting = started && inputRef.current.nitro && nitro > 0.02;
      if (started) {
        const target = inputRef.current.brake ? topSpeed * 0.3 : boosting ? topSpeed * 1.4 : topSpeed;
        speed += (target - speed) * Math.min(1, dt * 2.2);
        if (boosting) nitro = Math.max(0, nitro - 0.28 * dt);
        else nitro = Math.min(1, nitro + 0.06 * dt);
        const gateSlow = activeGate && !activeGate.done ? 0.6 : 1;
        z += speed * dt * 2.8 * gateSlow;
        score += speed * dt * 0.15;
        heat = Math.max(0, heat - 0.04 * dt);
      } else {
        speed = Math.max(0, speed - 40 * dt);
      }

      // collisions
      for (const o of course) {
        if (o.kind === 'finish' && o.z - z < 40) {
          score += 1000 + lives * 150;
          banner = 'FINISH — RACE WON';
          bannerColor = '#fbbf24';
          bannerT = 2;
          end(true);
          return;
        }
        if (o.kind === 'gate' && !o.done) {
          const rel = o.z - z;
          if (rel < 220 && rel > 30) {
            if (activeGate !== o) {
              activeGate = o;
              gatePrompt = o.prompt;
              setGateOpts([...o.options]);
              playArenaSfx('go');
              banner = 'CHECKPOINT — choose the correct LANE';
              bannerColor = '#38bdf8';
              bannerT = 1.4;
            }
          }
          if (activeGate === o && rel < 45) {
            o.done = true;
            gatesTot += 1;
            setGateOpts(null);
            gatePrompt = '';
            if (laneRef.current === o.correct) {
              gatesOk += 1;
              score += 450;
              combo += 1;
              comboMax = Math.max(comboMax, combo);
              nitro = Math.min(1, nitro + 0.4);
              banner = `CORRECT · ${o.options[o.correct]}`;
              bannerColor = '#4ade80';
              bannerT = 1.2;
              playArenaSfx('combo');
            } else {
              hit(`WRONG · answer: ${o.options[o.correct]}`);
            }
            activeGate = null;
          }
        }

        const rel = o.z - z;
        if (rel > 18 && rel < 55 && 'lane' in o && o.lane === laneRef.current) {
          if (o.kind === 'car' && !o.hit) {
            o.hit = true;
            hit(o.label);
          }
          if (o.kind === 'cone' && !o.hit) {
            o.hit = true;
            hit(o.label);
          }
          if (o.kind === 'coin' && !o.taken) {
            o.taken = true;
            coins += 1;
            score += 60 + combo * 10;
            combo += 1;
            comboMax = Math.max(comboMax, combo);
            playArenaSfx('hit');
            banner = '+ COIN';
            bannerColor = '#fbbf24';
            bannerT = 0.5;
          }
          if (o.kind === 'boost' && !o.taken) {
            o.taken = true;
            nitro = Math.min(1, nitro + 0.45);
            playArenaSfx('star');
            banner = 'NITRO PICKUP';
            bannerColor = '#38bdf8';
            bannerT = 0.6;
          }
        }
      }

      // draw
      const ox = shake ? (Math.random() - 0.5) * shake : 0;
      const oy = shake ? (Math.random() - 0.5) * shake : 0;
      ctx.save();
      ctx.translate(ox, oy);

      // sky
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, '#020617');
      sky.addColorStop(0.4, '#1e1b4b');
      sky.addColorStop(0.55, '#431407');
      sky.addColorStop(1, '#0c0a09');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // stars
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 50; i++) {
        ctx.fillRect((i * 73 + z * 0.03) % W, (i * 37) % (H * 0.35), i % 4 === 0 ? 2 : 1, 1);
      }

      // city
      const horizon = H * 0.42;
      for (let i = 0; i < 16; i++) {
        const bx = ((i * 80 - z * 0.15) % (W + 90)) - 30;
        const bh = 50 + (i % 5) * 18;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(bx, horizon - bh, 54, bh);
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.4;
        for (let row = 0; row < 4; row++) {
          ctx.fillRect(bx + 10, horizon - bh + 12 + row * 14, 8, 7);
          ctx.fillRect(bx + 32, horizon - bh + 12 + row * 14, 8, 7);
        }
        ctx.globalAlpha = 1;
      }

      // sun glow
      const glow = ctx.createRadialGradient(W / 2, horizon, 4, W / 2, horizon, W * 0.4);
      glow.addColorStop(0, `${accent}66`);
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.fillRect(0, horizon - 80, W, 160);

      // road segments (near to far painted far first)
      for (let i = 22; i >= 0; i--) {
        const z0 = z + i * 60;
        const z1 = z0 + 60;
        const p0 = project(z0, 1);
        const p1 = project(z1, 1);
        if (!p0 || !p1) continue;
        const odd = Math.floor(z0 / 60) % 2 === 0;
        ctx.fillStyle = odd ? '#292524' : '#1c1917';
        ctx.beginPath();
        ctx.moveTo(p0.x - p0.roadW / 2, p0.y);
        ctx.lineTo(p0.x + p0.roadW / 2, p0.y);
        ctx.lineTo(p1.x + p1.roadW / 2, p1.y);
        ctx.lineTo(p1.x - p1.roadW / 2, p1.y);
        ctx.closePath();
        ctx.fill();
        // edges
        ctx.fillStyle = odd ? '#fb923c' : '#fafaf9';
        ctx.fillRect(p0.x - p0.roadW / 2 - 6, p0.y, 6, Math.max(2, p1.y - p0.y + 1));
        ctx.fillRect(p0.x + p0.roadW / 2, p0.y, 6, Math.max(2, p1.y - p0.y + 1));
        // lane lines
        if (odd) {
          ctx.strokeStyle = 'rgba(250,250,249,0.7)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(p0.x - p0.roadW * 0.16, p0.y);
          ctx.lineTo(p1.x - p1.roadW * 0.16, p1.y);
          ctx.moveTo(p0.x + p0.roadW * 0.16, p0.y);
          ctx.lineTo(p1.x + p1.roadW * 0.16, p1.y);
          ctx.stroke();
        }
      }

      // highlight current lane near player
      const lp = project(z + 90, laneRef.current);
      if (lp) {
        ctx.fillStyle = 'rgba(251,146,60,0.12)';
        ctx.beginPath();
        ctx.moveTo(W / 2 + (laneRef.current - 1) * 90 - 50, H);
        ctx.lineTo(lp.x - 30, lp.y);
        ctx.lineTo(lp.x + 30, lp.y);
        ctx.lineTo(W / 2 + (laneRef.current - 1) * 90 + 50, H);
        ctx.closePath();
        ctx.fill();
      }

      // objects far → near
      const sorted = [...course].sort((a, b) => b.z - a.z);
      for (const o of sorted) {
        if (o.kind === 'finish') {
          const p = project(o.z, 1);
          if (!p) continue;
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 5;
          ctx.strokeRect(p.x - p.roadW * 0.42, p.y - 70 * p.scale, p.roadW * 0.84, 70 * p.scale);
          ctx.fillStyle = '#fbbf24';
          ctx.font = `bold ${Math.max(14, 26 * p.scale)}px ui-sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText('FINISH', p.x, p.y - 78 * p.scale);
          continue;
        }
        if (o.kind === 'gate') {
          for (let li = 0; li < 3; li++) {
            const p = project(o.z, li);
            if (!p) continue;
            const chosen = o.done && li === o.correct;
            const wrong = o.done && li !== o.correct;
            ctx.fillStyle = chosen
              ? 'rgba(74,222,128,0.65)'
              : wrong
                ? 'rgba(71,85,105,0.5)'
                : activeGate === o
                  ? 'rgba(56,189,248,0.5)'
                  : 'rgba(15,23,42,0.65)';
            const bw = 56 * p.scale;
            const bh = 78 * p.scale;
            roundRect(ctx, p.x - bw / 2, p.y - bh, bw, bh, 6);
            ctx.fill();
            ctx.strokeStyle = '#f8fafc';
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${Math.max(9, 12 * p.scale)}px ui-sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(o.options[li].slice(0, 11), p.x, p.y - bh - 8);
          }
          continue;
        }
        if ('taken' in o && o.taken) continue;
        if ('hit' in o && o.hit) continue;
        const p = project(o.z, o.lane);
        if (!p) continue;
        if (o.kind === 'coin') {
          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          ctx.arc(p.x, p.y - 14 * p.scale, 11 * p.scale, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#92400e';
          ctx.stroke();
        } else if (o.kind === 'boost') {
          ctx.fillStyle = '#38bdf8';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - 36 * p.scale);
          ctx.lineTo(p.x + 12 * p.scale, p.y - 8 * p.scale);
          ctx.lineTo(p.x - 12 * p.scale, p.y - 8 * p.scale);
          ctx.fill();
          ctx.fillStyle = '#e0f2fe';
          ctx.font = `bold ${Math.max(8, 10 * p.scale)}px ui-sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText('N2O', p.x, p.y - 40 * p.scale);
        } else if (o.kind === 'cone') {
          ctx.fillStyle = '#f97316';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - 36 * p.scale);
          ctx.lineTo(p.x + 16 * p.scale, p.y);
          ctx.lineTo(p.x - 16 * p.scale, p.y);
          ctx.fill();
          ctx.fillStyle = '#ffedd5';
          ctx.font = `bold ${Math.max(8, 10 * p.scale)}px ui-sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(o.label, p.x, p.y - 42 * p.scale);
        } else if (o.kind === 'car') {
          drawRivalCar(ctx, p.x, p.y, p.scale, o.color, o.label);
        }
      }

      // PLAYER CAR — always huge and clear at bottom
      const px = W / 2 + (laneX - 1) * Math.min(120, W * 0.18);
      const py = H * 0.82;
      if (!(inv > 0 && Math.floor(now / 80) % 2 === 0)) {
        drawPlayerCar(ctx, px, py, 1.45, boosting, accent);
      }

      // lane markers under car
      ctx.font = 'bold 11px ui-sans-serif';
      ctx.textAlign = 'center';
      for (let li = 0; li < 3; li++) {
        const lx = W / 2 + (li - 1) * Math.min(120, W * 0.18);
        ctx.fillStyle = li === laneRef.current ? accent : 'rgba(148,163,184,0.45)';
        ctx.fillText(li === 0 ? 'LANE 1' : li === 1 ? 'LANE 2' : 'LANE 3', lx, H - 8);
      }

      // banner
      if (bannerT > 0 && banner) {
        ctx.globalAlpha = Math.min(1, bannerT * 2);
        ctx.fillStyle = 'rgba(2,6,23,0.7)';
        ctx.fillRect(W * 0.1, H * 0.28, W * 0.8, 40);
        ctx.fillStyle = bannerColor;
        ctx.font = 'bold 18px ui-sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(banner, W / 2, H * 0.28 + 26);
        ctx.globalAlpha = 1;
      }

      // start overlay
      if (!started) {
        ctx.fillStyle = 'rgba(2,6,23,0.82)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = accent;
        ctx.font = 'bold 26px ui-sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('WOLF MOST WANTED', W / 2, H * 0.3);
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 15px ui-sans-serif';
        ctx.fillText(config.title, W / 2, H * 0.38);
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '14px ui-sans-serif';
        ctx.fillText('1) Press LEFT / RIGHT to change lane', W / 2, H * 0.5);
        ctx.fillText('2) Hold NITRO (SPACE) to boost', W / 2, H * 0.56);
        ctx.fillText('3) Avoid red cars · grab gold coins', W / 2, H * 0.62);
        ctx.fillText('4) At checkpoint, enter the correct answer lane', W / 2, H * 0.68);
        ctx.fillStyle = accent;
        ctx.font = 'bold 16px ui-sans-serif';
        ctx.fillText('TAP LEFT or RIGHT below to START', W / 2, H * 0.82);
      }

      ctx.restore();

      hudTick += dt;
      if (hudTick > 0.08) {
        hudTick = 0;
        setHud({
          mph: Math.round(speed),
          score: Math.round(score),
          lives,
          livesMax,
          nitro,
          heat,
          prog: Math.min(1, z / endZ),
          combo,
          banner: bannerT > 0 ? banner : gatePrompt,
          bannerColor: bannerT > 0 ? bannerColor : '#38bdf8',
          gatePrompt,
          started,
          over: finishRef.current,
        });
      }

      if (!finishRef.current) raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  return (
    <div className="wm-nfs" ref={wrapRef}>
      <div className="wm-nfs__hud">
        <div className="wm-nfs__hud-left">
          <strong>{config.title}</strong>
          <span>{hud.mph} MPH</span>
          <span>SCORE {hud.score}</span>
        </div>
        <div className="wm-nfs__hud-mid" aria-label={`${hud.lives} lives`}>
          {Array.from({ length: hud.livesMax }).map((_, i) => (
            <i key={i} className={i < hud.lives ? 'on' : ''} />
          ))}
          {hud.combo >= 2 ? <em>x{hud.combo}</em> : null}
        </div>
        <div className="wm-nfs__hud-right">
          <label>
            NITRO
            <b style={{ width: `${Math.round(hud.nitro * 100)}%` }} />
          </label>
          <label className="heat">
            HEAT
            <b style={{ width: `${Math.round(hud.heat * 100)}%` }} />
          </label>
        </div>
      </div>

      <div className="wm-nfs__stage">
        <canvas ref={canvasRef} className="wm-nfs__canvas" />
        {hud.banner ? (
          <div className="wm-nfs__banner" style={{ color: hud.bannerColor }}>
            {hud.banner}
          </div>
        ) : null}
        {gateOpts ? (
          <div className="wm-nfs__gate-hint">
            {gateOpts.map((o, i) => (
              <span key={i} className={laneRef.current === i ? 'on' : ''}>
                L{i + 1}: {o}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="wm-nfs__progress">
        <i style={{ width: `${Math.round(hud.prog * 100)}%` }} />
      </div>

      <div className="wm-nfs__controls">
        <button
          type="button"
          className="wm-nfs__btn"
          onPointerDown={(e) => {
            e.preventDefault();
            goLeft();
          }}
        >
          ← LEFT
        </button>
        <button
          type="button"
          className="wm-nfs__btn wm-nfs__btn--nitro"
          onPointerDown={(e) => {
            e.preventDefault();
            inputRef.current.nitro = true;
            startedRef.current = true;
          }}
          onPointerUp={() => {
            inputRef.current.nitro = false;
          }}
          onPointerLeave={() => {
            inputRef.current.nitro = false;
          }}
        >
          NITRO
          <small>hold</small>
        </button>
        <button
          type="button"
          className="wm-nfs__btn"
          onPointerDown={(e) => {
            e.preventDefault();
            goRight();
          }}
        >
          RIGHT →
        </button>
      </div>
      <p className="wm-nfs__hint">Keyboard: A/D or ← → lanes · Space = Nitro · S = Brake</p>
    </div>
  );
}

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
            options: ['High–Low', 'Open–Close', 'Bid–Ask'],
            correctIndex: 1,
          },
          {
            prompt: 'Long UPPER wick means…',
            options: ['Buy FOMO', 'Rejection', 'Always up'],
            correctIndex: 1,
          },
          {
            prompt: 'Doji mainly shows…',
            options: ['Indecision', 'Always long', 'Error'],
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
              options: ['Instant buy', 'Structure clue', 'No risk'],
              correctIndex: 1,
            },
          ]
        : theme === 'liquidity'
          ? [
              {
                prompt: 'Equal highs often hide…',
                options: ['Stop liquidity', 'Free money', 'Nothing'],
                correctIndex: 0,
              },
              {
                prompt: 'A sweep typically…',
                options: ['Grabs stops', 'Guarantees trend', 'Ends day'],
                correctIndex: 0,
              },
            ]
          : theme === 'mind'
            ? [
                {
                  prompt: 'FOMO usually causes…',
                  options: ['Chase', 'Better risk', 'Patience'],
                  correctIndex: 0,
                },
                {
                  prompt: 'After a loss, best move…',
                  options: ['Revenge size', 'Review → reset', 'Quit app'],
                  correctIndex: 1,
                },
              ]
            : [
                {
                  prompt: 'Unclear setup → best choice…',
                  options: ['No trade', 'Max leverage', 'Average down'],
                  correctIndex: 0,
                },
                {
                  prompt: 'Wolf Mentor teaches…',
                  options: ['Signals only', 'Process / AOI', 'Tips'],
                  correctIndex: 1,
                },
              ];

  return {
    levelId: input.id,
    title: input.title,
    mode: input.mode,
    lives: input.lives,
    trackLength: input.mode === 'boss' ? 4200 : input.mode === 'rush' ? 3400 : 2800,
    speed: input.mode === 'boss' ? 4.2 : input.mode === 'rush' ? 4.6 : 3.6,
    theme,
    gates,
  };
}
