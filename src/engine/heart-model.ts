/**
 * heart-model.ts
 * Defines the heart as a set of myocardial wall elements.
 *
 * PHYSICAL MODEL (uniform double layer, 1-D cable per element)
 * ------------------------------------------------------------
 * Each element is a slab of myocardium through which an activation front
 * propagates along a single direction `direction` (unit vector):
 *
 *   - Ventricular elements: the front enters at the endocardial face and
 *     exits at the epicardial face (transmural propagation). `direction` is
 *     the outward wall normal, computed from the chamber geometry — NOT the
 *     myofiber direction. In the uniform-double-layer theory the dipole of a
 *     wavefront element points along the direction of propagation.
 *   - Atrial elements: the atrial wall is thin and activation spreads
 *     tangentially along it. `direction` is the local propagation direction
 *     along the wall; the front enters at the proximal edge and exits at the
 *     distal edge.
 *
 * For a 1-D cable of cross-section A the far-field dipole moment is
 *     p(t) = sigma_i * A * [Vm(entry, t) - Vm(exit, t)]   (along `direction`)
 * This single identity produces the QRS (entry depolarised, exit still at
 * rest), an isoelectric ST segment (both faces at plateau) and the T wave
 * (exit face repolarises first when APD_exit + crossing time < APD_entry).
 * See action-potential.ts for the time course.
 *
 * Element parameters are anatomical: mass, wall thickness, path length,
 * conduction velocity, action-potential durations at the two faces.
 * Dipole amplitude emerges as A = mass / (density * pathLength). The only
 * free scalar is the global GAIN that maps dipole units to millivolts.
 *
 * Coordinate system (Frank convention, torso frame):
 *   X+ = patient's left, Y+ = inferior, Z+ = anterior. Positions in cm.
 *
 * Sources: Durrer 1970 (activation sequence), Streeter 1979 / AHA 17-segment
 * model (geometry), Antzelevitch 2007 & Franz 1987 (APD gradients),
 * Hutchins 1978 (wall thickness), Malmivuo & Plonsey 1995 (UDL theory).
 */

import type { Vec3 } from './cardiac-vector';

// ── Types ─────────────────────────────────────────────────────────────────────

export type Chamber = 'ra' | 'la' | 'rv' | 'lv' | 'septum';
export type Propagation = 'transmural' | 'tangential';

export interface MyocardialSegment {
  id: string;
  /** Human-readable anatomical name */
  name: string;
  chamber: Chamber;
  propagation: Propagation;
  /** Centroid position in cm (Frank coordinates) */
  position: Vec3;
  /**
   * Unit propagation direction of the activation front through the element.
   * Transmural elements: outward wall normal (endo -> epi).
   * Tangential elements: direction of spread along the wall.
   */
  direction: Vec3;
  /** Element mass in grams */
  mass: number;
  /**
   * Length of the cable along `direction` in cm.
   * Transmural: wall thickness. Tangential: patch length along the wall.
   */
  pathLength: number;
  /**
   * Fraction of `pathLength` the front must actually traverse by cell-to-cell
   * conduction. Ventricular walls are penetrated by Purkinje fibres for the
   * inner ~1/3, so only ~0.7 of the thickness is crossed slowly. Tangential
   * elements traverse their full length (1.0).
   */
  slowFraction: number;
  /** Cell-to-cell conduction velocity along `direction` in m/s */
  conductionVelocity: number;
  /** Action-potential duration (ms, to 50% repolarisation) at the entry face */
  apdEntry: number;
  /** Action-potential duration (ms, to 50% repolarisation) at the exit face */
  apdExit: number;
  /** Sigmoid time constant of the upstroke / activation dispersion across a face (ms) */
  tauUp: number;
  /** Sigmoid time constant of phase-3 repolarisation (ms) */
  tauRepol: number;
  /** Phase-2 plateau decline, fraction of AP amplitude lost per ms */
  plateauSlope: number;
  /**
   * Minimum time (ms) for activation to sweep through the element, set by the
   * dispersion of Purkinje–muscle breakthrough across its endocardium. Thin
   * walls (RV) are swept tangentially from a few breakthrough points rather
   * than simultaneously, so this exceeds the transmural crossing time.
   */
  dispersionMs: number;
  /**
   * Fraction of the element's activation front that is spatially coherent
   * (contributes to the far-field dipole). A thin wall swept tangentially by
   * an expanding ring front has opposite sides of the ring cancelling; the
   * Purkinje-dense LV endocardium produces coherent transmural fronts (1.0).
   */
  coherence: number;
  /**
   * If true, the exit face has its own Purkinje supply (the septum: LV face
   * from the left bundle, RV face from the right bundle). The exit-face
   * activation time is then the earlier of (entry + crossing) and the
   * conduction-graph node `${id}:exit`.
   */
  dualEntry: boolean;
  /** Radius of curvature of the wall at this element (cm) — sets the injury-current geometry factor */
  curvatureRadius: number;
  /** Fraction of excitable tissue: 1 = healthy, 0 = infarcted (no depolarisation) */
  health: number;
  /**
   * Acute ischaemia severity 0..1. Ischaemic tissue has an elevated resting
   * potential, a lower and shorter plateau, and a slower upstroke. The
   * resulting potential difference against surrounding healthy tissue drives
   * the injury current across the border of the element (see action-potential.ts).
   */
  ischemia: number;
}

// ── Vector helpers ────────────────────────────────────────────────────────────

function norm(v: Vec3): Vec3 {
  const m = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / m, v[1] / m, v[2] / m];
}
function add(a: Vec3, b: Vec3): Vec3 { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function scale(a: Vec3, s: number): Vec3 { return [a[0] * s, a[1] * s, a[2] * s]; }
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: Vec3, b: Vec3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

// ── Anatomical constants ──────────────────────────────────────────────────────

/** Myocardial density, g/cm^3 */
export const MYOCARDIAL_DENSITY = 1.05;

/** Wall thickness in cm (Hutchins 1978; Scholz 1994) */
export const WALL_THICKNESS = {
  lv: 1.0,
  septum: 1.0,
  rv: 0.4,
  atria: 0.25,
} as const;

/** Conduction velocities, m/s (cardiac_physiology_reference.md section 7) */
export const CONDUCTION_VELOCITY = {
  /** cross-fibre (transmural) working myocardium — transverse propagation is slow */
  ventricularTransmural: 0.33,
  /** along-fibre atrial myocardium */
  atrial: 0.9,
  /** along-fibre ventricular spread between neighbouring wall elements (backup pathways) */
  ventricularMyocardial: 0.7,
} as const;

/** Fraction of ventricular wall thickness crossed by slow cell-to-cell conduction
 *  (the inner third is activated near-simultaneously by the Purkinje network). */
export const PURKINJE_PENETRATION_SLOW_FRACTION = 0.7;

/**
 * The RV free wall is swept tangentially from a few Purkinje breakthrough
 * points (Durrer 1970: apex → base over ~15–45 ms), so each element takes
 * ~30 ms to activate and roughly half of its front is an expanding ring whose
 * opposite sides cancel in the far field.
 */
export const RV_ACTIVATION_DISPERSION_MS = 30;
export const RV_FRONT_COHERENCE = 0.6;

/**
 * Action-potential durations (ms, to 50% repolarisation, at RR = 800 ms).
 * Transmural: epicardial APD is ~30 ms shorter than endocardial (Antzelevitch 2007).
 * Apex-to-base: apical APD is shorter than basal (Franz 1987) → base-to-apex
 * repolarisation vector, concordant with the QRS.
 * RV APD is ~15 ms shorter than LV.
 */
export const APD = {
  lvEndoBase: 300,
  /**
   * endo − epi. Human endocardial repolarisation ends ~20–30 ms after
   * epicardial (Franz 1987; Antzelevitch 2007) even though the epicardium is
   * activated ~20 ms later, so the APD difference itself is ~45 ms.
   */
  transmuralGradient: 45,
  apexBaseGradient: 15,     // base - apex
  rvOffset: -15,
  /** RV-side septal endocardium (RV-type cells) */
  septumRvFace: 285,
  atrial: 200,
} as const;

/** Rate adaptation exponent: APD(RR) = APD_800 * (RR/800)^exponent (Bazett-type). */
export const APD_RATE_EXPONENT = 0.5;
export const APD_REFERENCE_RR_MS = 800;

// ── Heart orientation & geometry ──────────────────────────────────────────────
//
// The LV is modelled as a truncated prolate ellipsoid. Its long axis points
// from the base toward the apex, which in the thorax is directed leftward,
// inferiorly and anteriorly (the "anatomical axis", ~45 deg to each plane).
// Wall patch centroids and outward normals are computed analytically from
// the ellipsoid — this is the source of all ventricular dipole directions.

/** Base -> apex unit vector in Frank coordinates (left, inferior, anterior). */
export const APEX_DIRECTION: Vec3 = norm([0.45, 0.75, 0.49]);

/** Centre of the LV base plane (mitral annulus level), cm from heart origin. */
const LV_BASE_CENTER: Vec3 = [-1.0, -2.5, -0.8];

/** LV ellipsoid: mid-wall radius at base plane and base-to-apex length (cm). */
const LV_RADIUS = 3.2;
const LV_LENGTH = 6.5;

/** In-plane basis of the short axis: lateral (left-ish) and anterior (chest-ish). */
const ANTERIOR_IN_PLANE: Vec3 = norm(add([0, 0, 1], scale(APEX_DIRECTION, -dot([0, 0, 1], APEX_DIRECTION))));
const LATERAL_IN_PLANE: Vec3 = norm(cross(APEX_DIRECTION, ANTERIOR_IN_PLANE));

/**
 * Rotation of the heart about its long axis (degrees, viewed from the apex).
 * The RV lies anterior to the LV, so the LV lateral wall faces left-posterior
 * and the septum faces right-anterior. This is the "clockwise/counter-
 * clockwise rotation" of ECG terminology; it sets the precordial transition.
 */
export const SECTOR_ROTATION_DEG = -30;

/** Sector angle convention in the short-axis plane (degrees, before rotation):
 *  0 = lateral (leftward), 90 = anterior, 180 = septal (rightward), 270 = inferior. */
function inPlane(thetaDeg: number): Vec3 {
  const th = ((thetaDeg + SECTOR_ROTATION_DEG) * Math.PI) / 180;
  return add(scale(LATERAL_IN_PLANE, Math.cos(th)), scale(ANTERIOR_IN_PLANE, Math.sin(th)));
}

/** Mid-wall radius of the LV ellipsoid at distance z from the base plane. */
function lvRadiusAt(zFromBase: number): number {
  const f = zFromBase / LV_LENGTH;
  return LV_RADIUS * Math.sqrt(Math.max(0, 1 - f * f));
}

/** Centroid and outward normal of an LV wall patch at (sector angle, depth from base). */
function lvPatch(thetaDeg: number, zFromBase: number): { position: Vec3; normal: Vec3 } {
  const r = lvRadiusAt(zFromBase);
  const radial = inPlane(thetaDeg);
  const position = add(LV_BASE_CENTER, add(scale(radial, r), scale(APEX_DIRECTION, zFromBase)));
  // Gradient of the ellipsoid x^2/R^2 + y^2/R^2 + z^2/L^2 = 1 at the patch
  const normal = norm(add(scale(radial, r / (LV_RADIUS * LV_RADIUS)), scale(APEX_DIRECTION, zFromBase / (LV_LENGTH * LV_LENGTH))));
  return { position, normal };
}

/** RV cavity centre: anterior-right of the LV axis, mid-level. */
const RV_AXIS_OFFSET = add(LV_BASE_CENTER, add(scale(inPlane(150), 4.2), scale(APEX_DIRECTION, 2.6)));
const RV_RADIUS = 2.6;

/** Centroid and outward normal of an RV free-wall patch. */
function rvPatch(phiDeg: number, zFromBase: number, apexTilt = 0): { position: Vec3; normal: Vec3 } {
  const radial = inPlane(phiDeg);
  const dz = zFromBase - 2.6;
  const position = add(RV_AXIS_OFFSET, add(scale(radial, RV_RADIUS), scale(APEX_DIRECTION, dz)));
  const normal = norm(add(radial, scale(APEX_DIRECTION, apexTilt)));
  return { position, normal };
}

// ── Element factory ───────────────────────────────────────────────────────────

interface ElementSpec {
  id: string;
  name: string;
  chamber: Chamber;
  position: Vec3;
  direction: Vec3;
  mass: number;
  pathLength: number;
  apdEntry: number;
  apdExit: number;
  propagation?: Propagation;
  slowFraction?: number;
  conductionVelocity?: number;
  tauUp?: number;
  tauRepol?: number;
  dispersionMs?: number;
  coherence?: number;
  dualEntry?: boolean;
  curvatureRadius?: number;
}

function element(s: ElementSpec): MyocardialSegment {
  const isAtrial = s.chamber === 'ra' || s.chamber === 'la';
  const propagation = s.propagation ?? (isAtrial ? 'tangential' : 'transmural');
  return {
    id: s.id,
    name: s.name,
    chamber: s.chamber,
    propagation,
    position: s.position,
    direction: norm(s.direction),
    mass: s.mass,
    pathLength: s.pathLength,
    slowFraction: s.slowFraction ?? (propagation === 'transmural' ? PURKINJE_PENETRATION_SLOW_FRACTION : 1.0),
    conductionVelocity: s.conductionVelocity ?? (isAtrial ? CONDUCTION_VELOCITY.atrial : CONDUCTION_VELOCITY.ventricularTransmural),
    apdEntry: s.apdEntry,
    apdExit: s.apdExit,
    tauUp: s.tauUp ?? (isAtrial ? 5 : 3),
    tauRepol: s.tauRepol ?? (isAtrial ? 18 : 10),
    plateauSlope: isAtrial ? 0.35 / APD.atrial : 0.20 / APD.lvEndoBase,
    dispersionMs: s.dispersionMs ?? (s.chamber === 'rv' ? RV_ACTIVATION_DISPERSION_MS : 0),
    coherence: s.coherence ?? (s.chamber === 'rv' ? RV_FRONT_COHERENCE : 1.0),
    dualEntry: s.dualEntry ?? false,
    curvatureRadius: s.curvatureRadius ?? (s.chamber === 'rv' ? RV_RADIUS : isAtrial ? 2.0 : LV_RADIUS),
    health: 1.0,
    ischemia: 0.0,
  };
}

/** LV wall patch element. `level` sets the apex-base APD gradient (0 = base, 1 = apex). */
function lvElement(
  id: string, name: string, chamber: 'lv' | 'septum',
  thetaDeg: number, zFromBase: number, mass: number, level: number,
): MyocardialSegment {
  const { position, normal } = lvPatch(thetaDeg, zFromBase);
  const apdEntry = APD.lvEndoBase - APD.apexBaseGradient * level;
  const septal = chamber === 'septum';
  return element({
    id, name, chamber, position, direction: normal, mass,
    pathLength: septal ? WALL_THICKNESS.septum : WALL_THICKNESS.lv,
    apdEntry,
    // Free wall: epicardial APD shorter. Septum: exit face is the RV-side
    // endocardium (RV-type cells, shorter APD), fed by the right bundle.
    apdExit: septal ? APD.septumRvFace - APD.apexBaseGradient * level : apdEntry - APD.transmuralGradient,
    dualEntry: septal,
  });
}

function rvElement(
  id: string, name: string, phiDeg: number, zFromBase: number, mass: number, level: number, apexTilt = 0,
): MyocardialSegment {
  const { position, normal } = rvPatch(phiDeg, zFromBase, apexTilt);
  const apdEntry = APD.lvEndoBase + APD.rvOffset - APD.apexBaseGradient * level;
  return element({
    id, name, chamber: 'rv', position, direction: normal, mass,
    pathLength: WALL_THICKNESS.rv,
    apdEntry,
    apdExit: apdEntry - APD.transmuralGradient,
  });
}

/** Atrial tangential element. Mass follows from thickness x width x length. */
function atrialElement(
  id: string, name: string, chamber: 'ra' | 'la',
  position: Vec3, direction: Vec3, frontWidth: number, pathLength: number,
): MyocardialSegment {
  const mass = MYOCARDIAL_DENSITY * WALL_THICKNESS.atria * frontWidth * pathLength;
  return element({
    id, name, chamber, position, direction, mass, pathLength,
    apdEntry: APD.atrial, apdExit: APD.atrial,
  });
}

// ── Default heart anatomy ─────────────────────────────────────────────────────
//
// Ventricular layout follows the AHA 17-segment model: 6 basal, 6 mid,
// 4 apical sectors plus the apex cap, with a separate RV free wall.
// Masses: LV incl. septum ~150 g, RV ~50 g, atria ~25 g each (atrial elements
// represent the activated front area, not the full chamber mass).
// Sector angles: 0 lateral, 90 anterior, 180 septal, 270 inferior.

export function buildDefaultSegments(): MyocardialSegment[] {
  const Z_BASE = 0.8, Z_MID = 3.0, Z_APICAL = 5.0, Z_APEX = 6.3;

  return [
    // ── Right atrium (tangential elements, SA node at superior RA) ─────────
    // Front width = length of the activation ring sweeping the wall (cm).
    atrialElement('ra-superior',  'RA superior (SA node region)', 'ra', [-3.0, -5.0, +0.5], [0.30, 0.85, 0.40], 4.5, 2.5),
    atrialElement('ra-free',      'RA free wall',                 'ra', [-3.8, -3.0, +1.0], [0.20, 0.95, 0.00], 4.5, 2.5),
    atrialElement('ra-septal',    'RA septal / AV junction',      'ra', [-1.2, -2.5, +0.0], [0.45, 0.85, -0.20], 3.5, 2.5),

    // ── Left atrium (activated via Bachmann's bundle from the right) ───────
    atrialElement('la-anterior',  'LA roof / Bachmann',           'la', [+1.5, -4.8, -0.8], [0.90, 0.20, -0.40], 4.0, 2.5),
    atrialElement('la-posterior', 'LA posterior wall',            'la', [+4.0, -4.0, -2.2], [0.60, 0.50, -0.65], 4.0, 2.5),
    atrialElement('la-inferior',  'LA inferior (mitral annulus)', 'la', [+2.8, -2.5, -2.5], [0.30, 0.90, -0.30], 3.0, 2.0),

    // ── Interventricular septum ───────────────────────────────────────────
    // Each septal element is a full-thickness cable from the LV endocardium
    // (entry, left bundle) to the RV endocardium (exit, right bundle). Its
    // dipole is A·(Vm_LV − Vm_RV): rightward while only the left face is
    // depolarised, zero once both are — the classic brief septal vector.
    lvElement('sept-base-ant', 'Basal anteroseptal', 'septum', 150, Z_BASE, 9.0, 0.0),
    lvElement('sept-base-inf', 'Basal inferoseptal', 'septum', 210, Z_BASE, 9.0, 0.0),
    lvElement('sept-mid-ant',  'Mid anteroseptal',   'septum', 150, Z_MID, 9.0, 0.5),
    lvElement('sept-mid-inf',  'Mid inferoseptal',   'septum', 210, Z_MID, 9.0, 0.5),
    lvElement('sept-apical',   'Apical septal',      'septum', 180, Z_APICAL, 7.0, 0.8),

    // ── LV free wall — basal ring ─────────────────────────────────────────
    lvElement('lv-base-ant',    'Basal anterior',      'lv',  90, Z_BASE, 9.0, 0.0),
    lvElement('lv-base-antlat', 'Basal anterolateral', 'lv',  30, Z_BASE, 9.0, 0.0),
    lvElement('lv-base-inflat', 'Basal inferolateral', 'lv', 330, Z_BASE, 9.0, 0.0),
    lvElement('lv-base-inf',    'Basal inferior',      'lv', 270, Z_BASE, 9.0, 0.0),

    // ── LV free wall — mid ring ───────────────────────────────────────────
    lvElement('lv-mid-ant',     'Mid anterior',        'lv',  90, Z_MID, 8.5, 0.5),
    lvElement('lv-mid-antlat',  'Mid anterolateral',   'lv',  30, Z_MID, 8.5, 0.5),
    lvElement('lv-mid-inflat',  'Mid inferolateral',   'lv', 330, Z_MID, 8.5, 0.5),
    lvElement('lv-mid-inf',     'Mid inferior',        'lv', 270, Z_MID, 8.5, 0.5),

    // ── LV — apical ring and apex ─────────────────────────────────────────
    lvElement('lv-apical-ant',  'Apical anterior',     'lv',  90, Z_APICAL, 7.0, 0.8),
    lvElement('lv-apical-lat',  'Apical lateral',      'lv',   0, Z_APICAL, 7.0, 0.8),
    lvElement('lv-apical-inf',  'Apical inferior',     'lv', 270, Z_APICAL, 7.0, 0.8),
    lvElement('lv-apex',        'Apex',                'lv',   0, Z_APEX, 6.0, 1.0),

    // ── RV free wall ──────────────────────────────────────────────────────
    rvElement('rv-outflow',   'RV outflow tract',     110, 0.0, 8.0, 0.0),
    rvElement('rv-ant-base',  'RV anterior, basal',   100, 1.5, 8.0, 0.2),
    rvElement('rv-ant-mid',   'RV anterior, mid',     125, 3.5, 9.0, 0.5),
    rvElement('rv-lateral',   'RV lateral (acute margin)', 190, 3.0, 8.0, 0.4),
    rvElement('rv-inferior',  'RV inferior',          255, 3.5, 8.0, 0.5),
    rvElement('rv-apex',      'RV apex',              150, 5.0, 6.0, 1.0, 1.2),
  ];
}

/** Deep-clone a segment array so pathologies can mutate without affecting the base. */
export function cloneSegments(segments: MyocardialSegment[]): MyocardialSegment[] {
  return segments.map((s) => ({
    ...s,
    position: [...s.position] as Vec3,
    direction: [...s.direction] as Vec3,
  }));
}

/**
 * Time (ms) for the activation front to sweep the element from entry face to
 * exit face: the slow cell-to-cell crossing of `slowFraction * pathLength`,
 * or the endocardial breakthrough dispersion if that is longer.
 */
export function crossingTimeMs(seg: MyocardialSegment): number {
  // pathLength cm, velocity m/s = 100 cm/s → ms = cm / (cm/ms) = cm / (v*0.1)
  const transit = (seg.pathLength * seg.slowFraction) / (seg.conductionVelocity * 0.1);
  return Math.max(transit, seg.dispersionMs);
}

/**
 * Cross-sectional area (cm^2) of the activation front through an element.
 * The front sweeps the slowly-conducted volume (slowFraction * mass / density)
 * in crossingTimeMs at velocity v, so A = volume / (v * crossingTime).
 * For a purely transmural wall this reduces to mass / (density * thickness).
 */
export function frontArea(seg: MyocardialSegment): number {
  const volume = (seg.slowFraction * seg.mass) / MYOCARDIAL_DENSITY;
  return (seg.coherence * volume) / (seg.conductionVelocity * 0.1 * crossingTimeMs(seg));
}

/** Wall surface area of an element (cm^2): mass / (density x thickness). */
export function surfaceArea(seg: MyocardialSegment): number {
  return seg.mass / (MYOCARDIAL_DENSITY * seg.pathLength);
}

export function isAtrial(seg: MyocardialSegment): boolean {
  return seg.chamber === 'ra' || seg.chamber === 'la';
}
