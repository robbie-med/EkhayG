/**
 * cardiac-vector.ts
 * Computes the 3D cardiac dipole vector V(t) = [Vx, Vy, Vz] at any point in the cardiac cycle.
 * Based on the vectorcardiographic model (Frank, 1956).
 *
 * Coordinate system (Frank convention):
 *   X: positive = leftward
 *   Y: positive = inferior (foot-ward)
 *   Z: positive = anterior (chest-ward)
 */

export type Vec3 = [number, number, number];

export interface BezierSegment3D {
  p0: Vec3;
  p1: Vec3;
  p2: Vec3;
  p3: Vec3;
}

export interface CycleTimings {
  pDuration: number;    // ms
  prDuration: number;   // ms (PR segment — isoelectric)
  qrsDuration: number;  // ms
  stDuration: number;   // ms (ST segment — isoelectric normally)
  tDuration: number;    // ms
  // TP is whatever remains
}

export function getDefaultTimings(heartRateBpm: number): CycleTimings {
  const rrMs = 60000 / heartRateBpm;
  const qrsDuration = 90;
  const pDuration = 80;
  const prDuration = 80;
  // QTc = 400ms; QT = QTc * sqrt(RR in seconds)
  const rrSec = rrMs / 1000;
  const qtMs = Math.round(400 * Math.sqrt(rrSec));
  const stDuration = 80;
  const tDuration = qtMs - qrsDuration - stDuration;
  return {
    pDuration,
    prDuration,
    qrsDuration,
    stDuration,
    tDuration: Math.max(tDuration, 120),
  };
}

function evaluateBezier(seg: BezierSegment3D, t: number): Vec3 {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  return [
    uu * u * seg.p0[0] + 3 * uu * t * seg.p1[0] + 3 * u * tt * seg.p2[0] + tt * t * seg.p3[0],
    uu * u * seg.p0[1] + 3 * uu * t * seg.p1[1] + 3 * u * tt * seg.p2[1] + tt * t * seg.p3[1],
    uu * u * seg.p0[2] + 3 * uu * t * seg.p1[2] + 3 * u * tt * seg.p2[2] + tt * t * seg.p3[2],
  ];
}

/** Evaluate a piecewise cubic Bezier curve at normalized parameter t ∈ [0,1]. */
function evaluatePiecewise(segments: BezierSegment3D[], t: number): Vec3 {
  if (segments.length === 0) return [0, 0, 0];
  const n = segments.length;
  const scaled = t * n;
  const idx = Math.min(Math.floor(scaled), n - 1);
  const localT = scaled - idx;
  return evaluateBezier(segments[idx], localT);
}

/** Smooth ease-in-out (cubic hermite S-curve). */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

// ── P-wave loop (from VECTOR_REFERENCE.md) ─────────────────────────────────
const P_WAVE_SEGMENTS: BezierSegment3D[] = [
  {
    p0: [0.00, 0.00, 0.00],
    p1: [0.03, 0.02, 0.02],
    p2: [0.08, 0.06, 0.03],
    p3: [0.12, 0.08, 0.03],
  },
  {
    p0: [0.12, 0.08, 0.03],
    p1: [0.10, 0.06, 0.02],
    p2: [0.05, 0.03, 0.01],
    p3: [0.00, 0.00, 0.00],
  },
];

// ── QRS loop (from VECTOR_REFERENCE.md) ────────────────────────────────────
const QRS_SEGMENTS: BezierSegment3D[] = [
  {
    // Phase 1: Septal depolarization — L→R, anterior
    p0: [0.00, 0.00, 0.00],
    p1: [-0.03, 0.01, 0.06],
    p2: [-0.07, 0.02, 0.10],
    p3: [-0.10, 0.03, 0.12],
  },
  {
    // Phase 2a: Main free wall — leftward, inferior, slightly posterior
    p0: [-0.10, 0.03, 0.12],
    p1: [0.15, 0.20, 0.10],
    p2: [0.60, 0.50, 0.00],
    p3: [1.00, 0.70, -0.15],
  },
  {
    // Phase 2b: peak and turning
    p0: [1.00, 0.70, -0.15],
    p1: [1.10, 0.60, -0.25],
    p2: [0.90, 0.30, -0.30],
    p3: [0.50, 0.05, -0.25],
  },
  {
    // Phase 3: terminal — rightward, superior (S wave)
    p0: [0.50, 0.05, -0.25],
    p1: [0.20, -0.15, -0.15],
    p2: [0.05, -0.10, -0.05],
    p3: [0.00, 0.00, 0.00],
  },
];

// ── T-wave loop (from VECTOR_REFERENCE.md) ─────────────────────────────────
const T_WAVE_SEGMENTS: BezierSegment3D[] = [
  {
    p0: [0.00, 0.00, 0.00],
    p1: [0.10, 0.05, 0.05],
    p2: [0.25, 0.15, 0.12],
    p3: [0.35, 0.22, 0.18],
  },
  {
    p0: [0.35, 0.22, 0.18],
    p1: [0.40, 0.25, 0.15],
    p2: [0.30, 0.15, 0.08],
    p3: [0.00, 0.00, 0.00],
  },
];

export type CardiacPhase = 'p' | 'pr' | 'qrs' | 'st' | 't' | 'tp';

export interface CardiacVectorState {
  vector: Vec3;
  phase: CardiacPhase;
  /** normalized phase progress 0-1 */
  phaseT: number;
  /** ms into current cycle */
  cycleTimeMs: number;
}

/**
 * Compute the cardiac dipole vector at a given time within the cycle.
 * @param cycleTimeMs - time in ms from the start of the cycle (0 to cycleLengthMs)
 * @param timings     - segment durations
 * @param stVector    - optional additive injury vector during ST segment (for STEMI etc.)
 * @param qrsSegments - override QRS loop (for BBB etc.)
 */
export function getCardiacVector(
  cycleTimeMs: number,
  timings: CycleTimings,
  stVector: Vec3 = [0, 0, 0],
  qrsSegments: BezierSegment3D[] = QRS_SEGMENTS,
): CardiacVectorState {
  const { pDuration, prDuration, qrsDuration, stDuration, tDuration } = timings;

  const pStart = 0;
  const prStart = pStart + pDuration;
  const qrsStart = prStart + prDuration;
  const stStart = qrsStart + qrsDuration;
  const tStart = stStart + stDuration;
  const tpStart = tStart + tDuration;

  let vector: Vec3 = [0, 0, 0];
  let phase: CardiacPhase = 'tp';
  let phaseT = 0;

  if (cycleTimeMs < prStart) {
    // P-wave
    phase = 'p';
    phaseT = smoothstep(cycleTimeMs / pDuration);
    vector = evaluatePiecewise(P_WAVE_SEGMENTS, phaseT);
  } else if (cycleTimeMs < qrsStart) {
    // PR segment — isoelectric
    phase = 'pr';
    phaseT = (cycleTimeMs - prStart) / prDuration;
    vector = [0, 0, 0];
  } else if (cycleTimeMs < stStart) {
    // QRS complex
    phase = 'qrs';
    phaseT = smoothstep((cycleTimeMs - qrsStart) / qrsDuration);
    vector = evaluatePiecewise(qrsSegments, phaseT);
  } else if (cycleTimeMs < tStart) {
    // ST segment — isoelectric + optional injury vector, smoothly ramped
    phase = 'st';
    phaseT = (cycleTimeMs - stStart) / stDuration;
    // Ramp in over first 25%, sustain, ramp out over last 25%
    let stGain: number;
    if (phaseT < 0.25) {
      stGain = smoothstep(phaseT / 0.25);
    } else if (phaseT > 0.75) {
      stGain = smoothstep((1 - phaseT) / 0.25);
    } else {
      stGain = 1;
    }
    vector = [stVector[0] * stGain, stVector[1] * stGain, stVector[2] * stGain];
  } else if (cycleTimeMs < tpStart) {
    // T-wave + residual ST injury blended into early T
    phase = 't';
    phaseT = smoothstep((cycleTimeMs - tStart) / tDuration);
    const tBase = evaluatePiecewise(T_WAVE_SEGMENTS, phaseT);
    // Blend ST injury into early portion of T-wave (fades over first 40%)
    const stBlend = phaseT < 0.4 ? (1 - phaseT / 0.4) * 0.5 : 0;
    vector = [
      tBase[0] + stVector[0] * stBlend,
      tBase[1] + stVector[1] * stBlend,
      tBase[2] + stVector[2] * stBlend,
    ];
  } else {
    // TP segment — electrical diastole
    phase = 'tp';
    phaseT = 0;
    vector = [0, 0, 0];
  }

  return { vector, phase, phaseT, cycleTimeMs };
}

export { QRS_SEGMENTS as DEFAULT_QRS_SEGMENTS };
