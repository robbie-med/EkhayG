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

// ── Helpers ──────────────────────────────────────────────────────────────────

function scaleQRS(
  segs: BezierSegment3D[], sx: number, sy: number, sz: number,
): BezierSegment3D[] {
  return segs.map((s) => ({
    p0: [s.p0[0] * sx, s.p0[1] * sy, s.p0[2] * sz],
    p1: [s.p1[0] * sx, s.p1[1] * sy, s.p1[2] * sz],
    p2: [s.p2[0] * sx, s.p2[1] * sy, s.p2[2] * sz],
    p3: [s.p3[0] * sx, s.p3[1] * sy, s.p3[2] * sz],
  }));
}

// ── QRS loop variants ────────────────────────────────────────────────────────

const LBBB_QRS: BezierSegment3D[] = [
  { p0: [0,0,0], p1: [0.05,0.02,-0.03], p2: [0.10,0.05,-0.05], p3: [0.10,0.08,-0.05] },
  { p0: [0.10,0.08,-0.05], p1: [0.40,0.30,-0.15], p2: [0.90,0.60,-0.30], p3: [1.30,0.70,-0.40] },
  { p0: [1.30,0.70,-0.40], p1: [1.20,0.50,-0.45], p2: [0.80,0.20,-0.40], p3: [0.40,-0.05,-0.30] },
  { p0: [0.40,-0.05,-0.30], p1: [0.20,-0.15,-0.20], p2: [0.05,-0.08,-0.08], p3: [0,0,0] },
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
    qrsSegments: scaleQRS(DEFAULT_QRS_SEGMENTS, 1.8, 1.2, 0.8),
    stVector: [-0.15, 0.00, -0.10],
    timingOverrides: {},
  },
  rvh: {
    id: 'rvh',
    name: 'Right Ventricular Hypertrophy',
    qrsSegments: scaleQRS(DEFAULT_QRS_SEGMENTS, 0.6, 1.0, 1.5),
    stVector: [0.10, 0.00, -0.10],
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
