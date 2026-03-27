/**
 * pathology.ts — compound cardiac condition model.
 *
 * Each condition modifies one or more phases of the cardiac vector:
 *   pWaveSegments  → atrial depolarization loop (LAE, RAE)
 *   qrsSegments    → ventricular depolarization loop (BBB, WPW, LVH, RVH)
 *   tWaveSegments  → ventricular repolarization loop (strain, discordance)
 *   stVector       → DC injury current during ST segment + T-wave fade (ischemia)
 *   timingOverrides → PR/QRS/QT durations
 *
 * Multiple conditions are ADDITIVE where physics allows:
 *   - ST vectors are always summed
 *   - P-wave: LAE + RAE combine by evaluating both and summing
 *   - QRS: conduction presets dominate; hypertrophy scales amplitude
 *   - T-wave: hypertrophy strain + conduction discordance are prioritised
 */

import type { Vec3, BezierSegment3D, CycleTimings } from './cardiac-vector';
import {
  DEFAULT_QRS_SEGMENTS,
  T_WAVE_SEGMENTS,
  P_WAVE_SEGMENTS,
} from './cardiac-vector';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConditionCategory = 'conduction' | 'hypertrophy' | 'atrial';

export interface ConditionPreset {
  id: string;
  name: string;
  category: ConditionCategory;
  description: string;
  /** Override P-wave loop (atrial conditions) */
  pWaveSegments?: BezierSegment3D[];
  /** Override QRS loop (conduction / hypertrophy) */
  qrsSegments?: BezierSegment3D[];
  /** Override T-wave loop (strain / discordance) */
  tWaveSegments?: BezierSegment3D[];
  /** Additive ST injury vector */
  stVector?: Vec3;
  timingOverrides: Partial<CycleTimings>;
  /** Hex color for 3D condition vector arrow */
  vectorColor: string;
}

export interface CombinedPathology {
  pWaveSegments: BezierSegment3D[];
  qrsSegments: BezierSegment3D[];
  tWaveSegments: BezierSegment3D[];
  stVector: Vec3;
  timingOverrides: Partial<CycleTimings>;
}

// ── P-wave loop variants ───────────────────────────────────────────────────────

// LAE (Left Atrial Enlargement): broad bifid P, large late leftward+posterior forces.
// Clinical: P duration > 120ms, bifid P in II, deep negative in V1.
const LAE_P: BezierSegment3D[] = [
  // Initial RA depol: rightward, inferior (normal)
  { p0: [0,0,0],           p1: [-0.04,0.04,0.03],  p2: [-0.06,0.05,0.02],  p3: [-0.04,0.04,0.01] },
  // Enlarged LA: large late leftward + posterior (bifid notch)
  { p0: [-0.04,0.04,0.01], p1: [ 0.06,0.06,-0.06], p2: [ 0.18,0.08,-0.14], p3: [ 0.22,0.10,-0.16] },
  // Return
  { p0: [ 0.22,0.10,-0.16],p1: [ 0.14,0.05,-0.08], p2: [ 0.05,0.02,-0.02], p3: [0,0,0] },
];

// RAE (Right Atrial Enlargement): tall peaked P, large initial rightward+inferior forces.
// Clinical: P amplitude > 0.25 mV, peaked P in II/III/aVF (P pulmonale).
const RAE_P: BezierSegment3D[] = [
  // Large initial rightward+inferior RA depol (enlarged RA fires harder)
  { p0: [0,0,0],           p1: [-0.12,0.12,0.06],  p2: [-0.20,0.20,0.05],  p3: [-0.18,0.22,0.03] },
  // Normal small LA terminal
  { p0: [-0.18,0.22,0.03], p1: [-0.05,0.12,0.01],  p2: [ 0.02,0.04,0.00],  p3: [0,0,0] },
];

// ── QRS loop variants ─────────────────────────────────────────────────────────

// LBBB: Axis target -45° (left axis deviation).
// Broad notched R in I/aVL/V5-V6, absent septal Q.
// Mean vector: strongly leftward (X+), moderately superior (Y-).
const LBBB_QRS: BezierSegment3D[] = [
  { p0: [0,0,0],           p1: [0.08,0.00,0.04],   p2: [0.18,-0.02,0.06],  p3: [0.30,-0.05,0.06] },
  { p0: [0.30,-0.05,0.06], p1: [0.60,-0.15,-0.05], p2: [1.00,-0.30,-0.15], p3: [1.30,-0.45,-0.25] },
  { p0: [1.30,-0.45,-0.25],p1: [1.35,-0.60,-0.35], p2: [1.10,-0.70,-0.32], p3: [0.75,-0.65,-0.22] },
  { p0: [0.75,-0.65,-0.22],p1: [0.40,-0.45,-0.10], p2: [0.12,-0.18,-0.04], p3: [0,0,0] },
];

// RBBB: Axis target +100° (right axis deviation).
// RSR' in V1-V2, wide terminal S in I/V5-V6.
// Mean vector: mildly rightward (X-), strongly inferior (Y+).
const RBBB_QRS: BezierSegment3D[] = [
  // Initial normal septal + early LV depol (normal initial forces)
  { p0: [0,0,0],           p1: [-0.03,0.04,0.06],  p2: [-0.07,0.08,0.10],  p3: [-0.10,0.12,0.12] },
  // LV free wall (leftward, inferior)
  { p0: [-0.10,0.12,0.12], p1: [0.15,0.35,0.06],   p2: [0.50,0.60,-0.05],  p3: [0.70,0.70,-0.12] },
  // Turning point — then delayed RV depol swings rightward + anterior
  { p0: [0.70,0.70,-0.12], p1: [0.55,0.65,-0.18],  p2: [0.20,0.55,-0.10],  p3: [-0.10,0.50,0.10] },
  // Terminal RV: rightward + anterior (S in I, R' in V1)
  { p0: [-0.10,0.50,0.10], p1: [-0.35,0.45,0.25],  p2: [-0.45,0.30,0.30],  p3: [-0.40,0.20,0.25] },
  // Return to baseline
  { p0: [-0.40,0.20,0.25], p1: [-0.25,0.10,0.12],  p2: [-0.08,0.03,0.04],  p3: [0,0,0] },
];

// WPW Type A: Axis target ~+40° (mildly leftward + inferior).
// Delta wave with tall R in V1-V2 (positive delta, left-sided pathway).
// Short PR, slurred upstroke, wide QRS.
const WPW_QRS: BezierSegment3D[] = [
  // Delta wave: slow initial slur, leftward + inferior + anterior
  { p0: [0,0,0],          p1: [0.08,0.08,0.08],  p2: [0.18,0.16,0.12],  p3: [0.30,0.25,0.10] },
  // Main depol: strongly leftward + inferior
  { p0: [0.30,0.25,0.10], p1: [0.50,0.45,0.02],  p2: [0.80,0.70,-0.10], p3: [1.00,0.80,-0.18] },
  // Terminal
  { p0: [1.00,0.80,-0.18],p1: [0.90,0.60,-0.25], p2: [0.55,0.30,-0.22], p3: [0.25,0.10,-0.12] },
  { p0: [0.25,0.10,-0.12],p1: [0.10,0.02,-0.05], p2: [0.03,0.00,-0.01], p3: [0,0,0] },
];

// LVH: Axis target -15° (leftward, mildly superior = borderline LAD).
// High amplitude leftward forces (tall R in V5-V6), deep S in V1-V2.
// Mean vector: strongly leftward (X+), mildly superior (Y-).
const LVH_QRS: BezierSegment3D[] = [
  { p0: [0,0,0],           p1: [-0.03,0.02,0.06],  p2: [-0.07,0.05,0.10],  p3: [-0.10,0.08,0.12] },
  { p0: [-0.10,0.08,0.12], p1: [0.30,0.25,0.05],   p2: [0.85,0.20,-0.10],  p3: [1.50,0.05,-0.22] },
  { p0: [1.50,0.05,-0.22], p1: [1.60,-0.15,-0.28], p2: [1.35,-0.40,-0.28], p3: [0.80,-0.38,-0.20] },
  { p0: [0.80,-0.38,-0.20],p1: [0.35,-0.20,-0.08], p2: [0.10,-0.06,-0.02], p3: [0,0,0] },
];

// RVH: Axis target +120° (right axis deviation).
// Dominant R in V1, deep S in V5-V6, right axis.
// Mean vector: rightward (X-), inferior (Y+), with Y/X ratio for 120°.
const RVH_QRS: BezierSegment3D[] = [
  { p0: [0,0,0],            p1: [-0.04,0.08,0.12],  p2: [-0.10,0.18,0.22],  p3: [-0.18,0.28,0.28] },
  { p0: [-0.18,0.28,0.28],  p1: [-0.35,0.55,0.28],  p2: [-0.55,0.80,0.18],  p3: [-0.65,0.90,0.10] },
  { p0: [-0.65,0.90,0.10],  p1: [-0.55,0.72,0.00],  p2: [-0.35,0.48,-0.08], p3: [-0.15,0.28,-0.04] },
  { p0: [-0.15,0.28,-0.04], p1: [-0.06,0.12,-0.01], p2: [-0.02,0.04,0.00],  p3: [0,0,0] },
];

// BVH (biventricular): both ventricles hypertrophied — high voltage all leads,
// axis near-normal or mild LAD (competing forces). Target ~+30°.
const BVH_QRS: BezierSegment3D[] = [
  { p0: [0,0,0],           p1: [-0.04,0.05,0.12],  p2: [-0.12,0.12,0.20],  p3: [-0.18,0.18,0.24] },
  { p0: [-0.18,0.18,0.24], p1: [0.20,0.45,0.08],   p2: [0.70,0.70,-0.08],  p3: [1.20,0.70,-0.15] },
  { p0: [1.20,0.70,-0.15], p1: [1.25,0.40,-0.20],  p2: [0.90,0.10,-0.18],  p3: [0.45,0.05,-0.12] },
  { p0: [0.45,0.05,-0.12], p1: [0.15,0.00,-0.04],  p2: [0.04,0.00,0.00],   p3: [0,0,0] },
];

// ── T-wave loop variants ───────────────────────────────────────────────────────

const LBBB_T: BezierSegment3D[] = [
  { p0: [0,0,0],            p1: [-0.06,0.03,0.02],  p2: [-0.13,0.08,0.04],  p3: [-0.18,0.12,0.05] },
  { p0: [-0.18,0.12,0.05],  p1: [-0.16,0.10,0.04],  p2: [-0.10,0.06,0.02],  p3: [0,0,0] },
];

const RBBB_T: BezierSegment3D[] = [
  { p0: [0,0,0],           p1: [0.08,0.04,-0.04],  p2: [0.18,0.10,-0.08],  p3: [0.24,0.14,-0.10] },
  { p0: [0.24,0.14,-0.10], p1: [0.20,0.12,-0.08],  p2: [0.12,0.06,-0.04],  p3: [0,0,0] },
];

// LVH lateral strain: T inverted in I, aVL, V5-V6 (rightward+posterior T loop)
const LVH_T: BezierSegment3D[] = [
  { p0: [0,0,0],            p1: [-0.05,0.02,-0.07],  p2: [-0.10,0.04,-0.15],  p3: [-0.12,0.06,-0.18] },
  { p0: [-0.12,0.06,-0.18], p1: [-0.10,0.05,-0.14],  p2: [-0.06,0.02,-0.08],  p3: [0,0,0] },
];

// RVH right precordial strain: T inverted V1-V3 (leftward+posterior T loop)
const RVH_T: BezierSegment3D[] = [
  { p0: [0,0,0],           p1: [0.07,0.03,-0.07],  p2: [0.15,0.06,-0.15],  p3: [0.18,0.08,-0.20] },
  { p0: [0.18,0.08,-0.20], p1: [0.15,0.06,-0.15],  p2: [0.08,0.03,-0.08],  p3: [0,0,0] },
];

const WPW_T: BezierSegment3D[] = [
  { p0: [0,0,0],            p1: [-0.04,0.05,-0.03],  p2: [-0.10,0.12,-0.06], p3: [-0.14,0.18,-0.08] },
  { p0: [-0.14,0.18,-0.08], p1: [-0.12,0.14,-0.06],  p2: [-0.06,0.07,-0.03], p3: [0,0,0] },
];

// ── Condition presets ──────────────────────────────────────────────────────────

export const CONDITION_PRESETS: Record<string, ConditionPreset> = {
  // ── Conduction ────────────────────────────────────────────────────────────
  lbbb: {
    id: 'lbbb', name: 'LBBB', category: 'conduction',
    description: 'Left Bundle Branch Block — broad notched R in I/V5-V6, no septal Q, left axis deviation',
    qrsSegments: LBBB_QRS,
    tWaveSegments: LBBB_T,
    timingOverrides: { qrsDuration: 140 },
    vectorColor: '#aa44ff',
  },
  rbbb: {
    id: 'rbbb', name: 'RBBB', category: 'conduction',
    description: 'Right Bundle Branch Block — RSR\' in V1, wide S in I/V5-V6, T inversion V1',
    qrsSegments: RBBB_QRS,
    tWaveSegments: RBBB_T,
    timingOverrides: { qrsDuration: 130 },
    vectorColor: '#4488ff',
  },
  wpw: {
    id: 'wpw', name: 'WPW', category: 'conduction',
    description: 'Wolff–Parkinson–White (Type A) — short PR, delta wave, wide QRS',
    qrsSegments: WPW_QRS,
    tWaveSegments: WPW_T,
    timingOverrides: { prDuration: 40, qrsDuration: 130 },
    vectorColor: '#ff8800',
  },

  // ── Hypertrophy ────────────────────────────────────────────────────────────
  lvh: {
    id: 'lvh', name: 'LVH', category: 'hypertrophy',
    description: 'Left Ventricular Hypertrophy — tall R V5-V6, deep S V1-V2, lateral strain, left axis',
    qrsSegments: LVH_QRS,
    tWaveSegments: LVH_T,
    timingOverrides: {},
    vectorColor: '#ff4444',
  },
  rvh: {
    id: 'rvh', name: 'RVH', category: 'hypertrophy',
    description: 'Right Ventricular Hypertrophy — tall R V1, right axis deviation, RV strain T-wave',
    qrsSegments: RVH_QRS,
    tWaveSegments: RVH_T,
    timingOverrides: {},
    vectorColor: '#44bbff',
  },

  // ── Atrial ────────────────────────────────────────────────────────────────
  lae: {
    id: 'lae', name: 'LAE', category: 'atrial',
    description: 'Left Atrial Enlargement — broad bifid P (P mitrale), deep negative P in V1, P > 120ms',
    pWaveSegments: LAE_P,
    timingOverrides: { pDuration: 130 },
    vectorColor: '#ffcc00',
  },
  rae: {
    id: 'rae', name: 'RAE', category: 'atrial',
    description: 'Right Atrial Enlargement — tall peaked P in II/III/aVF (P pulmonale), P ≥ 0.25mV',
    pWaveSegments: RAE_P,
    timingOverrides: { pDuration: 90 },
    vectorColor: '#00ddaa',
  },
};

// Legacy name kept for backward compatibility
export const CONDUCTION_PRESETS = CONDITION_PRESETS;

// ── Artery occlusion ST vectors ───────────────────────────────────────────────

export const ARTERY_ST_VECTORS: Record<string, Vec3> = {
  lad: [ 0.25, -0.10,  0.50],
  d1:  [ 0.30,  0.00,  0.35],
  lcx: [ 0.40,  0.10, -0.20],
  om:  [ 0.35,  0.05, -0.30],
  rca: [-0.05,  0.50,  0.10],
  pda: [ 0.05,  0.45, -0.10],
};

// ── Combine multiple active conditions ────────────────────────────────────────

export function getCombinedPathology(
  activeConditions: string[],
  arteries: Record<string, boolean>,
): CombinedPathology {
  const active = activeConditions
    .map((id) => CONDITION_PRESETS[id])
    .filter(Boolean) as ConditionPreset[];

  // ── P-wave ─────────────────────────────────────────────────────────────────
  // Atrial conditions can combine: evaluate each P-wave loop and sum the vectors.
  // A combined P-wave Segments object is built from pre-sampled additive evaluation.
  // For simplicity: if one atrial condition, use its loop directly.
  // If both LAE and RAE, use a combined loop (LAE+RAE = P biatriale).
  const atrialActive = active.filter((p) => p.category === 'atrial' && p.pWaveSegments);
  let pWaveSegments: BezierSegment3D[] = P_WAVE_SEGMENTS;
  if (atrialActive.length === 1) {
    pWaveSegments = atrialActive[0]!.pWaveSegments!;
  } else if (atrialActive.length >= 2) {
    // Combine by creating offset control points (LAE + RAE vectors summed)
    // Use LAE as the base (more complex shape) and add RAE's initial amplitude
    pWaveSegments = LAE_P.map((seg, i) => {
      const rae = RAE_P[i] ?? RAE_P[RAE_P.length - 1]!;
      return {
        p0: addVec(seg.p0, rae.p0),
        p1: addVec(seg.p1, rae.p1),
        p2: addVec(seg.p2, rae.p2),
        p3: addVec(seg.p3, rae.p3),
      } satisfies BezierSegment3D;
    });
  }

  // ── QRS ────────────────────────────────────────────────────────────────────
  // Conduction presets (BBB, WPW) dominate QRS shape — use first found.
  // Hypertrophy (LVH, RVH) can combine: if both, use BVH; else use the one found.
  const conductionPreset = active.find((p) => p.category === 'conduction' && p.qrsSegments);
  const hypertrophyActive = active.filter((p) => p.category === 'hypertrophy' && p.qrsSegments);

  let qrsSegments: BezierSegment3D[] = DEFAULT_QRS_SEGMENTS;
  if (conductionPreset?.qrsSegments) {
    qrsSegments = conductionPreset.qrsSegments;
  } else if (hypertrophyActive.length >= 2) {
    qrsSegments = BVH_QRS;
  } else if (hypertrophyActive.length === 1) {
    qrsSegments = hypertrophyActive[0]!.qrsSegments!;
  }

  // ── T-wave ─────────────────────────────────────────────────────────────────
  // Priority: conduction preset > hypertrophy > default
  const tWaveSource =
    active.find((p) => p.category === 'conduction' && p.tWaveSegments) ??
    active.find((p) => p.category === 'hypertrophy' && p.tWaveSegments);
  const tWaveSegments: BezierSegment3D[] = tWaveSource?.tWaveSegments ?? T_WAVE_SEGMENTS;

  // ── ST vector (additive) ───────────────────────────────────────────────────
  const st: Vec3 = [0, 0, 0];
  for (const preset of active) {
    if (preset.stVector) {
      st[0] += preset.stVector[0];
      st[1] += preset.stVector[1];
      st[2] += preset.stVector[2];
    }
  }
  for (const [key, patent] of Object.entries(arteries)) {
    if (!patent && ARTERY_ST_VECTORS[key]) {
      const v = ARTERY_ST_VECTORS[key]!;
      st[0] += v[0]; st[1] += v[1]; st[2] += v[2];
    }
  }

  // ── Timing (merge, later conditions override earlier) ─────────────────────
  const timingOverrides: Partial<CycleTimings> = {};
  for (const preset of active) {
    Object.assign(timingOverrides, preset.timingOverrides);
  }

  return { pWaveSegments, qrsSegments, tWaveSegments, stVector: st, timingOverrides };
}

function addVec(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export const PATHOLOGY_PRESETS = CONDITION_PRESETS;
