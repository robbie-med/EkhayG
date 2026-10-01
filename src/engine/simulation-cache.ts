/**
 * simulation-cache.ts
 * Caches the pre-computed simulation state (elements, activation map, dipole
 * and 12-lead time series). Re-computes only when parameters change.
 *
 * This is the bridge between the store (user controls) and the per-frame
 * rendering. Rendering never evaluates the model; it indexes these tables.
 */

import type { MyocardialSegment } from './heart-model';
import { buildDefaultSegments, cloneSegments, APD_RATE_EXPONENT, APD_REFERENCE_RR_MS } from './heart-model';
import { buildDefaultConductionSystem, cloneConductionSystem } from './conduction-graph';
import type { ConductionSystem } from './conduction-graph';
import { solveActivationTimes } from './activation-solver';
import type { ActivationMap } from './activation-solver';
import { applyConditions, applyIschemia } from './pathology';
import { computeNetDipole, buildAdjacency } from './action-potential';
import type { AdjacencyPair } from './action-potential';
import { computeLeadVectors, computeAllLeadVoltages, ELECTRODE_POSITIONS, LEAD_NAMES } from './lead-calculator';
import type { LeadName } from './lead-calculator';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SimulationConfig {
  heartRateBpm: number;
  activeConditions: string[];
  arteries: Record<string, boolean>;
}

/** Pre-computed dipole vector time series at 1 ms resolution over one full cycle. */
export interface DipoleCache {
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  cycleLengthMs: number;
}

export interface SimulationState {
  segments: MyocardialSegment[];
  adjacency: AdjacencyPair[];
  conductionSystem: ConductionSystem;
  activationMap: ActivationMap;
  dipoleCache: DipoleCache;
  /**
   * Standard 12-lead voltages (mV) at 1 ms resolution, referenced to the TP
   * baseline (the diastolic value just before P onset is subtracted, as an
   * AC-coupled ECG amplifier does). Index = ms into the cycle.
   */
  leadCache: Record<LeadName, Float32Array>;
  /** Index into the caches of the diastolic baseline reference sample. */
  baselineIndex: number;
  config: SimulationConfig;
  /** Element ids excluded from the dipole sum (debug visualisation). */
  disabledSegments: string[];
}

// ── Cache ─────────────────────────────────────────────────────────────────────

let cached: SimulationState | null = null;
let disabledIds: string[] = [];

function configsEqual(a: SimulationConfig, b: SimulationConfig): boolean {
  if (a.heartRateBpm !== b.heartRateBpm) return false;
  if (a.activeConditions.length !== b.activeConditions.length) return false;
  for (let i = 0; i < a.activeConditions.length; i++) {
    if (a.activeConditions[i] !== b.activeConditions[i]) return false;
  }
  const aKeys = Object.keys(a.arteries);
  const bKeys = Object.keys(b.arteries);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) if (a.arteries[k] !== b.arteries[k]) return false;
  return true;
}

function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Rate adaptation: APD(RR) = APD_ref * (RR / RR_ref)^exponent (Bazett-type). */
export function apdRateFactor(heartRateBpm: number): number {
  const rr = 60000 / heartRateBpm;
  return Math.pow(rr / APD_REFERENCE_RR_MS, APD_RATE_EXPONENT);
}

/**
 * Set the element ids excluded from the dipole summation (debug mode).
 * Forces a recompute of the cached time series if the set changed.
 */
export function setDisabledSegments(ids: string[]): void {
  const sorted = [...ids].sort();
  if (sameIds(sorted, disabledIds)) return;
  disabledIds = sorted;
  if (cached) {
    const cfg = cached.config;
    cached = null;
    updateSimulation(cfg);
  }
}

export function getDisabledSegments(): string[] {
  return disabledIds;
}

/**
 * Update the simulation state. Only re-computes if the config has changed.
 */
export function updateSimulation(config: SimulationConfig): SimulationState {
  if (cached && configsEqual(cached.config, config) && sameIds(cached.disabledSegments, disabledIds)) {
    return cached;
  }

  // 1. Fresh anatomy
  const segments = cloneSegments(buildDefaultSegments());

  // 2. Rate-dependent action potential duration
  const rateFactor = apdRateFactor(config.heartRateBpm);
  for (const s of segments) {
    s.apdEntry *= rateFactor;
    s.apdExit *= rateFactor;
  }

  // 3. Pathology: tissue properties first (hypertrophy changes geometry),
  //    then the conduction system is built from the modified anatomy.
  const adjacency = buildAdjacency(segments);
  const conductionSystem = cloneConductionSystem(buildDefaultConductionSystem(segments, adjacency));
  applyConditions(config.activeConditions, segments, conductionSystem);
  applyIschemia(config.arteries, segments);

  // 4. Activation times
  const activationMap = solveActivationTimes(conductionSystem, segments, config.heartRateBpm);

  // 5. Dipole time series at 1 ms
  const cycleLengthMs = Math.max(1, Math.round(60000 / config.heartRateBpm));
  const disabled = new Set(disabledIds);
  const active = disabled.size > 0 ? segments.filter((s) => !disabled.has(s.id)) : segments;
  const activeAdjacency = disabled.size > 0 ? buildAdjacency(active) : adjacency;
  const x = new Float32Array(cycleLengthMs);
  const y = new Float32Array(cycleLengthMs);
  const z = new Float32Array(cycleLengthMs);
  for (let t = 0; t < cycleLengthMs; t++) {
    const [dx, dy, dz] = computeNetDipole(active, activationMap.activationTimes, t, activeAdjacency, activationMap.exitActivationTimes);
    x[t] = dx; y[t] = dy; z[t] = dz;
  }
  const dipoleCache: DipoleCache = { x, y, z, cycleLengthMs };

  // 6. 12-lead time series, referenced to the TP baseline
  const leadVectors = computeLeadVectors(ELECTRODE_POSITIONS);
  const pStart = activationMap.phaseBoundaries.pStart;
  const baselineIndex = ((Math.floor(pStart) - 2) % cycleLengthMs + cycleLengthMs) % cycleLengthMs;
  const leadCache = {} as Record<LeadName, Float32Array>;
  for (const lead of LEAD_NAMES) leadCache[lead] = new Float32Array(cycleLengthMs);
  const ref = computeAllLeadVoltages([x[baselineIndex], y[baselineIndex], z[baselineIndex]], leadVectors);
  for (let t = 0; t < cycleLengthMs; t++) {
    const v = computeAllLeadVoltages([x[t], y[t], z[t]], leadVectors);
    for (const lead of LEAD_NAMES) leadCache[lead][t] = v[lead] - ref[lead];
  }

  cached = {
    segments, adjacency, conductionSystem, activationMap, dipoleCache, leadCache, baselineIndex,
    config: { ...config, activeConditions: [...config.activeConditions], arteries: { ...config.arteries } },
    disabledSegments: [...disabledIds],
  };
  return cached;
}

export const DEFAULT_CONFIG: SimulationConfig = {
  heartRateBpm: 75,
  activeConditions: [],
  arteries: { lad: true, d1: true, lcx: true, om: true, rca: true, pda: true },
};

/** Get the current cached simulation state (initialises with defaults if needed). */
export function getSimulationState(): SimulationState {
  if (!cached) return updateSimulation(DEFAULT_CONFIG);
  return cached;
}

/**
 * Voltage (mV) of a standard lead at an absolute simulated time. The current
 * engine is periodic, so this wraps modulo the cycle length; a beat-by-beat
 * rhythm engine can replace it without touching the renderers.
 */
export function sampleLead(sim: SimulationState, lead: LeadName, tMs: number): number {
  const n = sim.dipoleCache.cycleLengthMs;
  const i = ((Math.floor(tMs) % n) + n) % n;
  return sim.leadCache[lead][i];
}

/** Same as sampleLead for a pre-projected waveform (custom electrode). */
export function sampleWave(wave: Float32Array, tMs: number): number {
  const n = wave.length;
  const i = ((Math.floor(tMs) % n) + n) % n;
  return wave[i];
}

/**
 * Project the cached dipole onto an arbitrary lead vector (or electrode
 * position), returning a 1 ms time series referenced to the TP baseline.
 */
export function projectLead(sim: SimulationState, leadVector: [number, number, number], scale = 1): Float32Array {
  const { x, y, z, cycleLengthMs } = sim.dipoleCache;
  const out = new Float32Array(cycleLengthMs);
  const b = sim.baselineIndex;
  const ref = (x[b] * leadVector[0] + y[b] * leadVector[1] + z[b] * leadVector[2]) * scale;
  for (let t = 0; t < cycleLengthMs; t++) {
    out[t] = (x[t] * leadVector[0] + y[t] * leadVector[1] + z[t] * leadVector[2]) * scale - ref;
  }
  return out;
}
