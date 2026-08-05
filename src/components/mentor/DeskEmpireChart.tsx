import { useEffect, useRef } from 'react';
import type { EmpireBar, EmpireScenario } from '../../services/deskEmpireReplay';

type DeskEmpireChartProps = {
  bars: EmpireBar[];
  scenario: EmpireScenario | null;
  entryLine?: number | null;
  showLevels?: boolean;
  pulse?: boolean;
};

export default function DeskEmpireChart({
  bars,
  scenario,
  entryLine,
  showLevels = true,
  pulse = false,
}: DeskEmpireChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let t = 0;

    const draw = () => {
      const r = wrap.getBoundingClientRect();
      const W = Math.max(280, Math.floor(r.width));
      const H = Math.max(220, Math.floor(r.height));
      canvas.width = W * devicePixelRatio;
      canvas.height = H * devicePixelRatio;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

      // background
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#070b14');
      g.addColorStop(1, '#0c1222');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // grid
      ctx.strokeStyle = 'rgba(148,163,184,0.08)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const y = (H / 6) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      if (!bars.length) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = '14px ui-sans-serif, system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('Loading tape…', W / 2, H / 2);
        return;
      }

      const padT = 28;
      const padB = 24;
      const padX = 12;
      const highs = bars.map((b) => b.high);
      const lows = bars.map((b) => b.low);
      let min = Math.min(...lows);
      let max = Math.max(...highs);
      if (showLevels && scenario) {
        for (const lv of scenario.levels) {
          min = Math.min(min, lv.price);
          max = Math.max(max, lv.price);
        }
      }
      const span = Math.max(1e-6, max - min);
      min -= span * 0.04;
      max += span * 0.04;
      const plotH = H - padT - padB;
      const slot = (W - padX * 2) / bars.length;
      const bodyW = Math.max(2, slot * 0.62);

      const yFor = (p: number) => padT + ((max - p) / (max - min)) * plotH;

      // levels
      if (showLevels && scenario) {
        for (const lv of scenario.levels) {
          const y = yFor(lv.price);
          ctx.strokeStyle =
            lv.tone === 'bull'
              ? 'rgba(52,211,153,0.55)'
              : lv.tone === 'bear'
                ? 'rgba(248,113,113,0.55)'
                : 'rgba(148,163,184,0.45)';
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(padX, y);
          ctx.lineTo(W - padX, y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = ctx.strokeStyle;
          ctx.font = 'bold 10px ui-sans-serif, system-ui';
          ctx.textAlign = 'left';
          ctx.fillText(lv.label, padX + 4, y - 4);
        }
      }

      // entry
      if (entryLine != null && entryLine > 0) {
        const y = yFor(entryLine);
        ctx.strokeStyle = '#d4af37';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 3]);
        ctx.beginPath();
        ctx.moveTo(padX, y);
        ctx.lineTo(W - padX, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#d4af37';
        ctx.font = 'bold 10px ui-sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`ENTRY ${entryLine.toFixed(1)}`, W - padX, y - 4);
      }

      // candles
      bars.forEach((b, i) => {
        const x = padX + i * slot + slot / 2;
        const bull = b.close >= b.open;
        const color = bull ? '#34d399' : '#f87171';
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(x, yFor(b.high));
        ctx.lineTo(x, yFor(b.low));
        ctx.stroke();
        const y1 = yFor(Math.max(b.open, b.close));
        const y2 = yFor(Math.min(b.open, b.close));
        const bh = Math.max(1, y2 - y1);
        ctx.fillRect(x - bodyW / 2, y1, bodyW, bh);
      });

      // decision pulse on last candle
      if (pulse && bars.length) {
        const i = bars.length - 1;
        const x = padX + i * slot + slot / 2;
        const b = bars[i];
        const y = yFor(b.close);
        const rad = 10 + Math.sin(t * 6) * 3;
        ctx.strokeStyle = 'rgba(212,175,55,0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.stroke();
      }

      // watermark
      ctx.fillStyle = 'rgba(212,175,55,0.2)';
      ctx.font = 'bold 12px ui-sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(scenario?.symbol || 'DESK TAPE', padX, 16);
    };

    const loop = () => {
      t += 0.05;
      draw();
      if (pulse) raf = requestAnimationFrame(loop);
    };
    draw();
    if (pulse) raf = requestAnimationFrame(loop);

    const ro = new ResizeObserver(() => draw());
    ro.observe(wrap);
    return () => {
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
