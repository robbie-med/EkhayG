/**
 * axis-calculator.ts
 * Computes mean frontal plane QRS axis from the cardiac vector model.
 * Axis = direction of the mean QRS vector in the frontal plane (X-Y in Frank coords).
 */

import { getCardiacVector, getDefaultTimings } from './cardiac-vector';
import type { BezierSegment3D, CycleTimings } from './cardiac-vector';

/** Mean frontal plane axis in degrees (-180 to +180).
 *  Convention: 0° = Lead I direction (leftward), +90° = aVF direction (inferior).
 *  Normal axis: -30° to +90°.
 */
export function computeQRSAxis(
  timings: CycleTimings,
  qrsSegments: BezierSegment3D[],
): number {
  const { pDuration, prDuration, qrsDuration } = timings;
  const qrsStart = pDuration + prDuration;
  const N = 120;
  let sumX = 0;
  let sumY = 0;

  for (let i = 0; i < N; i++) {
    const t = qrsStart + (i / (N - 1)) * qrsDuration;
    const state = getCardiacVector(t, timings, [0, 0, 0], qrsSegments);
    // Frank X+ = leftward = Lead I direction
    // Frank Y+ = inferior = aVF direction
    sumX += state.vector[0];
    sumY += state.vector[1];
  }

  const deg = Math.atan2(sumY, sumX) * (180 / Math.PI);
  // Round to nearest degree
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
