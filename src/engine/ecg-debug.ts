/**
 * ecg-debug.ts — standalone validation harness (Node or browser console).
 *
 *   npx tsx src/engine/ecg-debug.ts            # normal sinus rhythm
 *   npx tsx src/engine/ecg-debug.ts all        # every condition and artery
 *   npx tsx src/engine/ecg-debug.ts lbbb       # one condition id
 *   npx tsx src/engine/ecg-debug.ts lad        # one artery occluded
 *   HR=120 npx tsx src/engine/ecg-debug.ts     # other heart rate
 *
 * Measures intervals, amplitudes, QRS/P/T axes and R-wave progression from
 * the cached 12-lead time series and checks them against clinical ranges.
 */

import { updateSimulation } from './simulation-cache';
import type { SimulationConfig, SimulationState } from './simulation-cache';
import { LEAD_NAMES } from './lead-calculator';
import type { LeadName } from './lead-calculator';
import { CONDITION_PRESETS, ARTERY_TERRITORY } from './pathology';

// ── Measurement ───────────────────────────────────────────────────────────────

export interface LeadMetrics {
  q: number; r: number; s: number;   // Q trough, R peak, S trough (mV) within QRS
  st: number;                        // ST level 60 ms after QRS end (J+60)
  tPeak: number;                     // signed T extremum
  pPeak: number; pMin: number;       // P extremes
}

export interface ECGMetrics {
  config: SimulationConfig;
  prMs: number; pDurMs: number; qrsMs: number; qtMs: number; qtcMs: number;
  qrsAxisDeg: number; pAxisDeg: number; tAxisDeg: number;
  leads: Record<LeadName, LeadMetrics>;
  sim: SimulationState;
}

function extreme(a: Float32Array, from: number, to: number, sign: 1 | -1): { v: number; t: number } {
  let best = -Infinity, bt = from;
  for (let i = Math.max(0, Math.floor(from)); i <= Math.min(a.length - 1, Math.ceil(to)); i++) {
    const v = a[i] * sign;
    if (v > best) { best = v; bt = i; }
  }
  return { v: best * sign, t: bt };
}

function meanOver(a: Float32Array, from: number, to: number): number {
  let s = 0, n = 0;
  for (let i = Math.max(0, Math.floor(from)); i <= Math.min(a.length - 1, Math.ceil(to)); i++) { s += a[i]; n++; }
  return n ? s / n : 0;
}

/** Frontal-plane axis from net areas in leads I and aVF. */
function axisDeg(leads: Record<LeadName, Float32Array>, from: number, to: number): number {
  const i = meanOver(leads.I, from, to), f = meanOver(leads.aVF, from, to);
  return Math.round((Math.atan2(f, i) * 180) / Math.PI);
}

/** Threshold-based onset/offset around the model's phase boundaries. */
function findOnset(leads: Record<LeadName, Float32Array>, approx: number, window: number, thresh: number): number {
  for (let t = Math.max(0, Math.floor(approx - window)); t < approx + window; t++) {
    for (const l of LEAD_NAMES) if (Math.abs(leads[l][t]) > thresh) return t;
  }
  return approx;
}
function findOffset(leads: Record<LeadName, Float32Array>, approx: number, window: number, thresh: number): number {
  const N = leads.I.length;
  for (let t = Math.min(N - 1, Math.ceil(approx + window)); t > approx - window; t--) {
    for (const l of LEAD_NAMES) if (Math.abs(leads[l][t]) > thresh) return t;
  }
  return approx;
}

/** Offset relative to the level 30 ms after the approximate end (ignores Ta/ST offsets). */
function findOffsetRel(leads: Record<LeadName, Float32Array>, approx: number, before: number, after: number, thresh: number): number {
  const N = leads.I.length;
  const refIdx = Math.min(N - 1, Math.round(approx + 30));
  for (let t = Math.min(N - 1, Math.ceil(approx + after)); t > approx - before; t--) {
    for (const l of LEAD_NAMES) if (Math.abs(leads[l][t] - leads[l][refIdx]) > thresh) return t;
  }
  return approx;
}

export function analyzeECG(config: SimulationConfig): ECGMetrics {
  const sim = updateSimulation(config);
  const pb = sim.activationMap.phaseBoundaries;
  const L = sim.leadCache;

  // Onsets/offsets measured from the traces (0.02 mV threshold), seeded by phase boundaries
  const pOn = findOnset(L, pb.pStart, 15, 0.015);
  const qrsOn = findOnset(L, pb.qrsStart, 15, 0.03);
  const pOff = Math.min(findOffset(L, pb.pEnd, 25, 0.015), qrsOn - 2);
  const qrsOff = findOffsetRel(L, pb.qrsEnd, 30, 12, 0.05);
  const tOff = findOffset(L, pb.tEnd, 40, 0.02);

  const rr = 60000 / config.heartRateBpm;
  const qt = tOff - qrsOn;

  const leads = {} as Record<LeadName, LeadMetrics>;
  for (const l of LEAD_NAMES) {
    const a = L[l];
    const rPk = extreme(a, qrsOn, qrsOff, 1);
    // Q = negative deflection before R peak; S = negative deflection after R peak
    const q = Math.min(0, extreme(a, qrsOn, rPk.t, -1).v);
    const s = Math.min(0, extreme(a, rPk.t, qrsOff, -1).v);
    const tMax = extreme(a, qrsOff + 40, tOff, 1), tMin = extreme(a, qrsOff + 40, tOff, -1);
    leads[l] = {
      q, r: Math.max(0, rPk.v), s,
      st: a[Math.min(a.length - 1, qrsOff + 60)],
      tPeak: Math.abs(tMax.v) >= Math.abs(tMin.v) ? tMax.v : tMin.v,
      pPeak: extreme(a, pOn, pOff, 1).v,
      pMin: extreme(a, pOn, pOff, -1).v,
    };
  }

  return {
    config,
    prMs: qrsOn - pOn,
    pDurMs: pOff - pOn,
    qrsMs: qrsOff - qrsOn,
    qtMs: qt,
    qtcMs: Math.round(qt / Math.sqrt(rr / 1000)),
    qrsAxisDeg: axisDeg(L, qrsOn, qrsOff),
    pAxisDeg: axisDeg(L, pOn, pOff),
    tAxisDeg: axisDeg(L, qrsOff + 40, tOff),
    leads,
    sim,
  };
}

// ── Report ────────────────────────────────────────────────────────────────────

const f2 = (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2);
const ok = (b: boolean) => (b ? 'ok  ' : 'FAIL');

export function formatReport(m: ECGMetrics, title: string): string {
  const out: string[] = [];
  const ln = (s = '') => out.push(s);
  const II = m.leads.II;
  ln('='.repeat(78));
  ln(`[ECG] ${title} — ${m.config.heartRateBpm} bpm`);
  ln('='.repeat(78));
  ln(`  PR ${m.prMs.toFixed(0)} ms  P ${m.pDurMs.toFixed(0)} ms  QRS ${m.qrsMs.toFixed(0)} ms  QT ${m.qtMs.toFixed(0)} ms  QTc ${m.qtcMs} ms`);
  ln(`  Axis: QRS ${m.qrsAxisDeg}°  P ${m.pAxisDeg}°  T ${m.tAxisDeg}°`);
  ln(`  Lead II: P ${f2(II.pPeak)}  Q ${f2(II.q)}  R ${f2(II.r)}  S ${f2(II.s)}  ST ${f2(II.st)}  T ${f2(II.tPeak)} mV`);
  ln('  Lead     Q      R      S      ST     T      P');
  for (const l of LEAD_NAMES) {
    const x = m.leads[l];
    ln(`  ${l.padEnd(4)} ${f2(x.q).padStart(6)} ${f2(x.r).padStart(6)} ${f2(x.s).padStart(6)} ${f2(x.st).padStart(6)} ${f2(x.tPeak).padStart(6)} ${f2(x.pPeak).padStart(6)}`);
  }
  return out.join('\n');
}

export function formatNSRChecks(m: ECGMetrics): string {
  const L = m.leads;
  const rows: [string, string, boolean][] = [
    ['PR 120–200 ms', `${m.prMs.toFixed(0)}`, m.prMs >= 120 && m.prMs <= 200],
    ['P duration 80–120 ms', `${m.pDurMs.toFixed(0)}`, m.pDurMs >= 80 && m.pDurMs <= 120],
    ['QRS 70–100 ms', `${m.qrsMs.toFixed(0)}`, m.qrsMs >= 70 && m.qrsMs <= 100],
    ['QTc 350–440 ms', `${m.qtcMs}`, m.qtcMs >= 350 && m.qtcMs <= 440],
    ['QRS axis 0–90°', `${m.qrsAxisDeg}`, m.qrsAxisDeg >= 0 && m.qrsAxisDeg <= 90],
    ['P axis 0–75°', `${m.pAxisDeg}`, m.pAxisDeg >= 0 && m.pAxisDeg <= 75],
    ['T axis within 45° of QRS', `${m.tAxisDeg}`, Math.abs(((m.tAxisDeg - m.qrsAxisDeg + 540) % 360) - 180) <= 45],
    ['II P 0.10–0.25 mV', f2(L.II.pPeak), L.II.pPeak >= 0.10 && L.II.pPeak <= 0.25],
    ['II R 0.6–1.5 mV', f2(L.II.r), L.II.r >= 0.6 && L.II.r <= 1.5],
    ['II T upright 0.1–0.5 mV', f2(L.II.tPeak), L.II.tPeak >= 0.1 && L.II.tPeak <= 0.5],
    ['II ST |<0.05| mV', f2(L.II.st), Math.abs(L.II.st) < 0.05],
    ['I QRS net positive', f2(L.I.r + L.I.s + L.I.q), L.I.r + L.I.s + L.I.q > 0],
    ['aVR QRS net negative', f2(L.aVR.r + L.aVR.s + L.aVR.q), L.aVR.r + L.aVR.s + L.aVR.q < 0],
    ['aVR T negative', f2(L.aVR.tPeak), L.aVR.tPeak < 0],
    ['V1 rS (r < |S|, r < 0.5)', `r ${f2(L.V1.r)} S ${f2(L.V1.s)}`, L.V1.r < -L.V1.s && L.V1.r < 0.5],
    ['V2 R < |S|', `r ${f2(L.V2.r)} S ${f2(L.V2.s)}`, L.V2.r < -L.V2.s],
    ['Transition V3–V4', `V3 ${f2(L.V3.r + L.V3.s)} V4 ${f2(L.V4.r + L.V4.s)}`, L.V3.r + L.V3.s + L.V4.r + L.V4.s > -0.3],
    ['V5/V6 tall R, small S', `V5 R ${f2(L.V5.r)} S ${f2(L.V5.s)}`, L.V5.r > 0.8 && -L.V5.s < 0.4 * L.V5.r],
    ['V6 small septal q', f2(L.V6.q), L.V6.q < 0 && L.V6.q > -0.3],
    ['R progression V1<V2<V3<V4', `${f2(L.V1.r)} ${f2(L.V2.r)} ${f2(L.V3.r)} ${f2(L.V4.r)}`, L.V1.r < L.V2.r && L.V2.r < L.V3.r && L.V3.r <= L.V4.r + 0.05],
    ['S regression |S|V2 > |S|V4 > |S|V6', `${f2(L.V2.s)} ${f2(L.V4.s)} ${f2(L.V6.s)}`, L.V2.s < L.V4.s && L.V4.s <= L.V6.s + 0.02],
    ['T upright V3–V6', `${f2(L.V3.tPeak)} ${f2(L.V4.tPeak)} ${f2(L.V5.tPeak)} ${f2(L.V6.tPeak)}`, L.V3.tPeak > 0 && L.V4.tPeak > 0 && L.V5.tPeak > 0 && L.V6.tPeak > 0],
    ['V1 P biphasic/terminal neg', `+${L.V1.pPeak.toFixed(2)} ${f2(L.V1.pMin)}`, L.V1.pMin < -0.01],
  ];
  const out = ['  Normal sinus rhythm checks:'];
  let pass = 0;
  for (const [name, val, b] of rows) { out.push(`   ${ok(b)} ${name.padEnd(36)} ${val}`); if (b) pass++; }
  out.push(`   ${pass}/${rows.length} passed`);
  return out.join('\n');
}

// ── Scenarios ─────────────────────────────────────────────────────────────────

const ALL_PATENT = { lad: true, d1: true, lcx: true, om: true, rca: true, pda: true };

export function scenarioConfig(name: string, heartRateBpm = 75): SimulationConfig {
  if (name in CONDITION_PRESETS) return { heartRateBpm, activeConditions: [name], arteries: { ...ALL_PATENT } };
  if (name in ARTERY_TERRITORY) return { heartRateBpm, activeConditions: [], arteries: { ...ALL_PATENT, [name]: false } };
  return { heartRateBpm, activeConditions: [], arteries: { ...ALL_PATENT } };
}

export function runECGDebug(scenario = 'nsr', heartRateBpm = 75): string {
  const names = scenario === 'all'
    ? ['nsr', ...Object.keys(CONDITION_PRESETS), ...Object.keys(ARTERY_TERRITORY)]
    : [scenario];
  const parts: string[] = [];
  for (const n of names) {
    const m = analyzeECG(scenarioConfig(n, heartRateBpm));
    parts.push(formatReport(m, n.toUpperCase()));
    if (n === 'nsr') parts.push(formatNSRChecks(m));
  }
  const text = parts.join('\n\n');
  console.log(text);
  return text;
}

// CLI entry point (tsx) — not executed when imported by the browser bundle.
declare const process: { argv?: string[]; env?: Record<string, string | undefined> } | undefined;
if (typeof process !== 'undefined' && process?.argv && /ecg-debug/.test(process.argv[1] ?? '')) {
  runECGDebug(process.argv[2] ?? 'nsr', Number(process.env?.HR ?? 75));
}
