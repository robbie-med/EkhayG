/**
 * pathology.ts — Physics-based pathology model.
 *
 * Pathologies are modifications to tissue properties and conduction edges.
 * The ECG morphology emerges from the altered propagation and dipole
 * summation; nothing here draws a waveform.
 *
 * Categories:
 *   - conduction: block bundle branches (BBB) or add accessory pathways (WPW)
 *   - hypertrophy: thicker, heavier ventricular walls (+ repolarisation changes)
 *   - atrial: enlarged atria (longer, wider activation fronts)
 *   - ischemia: artery occlusion → acute ischaemia + injury current in its territory
 */

import type { MyocardialSegment } from './heart-model';
import { APD, WALL_THICKNESS, MYOCARDIAL_DENSITY, CONDUCTION_VELOCITY } from './heart-model';
import type { ConductionSystem } from './conduction-graph';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ConditionCategory = 'conduction' | 'hypertrophy' | 'atrial';

export interface ConditionPreset {
  id: string;
  name: string;
  category: ConditionCategory;
  description: string;
  /** Colour for 3D condition vector visualisation */
  vectorColor: string;
  /** Apply this condition's modifications to elements and conduction system */
  apply: (segments: MyocardialSegment[], conduction: ConductionSystem) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function blockEdge(conduction: ConductionSystem, from: string, to: string): void {
  for (const e of conduction.edges) {
    if (e.from === from && e.to === to) e.blocked = true;
  }
}

function addEdge(conduction: ConductionSystem, from: string, to: string, delayMs: number, accessory = false): void {
  conduction.edges.push({ from, to, delayMs, blocked: false, accessory });
}

function modifySegments(
  segments: MyocardialSegment[],
  filter: (s: MyocardialSegment) => boolean,
  modify: (s: MyocardialSegment) => void,
): void {
  for (const s of segments) if (filter(s)) modify(s);
}

// ── Condition presets ─────────────────────────────────────────────────────────

export const CONDITION_PRESETS: Record<string, ConditionPreset> = {
  // ── Conduction ────────────────────────────────────────────────────────────

  lbbb: {
    id: 'lbbb',
    name: 'LBBB',
    category: 'conduction',
    description: 'Left bundle branch block — LV activates late by slow cell-to-cell spread from the RV side of the septum',
    vectorColor: '#aa44ff',
    apply(_segments, conduction) {
      blockEdge(conduction, 'his', 'lbb');
    },
  },

  rbbb: {
    id: 'rbbb',
    name: 'RBBB',
    category: 'conduction',
    description: 'Right bundle branch block — RV activates late by slow cell-to-cell spread across the septum',
    vectorColor: '#4488ff',
    apply(_segments, conduction) {
      blockEdge(conduction, 'his', 'rbb');
    },
  },

  wpw: {
    id: 'wpw',
    name: 'WPW',
    category: 'conduction',
    description: 'Wolff-Parkinson-White — left lateral accessory pathway bypasses the AV node and pre-excites the basal lateral LV',
    vectorColor: '#ff8800',
    apply(segments, conduction) {
      // Accessory pathway (bundle of Kent) across the left AV groove: atrial
      // activation reaches the LA posterior wall at ~60 ms; the pathway
      // conducts in ~45 ms, so ventricular pre-excitation begins at ~105 ms
      // (short PR). From the insertion the wave spreads tangentially through
      // working myocardium, away from the left AV groove toward the septum
      // (rightward and anterior: positive delta in V1, negative in I/aVL —
      // the "type A" pattern of a left lateral pathway), until the
      // His-Purkinje wave takes over (fusion).
      const insertion = segments.find((s) => s.id === 'lv-base-inflat');
      const target = segments.find((s) => s.id === 'sept-mid-ant');
      if (insertion && target) {
        const d: [number, number, number] = [
          target.position[0] - insertion.position[0],
          target.position[1] - insertion.position[1],
          target.position[2] - insertion.position[2],
        ];
        const m = Math.hypot(d[0], d[1], d[2]) || 1;
        const pathLength = 3.0;  // cm of wall swept before the Purkinje wave takes over
        const frontWidth = 3.0;  // cm
        segments.push({
          id: 'wpw-preexcitation',
          name: 'Pre-excited basal lateral wall (accessory pathway insertion)',
          chamber: 'lv',
          propagation: 'tangential',
          position: [...insertion.position] as [number, number, number],
          direction: [d[0] / m, d[1] / m, d[2] / m],
          mass: MYOCARDIAL_DENSITY * WALL_THICKNESS.lv * frontWidth * pathLength,
          pathLength,
          slowFraction: 1.0,
          conductionVelocity: CONDUCTION_VELOCITY.ventricularMyocardial,
          apdEntry: insertion.apdEntry,
          apdExit: insertion.apdEntry,
          tauUp: insertion.tauUp,
          tauRepol: insertion.tauRepol,
          plateauSlope: insertion.plateauSlope,
          dispersionMs: 0,
          coherence: 1.0,
          dualEntry: false,
          curvatureRadius: insertion.curvatureRadius,
          health: 1.0,
          ischemia: 0,
        });
        // The pre-excited tissue is a slice of the basal lateral wall.
        insertion.mass = Math.max(1, insertion.mass - 4);
      }
      addEdge(conduction, 'la-posterior', 'wpw-preexcitation', 45, true);
      // The pathway inserts on the EPICARDIAL side of the AV groove, so the
      // pre-excited wall elements depolarise epi → endo (reversed transmural
      // direction). Model them as dual-entry elements whose exit (epicardial)
      // face is reached by the pathway; the endocardial face follows after
      // the transmural crossing unless the Purkinje wave arrives first.
      for (const [id, delay] of [['lv-base-inflat', 50], ['lv-base-antlat', 65]] as const) {
        const s = segments.find((x) => x.id === id);
        if (!s) continue;
        s.dualEntry = true;
        const cross = (s.pathLength * s.slowFraction) / (s.conductionVelocity * 0.1);
        addEdge(conduction, id, `${id}:exit`, cross);
        addEdge(conduction, `${id}:exit`, id, cross);
        addEdge(conduction, 'la-posterior', `${id}:exit`, delay, true);
      }
    },
  },

  // ── Hypertrophy ────────────────────────────────────────────────────────────

  lvh: {
    id: 'lvh',
    name: 'LVH',
    category: 'hypertrophy',
    description: 'Left ventricular hypertrophy — thicker, heavier LV wall; prolonged transmural crossing and epicardial APD (strain)',
    vectorColor: '#ff4444',
    apply(segments) {
      // Concentric LVH: wall 10 → 15 mm, mass +60%. Front area (mass/thickness)
      // barely changes but the slow transmural crossing lengthens, so each
      // element's dipole lasts longer and the summed voltage grows.
      // Hypertrophied sub-epicardial cells prolong their APD more than
      // sub-endocardial cells, reversing the transmural gradient → the
      // repolarisation vector turns away from the thick wall (strain pattern).
      modifySegments(segments, (s) => s.chamber === 'lv', (s) => {
        s.pathLength *= 1.5;
        s.mass *= 1.6;
        s.apdExit += APD.transmuralGradient + 5;   // epi now ~5 ms longer than endo
        s.apdEntry += 5;
      });
      modifySegments(segments, (s) => s.chamber === 'septum', (s) => {
        s.pathLength *= 1.3;
        s.mass *= 1.3;
      });
    },
  },

  rvh: {
    id: 'rvh',
    name: 'RVH',
    category: 'hypertrophy',
    description: 'Right ventricular hypertrophy — RV wall thickens toward LV values, adding rightward/anterior forces',
    vectorColor: '#44bbff',
    apply(segments) {
      // RV free wall 4 → 9 mm, mass ×2.5 (pressure overload). The RV dipoles,
      // directed right and anterior, no longer cancel inside the LV forces.
      // RV free wall 4 → 10 mm, mass ×3 (systemic-level pressure load).
      modifySegments(segments, (s) => s.chamber === 'rv', (s) => {
        s.pathLength *= 2.5;
        s.mass *= 3.0;
        s.apdExit += 25;   // RV strain: transmural gradient reduced/reversed
        s.apdEntry += 10;
      });
    },
  },

  // ── Atrial ────────────────────────────────────────────────────────────────

  lae: {
    id: 'lae',
    name: 'LAE',
    category: 'atrial',
    description: 'Left atrial enlargement — longer LA activation path: broad, notched P with a deep terminal negative P in V1',
    vectorColor: '#ffcc00',
    apply(segments, conduction) {
      // Dilated LA: each activation front travels further (path ×1.6) and the
      // front is wider (mass scales with both). Interatrial conduction slows.
      modifySegments(segments, (s) => s.chamber === 'la', (s) => {
        s.pathLength *= 1.5;
        s.mass *= 1.5 * 1.2;
      });
      for (const e of conduction.edges) {
        if (e.from === 'ra-superior' && e.to === 'la-anterior') e.delayMs += 15;
        if (e.from === 'la-anterior') e.delayMs *= 1.3;
      }
    },
  },

  rae: {
    id: 'rae',
    name: 'RAE',
    category: 'atrial',
    description: 'Right atrial enlargement — wider RA activation fronts: tall, peaked P wave (P pulmonale)',
    vectorColor: '#00ddaa',
    apply(segments) {
      // Dilated/hypertrophied RA: wider fronts (front area ×1.8) over a
      // slightly longer path; RA and LA components still overlap in time so
      // the P grows taller rather than broader.
      modifySegments(segments, (s) => s.chamber === 'ra', (s) => {
        s.mass *= 1.8;
      });
    },
  },
};

// ── Apply conditions ──────────────────────────────────────────────────────────

export function applyConditions(
  activeConditions: string[],
  segments: MyocardialSegment[],
  conduction: ConductionSystem,
): void {
  for (const id of activeConditions) {
    const preset = CONDITION_PRESETS[id];
    if (preset) preset.apply(segments, conduction);
  }
}

// ── Artery occlusion / ischaemia ──────────────────────────────────────────────

/** Which element IDs are perfused by each coronary artery */
export const ARTERY_TERRITORY: Record<string, string[]> = {
  // Left anterior descending: anterior wall, anterior 2/3 of septum, apex
  lad: [
    'sept-base-ant', 'sept-mid-ant', 'sept-apical', 'sept-rv-face',
    'lv-base-ant', 'lv-mid-ant', 'lv-apical-ant', 'lv-apex', 'lv-apical-lat',
  ],
  // First diagonal: basal/mid anterior and anterolateral
  d1: ['lv-base-ant', 'lv-mid-ant', 'lv-base-antlat'],
  // Left circumflex: lateral and inferolateral walls
  lcx: [
    'lv-base-antlat', 'lv-mid-antlat', 'lv-base-inflat', 'lv-mid-inflat', 'lv-apical-lat',
  ],
  // Obtuse marginal: mid/apical lateral
  om: ['lv-mid-antlat', 'lv-mid-inflat', 'lv-apical-lat'],
  // Right coronary: RV free wall, inferior LV, inferior septum (via PDA)
  rca: [
    'rv-outflow', 'rv-ant-base', 'rv-ant-mid', 'rv-lateral', 'rv-inferior', 'rv-apex',
    'lv-base-inf', 'lv-mid-inf', 'lv-apical-inf', 'lv-base-inflat',
    'sept-base-inf', 'sept-mid-inf',
  ],
  // Posterior descending: inferior septum and inferior wall
  pda: ['sept-base-inf', 'sept-mid-inf', 'lv-base-inf', 'lv-mid-inf', 'lv-apical-inf'],
};

/** Severity of acute transmural ischaemia applied to an occluded territory (0..1). */
export const OCCLUSION_ISCHEMIA_SEVERITY = 1.0;
/** Fraction of excitable tissue remaining in acutely ischaemic myocardium. */
export const OCCLUSION_HEALTH = 0.8;

/**
 * Apply acute ischaemia to elements in the territories of occluded arteries.
 * `arteries[key] === false` means occluded.
 */
export function applyIschemia(
  arteries: Record<string, boolean>,
  segments: MyocardialSegment[],
): void {
  for (const [arteryKey, isPatent] of Object.entries(arteries)) {
    if (isPatent) continue;
    const territory = ARTERY_TERRITORY[arteryKey];
    if (!territory) continue;
    const set = new Set(territory);
    for (const seg of segments) {
      if (!set.has(seg.id)) continue;
      seg.ischemia = Math.max(seg.ischemia, OCCLUSION_ISCHEMIA_SEVERITY);
      seg.health = Math.min(seg.health, OCCLUSION_HEALTH);
    }
  }
}

/** Centroid (Frank cm) of an artery's territory — for 3D visualisation. */
export function territoryCentroid(arteryKey: string, segments: MyocardialSegment[]): [number, number, number] | null {
  const ids = new Set(ARTERY_TERRITORY[arteryKey] ?? []);
  let n = 0, x = 0, y = 0, z = 0;
  for (const s of segments) {
    if (!ids.has(s.id)) continue;
    n++; x += s.position[0]; y += s.position[1]; z += s.position[2];
  }
  return n ? [x / n, y / n, z / n] : null;
}

export const PATHOLOGY_PRESETS = CONDITION_PRESETS;
