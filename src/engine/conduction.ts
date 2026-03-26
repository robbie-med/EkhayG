/**
 * conduction.ts
 * Heart rate, rhythm, and timing helpers.
 */

import { getDefaultTimings } from './cardiac-vector';
import type { CycleTimings } from './cardiac-vector';

export { getDefaultTimings };
export type { CycleTimings };

export function cycleLengthMs(heartRateBpm: number): number {
  return 60000 / heartRateBpm;
}
