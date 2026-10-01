/**
 * TwelveLeadGrid.tsx
 *
 * Standard 12-lead display rendered on a single Canvas for perfect synchronisation.
 *
 * Layout (standard clinical):
 *   Row 0:  I   | aVR | V1 | V4
 *   Row 1:  II  | aVL | V2 | V5
 *   Row 2:  III | aVF | V3 | V6
 *   Rhythm:        Lead II (full width, 10 s)
 *
 * Paper constants (1 mm = SCALE px):
 *   small square 1 mm = 0.04 s (at 25 mm/s), 0.1 mV (at 10 mm/mV)
 *   large square 5 mm
 *
 * Sampling: the engine provides every lead at 1 ms resolution (simulation-
 * cache.ts). Each pixel column covers a span of simulated time (10 ms at
 * 25 mm/s); the column stores the first, min, max and last sample of that
 * span so narrow QRS deflections are drawn at full amplitude regardless of
 * the animation frame rate (no once-per-frame aliasing).
 */

import { useRef, useEffect } from 'react';
import { getSimulationState, sampleLead, updateSimulation } from '../engine/simulation-cache';
import { LEAD_NAMES } from '../engine/lead-calculator';
import { useSimulationStore } from '../store/simulation-store';
import type { LeadName } from '../engine/lead-calculator';

// ── Layout constants ─────────────────────────────────────────────────────────
const SCALE = 4;          // px per mm (CSS px)
const SMALL_SQ = SCALE;
const LARGE_SQ = SCALE * 5;

const COLS = 4;
const ROWS = 3;
const CELL_W = 250;                   // px = 2.5 s at 25 mm/s
const CELL_H = 110;
const DIVIDER = 1;
const TOTAL_W = CELL_W * COLS;        // 1000 px
const RHYTHM_H = 110;
const TOTAL_H = CELL_H * ROWS + RHYTHM_H + 2;

const LEAD_LAYOUT: LeadName[][] = [
  ['I',   'aVR', 'V1', 'V4'],
  ['II',  'aVL', 'V2', 'V5'],
  ['III', 'aVF', 'V3', 'V6'],
];
const RHYTHM_LEAD: LeadName = 'II';

// Paper colours
const BG        = '#FFF5F5';
const GRID_SM   = '#FFB3B3';
const GRID_LG   = '#FF9999';
const TRACE     = '#111111';
const DIVIDER_C = '#CC6666';

/** Samples per column: first, extreme-A, extreme-B (in time order), last. */
const VALS_PER_COL = 4;

// ── Grid tile ────────────────────────────────────────────────────────────────
function buildGridCanvas(w: number, h: number, dpr: number): HTMLCanvasElement {
  const gc = document.createElement('canvas');
  gc.width = Math.round(w * dpr);
  gc.height = Math.round(h * dpr);
  const ctx = gc.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = GRID_SM;
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= w; x += SMALL_SQ) {
    ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
  }
  for (let y = 0; y <= h; y += SMALL_SQ) {
    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
  }

  ctx.strokeStyle = GRID_LG;
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += LARGE_SQ) {
    ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
  }
  for (let y = 0; y <= h; y += LARGE_SQ) {
    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
  }
  return gc;
}

/** Column ring buffer for one lead. */
class ColumnBuffer {
  data: Float32Array;
  head = 0;          // index of the next column to write
  constructor(public cols: number) {
    this.data = new Float32Array(cols * VALS_PER_COL);
  }
  push(first: number, a: number, b: number, last: number): void {
    const o = this.head * VALS_PER_COL;
    this.data[o] = first; this.data[o + 1] = a; this.data[o + 2] = b; this.data[o + 3] = last;
    this.head = (this.head + 1) % this.cols;
  }
  /** Column `k` counted from the oldest (0) to the newest (cols-1). */
  offset(k: number): number {
    return ((this.head + k) % this.cols) * VALS_PER_COL;
  }
  clear(): void { this.data.fill(0); this.head = 0; }
}

/** Fill one column from the lead cache over the simulated-time span [t0, t0+span). */
function columnFromCache(
  sampler: (t: number) => number, t0: number, span: number,
): [number, number, number, number] {
  const n = Math.max(1, Math.round(span));
  const first = sampler(t0);
  let lo = first, hi = first, loT = 0, hiT = 0, last = first;
  for (let k = 1; k < n; k++) {
    const v = sampler(t0 + k);
    if (v < lo) { lo = v; loT = k; }
    if (v > hi) { hi = v; hiT = k; }
    last = v;
  }
  return loT <= hiT ? [first, lo, hi, last] : [first, hi, lo, last];
}

export function TwelveLeadGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const buffersRef = useRef<Record<LeadName, ColumnBuffer>>(
    Object.fromEntries(LEAD_NAMES.map((l) => [l, new ColumnBuffer(TOTAL_W)])) as Record<LeadName, ColumnBuffer>,
  );
  const simTimeRef = useRef(0);     // simulated ms at the newest column
  const pxAccRef = useRef(0);       // fractional pixel accumulator
  const lastTsRef = useRef<number | null>(null);
  const rafRef = useRef(0);

  const { heartRateBpm, activeConditions, arteries, playbackSpeed, gain, paperSpeed } = useSimulationStore();

  // Reset buffers on parameter change
  useEffect(() => {
    for (const l of LEAD_NAMES) buffersRef.current[l].clear();
    simTimeRef.current = 0;
    pxAccRef.current = 0;
  }, [heartRateBpm, activeConditions, arteries, playbackSpeed, gain, paperSpeed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(TOTAL_W * dpr);
    canvas.height = Math.round(TOTAL_H * dpr);
    canvas.style.width = `${TOTAL_W}px`;
    canvas.style.height = `${TOTAL_H}px`;
    gridCanvasRef.current = buildGridCanvas(TOTAL_W, TOTAL_H, dpr);

    updateSimulation({ heartRateBpm, activeConditions, arteries });
    const pxPerSimMs = (paperSpeed * SCALE) / 1000;   // paper speed is in simulated time
    const msPerPx = 1 / pxPerSimMs;
    const pxPerMv = 10 * SCALE * (gain / 10);

    const drawLabel = (text: string, x: number, y: number) => {
      ctx.fillStyle = '#444';
      ctx.font = `bold ${LARGE_SQ * 0.7}px monospace`;
      ctx.fillText(text, x + SMALL_SQ * 1.5, y + LARGE_SQ * 0.85);
    };

    const traceColumns = (buf: ColumnBuffer, ox: number, baseline: number, fromCol: number, count: number) => {
      ctx.beginPath();
      for (let i = 0; i < count; i++) {
        const o = buf.offset(fromCol + i);
        const x = ox + i + 0.5;
        const y0 = baseline - buf.data[o] * pxPerMv;
        if (i === 0) ctx.moveTo(x, y0); else ctx.lineTo(x, y0);
        ctx.lineTo(x, baseline - buf.data[o + 1] * pxPerMv);
        ctx.lineTo(x, baseline - buf.data[o + 2] * pxPerMv);
        ctx.lineTo(x, baseline - buf.data[o + 3] * pxPerMv);
      }
      ctx.stroke();
    };

    const animate = (ts: number) => {
      if (lastTsRef.current === null) lastTsRef.current = ts;
      const dtReal = Math.min(100, ts - lastTsRef.current);   // clamp after tab switches
      lastTsRef.current = ts;

      // Advance simulated time and emit whole pixel columns.
      const sim = getSimulationState();
      pxAccRef.current += dtReal * playbackSpeed * pxPerSimMs;
      while (pxAccRef.current >= 1) {
        const t0 = simTimeRef.current;
        for (const lead of LEAD_NAMES) {
          const col = columnFromCache((t) => sampleLead(sim, lead, t), t0, msPerPx);
          buffersRef.current[lead].push(col[0], col[1], col[2], col[3]);
        }
        simTimeRef.current = t0 + msPerPx;
        pxAccRef.current -= 1;
      }

      // ── Draw frame ─────────────────────────────────────────────────────────
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (gridCanvasRef.current) ctx.drawImage(gridCanvasRef.current, 0, 0);
      else { ctx.fillStyle = BG; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.strokeStyle = DIVIDER_C;
      ctx.lineWidth = DIVIDER;
      for (let col = 1; col < COLS; col++) {
        const x = col * CELL_W + 0.5;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CELL_H * ROWS); ctx.stroke();
      }
      for (let row = 1; row <= ROWS; row++) {
        const y = row * CELL_H + 0.5;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(TOTAL_W, y); ctx.stroke();
      }

      ctx.strokeStyle = TRACE;
      ctx.lineWidth = 1.25;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const lead = LEAD_LAYOUT[row]![col]!;
          const ox = col * CELL_W;
          const oy = row * CELL_H;
          ctx.save();
          ctx.beginPath(); ctx.rect(ox, oy, CELL_W, CELL_H); ctx.clip();
          // newest CELL_W columns
          traceColumns(buffersRef.current[lead], ox, oy + CELL_H / 2, TOTAL_W - CELL_W, CELL_W);
          ctx.restore();
          drawLabel(lead, ox, oy);
        }
      }

      // Rhythm strip: full buffer width
      {
        const oy = CELL_H * ROWS;
        ctx.save();
        ctx.beginPath(); ctx.rect(0, oy, TOTAL_W, RHYTHM_H); ctx.clip();
        traceColumns(buffersRef.current[RHYTHM_LEAD], 0, oy + RHYTHM_H / 2, 0, TOTAL_W);
        ctx.restore();
        drawLabel(`${RHYTHM_LEAD} (rhythm)`, 0, oy);
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(rafRef.current);
      lastTsRef.current = null;
    };
  }, [heartRateBpm, activeConditions, arteries, playbackSpeed, gain, paperSpeed]);

  return (
    <canvas
      ref={canvasRef}
      width={TOTAL_W}
      height={TOTAL_H}
      style={{ display: 'block', width: TOTAL_W, height: TOTAL_H }}
    />
  );
}
