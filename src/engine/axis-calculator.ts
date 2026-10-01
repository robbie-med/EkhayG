/**
 * axis-calculator.ts
 * Computes mean frontal plane QRS axis from the propagation-based cardiac vector model.
 * Axis = direction of the mean QRS vector in the frontal plane (X-Y in Frank coords).
 */

import { getSimulationState } from './simulation-cache';

/** Mean frontal plane axis in degrees (-180 to +180).
 *  Convention: 0° = Lead I direction (leftward), +90° = aVF direction (inferior).
 *  Normal axis: -30° to +90°. Uses the cached dipole (same data the leads are drawn from).
 */
export function computeQRSAxis(): number {
  const sim = getSimulationState();
  const { qrsStart, qrsEnd } = sim.activationMap.phaseBoundaries;
  const { x, y, cycleLengthMs } = sim.dipoleCache;
  if (qrsEnd <= qrsStart) return 0;

  let sumX = 0;
  let sumY = 0;
  for (let t = Math.max(0, Math.floor(qrsStart)); t <= Math.min(cycleLengthMs - 1, Math.ceil(qrsEnd)); t++) {
    sumX += x[t];
    sumY += y[t];
  }

  const deg = Math.atan2(sumY, sumX) * (180 / Math.PI);
  return Math.round(deg);
}

export function axisInterpretation(deg: number): string {
  if (deg >= -30 && deg <= 90)  return 'Normal';
  if (deg < -30 && deg >= -90)  return 'Left axis deviation';
  if (deg > 90 && deg <= 180)   return 'Right axis deviation';
  return 'Extreme axis deviation';
}

export function axisToLeadI(deg: number): 'positive' | 'negative' {
  return Math.abs(deg) <= 90 ? 'positive' : 'negative';
}
