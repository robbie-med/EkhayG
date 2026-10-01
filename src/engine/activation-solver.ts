/**
 * activation-solver.ts
 * Computes activation times for all myocardial elements using shortest-path
 * (Dijkstra) on the conduction graph.
 *
 * Runs once when simulation parameters change — NOT per frame.
 * Output: a map from element ID → activation time (ms) of its entry face,
 * plus emergent phase boundaries (P, QRS, T) derived from element timing.
 */

import type { ConductionSystem } from './conduction-graph';
import type { MyocardialSegment } from './heart-model';
import { isAtrial } from './heart-model';
import { exitTime } from './action-potential';
import type { CardiacPhase } from './cardiac-vector';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ActivationMap {
  /** Element ID → activation time (ms from start of cardiac cycle) */
  activationTimes: Map<string, number>;
  /** Element ID → activation time of its exit face, for dual-entry elements (septum) */
  exitActivationTimes: Map<string, number>;
  /** Pre-computed cardiac phase boundaries in ms */
  phaseBoundaries: PhaseBoundaries;
}

export interface PhaseBoundaries {
  pStart: number;       // first atrial element activates
  pEnd: number;         // last atrial element finishes depolarising
  qrsStart: number;     // first ventricular element activates
  qrsEnd: number;       // last ventricular element finishes depolarising
  tStart: number;       // first ventricular face starts repolarising
  tEnd: number;         // last ventricular face finishes repolarising
  cycleLength: number;  // total cycle in ms (60000/bpm)
}

// ── Dijkstra ──────────────────────────────────────────────────────────────────

export function solveActivationTimes(
  conduction: ConductionSystem,
  segments: MyocardialSegment[],
  heartRateBpm: number,
): ActivationMap {
  const adj = new Map<string, { to: string; delay: number }[]>();
  for (const e of conduction.edges) {
    if (e.blocked) continue;
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push({ to: e.to, delay: e.delayMs });
  }

  const dist = new Map<string, number>();
  const visited = new Set<string>();
  const queue: [string, number][] = [['sa-node', 0]];
  dist.set('sa-node', 0);

  while (queue.length > 0) {
    let minIdx = 0;
    for (let i = 1; i < queue.length; i++) {
      if (queue[i][1] < queue[minIdx][1]) minIdx = i;
    }
    const [node, d] = queue.splice(minIdx, 1)[0];
    if (visited.has(node)) continue;
    visited.add(node);

    const neighbors = adj.get(node);
    if (!neighbors) continue;
    for (const { to, delay } of neighbors) {
      const nd = d + delay;
      if (!dist.has(to) || nd < dist.get(to)!) {
        dist.set(to, nd);
        queue.push([to, nd]);
      }
    }
  }

  const segmentIds = new Set(segments.map((s) => s.id));
  const activationTimes = new Map<string, number>();
  const exitActivationTimes = new Map<string, number>();
  for (const [nodeId, time] of dist) {
    if (segmentIds.has(nodeId)) activationTimes.set(nodeId, time);
    else if (nodeId.endsWith(':exit') && segmentIds.has(nodeId.slice(0, -5))) exitActivationTimes.set(nodeId.slice(0, -5), time);
  }

  const phaseBoundaries = computePhaseBoundaries(activationTimes, exitActivationTimes, segments, heartRateBpm);
  return { activationTimes, exitActivationTimes, phaseBoundaries };
}

// ── Phase boundaries ──────────────────────────────────────────────────────────

function computePhaseBoundaries(
  activationTimes: Map<string, number>,
  exitActivationTimes: Map<string, number>,
  segments: MyocardialSegment[],
  heartRateBpm: number,
): PhaseBoundaries {
  const cycleLength = 60000 / heartRateBpm;

  let pStart = Infinity, pEnd = -Infinity;
  let qrsStart = Infinity, qrsEnd = -Infinity;
  let tStart = Infinity, tEnd = -Infinity;

  for (const seg of segments) {
    const at = activationTimes.get(seg.id);
    if (at === undefined || seg.health <= 0) continue;
    const exitAt = exitTime(seg, at, exitActivationTimes.get(seg.id));
    const depolStart = Math.min(at, exitAt) - 2 * seg.tauUp;
    const depolEnd = Math.max(at, exitAt) + 3 * seg.tauUp;
    // Exit face repolarises at exitAt+apdExit, entry face at at+apdEntry.
    const repolStart = Math.min(exitAt + seg.apdExit, at + seg.apdEntry) - 2.5 * seg.tauRepol;
    const repolEnd = Math.max(exitAt + seg.apdExit, at + seg.apdEntry) + 3 * seg.tauRepol;

    if (isAtrial(seg)) {
      pStart = Math.min(pStart, depolStart);
      pEnd = Math.max(pEnd, depolEnd);
    } else {
      qrsStart = Math.min(qrsStart, depolStart);
      qrsEnd = Math.max(qrsEnd, depolEnd);
      tStart = Math.min(tStart, repolStart);
      tEnd = Math.max(tEnd, repolEnd);
    }
  }

  if (pStart === Infinity) pStart = 0;
  if (pEnd === -Infinity) pEnd = 90;
  if (qrsStart === Infinity) qrsStart = 160;
  if (qrsEnd === -Infinity) qrsEnd = 250;
  if (tStart === Infinity) tStart = 330;
  if (tEnd === -Infinity) tEnd = 490;

  pStart = Math.max(0, pStart);
  tStart = Math.max(tStart, qrsEnd + 10);
  tEnd = Math.min(tEnd, cycleLength);

  return { pStart, pEnd, qrsStart, qrsEnd, tStart, tEnd, cycleLength };
}

// ── Phase lookup ──────────────────────────────────────────────────────────────

export function lookupPhase(
  pb: PhaseBoundaries,
  cycleTimeMs: number,
): { phase: CardiacPhase; phaseT: number } {
  if (cycleTimeMs < pb.pStart) return { phase: 'tp', phaseT: 0 };
  if (cycleTimeMs < pb.pEnd) {
    const dur = pb.pEnd - pb.pStart;
    return { phase: 'p', phaseT: dur > 0 ? (cycleTimeMs - pb.pStart) / dur : 0 };
  }
  if (cycleTimeMs < pb.qrsStart) {
    const dur = pb.qrsStart - pb.pEnd;
    return { phase: 'pr', phaseT: dur > 0 ? (cycleTimeMs - pb.pEnd) / dur : 0 };
  }
  if (cycleTimeMs < pb.qrsEnd) {
    const dur = pb.qrsEnd - pb.qrsStart;
    return { phase: 'qrs', phaseT: dur > 0 ? (cycleTimeMs - pb.qrsStart) / dur : 0 };
  }
  if (cycleTimeMs < pb.tStart) {
    const dur = pb.tStart - pb.qrsEnd;
    return { phase: 'st', phaseT: dur > 0 ? (cycleTimeMs - pb.qrsEnd) / dur : 0 };
  }
  if (cycleTimeMs < pb.tEnd) {
    const dur = pb.tEnd - pb.tStart;
    return { phase: 't', phaseT: dur > 0 ? (cycleTimeMs - pb.tStart) / dur : 0 };
  }
  return { phase: 'tp', phaseT: 0 };
}
