/**
 * lead-calculator.ts
 * Computes EKG lead voltages via dot-product projection of the cardiac vector.
 *
 * V_lead(t) = dot(V(t), L̂)   where L̂ is the unit lead vector
 */

import type { Vec3 } from './cardiac-vector';

// ── Standard electrode positions (normalized torso coordinates) ─────────────
// From VECTOR_REFERENCE.md
export const ELECTRODE_POSITIONS = {
  RA: [-0.35, -0.30, 0.00] as Vec3,
  LA: [ 0.35, -0.30, 0.00] as Vec3,
  RL: [-0.15,  0.45, 0.00] as Vec3,
  LL: [ 0.15,  0.45, 0.00] as Vec3,
  V1: [-0.05, -0.12, 0.19] as Vec3,
  V2: [ 0.05, -0.12, 0.19] as Vec3,
  V3: [ 0.11, -0.07, 0.17] as Vec3,
  V4: [ 0.17, -0.02, 0.14] as Vec3,
  V5: [ 0.24,  0.00, 0.07] as Vec3,
  V6: [ 0.30,  0.02,-0.02] as Vec3,
} as const;

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

/** Compute scalar projection of cardiacVector onto leadVector (dot / |lead|). */
export function computeLeadVoltage(cardiacVector: Vec3, leadVector: Vec3): number {
  const mag = Math.sqrt(
    leadVector[0] ** 2 + leadVector[1] ** 2 + leadVector[2] ** 2,
  );
  if (mag === 0) return 0;
  return (
    cardiacVector[0] * leadVector[0] +
    cardiacVector[1] * leadVector[1] +
    cardiacVector[2] * leadVector[2]
  ) / mag;
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
 * Compute all 12 lead vectors given electrode positions.
 * Returns the raw (un-normalized) lead vectors — normalization happens in computeLeadVoltage.
 */
export function computeLeadVectors(
  positions: typeof ELECTRODE_POSITIONS = ELECTRODE_POSITIONS,
): LeadVectors {
  const { RA, LA, LL, V1, V2, V3, V4, V5, V6 } = positions;
  const wct = computeWCT(RA, LA, LL);

  // Bipolar limb leads
  const leadI   = sub(LA, RA);
  const leadII  = sub(LL, RA);
  const leadIII = sub(LL, LA);

  // Augmented limb leads (Goldberger)
  const aVR = sub(RA, scale(add(LA, LL), 0.5));
  const aVL = sub(LA, scale(add(RA, LL), 0.5));
  const aVF = sub(LL, scale(add(RA, LA), 0.5));

  // Precordial leads (unipolar, referenced to WCT)
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

/** Compute all 12 lead voltages from a cardiac vector snapshot. */
export function computeAllLeadVoltages(
  cardiacVector: Vec3,
  leadVectors: LeadVectors,
): Record<LeadName, number> {
  const result = {} as Record<LeadName, number>;
  for (const lead of Object.keys(leadVectors) as LeadName[]) {
    result[lead] = computeLeadVoltage(cardiacVector, leadVectors[lead]);
  }
  return result;
}
