/**
 * EKGStrip.tsx
 * Single-lead EKG tracing on an HTML5 Canvas.
 * Scrolling strip — new data appears at right, scrolls left.
 *
 * EKG paper standards (from TECHNICAL_SPEC.md):
 *   - Small square: 1mm × 1mm = 0.04s × 0.1mV
 *   - Large square: 5mm × 5mm = 0.20s × 0.5mV
 *   - Standard speed: 25mm/s  → 1px = 1mm at CSS pixel density 1
 *   - Standard gain:  10mm/mV
 *   - Grid color: #FFB3B3 (light pink/red)
 *   - Background: #FFF5F5
 */

import { useRef, useEffect, useCallback } from 'react';
import { getCardiacVector, getDefaultTimings } from '../engine/cardiac-vector';
import type { Vec3 } from '../engine/cardiac-vector';
import { computeLeadVoltage, computeLeadVectors, ELECTRODE_POSITIONS } from '../engine/lead-calculator';
import { getCombinedPathology } from '../engine/pathology';
import { useSimulationStore } from '../store/simulation-store';
import type { LeadName } from '../engine/lead-calculator';

// ── EKG paper constants (all in canvas pixels — 1px = 1mm) ─────────────────
const SMALL_SQ_PX = 4;   // 1mm at display density — scale up so it's visible on screen
const LARGE_SQ_PX = SMALL_SQ_PX * 5; // 5 small = 1 large square

// At 25mm/s: 25px/s → rate of pixels per millisecond
const MM_PER_S = 25;
const PX_PER_MS = (MM_PER_S * SMALL_SQ_PX) / 1000; // px per ms

// 10mm/mV default gain
const PX_PER_MV_BASE = 10 * SMALL_SQ_PX;

interface Props {
  leadName: LeadName;
  /** Canvas width in px */
  width?: number;
  /** Canvas height in px */
  height?: number;
  /** Optional label override */
  label?: string;
  /** Show grid and label (default true) */
  showGrid?: boolean;
  /** Override lead vector for custom electrode placement (Frank coords). */
  customLeadVector?: Vec3;
}

export function EKGStrip({
  leadName,
  width = 600,
  height = 120,
  label,
  showGrid = true,
  customLeadVector,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufferRef = useRef<number[]>([]);   // ring buffer of voltage samples
  const lastTimeRef = useRef<number | null>(null);
  const cycleTimeMsRef = useRef(0);
  const rafRef = useRef<number>(0);
  const customVecRef = useRef(customLeadVector);
  customVecRef.current = customLeadVector;

  const {
    heartRateBpm,
    activePathologyId,
    arteries,
    playbackSpeed,
    gain,
    paperSpeed,
  } = useSimulationStore();

  const leadVectors = computeLeadVectors(ELECTRODE_POSITIONS);

  const drawGrid = useCallback((ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.fillStyle = '#FFF5F5';
    ctx.fillRect(0, 0, w, h);

    // Light pink small squares
    ctx.strokeStyle = '#FFB3B3';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= w; x += SMALL_SQ_PX) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += SMALL_SQ_PX) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Darker pink large squares
    ctx.strokeStyle = '#FF8888';
    ctx.lineWidth = 0.8;
    for (let x = 0; x <= w; x += LARGE_SQ_PX) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += LARGE_SQ_PX) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const combined = getCombinedPathology(activePathologyId, arteries);
    const timings = {
      ...getDefaultTimings(heartRateBpm),
      ...combined.timingOverrides,
    };
    const cycleLen = 60000 / heartRateBpm;
    const pxPerMv = PX_PER_MV_BASE * (gain / 10);
    const pxPerMs = (paperSpeed * SMALL_SQ_PX) / 1000 * playbackSpeed;

    // Initialize buffer to fill canvas width
    if (bufferRef.current.length === 0) {
      bufferRef.current = new Array(width).fill(0);
    }

    const animate = (timestamp: number) => {
      if (lastTimeRef.current === null) lastTimeRef.current = timestamp;
      const dtMs = (timestamp - lastTimeRef.current);
      lastTimeRef.current = timestamp;

      // Advance cycle time
      cycleTimeMsRef.current = (cycleTimeMsRef.current + dtMs * playbackSpeed) % cycleLen;

      // How many pixels to advance this frame
      const pxAdvance = dtMs * pxPerMs;

      // Sample voltage at current cycle time
      const state = getCardiacVector(
        cycleTimeMsRef.current,
        timings,
        combined.stVector,
        combined.qrsSegments,
      );
      const lv = customVecRef.current ?? leadVectors[leadName];
      const voltage = computeLeadVoltage(state.vector, lv);

      // Push new sample(s) — for smooth scrolling push fractional px
      // We push one sample per frame; the scroll handles sub-pixel timing
      const buf = bufferRef.current;
      // Shift left by pxAdvance, fill rightmost with new voltage
      // Simple approach: push one sample per frame
      const samplesToAdd = Math.max(1, Math.round(pxAdvance));
      for (let i = 0; i < samplesToAdd; i++) {
        buf.push(voltage);
      }
      // Keep buffer at width samples
      if (buf.length > width) {
        buf.splice(0, buf.length - width);
      }

      // ── Draw ──────────────────────────────────────────────────────────────
      if (showGrid) {
        drawGrid(ctx, width, height);
      } else {
        ctx.fillStyle = '#FFF5F5';
        ctx.fillRect(0, 0, width, height);
      }

      // Baseline is middle of canvas
      const baseline = height / 2;

      // Draw tracing
      ctx.beginPath();
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      for (let x = 0; x < buf.length; x++) {
        const v = buf[x];
        const y = baseline - v * pxPerMv;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Lead label
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
    heartRateBpm, activePathologyId, arteries, playbackSpeed, gain, paperSpeed,
    drawGrid, leadVectors,
  ]);

  // Reset buffer when parameters change
  useEffect(() => {
    bufferRef.current = [];
    cycleTimeMsRef.current = 0;
  }, [heartRateBpm, activePathologyId, arteries, playbackSpeed, gain, paperSpeed]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ display: 'block' }}
    />
  );
}
