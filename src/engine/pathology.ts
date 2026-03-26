/**
 * pathology.ts
 * Modifications to the cardiac vector loop per pathology.
 *
 * Architecture (Phase 5):
 *   - CONDUCTION presets control QRS morphology + secondary ST/T changes
 *   - ARTERY occlusions add injury-current ST vectors (additive, combinable)
 *   - getCombinedPathology() merges both into one set of parameters
 */

import type { Vec3, BezierSegment3D, CycleTimings } from './cardiac-vector';
import { DEFAULT_QRS_SEGMENTS } from './cardiac-vector';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ConductionPreset {
  id: string;
  name: string;
  qrsSegments: BezierSegment3D[];
  /** Secondary ST changes (e.g. LBBB discordance, LVH strain) */
  stVector: Vec3;
  timingOverrides: Partial<CycleTimings>;
}

export interface CombinedPathology {
  qrsSegments: BezierSegment3D[];
  stVector: Vec3;
  timingOverrides: Partial<CycleTimings>;
}

// ── QRS loop variants ────────────────────────────────────────────────────────

// LBBB: no septal Q (initial forces leftward), broad slurred R in I/aVL/V5-V6,
// terminal forces superior → mean axis -40° to -60° (left axis deviation).
// Frank: net X strongly positive (leftward), net Y negative (superior).
const LBBB_QRS: BezierSegment3D[] = [
  // Phase 1: no septal deflection — initial forces leftward (LBB blocked, RBB conducts first)
  { p0: [0,0,0],          p1: [0.05,0.02,0.04],   p2: [0.12,0.04,0.06],   p3: [0.18,0.05,0.06] },
  // Phase 2: LV free wall — broad, strongly leftward, initially inferior then turning superior
  { p0: [0.18,0.05,0.06], p1: [0.50,0.25,-0.05],  p2: [1.00,0.30,-0.20],  p3: [1.30,0.10,-0.35] },
  // Phase 3: peak — leftward, now superior (negative Y)
  { p0: [1.30,0.10,-0.35],p1: [1.35,-0.15,-0.40], p2: [1.20,-0.30,-0.38], p3: [0.70,-0.35,-0.25] },
  // Phase 4: terminal return — superior, leftward
  { p0: [0.70,-0.35,-0.25],p1:[0.30,-0.25,-0.12],  p2: [0.08,-0.10,-0.04], p3: [0,0,0] },
];

const RBBB_QRS: BezierSegment3D[] = [
  ...DEFAULT_QRS_SEGMENTS.slice(0, 3),
  { p0: [0.50,0.05,-0.25], p1: [0.10,-0.10,0.05], p2: [-0.20,-0.05,0.20], p3: [-0.30,-0.05,0.25] },
  { p0: [-0.30,-0.05,0.25], p1: [-0.20,-0.02,0.15], p2: [-0.08,0,0.05], p3: [0,0,0] },
];

/** WPW (Type A — left posterior pathway): short PR, delta wave, wide QRS */
const WPW_QRS: BezierSegment3D[] = [
  // Delta wave: slow initial slurring leftward + inferior + anterior
  { p0: [0,0,0], p1: [0.06,0.04,0.05], p2: [0.14,0.08,0.09], p3: [0.22,0.12,0.10] },
  // Transition into main free-wall depolarization
  { p0: [0.22,0.12,0.10], p1: [0.40,0.28,0.04], p2: [0.70,0.52,-0.10], p3: [1.00,0.65,-0.18] },
  // Peak and turning
  { p0: [1.00,0.65,-0.18], p1: [1.05,0.52,-0.28], p2: [0.82,0.25,-0.30], p3: [0.45,0.05,-0.22] },
  // Terminal return
  { p0: [0.45,0.05,-0.22], p1: [0.18,-0.12,-0.12], p2: [0.05,-0.08,-0.04], p3: [0,0,0] },
];

// LVH: hypertrophied LV dominates — large leftward amplitude, terminal forces superior.
// Mean axis ~-20° to -40° (mild left axis deviation).
// Frank: very strong positive X, net Y slightly negative (superior terminal forces).
const LVH_QRS: BezierSegment3D[] = [
  // Phase 1: normal septal (rightward/anterior)
  { p0: [0,0,0],           p1: [-0.03,0.01,0.06],  p2: [-0.07,0.02,0.10],  p3: [-0.10,0.03,0.12] },
  // Phase 2: massively enlarged LV free wall — high amplitude leftward, inferior
  { p0: [-0.10,0.03,0.12], p1: [0.30,0.28,0.05],   p2: [0.90,0.45,-0.10],  p3: [1.60,0.35,-0.22] },
  // Phase 3: peak — leftward, turning superior (strain pattern)
  { p0: [1.60,0.35,-0.22], p1: [1.70,0.05,-0.28],  p2: [1.50,-0.25,-0.30], p3: [0.90,-0.35,-0.22] },
  // Phase 4: terminal — leftward, superior return
  { p0: [0.90,-0.35,-0.22],p1: [0.40,-0.20,-0.10],  p2: [0.10,-0.05,-0.02], p3: [0,0,0] },
];

// RVH: RV dominates — mean axis +100° to +150° (right axis deviation).
// Frank: net X strongly negative (rightward), net Y positive (inferior), net Z positive (anterior).
// Produces tall R in V1, deep S in V5-V6, right axis, dominant R in aVR.
const RVH_QRS: BezierSegment3D[] = [
  // Phase 1: initial forces rightward + anterior (RV depolarizes early in RVH)
  { p0: [0,0,0],            p1: [-0.05,0.03,0.12],  p2: [-0.15,0.08,0.22],  p3: [-0.25,0.14,0.28] },
  // Phase 2: dominant RV free wall — strongly rightward, inferior, anterior
  { p0: [-0.25,0.14,0.28],  p1: [-0.55,0.38,0.34],  p2: [-0.90,0.58,0.28],  p3: [-1.10,0.62,0.18] },
  // Phase 3: peak and turning — rightward, inferior
  { p0: [-1.10,0.62,0.18],  p1: [-1.00,0.50,0.05],  p2: [-0.65,0.28,-0.08], p3: [-0.20,0.08,-0.05] },
  // Phase 4: terminal return
  { p0: [-0.20,0.08,-0.05], p1: [-0.08,0.03,-0.01],  p2: [-0.02,0.01,0.00],  p3: [0,0,0] },
];

// ── Conduction presets (dropdown) ────────────────────────────────────────────

export const CONDUCTION_PRESETS: Record<string, ConductionPreset> = {
  normal: {
    id: 'normal',
    name: 'Normal Sinus Rhythm',
    qrsSegments: DEFAULT_QRS_SEGMENTS,
    stVector: [0, 0, 0],
    timingOverrides: {},
  },
  lbbb: {
    id: 'lbbb',
    name: 'Left Bundle Branch Block',
    qrsSegments: LBBB_QRS,
    stVector: [-0.15, 0.00, 0.10],
    timingOverrides: { qrsDuration: 140 },
  },
  rbbb: {
    id: 'rbbb',
    name: 'Right Bundle Branch Block',
    qrsSegments: RBBB_QRS,
    stVector: [0, 0, 0],
    timingOverrides: { qrsDuration: 130 },
  },
  lvh: {
    id: 'lvh',
    name: 'Left Ventricular Hypertrophy',
    qrsSegments: LVH_QRS,
    stVector: [-0.18, 0.00, -0.12],  // lateral strain ST-T changes
    timingOverrides: {},
  },
  rvh: {
    id: 'rvh',
    name: 'Right Ventricular Hypertrophy',
    qrsSegments: RVH_QRS,
    stVector: [0.12, 0.00, -0.10],   // RV strain: STE V1-V2, STD lateral
    timingOverrides: {},
  },
  wpw: {
    id: 'wpw',
    name: 'WPW (Type A)',
    qrsSegments: WPW_QRS,
    stVector: [0, 0, 0],
    timingOverrides: { prDuration: 40, qrsDuration: 130 },
  },
};

// ── Artery occlusion ST vectors ──────────────────────────────────────────────
// From VECTOR_REFERENCE.md pathology_st_vectors (proximal patterns).
// The ST injury vector points TOWARD the ischemic zone.

export const ARTERY_ST_VECTORS: Record<string, Vec3> = {
  lad: [0.25, -0.10, 0.50],   // Anterior STEMI: STE V1–V4, reciprocal II/III/aVF
  rca: [-0.05, 0.50, 0.10],   // Inferior STEMI: STE II, III, aVF, reciprocal I/aVL
  lcx: [0.40, 0.10, -0.20],   // Lateral STEMI:  STE I, aVL, V5–V6
};

// ── Combine conduction preset + artery occlusions ────────────────────────────

export function getCombinedPathology(
  conductionId: string,
  arteries: { lad: boolean; lcx: boolean; rca: boolean },
): CombinedPathology {
  const preset = CONDUCTION_PRESETS[conductionId] ?? CONDUCTION_PRESETS['normal']!;

  // Start with the conduction preset's secondary ST vector
  const st: Vec3 = [preset.stVector[0], preset.stVector[1], preset.stVector[2]];

  // Add ST injury vectors for each occluded artery
  for (const [key, patent] of Object.entries(arteries)) {
    if (!patent && ARTERY_ST_VECTORS[key]) {
      const v = ARTERY_ST_VECTORS[key]!;
      st[0] += v[0];
      st[1] += v[1];
      st[2] += v[2];
    }
  }

  return {
    qrsSegments: preset.qrsSegments,
    stVector: st,
    timingOverrides: preset.timingOverrides,
  };
}

// ── Legacy compat: keep PATHOLOGY_PRESETS for any code still referencing it ──
export const PATHOLOGY_PRESETS = CONDUCTION_PRESETS;
