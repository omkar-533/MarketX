import { useEffect, useRef } from 'react';
import type { EmpireBar, EmpireScenario } from '../../services/deskEmpireReplay';

type DeskEmpireChartProps = {
  bars: EmpireBar[];
  scenario: EmpireScenario | null;
  entryLine?: number | null;
  showLevels?: boolean;
  pulse?: boolean;
};

/** Always lay out this many candle slots so bars never look "zoomed"/fat. */
const SLOT_COUNT = 48;

export default function DeskEmpireChart({
  bars,
  scenario,
  entryLine,
  showLevels = true,
  pulse = false,
}: DeskEmpireChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let t = 0;
    let alive = true;

    const draw = () => {
      if (!alive) return;
      const r = wrap.getBoundingClientRect();
      // Ignore broken first layout frames (0 size) — they cause wild zoom look.
      if (r.width < 80 || r.height < 80) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = Math.floor(r.width);
      const H = Math.floor(r.height);

      if (sizeRef.current.w !== W || sizeRef.current.h !== H) {
        sizeRef.current = { w: W, h: H };
        canvas.width = Math.floor(W * dpr);
        canvas.height = Math.floor(H * dpr);
        canvas.style.width = `${W}px`;
        canvas.style.height = `${H}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#070b14');
      g.addColorStop(1, '#0c1222');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = 'rgba(148,163,184,0.08)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const y = (H / 6) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(212,175,55,0.35)';
      ctx.font = 'bold 11px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(scenario?.symbol || 'DESK TAPE', 10, 16);

      if (!bars.length) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px ui-sans-serif, system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('Loading tape…', W / 2, H / 2);
        return;
      }

      // Right-align bars into a fixed slot grid (empty slots on the left).
      const shown = bars.slice(-SLOT_COUNT);
      const padT = 26;
      const padB = 20;
      const padL = 8;
      const padR = 52;
      const plotW = W - padL - padR;
      const plotH = H - padT - padB;
      const slot = plotW / SLOT_COUNT;
      const bodyW = Math.min(9, Math.max(2.5, slot * 0.55));
      const startSlot = SLOT_COUNT - shown.length;

      let min = Math.min(...shown.map((b) => b.low));
      let max = Math.max(...shown.map((b) => b.high));
      if (showLevels && scenario) {
        for (const lv of scenario.levels) {
          if (Number.isFinite(lv.price)) {
            min = Math.min(min, lv.price);
            max = Math.max(max, lv.price);
          }
        }
      }
      if (entryLine != null && entryLine > 0) {
        min = Math.min(min, entryLine);
        max = Math.max(max, entryLine);
      }

      // Prevent Y micro-zoom when range is tiny (huge candles look).
      const mid = (min + max) / 2 || 1;
      const rawSpan = Math.max(1e-9, max - min);
      const minSpan = Math.max(mid * 0.004, rawSpan * 1.35, mid * 0.0015);
      if (rawSpan < minSpan) {
        const half = minSpan / 2;
        min = mid - half;
        max = mid + half;
      } else {
        const pad = rawSpan * 0.12;
        min -= pad;
        max += pad;
      }

      const yFor = (p: number) => padT + ((max - p) / (max - min)) * plotH;

      // price axis ticks
      ctx.fillStyle = 'rgba(148,163,184,0.65)';
      ctx.font = '9px ui-sans-serif, system-ui';
      ctx.textAlign = 'right';
      for (let i = 0; i < 4; i++) {
        const p = max - ((max - min) * i) / 3;
        const y = yFor(p);
        ctx.fillText(p.toFixed(0), W - 6, y + 3);
        ctx.strokeStyle = 'rgba(148,163,184,0.06)';
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(W - padR, y);
        ctx.stroke();
      }

      if (showLevels && scenario) {
        for (const lv of scenario.levels) {
          if (!Number.isFinite(lv.price)) continue;
          const y = yFor(lv.price);
          if (y < padT - 4 || y > H - padB + 4) continue;
          ctx.strokeStyle =
            lv.tone === 'bull'
              ? 'rgba(52,211,153,0.5)'
              : lv.tone === 'bear'
                ? 'rgba(248,113,113,0.5)'
                : 'rgba(148,163,184,0.4)';
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(padL, y);
          ctx.lineTo(W - padR, y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = ctx.strokeStyle as string;
          ctx.font = 'bold 9px ui-sans-serif, system-ui';
          ctx.textAlign = 'left';
          ctx.fillText(lv.label, padL + 2, y - 3);
        }
      }

      if (entryLine != null && entryLine > 0) {
        const y = yFor(entryLine);
        ctx.strokeStyle = '#d4af37';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 3]);
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(W - padR, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#d4af37';
        ctx.font = 'bold 9px ui-sans-serif, system-ui';
        ctx.textAlign = 'right';
        ctx.fillText(`ENTRY ${entryLine.toFixed(1)}`, W - padR - 2, y - 3);
      }

      shown.forEach((b, i) => {
        const x = padL + (startSlot + i + 0.5) * slot;
        const bull = b.close >= b.open;
        const color = bull ? '#34d399' : '#f87171';
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, yFor(b.high));
        ctx.lineTo(x, yFor(b.low));
        ctx.stroke();
        const top = yFor(Math.max(b.open, b.close));
        const bot = yFor(Math.min(b.open, b.close));
        ctx.fillRect(x - bodyW / 2, top, bodyW, Math.max(1, bot - top));
      });

      if (pulse && shown.length) {
        const i = shown.length - 1;
        const x = padL + (startSlot + i + 0.5) * slot;
        const y = yFor(shown[i].close);
        const rad = 8 + Math.sin(t * 5) * 2;
        ctx.strokeStyle = 'rgba(212,175,55,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.stroke();
      }
    };

    const loop = () => {
      t += 0.05;
      draw();
      if (pulse && alive) raf = requestAnimationFrame(loop);
    };

    draw();
    if (pulse) raf = requestAnimationFrame(loop);

    const ro = new ResizeObserver(() => {
      // debounce via rAF
      cancelAnimationFrame(raf);
      if (pulse) raf = requestAnimationFrame(loop);
      else draw();
    });
    ro.observe(wrap);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [bars, scenario, entryLine, showLevels, pulse]);

  return (
    <div className="wm-empire__chart" ref={wrapRef}>
      <canvas ref={canvasRef} className="wm-empire__canvas" />
    </div>
  );
}
