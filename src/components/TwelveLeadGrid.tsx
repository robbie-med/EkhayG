/**
 * TwelveLeadGrid.tsx
 *
 * Standard 12-lead display rendered on a single Canvas for perfect synchronization.
 * All 12 leads are computed from the same cardiac vector sample each frame.
 *
 * Layout (standard clinical):
 *   Row 0:  I   | aVR | V1 | V4
 *   Row 1:  II  | aVL | V2 | V5
 *   Row 2:  III | aVF | V3 | V6
 *   Rhythm:        Lead II (full width, 10 s)
 *
 * Paper constants (1 px = 1 mm at SCALE factor):
 *   SMALL_SQ = SCALE px  (1 mm = 0.04 s, 0.1 mV)
 *   LARGE_SQ = SCALE×5 px (5 mm = 0.20 s, 0.5 mV)
 *   Speed: 25 mm/s  →  SCALE×25 px/s  →  SCALE×25/1000 px/ms
 *   Gain:  10 mm/mV →  SCALE×10 px/mV
 */

import { useRef, useEffect, useCallback } from 'react';
import { getCardiacVector, getDefaultTimings } from '../engine/cardiac-vector';
import { computeLeadVoltage, computeLeadVectors, ELECTRODE_POSITIONS } from '../engine/lead-calculator';
import { getCombinedPathology } from '../engine/pathology';
import { useSimulationStore } from '../store/simulation-store';
import type { LeadName } from '../engine/lead-calculator';

// ── Layout constants ─────────────────────────────────────────────────────────
const SCALE = 4;          // px per mm
const SMALL_SQ = SCALE;   // px
const LARGE_SQ = SCALE * 5;

const COLS = 4;
const ROWS = 3;
const CELL_W = 250;                   // px = 2.5 s × 25 mm/s × 4 px/mm
const CELL_H = 110;                   // px ≈ 5.5 large squares
const DIVIDER = 1;                    // px between cells
const TOTAL_W = CELL_W * COLS;        // 1000 px
const RHYTHM_H = 110;
const TOTAL_H = CELL_H * ROWS + RHYTHM_H + 2; // +2 for bottom divider

// Standard 12-lead layout
const LEAD_LAYOUT: LeadName[][] = [
  ['I',   'aVR', 'V1', 'V4'],
  ['II',  'aVL', 'V2', 'V5'],
  ['III', 'aVF', 'V3', 'V6'],
];
const RHYTHM_LEAD: LeadName = 'II';

// All 12 lead names
const ALL_LEADS: LeadName[] = ['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'];

// Paper colours
const BG        = '#FFF5F5';
const GRID_SM   = '#FFB3B3';
const GRID_LG   = '#FF9999';
const TRACE     = '#111111';
const DIVIDER_C = '#CC6666';

// ── Pre-render grid tile onto an OffscreenCanvas ─────────────────────────────
function buildGridCanvas(w: number, h: number): HTMLCanvasElement {
  const gc = document.createElement('canvas');
  gc.width = w;
  gc.height = h;
  const ctx = gc.getContext('2d')!;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);

  // Small squares
  ctx.strokeStyle = GRID_SM;
  ctx.lineWidth = 0.5;
  for (let x = 0; x <= w; x += SMALL_SQ) {
    ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke();
  }
  for (let y = 0; y <= h; y += SMALL_SQ) {
    ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke();
  }

  // Large squares
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

// ── Component ────────────────────────────────────────────────────────────────
export function TwelveLeadGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Per-lead ring buffers (length = TOTAL_W for rhythm, trimmed to CELL_W for cells)
  const buffersRef = useRef<Record<LeadName, number[]>>(
    Object.fromEntries(ALL_LEADS.map((l) => [l, new Array(TOTAL_W).fill(0)])) as Record<LeadName, number[]>,
  );

  const cycleTimeMsRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);
  const rafRef = useRef(0);

  const { heartRateBpm, activePathologyId, arteries, playbackSpeed, gain } = useSimulationStore();

  // Pre-compute lead vectors (stable — only changes if electrode positions change)
  const leadVectors = computeLeadVectors(ELECTRODE_POSITIONS);

  // Build grid canvas once (or when size changes)
  useEffect(() => {
    gridCanvasRef.current = buildGridCanvas(TOTAL_W, TOTAL_H);
  }, []);

  // Reset buffers on parameter change
  useEffect(() => {
    const b = buffersRef.current;
    ALL_LEADS.forEach((l) => { b[l] = new Array(TOTAL_W).fill(0); });
    cycleTimeMsRef.current = 0;
  }, [heartRateBpm, activePathologyId, arteries, playbackSpeed, gain]);

  const drawLabel = useCallback(
    (ctx: CanvasRenderingContext2D, text: string, x: number, y: number) => {
      ctx.fillStyle = '#444';
      ctx.font = `bold ${LARGE_SQ * 0.7}px monospace`;
      ctx.fillText(text, x + SMALL_SQ * 1.5, y + LARGE_SQ * 0.85);
    },
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const combined = getCombinedPathology(activePathologyId, arteries);
    const baseTimings = getDefaultTimings(heartRateBpm);
    const timings = { ...baseTimings, ...combined.timingOverrides };
    const cycleLen = 60000 / heartRateBpm;
    const pxPerMs = (25 * SCALE) / 1000 * playbackSpeed;  // px/ms at 25mm/s
    const pxPerMv = 10 * SCALE * (gain / 10);              // px/mV

    const animate = (ts: number) => {
      if (lastTsRef.current === null) lastTsRef.current = ts;
      const dtMs = ts - lastTsRef.current;
      lastTsRef.current = ts;

      cycleTimeMsRef.current = (cycleTimeMsRef.current + dtMs * playbackSpeed) % cycleLen;
      const cVec = getCardiacVector(
        cycleTimeMsRef.current, timings, combined.stVector, combined.qrsSegments,
      );

      // Push one voltage sample per lead into each buffer
      const buf = buffersRef.current;
      const samplesToAdd = Math.max(1, Math.round(dtMs * pxPerMs));
      for (const lead of ALL_LEADS) {
        const v = computeLeadVoltage(cVec.vector, leadVectors[lead]);
        for (let i = 0; i < samplesToAdd; i++) buf[lead].push(v);
        if (buf[lead].length > TOTAL_W) buf[lead].splice(0, buf[lead].length - TOTAL_W);
      }

      // ── Draw frame ─────────────────────────────────────────────────────────
      // 1. Grid background
      if (gridCanvasRef.current) {
        ctx.drawImage(gridCanvasRef.current, 0, 0);
      } else {
        ctx.fillStyle = BG;
        ctx.fillRect(0, 0, TOTAL_W, TOTAL_H);
      }

      // 2. Cell dividers
      ctx.strokeStyle = DIVIDER_C;
      ctx.lineWidth = DIVIDER;
      for (let col = 1; col < COLS; col++) {
        const x = col * CELL_W;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CELL_H * ROWS);
        ctx.stroke();
      }
      for (let row = 1; row <= ROWS; row++) {
        const y = row * CELL_H;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(TOTAL_W, y);
        ctx.stroke();
      }
      // Rhythm strip divider
      ctx.beginPath();
      ctx.moveTo(0, CELL_H * ROWS);
      ctx.lineTo(TOTAL_W, CELL_H * ROWS);
      ctx.stroke();

      // 3. Lead traces (cells)
      ctx.strokeStyle = TRACE;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      for (let row = 0; row < ROWS; row++) {
        for (let col = 0; col < COLS; col++) {
          const lead = LEAD_LAYOUT[row]![col]!;
          const ox = col * CELL_W;
          const oy = row * CELL_H;
          const baseline = oy + CELL_H / 2;

          // Draw last CELL_W samples from the buffer
          const b = buf[lead];
          const start = Math.max(0, b.length - CELL_W);

          ctx.beginPath();
          ctx.save();
          ctx.rect(ox, oy, CELL_W, CELL_H);
          ctx.clip();

          for (let i = 0; i < CELL_W; i++) {
            const v = b[start + i] ?? 0;
            const x = ox + i;
            const y = baseline - v * pxPerMv;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.restore();

          drawLabel(ctx, lead, ox, oy);
        }
      }

      // 4. Rhythm strip (full TOTAL_W buffer for RHYTHM_LEAD)
      {
        const oy = CELL_H * ROWS;
        const baseline = oy + RHYTHM_H / 2;
        const b = buf[RHYTHM_LEAD];

        ctx.beginPath();
        ctx.strokeStyle = TRACE;
        ctx.lineWidth = 1.5;
        ctx.save();
        ctx.rect(0, oy, TOTAL_W, RHYTHM_H);
        ctx.clip();

        for (let i = 0; i < TOTAL_W; i++) {
          const v = b[i] ?? 0;
          const y = baseline - v * pxPerMv;
          if (i === 0) ctx.moveTo(i, y);
          else ctx.lineTo(i, y);
        }
        ctx.stroke();
        ctx.restore();

        // Rhythm strip label
        drawLabel(ctx, `${RHYTHM_LEAD} (rhythm)`, 0, oy);
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(rafRef.current);
      lastTsRef.current = null;
    };
  }, [
    heartRateBpm, activePathologyId, arteries, playbackSpeed, gain,
    leadVectors, drawLabel,
  ]);

  return (
    <canvas
      ref={canvasRef}
      width={TOTAL_W}
      height={TOTAL_H}
      style={{ display: 'block', imageRendering: 'pixelated' }}
    />
  );
}
