/**
 * conduction-graph.ts
 * The cardiac conduction system as a directed graph.
 *
 *   sa-node → atrial elements → av-node → his → lbb / rbb → fascicles → Purkinje → endocardium
 *
 * Node activation times are solved by Dijkstra (activation-solver.ts). Edge
 * delays encode anatomy:
 *   - specialised conduction tissue (fixed delays from the literature),
 *   - Purkinje–myocardial junctions (Durrer 1970 endocardial breakthrough times),
 *   - working-myocardium cell-to-cell spread between neighbouring elements,
 *     generated from geometry: delay = centroid distance / along-fibre
 *     conduction velocity (tangential spread starts as soon as the entry
 *     face is excited). These are the slow pathways that take over when a
 *     bundle branch is blocked.
 *
 * Timing (ms from SA node discharge = P onset):
 *   atrial activation       0 – ~90      (P wave)
 *   AV node entry           40
 *   AV nodal delay          90           → His at 130
 *   His / bundle branches   10           → 140
 *   fascicles               8            → 148 (left), RV Purkinje 150
 *   first ventricular myocardium 160     (PR interval 160 ms)
 */

import type { MyocardialSegment } from './heart-model';
import { crossingTimeMs, CONDUCTION_VELOCITY } from './heart-model';
import { buildAdjacency } from './action-potential';
import type { AdjacencyPair } from './action-potential';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConductionEdge {
  from: string;
  to: string;
  /** Conduction delay along this edge in ms */
  delayMs: number;
  /** If true, this edge is blocked (e.g. LBBB blocks 'his → lbb') */
  blocked: boolean;
  /** If true, this is an accessory pathway (WPW) */
  accessory: boolean;
  /** If true, this is slow working-myocardium spread (not specialised tissue) */
  myocardial?: boolean;
}

export interface ConductionSystem {
  edges: ConductionEdge[];
}

function edge(from: string, to: string, delayMs: number, extra: Partial<ConductionEdge> = {}): ConductionEdge {
  return { from, to, delayMs, blocked: false, accessory: false, ...extra };
}

// ── Specialised conduction timing ─────────────────────────────────────────────

export const CONDUCTION_TIMING = {
  raSuperiorToFree: 20,
  raFreeToSeptal: 10,
  bachmannBundle: 40,          // SA region → LA roof
  laRoofToPosterior: 20,
  laRoofToInferior: 25,
  raSeptalToAvNode: 10,
  avNodalDelay: 90,
  hisToBundleBranch: 10,
  bundleToFascicle: 8,
  rbbToPurkinje: 10,
  /** fascicle → earliest endocardial breakthrough */
  purkinjeMinimum: 12,
} as const;

/**
 * Endocardial activation offsets (ms after QRS onset) at the Purkinje–muscle
 * junction of each element — Durrer et al. 1970, isolated human hearts:
 *   0–5 ms   three simultaneous LV endocardial areas: central left septal
 *            surface, high anterior paraseptal wall, posterior paraseptal wall
 *   5–10 ms  RV septal surface (right bundle), apical septum
 *   10–20 ms apex, RV anterior free wall, inferior LV
 *   20–35 ms anterolateral / inferolateral LV, RV lateral and inferior
 *   35–50 ms basal free wall; basal septum activated from the RV side
 *   50–70 ms posterobasal LV (last), RV outflow / pulmonary conus
 */
export const PURKINJE_BREAKTHROUGH: Record<string, { fascicle: 'laf' | 'lpf' | 'rvp'; offsetMs: number }> = {
  // Left anterior fascicle / septal fibres
  'sept-mid-ant':   { fascicle: 'laf', offsetMs: 0 },
  'lv-mid-ant':     { fascicle: 'laf', offsetMs: 4 },
  'sept-apical':    { fascicle: 'laf', offsetMs: 6 },
  'lv-apical-ant':  { fascicle: 'laf', offsetMs: 8 },
  'lv-apex':        { fascicle: 'laf', offsetMs: 12 },
  'lv-apical-lat':  { fascicle: 'laf', offsetMs: 18 },
  'lv-mid-antlat':  { fascicle: 'laf', offsetMs: 22 },
  'lv-base-ant':    { fascicle: 'laf', offsetMs: 34 },
  'sept-base-ant':  { fascicle: 'laf', offsetMs: 38 },
  'lv-base-antlat': { fascicle: 'laf', offsetMs: 40 },
  // Left posterior fascicle
  'sept-mid-inf':   { fascicle: 'lpf', offsetMs: 3 },
  'lv-mid-inf':     { fascicle: 'lpf', offsetMs: 6 },
  'lv-apical-inf':  { fascicle: 'lpf', offsetMs: 8 },
  'lv-mid-inflat':  { fascicle: 'lpf', offsetMs: 26 },
  'sept-base-inf':  { fascicle: 'lpf', offsetMs: 36 },
  'lv-base-inf':    { fascicle: 'lpf', offsetMs: 40 },
  'lv-base-inflat': { fascicle: 'lpf', offsetMs: 48 },
  // Right bundle branch / RV Purkinje: RV septal surface and RV free wall
  'sept-mid-ant:exit':  { fascicle: 'rvp', offsetMs: 8 },
  'sept-apical:exit':   { fascicle: 'rvp', offsetMs: 8 },
  'sept-mid-inf:exit':  { fascicle: 'rvp', offsetMs: 10 },
  'rv-apex':        { fascicle: 'rvp', offsetMs: 10 },
  'rv-ant-mid':     { fascicle: 'rvp', offsetMs: 14 },
  'rv-lateral':     { fascicle: 'rvp', offsetMs: 20 },
  'rv-ant-base':    { fascicle: 'rvp', offsetMs: 22 },
  'rv-inferior':    { fascicle: 'rvp', offsetMs: 22 },
  'sept-base-ant:exit': { fascicle: 'rvp', offsetMs: 28 },
  'sept-base-inf:exit': { fascicle: 'rvp', offsetMs: 30 },
  'rv-outflow':     { fascicle: 'rvp', offsetMs: 36 },
};

// ── Default conduction system ─────────────────────────────────────────────────

export function buildDefaultConductionSystem(segments: MyocardialSegment[], adjacency?: AdjacencyPair[]): ConductionSystem {
  const T = CONDUCTION_TIMING;
  const edges: ConductionEdge[] = [
    // Atria
    edge('sa-node', 'ra-superior', 0),
    edge('ra-superior', 'ra-free', T.raSuperiorToFree),
    edge('ra-free', 'ra-septal', T.raFreeToSeptal),
    edge('ra-superior', 'la-anterior', T.bachmannBundle),
    edge('la-anterior', 'la-posterior', T.laRoofToPosterior),
    edge('la-anterior', 'la-inferior', T.laRoofToInferior),

    // AV node and His–Purkinje system
    edge('ra-septal', 'av-node', T.raSeptalToAvNode),
    edge('av-node', 'his', T.avNodalDelay),
    edge('his', 'lbb', T.hisToBundleBranch),
    edge('his', 'rbb', T.hisToBundleBranch),
    edge('lbb', 'laf', T.bundleToFascicle),
    edge('lbb', 'lpf', T.bundleToFascicle),
    edge('rbb', 'rvp', T.rbbToPurkinje),
  ];

  // Purkinje–myocardial junctions (Durrer breakthrough times). The left
  // fascicles sit 8 ms later than the RV Purkinje node, so offsets are
  // referenced to a common QRS onset of 160 ms.
  for (const [id, { fascicle, offsetMs }] of Object.entries(PURKINJE_BREAKTHROUGH)) {
    const base = fascicle === 'rvp' ? T.purkinjeMinimum - 2 : T.purkinjeMinimum;
    edges.push(edge(fascicle, id, base + offsetMs));
  }

  // Dual-entry elements (septum): the two faces are joined by the wall itself,
  // so activation can cross from either face to the other (RBBB: LV→RV side;
  // LBBB: RV→LV side).
  for (const s of segments) {
    if (!s.dualEntry) continue;
    edges.push(edge(s.id, `${s.id}:exit`, crossingTimeMs(s), { myocardial: true }));
    edges.push(edge(`${s.id}:exit`, s.id, crossingTimeMs(s), { myocardial: true }));
  }

  // Working-myocardium spread between neighbouring elements (both directions).
  const adj = adjacency ?? buildAdjacency(segments);
  const vMyo = CONDUCTION_VELOCITY.ventricularMyocardial * 0.1; // cm/ms
  const vAtr = CONDUCTION_VELOCITY.atrial * 0.1;
  for (const p of adj) {
    const a = segments[p.a], b = segments[p.b];
    const atrial = a.chamber === 'ra' || a.chamber === 'la';
    const v = atrial ? vAtr : vMyo;
    edges.push(edge(a.id, b.id, p.distance / v, { myocardial: true }));
    edges.push(edge(b.id, a.id, p.distance / v, { myocardial: true }));
  }

  return { edges };
}

/** Deep-clone a conduction system so pathologies can modify edges. */
export function cloneConductionSystem(sys: ConductionSystem): ConductionSystem {
  return { edges: sys.edges.map((e) => ({ ...e })) };
}
