/**
 * EKGStrip.tsx
 * Single-lead EKG tracing on an HTML5 Canvas.
 * Scrolling strip — new data appears at right, scrolls left.
 *
 * EKG paper standards:
 *   - Small square: 1mm × 1mm = 0.04s × 0.1mV (at 25 mm/s, 10 mm/mV)
 *   - Large square: 5mm × 5mm
 *
 * Sampling: the engine supplies the waveform at 1 ms resolution; each pixel
 * column stores the first / min / max / last sample of the simulated time it
 * covers, so narrow deflections keep their full amplitude at any frame rate.
 */

import { useRef, useEffect, useCallback } from 'react';
import type { Vec3 } from '../engine/cardiac-vector';
import { PRECORDIAL_SCALE, STANDARD_LEAD_VECTORS } from '../engine/lead-calculator';
import { getSimulationState, projectLead, sampleWave, updateSimulation } from '../engine/simulation-cache';
import type { SimulationState } from '../engine/simulation-cache';
import { useSimulationStore } from '../store/simulation-store';
import type { LeadName } from '../engine/lead-calculator';

// ── EKG paper constants (CSS px) ─────────────────────────────────────────────
const SMALL_SQ_PX = 4;   // 1 mm
const LARGE_SQ_PX = SMALL_SQ_PX * 5;
const PX_PER_MV_BASE = 10 * SMALL_SQ_PX;   // 10 mm/mV

interface Props {
  leadName: LeadName;
  width?: number;
  height?: number;
  label?: string;
  showGrid?: boolean;
  /** Override lead vector for custom electrode placement (Frank coords). */
  customLeadVector?: Vec3;
  /** Electrode position in Frank coords (cm) for arbitrary lead placement. */
  customElectrodePosition?: Vec3;
}

function unit(v: Vec3): Vec3 {
  const m = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / m, v[1] / m, v[2] / m];
}

export function EKGStrip({
  leadName,
  width = 600,
  height = 120,
  label,
  showGrid = true,
  customLeadVector,
  customElectrodePosition,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colsRef = useRef<Float32Array>(new Float32Array(0));  // 4 values per column
  const headRef = useRef(0);
  const simTimeRef = useRef(0);
  const pxAccRef = useRef(0);
  const lastTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);
  const customVecRef = useRef(customLeadVector);
  customVecRef.current = customLeadVector;
  const customPosRef = useRef(customElectrodePosition);
  customPosRef.current = customElectrodePosition;
  const waveRef = useRef<{ key: string; sim: SimulationState | null; wave: Float32Array | null }>({ key: '', sim: null, wave: null });

  const { heartRateBpm, activeConditions, arteries, playbackSpeed, gain, paperSpeed } = useSimulationStore();

  const drawGrid = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.fillStyle = '#FFF5F5';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#FFB3B3';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= w; x += SMALL_SQ_PX) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += SMALL_SQ_PX) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke(); }
    ctx.strokeStyle = '#FF8888';
    ctx.lineWidth = 0.8;
    for (let x = 0; x <= w; x += LARGE_SQ_PX) { ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); ctx.stroke(); }
    for (let y = 0; y <= h; y += LARGE_SQ_PX) { ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); ctx.stroke(); }
  }, []);

  /** Waveform (1 ms samples, one cycle) for the current lead / custom electrode. */
  const getWave = useCallback((sim: SimulationState): Float32Array => {
    const cv = customVecRef.current, cp = customPosRef.current;
    const key = cp ? `pos:${cp.join(',')}` : cv ? `vec:${cv.join(',')}` : `lead:${leadName}`;
    const cached = waveRef.current;
    if (cached.sim === sim && cached.key === key && cached.wave) return cached.wave;
    let wave: Float32Array;
    if (cp) wave = projectLead(sim, unit(cp), 1);
    else if (cv) wave = projectLead(sim, unit(cv), 1);
    else wave = projectLead(sim, STANDARD_LEAD_VECTORS[leadName], PRECORDIAL_SCALE[leadName] ?? 1);
    waveRef.current = { key, sim, wave };
    return wave;
  }, [leadName]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    updateSimulation({ heartRateBpm, activeConditions, arteries });
    const pxPerMv = PX_PER_MV_BASE * (gain / 10);
    const pxPerSimMs = (paperSpeed * SMALL_SQ_PX) / 1000;
    const msPerPx = 1 / pxPerSimMs;
    const nCols = width;
    if (colsRef.current.length !== nCols * 4) { colsRef.current = new Float32Array(nCols * 4); headRef.current = 0; }

    const animate = (timestamp: number) => {
      if (lastTimeRef.current === null) lastTimeRef.current = timestamp;
      const dtReal = Math.min(100, timestamp - lastTimeRef.current);
      lastTimeRef.current = timestamp;

      const sim = getSimulationState();
      const wave = getWave(sim);
      const cols = colsRef.current;

      pxAccRef.current += dtReal * playbackSpeed * pxPerSimMs;
      while (pxAccRef.current >= 1) {
        const t0 = simTimeRef.current;
        const n = Math.max(1, Math.round(msPerPx));
        const first = sampleWave(wave, t0);
        let lo = first, hi = first, loT = 0, hiT = 0, last = first;
        for (let k = 1; k < n; k++) {
          const v = sampleWave(wave, t0 + k);
          if (v < lo) { lo = v; loT = k; }
          if (v > hi) { hi = v; hiT = k; }
          last = v;
        }
        const o = headRef.current * 4;
        cols[o] = first; cols[o + 1] = loT <= hiT ? lo : hi; cols[o + 2] = loT <= hiT ? hi : lo; cols[o + 3] = last;
        headRef.current = (headRef.current + 1) % nCols;
        simTimeRef.current = t0 + msPerPx;
        pxAccRef.current -= 1;
      }

      // ── Draw ──────────────────────────────────────────────────────────────
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (showGrid) drawGrid(ctx, width, height);
      else { ctx.fillStyle = '#FFF5F5'; ctx.fillRect(0, 0, width, height); }

      const baseline = height / 2;
      ctx.beginPath();
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 1.25;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (let i = 0; i < nCols; i++) {
        const o = ((headRef.current + i) % nCols) * 4;
        const x = i + 0.5;
        const y0 = baseline - cols[o] * pxPerMv;
        if (i === 0) ctx.moveTo(x, y0); else ctx.lineTo(x, y0);
        ctx.lineTo(x, baseline - cols[o + 1] * pxPerMv);
        ctx.lineTo(x, baseline - cols[o + 2] * pxPerMv);
        ctx.lineTo(x, baseline - cols[o + 3] * pxPerMv);
      }
      ctx.stroke();

      if (showGrid) {
        ctx.fillStyle = '#333333';
        ctx.font = `bold ${LARGE_SQ_PX * 0.7}px monospace`;
        ctx.fillText(label ?? leadName, SMALL_SQ_PX * 2, LARGE_SQ_PX * 0.8);
      }

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(rafRef.current);
      lastTimeRef.current = null;
    };
  }, [
    leadName, width, height, showGrid, label,
    heartRateBpm, activeConditions, arteries, playbackSpeed, gain, paperSpeed,
    drawGrid, getWave,
  ]);

  // Reset buffer when parameters change
  useEffect(() => {
    colsRef.current.fill(0);
    headRef.current = 0;
    simTimeRef.current = 0;
    pxAccRef.current = 0;
  }, [heartRateBpm, activeConditions, arteries, playbackSpeed, gain, paperSpeed]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ display: 'block', width, height }}
    />
  );
}
