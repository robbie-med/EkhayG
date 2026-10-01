/**
 * cardiac-vector.ts
 * Public API for the 3D cardiac dipole vector V(t) = [Vx, Vy, Vz] at any
 * point in the cardiac cycle.
 *
 * The vector emerges from electrical propagation through the myocardial
 * elements (heart-model.ts, action-potential.ts); it is read from the
 * per-millisecond cache built in simulation-cache.ts.
 *
 * Coordinate system (Frank convention):
 *   X: positive = leftward
 *   Y: positive = inferior (foot-ward)
 *   Z: positive = anterior (chest-ward)
 */

import { lookupPhase } from './activation-solver';
import { getSimulationState, updateSimulation, setDisabledSegments as setDisabled } from './simulation-cache';
import type { SimulationConfig } from './simulation-cache';

export type Vec3 = [number, number, number];

export type CardiacPhase = 'p' | 'pr' | 'qrs' | 'st' | 't' | 'tp';

export interface CardiacVectorState {
  vector: Vec3;
  phase: CardiacPhase;
  /** normalised phase progress 0-1 */
  phaseT: number;
  /** ms into current cycle */
  cycleTimeMs: number;
}

/** Ensure the simulation cache is up to date for the given parameters. */
export function ensureSimulation(config: SimulationConfig): void {
  updateSimulation(config);
}

/** Exclude element ids from the dipole summation (debug visualisation). */
export function setDisabledSegments(ids: string[]): void {
  setDisabled(ids);
}

/** Cardiac dipole vector at a given time within the cycle (1 ms resolution, linearly interpolated). */
export function getCardiacVector(cycleTimeMs: number): CardiacVectorState {
  const sim = getSimulationState();
  const { phaseBoundaries } = sim.activationMap;
  const { x, y, z, cycleLengthMs } = sim.dipoleCache;

  const cycleLen = phaseBoundaries.cycleLength;
  const t = ((cycleTimeMs % cycleLen) + cycleLen) % cycleLen;

  const i0 = Math.floor(t) % cycleLengthMs;
  const i1 = (i0 + 1) % cycleLengthMs;
  const f = t - Math.floor(t);
  const vector: Vec3 = [
    x[i0] + (x[i1] - x[i0]) * f,
    y[i0] + (y[i1] - y[i0]) * f,
    z[i0] + (z[i1] - z[i0]) * f,
  ];

  const { phase, phaseT } = lookupPhase(phaseBoundaries, t);
  return { vector, phase, phaseT, cycleTimeMs: t };
}
