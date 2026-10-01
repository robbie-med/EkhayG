/**
 * action-potential.ts
 * Time course of the transmembrane potential and the dipole of each wall
 * element (see heart-model.ts for the physical model).
 *
 * Normalised action potential (0 = resting, 1 = plateau):
 *
 *   Vm(tau) = up(tau) * [1 - down(tau - APD)] * decline(tau)
 *     up      = logistic(tau / tauUp)              phase 0 (+ activation dispersion across the face)
 *     down    = logistic((tau - APD) / tauRepol)   phase 3
 *     decline = 1 - plateauSlope * tau            phase 2 slope
 *
 * Element dipole (1-D cable identity, uniform double layer):
 *
 *   p(t) = GAIN * A * health * [Vm_entry(t) - Vm_exit(t)] * direction
 *     A        = mass / (density * pathLength)         front cross-section
 *     Vm_entry = AP started at the activation time, APD = apdEntry
 *     Vm_exit  = AP started crossingTime later,      APD = apdExit
 *
 * Injury current (acute ischaemia): an ischaemic element has an elevated
 * resting potential, a lower and shorter plateau and a slower upstroke. The
 * potential difference ΔVm against the surrounding healthy tissue drives
 * current across the border of the ischaemic zone. For a transmural zone
 * the border is a ribbon of height h (wall thickness) around the zone; its
 * vector area on a wall of curvature radius R is (2h/R) x (vector area of
 * the zone), so (solid-angle theory of ST shifts):
 *
 *   p_injury(t) = -GAIN * ΔVm(t) * Σ_ischaemic (2h/R) * A_surface * n̂
 *
 * During diastole ΔVm > 0 and the dipole points away from the ischaemic
 * wall (TQ depression in facing leads); during the plateau ΔVm < 0 and it
 * points toward it (ST elevation). Both read as ST elevation once the trace
 * is referenced to the TP baseline.
 */

import type { Vec3 } from './cardiac-vector';
import type { MyocardialSegment } from './heart-model';
import { frontArea, crossingTimeMs, surfaceArea } from './heart-model';

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Global amplitude: dipole units (cm^2 x normalised Vm) → millivolts at the
 * body surface. This is the ONLY free scalar in the model. Calibrated so that
 * lead II R-wave ≈ 1.0 mV in normal sinus rhythm with the default anatomy.
 */
export const GAIN = 0.0575;

/** Ischaemic action-potential modifications (fractions of the normal AP amplitude). */
export const ISCHEMIA = {
  /** Resting potential elevation (−90 → −70 mV ≈ +0.2 of a 100 mV AP) */
  restOffset: 0.20,
  /** Plateau amplitude reduction */
  plateauLoss: 0.15,
  /** APD shortening factor (I_K,ATP activation) */
  apdFactor: 0.85,
  /** Upstroke slowing (reduced I_Na availability) */
  tauUpFactor: 1.6,
} as const;

// ── Action potential ──────────────────────────────────────────────────────────

function logistic(x: number): number {
  if (x > 30) return 1;
  if (x < -30) return 0;
  return 1 / (1 + Math.exp(-x));
}

export interface APParams {
  apd: number;
  tauUp: number;
  tauRepol: number;
  /** phase-2 decline, fraction of amplitude per ms */
  plateauSlope: number;
}

/** Normalised transmembrane potential `tau` ms after local activation (healthy tissue). */
export function actionPotential(tau: number, p: APParams): number {
  if (tau < -6 * p.tauUp) return 0;
  if (tau > p.apd + 8 * p.tauRepol) return 0;
  const up = logistic(tau / p.tauUp);
  const down = logistic((tau - p.apd) / p.tauRepol);
  const decline = Math.max(0.5, 1 - p.plateauSlope * Math.max(0, tau));
  return up * (1 - down) * decline;
}

/** Normalised transmembrane potential of ischaemic tissue (severity 0..1 blends toward healthy). */
export function ischemicActionPotential(tau: number, p: APParams, severity: number): number {
  const rest = ISCHEMIA.restOffset * severity;
  const amp = 1 - ISCHEMIA.plateauLoss * severity - rest;
  const shape = actionPotential(tau, {
    apd: p.apd * (1 - (1 - ISCHEMIA.apdFactor) * severity),
    tauUp: p.tauUp * (1 + (ISCHEMIA.tauUpFactor - 1) * severity),
    tauRepol: p.tauRepol,
    plateauSlope: p.plateauSlope,
  });
  return rest + amp * shape;
}

function faceVm(seg: MyocardialSegment, tau: number, apd: number): number {
  const p: APParams = { apd, tauUp: seg.tauUp, tauRepol: seg.tauRepol, plateauSlope: seg.plateauSlope };
  return seg.ischemia > 0 ? ischemicActionPotential(tau, p, seg.ischemia) : actionPotential(tau, p);
}

// ── Per-element dipole ────────────────────────────────────────────────────────

/**
 * Dipole of one element at cycle time t (ms), in millivolt-equivalent units.
 * `activationTime` is when the front reaches the entry face.
 */
export function segmentDipole(
  seg: MyocardialSegment,
  activationTime: number,
  cycleTimeMs: number,
  exitActivationTime?: number,
): Vec3 {
  const tauEntry = cycleTimeMs - activationTime;
  const tauExit = cycleTimeMs - exitTime(seg, activationTime, exitActivationTime);
  const vEntry = faceVm(seg, tauEntry, seg.apdEntry);
  const vExit = faceVm(seg, tauExit, seg.apdExit);
  const amp = GAIN * frontArea(seg) * seg.health * (vEntry - vExit);
  return [seg.direction[0] * amp, seg.direction[1] * amp, seg.direction[2] * amp];
}

/** Activation time of the exit face: entry + crossing, or earlier if the exit face has its own supply. */
export function exitTime(seg: MyocardialSegment, activationTime: number, exitActivationTime?: number): number {
  const viaWall = activationTime + crossingTimeMs(seg);
  return exitActivationTime !== undefined ? Math.min(viaWall, exitActivationTime) : viaWall;
}

/** Mean transmembrane potential of an element (average of its two faces), healthy or ischaemic. */
function meanVm(seg: MyocardialSegment, activationTime: number, t: number, asHealthy: boolean, exitAct?: number): number {
  const tauEntry = t - activationTime;
  const tauExit = t - exitTime(seg, activationTime, exitAct);
  const pe: APParams = { apd: seg.apdEntry, tauUp: seg.tauUp, tauRepol: seg.tauRepol, plateauSlope: seg.plateauSlope };
  const px: APParams = { apd: seg.apdExit, tauUp: seg.tauUp, tauRepol: seg.tauRepol, plateauSlope: seg.plateauSlope };
  void crossingTimeMs;
  if (asHealthy || seg.ischemia <= 0) {
    return 0.5 * (actionPotential(tauEntry, pe) + actionPotential(tauExit, px));
  }
  return 0.5 * (ischemicActionPotential(tauEntry, pe, seg.ischemia) + ischemicActionPotential(tauExit, px, seg.ischemia));
}

// ── Adjacency (shared borders between elements) ───────────────────────────────

export interface AdjacencyPair {
  a: number;            // index into segments
  b: number;
  /** centroid distance, cm */
  distance: number;
  /** cross-section of the shared border, cm^2 (thickness x edge length) */
  borderArea: number;
  /**
   * Unit vector from a to b along the wall (the centroid chord projected
   * onto the local wall plane). The injury current across a border flows
   * within the wall; using the raw chord would add a spurious inward
   * (toward the cavity) component on a curved wall.
   */
  dir: Vec3;
}

/**
 * Build element adjacency from geometry. Elements closer than `maxDistance`
 * (cm) are neighbours. Atria and ventricles are electrically insulated from
 * each other by the fibrous AV ring, so cross-pairs are excluded.
 */
export function buildAdjacency(segments: MyocardialSegment[], maxDistance = 3.8): AdjacencyPair[] {
  const pairs: AdjacencyPair[] = [];
  const NOMINAL_EDGE_CM = 2.5;
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i], b = segments[j];
      const aAtrial = a.chamber === 'ra' || a.chamber === 'la';
      const bAtrial = b.chamber === 'ra' || b.chamber === 'la';
      if (aAtrial !== bAtrial) continue;
      const dx = b.position[0] - a.position[0];
      const dy = b.position[1] - a.position[1];
      const dz = b.position[2] - a.position[2];
      const d = Math.hypot(dx, dy, dz);
      if (d > maxDistance) continue;
      const thickness = a.propagation === 'transmural' && b.propagation === 'transmural'
        ? 0.5 * (a.pathLength + b.pathLength)
        : 0.25; // atrial wall thickness
      let dir: Vec3 = d > 1e-6 ? [dx / d, dy / d, dz / d] : [0, 0, 0];
      if (a.propagation === 'transmural' && b.propagation === 'transmural') {
        // Mean outward normal of the two elements; remove the chord's component along it.
        const nx = a.direction[0] + b.direction[0], ny = a.direction[1] + b.direction[1], nz = a.direction[2] + b.direction[2];
        const nm = Math.hypot(nx, ny, nz);
        if (nm > 1e-6) {
          const k = (dir[0] * nx + dir[1] * ny + dir[2] * nz) / (nm * nm);
          const tx = dir[0] - k * nx, ty = dir[1] - k * ny, tz = dir[2] - k * nz;
          const tm = Math.hypot(tx, ty, tz);
          if (tm > 1e-6) dir = [tx / tm, ty / tm, tz / tm];
        }
      }
      pairs.push({ a: i, b: j, distance: d, borderArea: thickness * NOMINAL_EDGE_CM, dir });
    }
  }
  return pairs;
}

// ── Net cardiac vector ────────────────────────────────────────────────────────

/**
 * Sum all element dipoles (plus injury currents across ischaemic borders)
 * at cycle time t. `activationTimes` maps element id → entry-face activation.
 * `adjacency` is optional; without it, injury currents are omitted.
 */
export function computeNetDipole(
  segments: MyocardialSegment[],
  activationTimes: Map<string, number>,
  cycleTimeMs: number,
  adjacency?: AdjacencyPair[],
  exitActivationTimes?: Map<string, number>,
): Vec3 {
  let x = 0, y = 0, z = 0;

  for (const seg of segments) {
    const at = activationTimes.get(seg.id);
    if (at === undefined) continue;
    const [dx, dy, dz] = segmentDipole(seg, at, cycleTimeMs, exitActivationTimes?.get(seg.id));
    x += dx; y += dy; z += dz;
  }

  // Injury current across the border of each ischaemic element.
  for (const seg of segments) {
    if (seg.ischemia <= 0) continue;
    const at = activationTimes.get(seg.id);
    if (at === undefined) continue;
    const ea = exitActivationTimes?.get(seg.id);
    // ΔVm = ischaemic potential − what healthy tissue with the same timing would have
    const dV = meanVm(seg, at, cycleTimeMs, false, ea) - meanVm(seg, at, cycleTimeMs, true, ea);
    if (dV === 0) continue;
    const geom = (2 * seg.pathLength) / seg.curvatureRadius;
    const amp = -GAIN * geom * surfaceArea(seg) * dV;
    x += seg.direction[0] * amp; y += seg.direction[1] * amp; z += seg.direction[2] * amp;
  }
  void adjacency;

  return [x, y, z];
}
