/**
 * lead-calculator.ts
 * Computes EKG lead voltages via dot-product projection of the cardiac vector.
 *
 * V_lead(t) = dot(D(t), lead_vector)
 *
 * Lead vectors from ecg_dipole_reference.md (Malmivuo & Plonsey 1995).
 * Limb leads are unit vectors in the frontal plane.
 * Precordial leads are computed from electrode-to-heart vectors, normalized.
 */

import type { Vec3 } from './cardiac-vector';

// ── Standard electrode positions (cm from the heart centre) ───────────────────
//
// Derived from a torso cross-section of half-width 16 cm and half-depth 11 cm
// (AP diameter 22 cm) with the ventricular mass centre 1.5 cm left of the
// midline and 2.5 cm anterior of the mid-coronal plane (≈ 8.5 cm behind the
// sternum). Precordial sites on the chest surface:
//   V1 / V2  4th intercostal space, right / left sternal border (x ∓ 2.5)
//   V3       midway between V2 and V4
//   V4       5th intercostal space, mid-clavicular line (x ≈ 9.5)
//   V5       anterior axillary line (x ≈ 13), same level as V4
//   V6       mid-axillary line (x = 16, mid-coronal plane), same level as V4
// Because the heart centre lies anterior of the mid-coronal plane, V6 sits
// slightly BEHIND it: V5/V6 look at the lateral wall, not the anterior wall.
export const ELECTRODE_POSITIONS = {
  RA: [-15.0, -12.0,  -3.0] as Vec3,
  LA: [+15.0, -12.0,  -3.0] as Vec3,
  RL: [ +0.0, +20.0,  -3.0] as Vec3,
  LL: [ +6.0, +20.0,  -3.0] as Vec3,
  V1: [ -4.0,  -3.0,  +8.4] as Vec3,
  V2: [ +1.0,  -3.0,  +8.4] as Vec3,
  V3: [ +4.5,  -1.5,  +7.7] as Vec3,
  V4: [ +8.0,   0.0,  +6.4] as Vec3,
  V5: [+11.5,   0.0,  +3.9] as Vec3,
  V6: [+14.5,   0.0,  -2.5] as Vec3,
} as const;

// ── Scene-scale electrode positions (for Three.js rendering only) ─────────────
// Normalized to ~0.3 range to fit the 3D torso model.
export const ELECTRODE_POSITIONS_SCENE = {
  RA: [-0.35, -0.30,  0.00] as Vec3,
  LA: [ 0.35, -0.30,  0.00] as Vec3,
  RL: [-0.15,  0.45,  0.00] as Vec3,
  LL: [ 0.15,  0.45,  0.00] as Vec3,
  V1: [-0.05, -0.12,  0.19] as Vec3,
  V2: [ 0.05, -0.12,  0.19] as Vec3,
  V3: [ 0.11, -0.07,  0.17] as Vec3,
  V4: [ 0.17, -0.02,  0.14] as Vec3,
  V5: [ 0.24,  0.00,  0.07] as Vec3,
  V6: [ 0.30,  0.02, -0.02] as Vec3,
} as const;

// ── Standard lead vectors ─────────────────────────────────────────────────────
// Limb leads: Einthoven/Goldberger idealised frontal-plane unit vectors.
// Precordial leads: unit vector from the heart centre to the electrode
// (Wilson central terminal taken as the zero reference at infinity).

function unit(v: Vec3): Vec3 {
  const m = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / m, v[1] / m, v[2] / m];
}

export const STANDARD_LEAD_VECTORS: LeadVectors = {
  I:   [+1.000,  0.000,  0.000],
  II:  [+0.500, +0.866,  0.000],
  III: [-0.500, +0.866,  0.000],
  aVR: [-0.866, -0.500,  0.000],
  aVL: [+0.866, -0.500,  0.000],
  aVF: [ 0.000, +1.000,  0.000],
  V1: unit(ELECTRODE_POSITIONS.V1),
  V2: unit(ELECTRODE_POSITIONS.V2),
  V3: unit(ELECTRODE_POSITIONS.V3),
  V4: unit(ELECTRODE_POSITIONS.V4),
  V5: unit(ELECTRODE_POSITIONS.V5),
  V6: unit(ELECTRODE_POSITIONS.V6),
};

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/** Compute Wilson's Central Terminal from RA, LA, LL. */
export function computeWCT(ra: Vec3, la: Vec3, ll: Vec3): Vec3 {
  return [
    (ra[0] + la[0] + ll[0]) / 3,
    (ra[1] + la[1] + ll[1]) / 3,
    (ra[2] + la[2] + ll[2]) / 3,
  ];
}

/**
 * Compute scalar projection of cardiacVector onto a lead direction (dot product).
 *
 * @param cardiacVector  The 3D cardiac dipole vector at time t
 * @param leadVector     Pre-computed lead axis (used when position is not provided)
 * @param position       Optional electrode position in Frank coords (cm).
 *                       When provided, the lead vector is computed as the unit
 *                       vector from heart center [0,0,0] to the electrode position.
 *                       This is the arbitrary lead placement API.
 */
export function computeLeadVoltage(
  cardiacVector: Vec3,
  leadVector: Vec3,
  position?: Vec3,
): number {
  let lv = leadVector;
  if (position) {
    const mag = Math.sqrt(position[0] ** 2 + position[1] ** 2 + position[2] ** 2);
    if (mag > 0) {
      lv = [position[0] / mag, position[1] / mag, position[2] / mag];
    }
  }
  return (
    cardiacVector[0] * lv[0] +
    cardiacVector[1] * lv[1] +
    cardiacVector[2] * lv[2]
  );
}

export interface LeadVectors {
  I:    Vec3;
  II:   Vec3;
  III:  Vec3;
  aVR:  Vec3;
  aVL:  Vec3;
  aVF:  Vec3;
  V1:   Vec3;
  V2:   Vec3;
  V3:   Vec3;
  V4:   Vec3;
  V5:   Vec3;
  V6:   Vec3;
}

/**
 * Compute all 12 lead vectors.
 * For standard electrodes, returns the reference lead vectors directly.
 * For custom electrode positions, computes from electrode geometry.
 */
export function computeLeadVectors(
  positions: typeof ELECTRODE_POSITIONS = ELECTRODE_POSITIONS,
): LeadVectors {
  // If using standard positions, return reference lead vectors
  if (positions === ELECTRODE_POSITIONS) {
    return { ...STANDARD_LEAD_VECTORS };
  }

  // Custom electrode positions: compute from geometry
  const { RA, LA, LL, V1, V2, V3, V4, V5, V6 } = positions;
  const wct = computeWCT(RA, LA, LL);

  const leadI   = sub(LA, RA);
  const leadII  = sub(LL, RA);
  const leadIII = sub(LL, LA);

  const aVR = sub(RA, scale(add(LA, LL), 0.5));
  const aVL = sub(LA, scale(add(RA, LL), 0.5));
  const aVF = sub(LL, scale(add(RA, LA), 0.5));

  const v1 = sub(V1, wct);
  const v2 = sub(V2, wct);
  const v3 = sub(V3, wct);
  const v4 = sub(V4, wct);
  const v5 = sub(V5, wct);
  const v6 = sub(V6, wct);

  return {
    I:   leadI,
    II:  leadII,
    III: leadIII,
    aVR,
    aVL,
    aVF,
    V1:  v1,
    V2:  v2,
    V3:  v3,
    V4:  v4,
    V5:  v5,
    V6:  v6,
  };
}

export type LeadName = keyof LeadVectors;

/** All 12 standard leads in conventional order. */
export const LEAD_NAMES: LeadName[] = ['I','II','III','aVR','aVL','aVF','V1','V2','V3','V4','V5','V6'];

// ── Precordial proximity scaling ──────────────────────────────────────────────
// Electrodes closer to the heart see larger potentials. In an unbounded
// conductor a dipole field falls as 1/d²; inside the bounded torso the
// insulating boundary flattens this to roughly 1/d (Frank's image-surface
// measurements show ~±30% variation across V1–V6). Scaled relative to V4.
const PROXIMITY_EXPONENT = 1.0;
const _d = (key: keyof typeof ELECTRODE_POSITIONS) => {
  const p = ELECTRODE_POSITIONS[key];
  return Math.sqrt(p[0] ** 2 + p[1] ** 2 + p[2] ** 2);
};
const _dV4 = _d('V4');
export const PRECORDIAL_SCALE: Partial<Record<LeadName, number>> = {
  V1: (_dV4 / _d('V1')) ** PROXIMITY_EXPONENT,
  V2: (_dV4 / _d('V2')) ** PROXIMITY_EXPONENT,
  V3: (_dV4 / _d('V3')) ** PROXIMITY_EXPONENT,
  V4: 1.0,
  V5: (_dV4 / _d('V5')) ** PROXIMITY_EXPONENT,
  V6: (_dV4 / _d('V6')) ** PROXIMITY_EXPONENT,
};

/** Compute all 12 lead voltages from a cardiac vector snapshot. */
export function computeAllLeadVoltages(
  cardiacVector: Vec3,
  leadVectors: LeadVectors,
): Record<LeadName, number> {
  const result = {} as Record<LeadName, number>;
  for (const lead of Object.keys(leadVectors) as LeadName[]) {
    result[lead] = computeLeadVoltage(cardiacVector, leadVectors[lead]) * (PRECORDIAL_SCALE[lead] ?? 1.0);
  }
  return result;
}
