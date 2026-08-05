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
  trackLength: number;
  speed: number;
  theme: 'candle' | 'structure' | 'liquidity' | 'mind' | 'mixed';
  gates: { prompt: string; options: string[]; correctIndex: number }[];
};

type WolfTapeGameProps = {
  config: TapeGameConfig;
  onFinish: (result: TapeGameResult) => void;
};

type RoadObj =
  | { kind: 'rival'; z: number; lane: number; label: string; hit?: boolean; color: string }
  | { kind: 'barrier'; z: number; lane: number; label: string; hit?: boolean }
  | { kind: 'coin'; z: number; lane: number; taken?: boolean }
  | { kind: 'nitro'; z: number; lane: number; taken?: boolean }
  | {
      kind: 'gate';
      z: number;
      prompt: string;
      options: string[];
      correctIndex: number;
      resolved?: boolean;
    }
  | { kind: 'finish'; z: number };

function themeLabels(theme: TapeGameConfig['theme']): string[] {
  if (theme === 'candle') return ['FOMO LONG', 'WICK TRAP', 'CHASE ENTRY'];
  if (theme === 'structure') return ['FAKE BOS', 'BROKEN HL', 'LH TRAP'];
  if (theme === 'liquidity') return ['STOP HUNT', 'SWEEP', 'EQ HIGH'];
  if (theme === 'mind') return ['REVENGE', 'TILT', 'IMPATIENCE'];
  return ['FAKEOUT', 'NO PLAN', 'OVERSIZE'];
}

function themeAccent(theme: TapeGameConfig['theme']): string {
  if (theme === 'mind') return '#a855f7';
  if (theme === 'liquidity') return '#38bdf8';
  if (theme === 'structure') return '#4ade80';
  if (theme === 'candle') return '#f97316';
  return '#f59e0b';
}

function buildTrack(cfg: TapeGameConfig): RoadObj[] {
  const objs: RoadObj[] = [];
  const labels = themeLabels(cfg.theme);
  const raceZ = Math.max(2200, cfg.trackLength * 0.85);
  let z = 380;
  while (z < raceZ - 420) {
    const roll = Math.random();
    const lane = Math.floor(Math.random() * 3);
    if (roll < 0.34) {
      objs.push({
        kind: 'rival',
        z,
        lane,
        label: labels[Math.floor(Math.random() * labels.length)],
        color: Math.random() > 0.5 ? '#ef4444' : '#3b82f6',
      });
      z += 180 + Math.random() * 160;
    } else if (roll < 0.48) {
      objs.push({ kind: 'barrier', z, lane, label: labels[Math.floor(Math.random() * labels.length)] });
      z += 200 + Math.random() * 120;
    } else if (roll < 0.72) {
      objs.push({ kind: 'coin', z, lane });
      if (Math.random() > 0.55) objs.push({ kind: 'nitro', z: z + 40, lane: (lane + 1) % 3 });
      z += 110 + Math.random() * 90;
    } else {
      z += 70;
    }
  }

  const gateCount = Math.min(cfg.gates.length, cfg.mode === 'boss' ? 3 : 2);
  for (let i = 0; i < gateCount; i++) {
    const g = cfg.gates[i];
    objs.push({
      kind: 'gate',
      z: Math.floor((raceZ / (gateCount + 1)) * (i + 1)),
      prompt: g.prompt,
      options: g.options.slice(0, 3),
      correctIndex: Math.min(2, g.correctIndex),
    });
  }
  objs.push({ kind: 'finish', z: raceZ });
  objs.sort((a, b) => b.z - a.z);
  return objs;
}

/** Project world Z + lane → screen */
function project(
  z: number,
  lane: number,
  playerZ: number,
  W: number,
  H: number,
  curve: number,
) {
  const rel = z - playerZ;
  if (rel <= 8) return null;
  const scale = 220 / rel;
  const roadY = H * 0.55;
  const y = roadY + (H * 0.42) * (1 - 280 / (rel + 280));
  const roadW = Math.min(W * 0.92, 90 + scale * 420);
  const laneX = (lane - 1) * roadW * 0.28;
  const curveOff = curve * scale * 48;
  const x = W / 2 + laneX + curveOff;
  return { x, y, scale, roadW, rel };
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
    let W = 900;
    let H = 480;
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      W = Math.max(360, Math.floor(r.width));
      H = Math.max(320, Math.floor(r.height));
      canvas.width = W * devicePixelRatio;
      canvas.height = H * devicePixelRatio;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const accent = themeAccent(config.theme);
    const objs = buildTrack(config);
    const raceEnd = objs.find((o) => o.kind === 'finish')?.z || 2600;

    let playerZ = 0;
    let lane = 1; // 0 1 2
    let laneVisual = 1;
    let speed = 0;
    const maxSpeed = 220 + config.speed * 28 + (config.mode === 'rush' ? 40 : 0);
    let nitro = 0.45;
    let nitroActive = false;
    let heat = 0;
    let lives = config.lives;
    const livesMax = config.lives;
    let score = 0;
    let coins = 0;
    let combo = 0;
    let comboMax = 0;
    let gatesCorrect = 0;
    let gatesTotal = 0;
    let curve = 0;
    let curveTarget = 0;
    let shake = 0;
    let invuln = 0;
    let helpT = 5.5;
    let flash: { text: string; color: string; t: number } | null = null;
    let activeGate: Extract<RoadObj, { kind: 'gate' }> | null = null;
    let gateSlow = 0;
    let started = false;
    let t = 0;
    let last = performance.now();
    let raf = 0;

    const keys = new Set<string>();

    const end = (cleared: boolean) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      playArenaSfx(cleared ? 'wave' : 'over');
      onFinishRef.current({
        cleared,
        score: Math.round(score),
        coins,
        livesLeft: Math.max(0, lives),
        livesMax,
        distance: playerZ,
        gatesCorrect,
        gatesTotal,
        comboMax,
      });
    };

    const bump = (label: string) => {
      if (invuln > 0) return;
      lives -= 1;
      invuln = 1.25;
      heat = Math.min(1, heat + 0.22);
      speed *= 0.45;
      nitroActive = false;
      combo = 0;
      shake = 14;
      flash = { text: label, color: '#f87171', t: 1.1 };
      playArenaSfx('miss');
      if (lives <= 0) end(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's', ' ', 'shift'].includes(k) || e.code === 'Space') {
        e.preventDefault();
      }
      keys.add(k);
      if (e.code === 'Space') keys.add(' ');
      if (!started) {
        started = true;
        helpT = 0;
      }
      if (k === 'arrowleft' || k === 'a') {
        lane = Math.max(0, lane - 1);
        playArenaSfx('hit');
      }
      if (k === 'arrowright' || k === 'd') {
        lane = Math.min(2, lane + 1);
        playArenaSfx('hit');
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.key.toLowerCase());
      if (e.code === 'Space') keys.delete(' ');
    };

    // touch: left third / right third / center = nitro
    const onPointer = (e: PointerEvent) => {
      if (!started) {
        started = true;
        helpT = 0;
      }
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      if (x < rect.width * 0.33) {
        lane = Math.max(0, lane - 1);
        playArenaSfx('hit');
      } else if (x > rect.width * 0.66) {
        lane = Math.min(2, lane + 1);
        playArenaSfx('hit');
      } else {
        nitroActive = nitro > 0.05;
      }
    };
    const onPointerUp = () => {
      nitroActive = false;
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('pointerdown', onPointer);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerUp);

    const drawCar = (
      x: number,
      y: number,
      scale: number,
      body: string,
      label?: string,
      rival?: boolean,
    ) => {
      const w = 54 * scale;
      const h = 28 * scale;
      ctx.save();
      ctx.translate(x, y);
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.ellipse(0, h * 0.45, w * 0.55, h * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      // body
      const g = ctx.createLinearGradient(-w / 2, -h, w / 2, h);
      g.addColorStop(0, body);
      g.addColorStop(0.5, '#fff');
      g.addColorStop(0.52, body);
      g.addColorStop(1, '#0f172a');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(-w * 0.45, h * 0.2);
      ctx.lineTo(-w * 0.35, -h * 0.15);
      ctx.lineTo(-w * 0.1, -h * 0.55);
      ctx.lineTo(w * 0.1, -h * 0.55);
      ctx.lineTo(w * 0.35, -h * 0.15);
      ctx.lineTo(w * 0.45, h * 0.2);
      ctx.lineTo(w * 0.38, h * 0.35);
      ctx.lineTo(-w * 0.38, h * 0.35);
      ctx.closePath();
      ctx.fill();
      // windshield
      ctx.fillStyle = rival ? 'rgba(15,23,42,0.75)' : 'rgba(56,189,248,0.55)';
      ctx.fillRect(-w * 0.18, -h * 0.42, w * 0.36, h * 0.22);
      // headlights
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(-w * 0.4, h * 0.05, w * 0.12, h * 0.08);
      ctx.fillRect(w * 0.28, h * 0.05, w * 0.12, h * 0.08);
      // neon underglow
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 2 * scale;
      ctx.beginPath();
      ctx.moveTo(-w * 0.35, h * 0.38);
      ctx.lineTo(w * 0.35, h * 0.38);
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (label) {
        ctx.fillStyle = '#fecaca';
        ctx.font = `bold ${Math.max(9, 11 * scale)}px ui-sans-serif, system-ui`;
        ctx.textAlign = 'center';
        ctx.fillText(label, 0, -h * 0.7);
      }
      ctx.restore();
    };

    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      t += dt;
      if (helpT > 0) helpT -= dt;
      if (shake > 0) shake *= 0.86;
      if (invuln > 0) invuln -= dt;
      if (flash) {
        flash.t -= dt;
        if (flash.t <= 0) flash = null;
      }

      // curves
      if (Math.floor(playerZ / 400) !== Math.floor((playerZ - speed * dt) / 400)) {
        curveTarget = (Math.random() - 0.5) * 1.6;
      }
      curve += (curveTarget - curve) * Math.min(1, dt * 1.5);

      // input drive
      const throttle = keys.has('arrowup') || keys.has('w') || started;
      const brake = keys.has('arrowdown') || keys.has('s');
      nitroActive =
        nitroActive ||
        ((keys.has(' ') || keys.has('shift')) && nitro > 0.04);

      if (!started) {
        speed = Math.max(0, speed - 80 * dt);
      } else {
        const target = brake ? maxSpeed * 0.25 : nitroActive && nitro > 0 ? maxSpeed * 1.35 : maxSpeed;
        const accel = brake ? 180 : nitroActive ? 140 : 70;
        if (throttle || true) {
          speed += (target - speed) * Math.min(1, accel * dt * 0.02);
        }
        if (nitroActive && nitro > 0) {
          nitro = Math.max(0, nitro - 0.22 * dt);
          if (nitro <= 0) nitroActive = false;
        } else {
          nitro = Math.min(1, nitro + 0.04 * dt);
          nitroActive = false;
        }
      }

      const slow = activeGate && !activeGate.resolved ? 0.55 : 1;
      const step = speed * dt * slow;
      playerZ += step;
      laneVisual += (lane - laneVisual) * Math.min(1, dt * 10);
      heat = Math.max(0, heat - 0.03 * dt);
      score += step * 0.08 * (1 + combo * 0.05);

      // collisions / pickups
      for (const o of objs) {
        const rel = o.z - playerZ;
        if (o.kind === 'finish' && rel < 40) {
          score += 800 + lives * 120 + Math.round((1 - heat) * 200);
          flash = { text: 'FINISH — MOST WANTED CLEAR', color: '#fbbf24', t: 1.5 };
          end(true);
          return;
        }
        if (o.kind === 'gate' && !o.resolved && rel < 160 && rel > 20) {
          if (!activeGate) {
            activeGate = o;
            gateSlow = 4.2;
            playArenaSfx('go');
            flash = { text: 'CHECKPOINT — PICK THE RIGHT LANE', color: '#38bdf8', t: 1.2 };
          }
        }
        if (o.kind === 'gate' && activeGate === o && !o.resolved) {
          gateSlow -= dt;
          if (rel < 55) {
            o.resolved = true;
            gatesTotal += 1;
            if (lane === o.correctIndex) {
              gatesCorrect += 1;
              score += 400;
              combo += 1;
              comboMax = Math.max(comboMax, combo);
              nitro = Math.min(1, nitro + 0.35);
              heat = Math.max(0, heat - 0.15);
              flash = { text: `CORRECT · ${o.options[o.correctIndex]}`, color: '#4ade80', t: 1.2 };
              playArenaSfx('combo');
            } else {
              bump(`WRONG LANE · ${o.options[o.correctIndex]}`);
            }
            activeGate = null;
          } else if (gateSlow <= 0) {
            o.resolved = true;
            gatesTotal += 1;
            bump('MISSED CHECKPOINT');
            activeGate = null;
          }
        }
        if (rel > 8 && rel < 55) {
          const sameLane = o.kind !== 'finish' && o.kind !== 'gate' && 'lane' in o && o.lane === lane;
          if (sameLane && o.kind === 'rival' && !o.hit) {
            o.hit = true;
            bump(o.label);
          }
          if (sameLane && o.kind === 'barrier' && !o.hit) {
            o.hit = true;
            bump(o.label);
          }
          if (sameLane && o.kind === 'coin' && !o.taken) {
            o.taken = true;
            coins += 1;
            score += 50 + combo * 8;
            combo += 1;
            comboMax = Math.max(comboMax, combo);
            playArenaSfx('hit');
            flash = { text: '+COIN', color: '#fbbf24', t: 0.5 };
          }
          if (sameLane && o.kind === 'nitro' && !o.taken) {
            o.taken = true;
            nitro = Math.min(1, nitro + 0.4);
            playArenaSfx('star');
            flash = { text: 'NITRO+', color: '#38bdf8', t: 0.6 };
          }
        }
      }

      // ——— DRAW ———
      const sx = shake ? (Math.random() - 0.5) * shake : 0;
      const sy = shake ? (Math.random() - 0.5) * shake : 0;
      ctx.save();
      ctx.translate(sx, sy);

      // night sky
      const sky = ctx.createLinearGradient(0, 0, 0, H * 0.55);
      sky.addColorStop(0, '#020617');
      sky.addColorStop(0.45, '#0f172a');
      sky.addColorStop(1, '#1e0933');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      // stars
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (let i = 0; i < 40; i++) {
        const stx = ((i * 97 + playerZ * 0.02) % W);
        const sty = (i * 53) % (H * 0.4);
        ctx.fillRect(stx, sty, i % 5 === 0 ? 2 : 1, i % 5 === 0 ? 2 : 1);
      }

      // moon
      ctx.fillStyle = 'rgba(248,250,252,0.9)';
      ctx.beginPath();
      ctx.arc(W * 0.82, H * 0.12, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = sky;
      ctx.beginPath();
      ctx.arc(W * 0.84, H * 0.1, 18, 0, Math.PI * 2);
      ctx.fill();

      // skyline
      for (let i = 0; i < 18; i++) {
        const bx = ((i * 70 - curve * 30 - playerZ * 0.08) % (W + 80)) - 20;
        const bh = 40 + ((i * 41) % 100);
        ctx.fillStyle = i % 2 ? '#111827' : '#0b1220';
        ctx.fillRect(bx, H * 0.55 - bh, 48, bh);
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.35 + (i % 3) * 0.1;
        for (let wy = 0; wy < 5; wy++) {
          ctx.fillRect(bx + 8, H * 0.55 - bh + 10 + wy * 12, 6, 5);
          ctx.fillRect(bx + 28, H * 0.55 - bh + 10 + wy * 12, 6, 5);
        }
        ctx.globalAlpha = 1;
      }

      // horizon glow
      const hg = ctx.createRadialGradient(W / 2 + curve * 20, H * 0.55, 10, W / 2, H * 0.55, W * 0.5);
      hg.addColorStop(0, `${accent}55`);
      hg.addColorStop(1, 'transparent');
      ctx.fillStyle = hg;
      ctx.fillRect(0, H * 0.35, W, H * 0.3);

      // road trapezoid strips (pseudo-3D)
      const roadTop = H * 0.55;
      for (let i = 0; i < 24; i++) {
        const z0 = playerZ + i * 55;
        const z1 = z0 + 55;
        const p0 = project(z0, 1, playerZ, W, H, curve);
        const p1 = project(z1, 1, playerZ, W, H, curve);
        if (!p0 || !p1) continue;
        const stripe = Math.floor((z0 / 55) % 2);
        ctx.fillStyle = stripe ? '#1f2937' : '#111827';
        ctx.beginPath();
        ctx.moveTo(p0.x - p0.roadW / 2, p0.y);
        ctx.lineTo(p0.x + p0.roadW / 2, p0.y);
        ctx.lineTo(p1.x + p1.roadW / 2, p1.y);
        ctx.lineTo(p1.x - p1.roadW / 2, p1.y);
        ctx.closePath();
        ctx.fill();

        // rumble
        ctx.fillStyle = stripe ? '#f97316' : '#f8fafc';
        ctx.beginPath();
        ctx.moveTo(p0.x - p0.roadW / 2 - 10, p0.y);
        ctx.lineTo(p0.x - p0.roadW / 2, p0.y);
        ctx.lineTo(p1.x - p1.roadW / 2, p1.y);
        ctx.lineTo(p1.x - p1.roadW / 2 - 8, p1.y);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(p0.x + p0.roadW / 2, p0.y);
        ctx.lineTo(p0.x + p0.roadW / 2 + 10, p0.y);
        ctx.lineTo(p1.x + p1.roadW / 2 + 8, p1.y);
        ctx.lineTo(p1.x + p1.roadW / 2, p1.y);
        ctx.closePath();
        ctx.fill();

        // lane dashes
        if (stripe) {
          ctx.strokeStyle = 'rgba(248,250,252,0.55)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(p0.x - p0.roadW * 0.14, p0.y);
          ctx.lineTo(p1.x - p1.roadW * 0.14, p1.y);
          ctx.moveTo(p0.x + p0.roadW * 0.14, p0.y);
          ctx.lineTo(p1.x + p1.roadW * 0.14, p1.y);
          ctx.stroke();
        }
      }

      // roadside grass/dark
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, roadTop + (H - roadTop) * 0.85, W, H);

      // objects far → near already sorted
      const drawList = [...objs].sort((a, b) => b.z - a.z);
      for (const o of drawList) {
        if (o.kind === 'finish') {
          const p = project(o.z, 1, playerZ, W, H, curve);
          if (!p || p.rel > 900) continue;
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 4 * p.scale;
          ctx.strokeRect(p.x - p.roadW * 0.45, p.y - 80 * p.scale, p.roadW * 0.9, 80 * p.scale);
          ctx.fillStyle = '#fbbf24';
          ctx.font = `bold ${Math.max(12, 28 * p.scale)}px ui-sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText('FINISH', p.x, p.y - 90 * p.scale);
          continue;
        }
        if (o.kind === 'gate') {
          const p = project(o.z, 1, playerZ, W, H, curve);
          if (!p || p.rel > 900) continue;
          // three lane arches
          for (let li = 0; li < 3; li++) {
            const lp = project(o.z, li, playerZ, W, H, curve);
            if (!lp) continue;
            const ok = o.resolved ? li === o.correctIndex : activeGate === o;
            ctx.fillStyle = o.resolved
              ? li === o.correctIndex
                ? 'rgba(74,222,128,0.55)'
                : 'rgba(100,116,139,0.35)'
              : ok
                ? 'rgba(56,189,248,0.45)'
                : 'rgba(15,23,42,0.55)';
            const bw = 48 * lp.scale;
            const bh = 70 * lp.scale;
            ctx.fillRect(lp.x - bw / 2, lp.y - bh, bw, bh);
            ctx.strokeStyle = accent;
            ctx.strokeRect(lp.x - bw / 2, lp.y - bh, bw, bh);
            ctx.fillStyle = '#f8fafc';
            ctx.font = `bold ${Math.max(8, 11 * lp.scale)}px ui-sans-serif`;
            ctx.textAlign = 'center';
            const opt = o.options[li] || '';
            ctx.fillText(opt.slice(0, 12), lp.x, lp.y - bh - 6);
          }
          if (activeGate === o && !o.resolved) {
            ctx.fillStyle = 'rgba(2,6,23,0.72)';
            ctx.fillRect(W * 0.1, 52, W * 0.8, 44);
            ctx.fillStyle = '#38bdf8';
            ctx.font = 'bold 14px ui-sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(o.prompt, W / 2, 72);
            ctx.fillStyle = '#94a3b8';
            ctx.font = '11px ui-sans-serif';
            ctx.fillText('← → lane choose · drive into the correct arch', W / 2, 90);
          }
          continue;
        }
        if ('taken' in o && o.taken) continue;
        if ('hit' in o && o.hit) continue;
        const p = project(o.z, o.lane, playerZ, W, H, curve);
        if (!p || p.rel > 850 || p.rel < 12) continue;
        if (o.kind === 'coin') {
          ctx.fillStyle = '#fbbf24';
          ctx.shadowColor = '#fbbf24';
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(p.x, p.y - 18 * p.scale, 10 * p.scale, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        } else if (o.kind === 'nitro') {
          ctx.fillStyle = '#38bdf8';
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y - 34 * p.scale);
          ctx.lineTo(p.x + 10 * p.scale, p.y - 10 * p.scale);
          ctx.lineTo(p.x - 10 * p.scale, p.y - 10 * p.scale);
          ctx.closePath();
          ctx.fill();
          ctx.shadowBlur = 0;
        } else if (o.kind === 'barrier') {
          ctx.fillStyle = '#f97316';
          ctx.fillRect(p.x - 26 * p.scale, p.y - 22 * p.scale, 52 * p.scale, 22 * p.scale);
          ctx.fillStyle = '#0f172a';
          ctx.font = `bold ${Math.max(8, 10 * p.scale)}px ui-sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(o.label.slice(0, 10), p.x, p.y - 28 * p.scale);
        } else if (o.kind === 'rival') {
          drawCar(p.x, p.y, Math.max(0.35, p.scale * 1.1), o.color, o.label, true);
        }
      }

      // player car
      const pLane = project(playerZ + 70, laneVisual, playerZ, W, H, curve);
      const px = pLane ? pLane.x : W / 2 + (laneVisual - 1) * 70;
      const py = H * 0.78;
      if (!(invuln > 0 && Math.floor(t * 20) % 2 === 0)) {
        if (nitroActive) {
          ctx.fillStyle = 'rgba(56,189,248,0.35)';
          ctx.beginPath();
          ctx.moveTo(px - 10, py + 10);
          ctx.lineTo(px + 10, py + 10);
          ctx.lineTo(px, py + 55 + Math.random() * 20);
          ctx.fill();
        }
        drawCar(px, py, 1.35, '#f8fafc');
      }

      // speed lines when nitro
      if (nitroActive) {
        ctx.strokeStyle = 'rgba(56,189,248,0.35)';
        for (let i = 0; i < 12; i++) {
          const ly = H * 0.5 + Math.random() * H * 0.4;
          ctx.beginPath();
          ctx.moveTo(Math.random() * W, ly);
          ctx.lineTo(Math.random() * W, ly + 2);
          ctx.stroke();
        }
      }

      // HUD chrome
      ctx.fillStyle = 'rgba(2,6,23,0.72)';
      ctx.fillRect(0, 0, W, 56);
      ctx.fillStyle = accent;
      ctx.font = 'bold 12px ui-sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(config.title.toUpperCase(), 14, 22);
      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 16px ui-sans-serif';
      ctx.fillText(`${Math.round(speed)} MPH`, 14, 44);
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(`SCORE ${Math.round(score)}`, 130, 44);
      ctx.fillStyle = '#f43f5e';
      ctx.fillText(`${'♥'.repeat(Math.max(0, lives))}${'♡'.repeat(Math.max(0, livesMax - lives))}`, 280, 44);

      // nitro bar
      ctx.fillStyle = 'rgba(148,163,184,0.25)';
      ctx.fillRect(W - 170, 14, 150, 10);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(W - 170, 14, 150 * nitro, 10);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px ui-sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('NITRO  SPACE', W - 20, 12);

      // heat / wanted
      ctx.fillStyle = 'rgba(148,163,184,0.25)';
      ctx.fillRect(W - 170, 32, 150, 10);
      ctx.fillStyle = heat > 0.7 ? '#ef4444' : '#f97316';
      ctx.fillRect(W - 170, 32, 150 * heat, 10);
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('HEAT', W - 20, 50);

      // progress
      const prog = Math.min(1, playerZ / raceEnd);
      ctx.fillStyle = 'rgba(15,23,42,0.8)';
      ctx.fillRect(W * 0.25, H - 18, W * 0.5, 8);
      ctx.fillStyle = accent;
      ctx.fillRect(W * 0.25, H - 18, W * 0.5 * prog, 8);
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(W * 0.25 + W * 0.5 * prog, H - 14, 6, 0, Math.PI * 2);
      ctx.fill();

      if (combo >= 2) {
        ctx.fillStyle = '#fb923c';
        ctx.font = 'bold 14px ui-sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`COMBO x${combo}`, W / 2, H - 28);
      }

      if (flash) {
        ctx.globalAlpha = Math.min(1, flash.t * 2);
        ctx.fillStyle = flash.color;
        ctx.font = 'bold 22px ui-sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(flash.text, W / 2, H * 0.42);
        ctx.globalAlpha = 1;
      }

      // tutorial overlay
      if (helpT > 0 || !started) {
        ctx.fillStyle = 'rgba(2,6,23,0.78)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = accent;
        ctx.font = 'bold 28px ui-sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('WOLF MOST WANTED', W / 2, H * 0.28);
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 16px ui-sans-serif';
        ctx.fillText('Night pursuit on the trading tape', W / 2, H * 0.36);
        ctx.font = '14px ui-sans-serif';
        ctx.fillStyle = '#cbd5e1';
        const lines = [
          '← → / A D     change LANE (avoid FOMO cars)',
          'HOLD ↑ / W      already racing — keep speed',
          'SPACE / SHIFT   NITRO boost',
          '↓ / S           brake before checkpoints',
          'CHECKPOINT      drive into the CORRECT answer lane',
          'FINISH line     clear the level · earn chest',
        ];
        lines.forEach((line, i) => ctx.fillText(line, W / 2, H * 0.46 + i * 22));
        ctx.fillStyle = accent;
        ctx.font = 'bold 15px ui-sans-serif';
        ctx.fillText('PRESS ANY KEY / TAP SCREEN TO LAUNCH', W / 2, H * 0.88);
      }

      // mobile touch zones hint
      if (started && t < 8) {
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(0, H * 0.7, W * 0.33, H * 0.3);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(W * 0.33, H * 0.7, W * 0.34, H * 0.3);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(W * 0.67, H * 0.7, W * 0.33, H * 0.3);
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = '#fff';
        ctx.font = '11px ui-sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('LEFT', W * 0.16, H * 0.86);
        ctx.fillText('NITRO', W * 0.5, H * 0.86);
        ctx.fillText('RIGHT', W * 0.84, H * 0.86);
        ctx.globalAlpha = 1;
      }

      ctx.restore();
      if (!finishedRef.current) raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('pointerdown', onPointer);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerUp);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  return (
    <div className="wm-tape wm-tape--nfs" ref={wrapRef}>
      <canvas ref={canvasRef} className="wm-tape__canvas" aria-label="Wolf Most Wanted race" />
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
            options: ['Buy FOMO', 'Rejection', 'Guaranteed up'],
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
              options: ['Instant buy', 'Structure clue', 'Ignore risk'],
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
                options: ['Grabs stops', 'Guarantees trend', 'Ends market'],
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
                  options: ['Revenge size', 'Review → reset', 'Delete journal'],
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
    speed: input.mode === 'boss' ? 4.4 : input.mode === 'rush' ? 4.8 : 3.8,
    theme,
    gates,
  };
}
