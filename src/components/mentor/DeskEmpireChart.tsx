import { useEffect, useRef, useState } from 'react';
import type { EmpireBar, EmpireScenario, TradePlan } from '../../services/deskEmpireReplay';

export type DraftLevels = {
  entry: number;
  stop: number;
  target: number;
};

type DragKey = 'entry' | 'stop' | 'target';

type DeskEmpireChartProps = {
  bars: EmpireBar[];
  scenario: EmpireScenario | null;
  plan?: TradePlan | null;
  draft?: DraftLevels | null;
  onDraftChange?: (next: DraftLevels) => void;
  /** Which line is actively selected for keyboard nudge / handle glow */
  activeTool?: DragKey | null;
  onActiveToolChange?: (tool: DragKey) => void;
  editable?: boolean;
  showLevels?: boolean;
  pulse?: boolean;
  liveR?: number | null;
};

/** Right-align candles into a fixed grid so width stays TV-like, not zoomed. */
const SLOT_COUNT = 64;

type Geo = {
  padT: number;
  padB: number;
  padL: number;
  padR: number;
  plotW: number;
  plotH: number;
  min: number;
  max: number;
  W: number;
  H: number;
};

function priceFromY(y: number, geo: Geo) {
  const t = (y - geo.padT) / Math.max(1e-9, geo.plotH);
  return geo.max - t * (geo.max - geo.min);
}

function yFromPrice(p: number, geo: Geo) {
  return geo.padT + ((geo.max - p) / Math.max(1e-9, geo.max - geo.min)) * geo.plotH;
}

export default function DeskEmpireChart({
  bars,
  scenario,
  plan,
  draft = null,
  onDraftChange,
  activeTool = 'entry',
  onActiveToolChange,
  editable = false,
  showLevels = true,
  pulse = false,
  liveR,
}: DeskEmpireChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const geoRef = useRef<Geo | null>(null);
  const draftRef = useRef(draft);
  const dragRef = useRef<DragKey | null>(null);
  const [hoverPx, setHoverPx] = useState<number | null>(null);
  const [hoverY, setHoverY] = useState<number | null>(null);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let raf = 0;
    let t = 0;
    let alive = true;

    const draw = () => {
      if (!alive) return;
      const r = wrap.getBoundingClientRect();
      if (r.width < 80 || r.height < 80) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
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
      ctx.imageSmoothingEnabled = false;

      ctx.fillStyle = '#131722';
      ctx.fillRect(0, 0, W, H);

      // Horizontal grid like TradingView
      ctx.strokeStyle = 'rgba(42,46,57,0.9)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 8; i += 1) {
        const y = (H / 8) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      ctx.fillStyle = '#787b86';
      ctx.font = '600 11px "Trebuchet MS", "Segoe UI", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(
        `${scenario?.symbol || 'DESK'} · ${scenario?.interval || ''}`,
        12,
        18,
      );

      if (!bars.length) {
        ctx.fillStyle = '#d1d4dc';
        ctx.font = '14px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Loading tape…', W / 2, H / 2);
        return;
      }

      const shown = bars.slice(-SLOT_COUNT);
      const padT = 28;
      const padB = 24;
      const padL = 10;
      const padR = 68;
      const plotW = W - padL - padR;
      const plotH = H - padT - padB;
      const slot = plotW / SLOT_COUNT;
      const bodyW = Math.min(10, Math.max(3, slot * 0.62));
      const startSlot = SLOT_COUNT - shown.length;

      let min = Math.min(...shown.map((b) => b.low));
      let max = Math.max(...shown.map((b) => b.high));
      const extras: number[] = [];
      if (showLevels && scenario) {
        // Only core structure levels — avoid label soup.
        for (const lv of scenario.levels) {
          if (/EQ|BSL|SSL|Decision|LTP/i.test(lv.label)) extras.push(lv.price);
        }
      }
      const lines = plan
        ? [plan.entryPrice, plan.stopPrice, plan.targetPrice]
        : draft
          ? [draft.entry, draft.stop, draft.target]
          : [];
      extras.push(...lines);
      for (const p of extras) {
        if (Number.isFinite(p)) {
          min = Math.min(min, p);
          max = Math.max(max, p);
        }
      }

      const mid = (min + max) / 2 || 1;
      const rawSpan = Math.max(1e-9, max - min);
      const minSpan = Math.max(mid * 0.0035, rawSpan * 1.15, mid * 0.0012);
      if (rawSpan < minSpan) {
        const half = minSpan / 2;
        min = mid - half;
        max = mid + half;
      } else {
        const pad = rawSpan * 0.08;
        min -= pad;
        max += pad;
      }

      const geo: Geo = { padT, padB, padL, padR, plotW, plotH, min, max, W, H };
      geoRef.current = geo;
      const yFor = (p: number) => yFromPrice(p, geo);
      const decimals = mid >= 1000 ? 1 : mid >= 20 ? 2 : 4;

      // Price axis
      ctx.fillStyle = '#787b86';
      ctx.font = '11px "Trebuchet MS", "Segoe UI", sans-serif';
      ctx.textAlign = 'right';
      for (let i = 0; i < 5; i += 1) {
        const p = max - ((max - min) * i) / 4;
        const y = yFor(p);
        ctx.fillText(p.toFixed(decimals), W - 8, y + 4);
        ctx.strokeStyle = 'rgba(42,46,57,0.7)';
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(W - padR, y);
        ctx.stroke();
      }

      if (showLevels && scenario) {
        for (const lv of scenario.levels) {
          if (!Number.isFinite(lv.price)) continue;
          if (!/EQ|BSL|SSL/i.test(lv.label)) continue;
          const y = yFor(lv.price);
          if (y < padT - 4 || y > H - padB + 4) continue;
          ctx.strokeStyle =
            lv.tone === 'bull'
              ? 'rgba(38,166,154,0.45)'
              : lv.tone === 'bear'
                ? 'rgba(239,83,80,0.45)'
                : 'rgba(120,123,134,0.4)';
          ctx.setLineDash([3, 5]);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(padL, y);
          ctx.lineTo(W - padR, y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = ctx.strokeStyle as string;
          ctx.font = '600 10px "Trebuchet MS", "Segoe UI", sans-serif';
          ctx.textAlign = 'left';
          const short = /BSL/i.test(lv.label) ? 'BSL' : /SSL/i.test(lv.label) ? 'SSL' : 'EQ';
          ctx.fillText(short, padL + 4, y - 4);
        }
      }

      const active = plan
        ? { entry: plan.entryPrice, stop: plan.stopPrice, target: plan.targetPrice }
        : draft;

      if (active) {
        const yE = yFor(active.entry);
        const yS = yFor(active.stop);
        const yT = yFor(active.target);
        ctx.fillStyle = 'rgba(239,83,80,0.1)';
        ctx.fillRect(padL, Math.min(yE, yS), plotW, Math.abs(yS - yE));
        ctx.fillStyle = 'rgba(38,166,154,0.1)';
        ctx.fillRect(padL, Math.min(yE, yT), plotW, Math.abs(yT - yE));

        const drawLine = (key: DragKey, y: number, color: string, label: string, price: number) => {
          if (y < padT - 8 || y > H - padB + 8) return;
          const selected = editable && activeTool === key;
          ctx.strokeStyle = color;
          ctx.lineWidth = selected ? 2.2 : 1.5;
          ctx.setLineDash(selected ? [] : [7, 4]);
          ctx.beginPath();
          ctx.moveTo(padL, y);
          ctx.lineTo(W - padR, y);
          ctx.stroke();
          ctx.setLineDash([]);

          // Price tag on the right (TV style)
          const tag = `${label} ${price.toFixed(decimals)}`;
          ctx.font = '700 11px "Trebuchet MS", "Segoe UI", sans-serif';
          const tw = ctx.measureText(tag).width + 10;
          ctx.fillStyle = color;
          ctx.fillRect(W - padR - 2, y - 10, tw, 18);
          ctx.fillStyle = '#0b0e11';
          ctx.textAlign = 'left';
          ctx.fillText(tag, W - padR + 3, y + 4);

          if (editable) {
            // Drag handle
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(padL + 14, y, selected ? 7 : 5.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#131722';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        };

        const rr =
          Math.abs(active.target - active.entry) / Math.max(1e-9, Math.abs(active.entry - active.stop));
        drawLine('target', yT, '#26a69a', `TP 1:${rr.toFixed(1)}`, active.target);
        drawLine('entry', yE, '#f0b90b', 'ENTRY', active.entry);
        drawLine('stop', yS, '#ef5350', 'SL', active.stop);
      }

      // Candles — TradingView palette
      shown.forEach((b, i) => {
        const x = padL + (startSlot + i + 0.5) * slot;
        const bull = b.close >= b.open;
        const color = bull ? '#26a69a' : '#ef5350';
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

      // Crosshair
      if (hoverY != null && hoverPx != null && editable) {
        ctx.strokeStyle = 'rgba(209,212,220,0.35)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(padL, hoverY);
        ctx.lineTo(W - padR, hoverY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#2962ff';
        ctx.fillRect(W - padR - 2, hoverY - 10, padR, 18);
        ctx.fillStyle = '#fff';
        ctx.font = '700 11px "Trebuchet MS", "Segoe UI", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(hoverPx.toFixed(decimals), W - 10, hoverY + 4);
      }

      if (pulse && shown.length && !editable) {
        const i = shown.length - 1;
        const x = padL + (startSlot + i + 0.5) * slot;
        const y = yFor(shown[i].close);
        const rad = 7 + Math.sin(t * 5) * 2;
        ctx.strokeStyle = 'rgba(240,185,11,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (liveR != null) {
        const txt = `${liveR >= 0 ? '+' : ''}${liveR.toFixed(2)}R`;
        ctx.font = '700 16px "Trebuchet MS", "Segoe UI", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = liveR >= 0 ? '#26a69a' : '#ef5350';
        ctx.fillText(txt, padL + 8, padT + 4);
      }

      if (editable) {
        ctx.fillStyle = 'rgba(209,212,220,0.55)';
        ctx.font = '600 10px "Segoe UI", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('Drag gold / red / green handles · or pick tool below', padL + 4, H - 8);
      }
    };

    const loop = () => {
      t += 0.05;
      draw();
      if ((pulse || hoverY != null) && alive) raf = requestAnimationFrame(loop);
    };

    draw();
    if (pulse) raf = requestAnimationFrame(loop);

    const hitTest = (y: number): DragKey | null => {
      const geo = geoRef.current;
      const d = draftRef.current;
      if (!geo || !d || !editable) return null;
      const pairs: [DragKey, number][] = [
        ['entry', yFromPrice(d.entry, geo)],
        ['stop', yFromPrice(d.stop, geo)],
        ['target', yFromPrice(d.target, geo)],
      ];
      let best: DragKey | null = null;
      let bestDist = 14;
      for (const [k, ly] of pairs) {
        const dist = Math.abs(ly - y);
        if (dist < bestDist) {
          bestDist = dist;
          best = k;
        }
      }
      return best;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!editable) return;
      const rect = canvas.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const key = hitTest(y) || activeTool || 'entry';
      dragRef.current = key;
      onActiveToolChange?.(key);
      canvas.setPointerCapture(e.pointerId);
      const geo = geoRef.current;
      const d = draftRef.current;
      if (geo && d && onDraftChange) {
        const px = priceFromY(y, geo);
        onDraftChange({ ...d, [key]: px });
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const geo = geoRef.current;
      if (geo) {
        const px = priceFromY(Math.min(geo.H - geo.padB, Math.max(geo.padT, y)), geo);
        setHoverPx(px);
        setHoverY(y);
      }
      if (!dragRef.current || !editable) return;
      const d = draftRef.current;
      if (!geo || !d || !onDraftChange) return;
      const px = priceFromY(Math.min(geo.H - geo.padB, Math.max(geo.padT, y)), geo);
      onDraftChange({ ...d, [dragRef.current]: px });
    };

    const onPointerUp = (e: PointerEvent) => {
      dragRef.current = null;
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onLeave = () => {
      setHoverPx(null);
      setHoverY(null);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onLeave);

    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      if (pulse) raf = requestAnimationFrame(loop);
      else draw();
    });
    ro.observe(wrap);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onLeave);
    };
  }, [
    bars,
    scenario,
    plan,
    draft,
    editable,
    activeTool,
    onActiveToolChange,
    onDraftChange,
    showLevels,
    pulse,
    liveR,
    hoverY,
    hoverPx,
  ]);

  return (
    <div className={`wm-empire__chart ${editable ? 'wm-empire__chart--edit' : ''}`} ref={wrapRef}>
      <canvas ref={canvasRef} className="wm-empire__canvas" />
    </div>
  );
}
