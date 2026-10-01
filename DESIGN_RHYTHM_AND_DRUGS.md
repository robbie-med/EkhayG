# Design: rhythm layer, ectopic foci and drugs

Status: design only (2026-10-01). The physics engine was rebuilt with this in
mind; nothing below is implemented yet.

## Goal

- Drugs and electrolytes that "poison" the heart (Na/K/Ca channel blockers,
  digoxin, beta-blockers, hyper/hypokalaemia, hypercalcaemia, …).
- Ectopic foci that fire on their own, produce PVCs / ventricular tachycardia,
  degenerate into fibrillation and kill the heart.
- Treatment with drugs (and defibrillation / pacing) that reverses the state.
- Keep the Windows XP look; new controls are XP group boxes like the rest.

## Why the current engine cannot do it

`simulation-cache.ts` solves ONE activation sequence (Dijkstra) and caches
ONE beat; the renderers wrap it modulo the cycle length. Arrhythmia is by
definition beat-to-beat variation, and re-entry requires refractoriness
(a wave may only re-excite tissue that has recovered). Dijkstra is the
special case "every node accepts the first wave and nothing else".

## Architecture

```
            ┌────────────────────┐   per-node parameters      ┌──────────────┐
 drugs,     │  TissueState        │ ─────────────────────────▶ │ RhythmEngine │
 ions,      │  (per element /     │  SA rate, AV delay, CV,   │ (discrete-   │
 ischaemia  │   per node)         │  APD, refractory, foci    │  event sim)  │
            └────────────────────┘                            └──────┬───────┘
                                                                     │ activation events
                                                                     ▼
                                                     ┌──────────────────────────┐
                                                     │ DipoleStream             │
                                                     │ sum of element APs from  │
                                                     │ their recent activations │
                                                     └──────────┬───────────────┘
                                                                ▼
                                                     leads at 1 ms → renderers
```

### 1. TissueState (what drugs act on)

Every element already carries the cellular knobs; drugs modulate them:

| Parameter (exists today)        | Physiology                   | Drug / state examples                         |
|---------------------------------|------------------------------|-----------------------------------------------|
| `tauUp`, `conductionVelocity`   | I_Na availability            | class I antiarrhythmics, hyperkalaemia, TCA overdose → wide QRS |
| `apdEntry/apdExit`, `tauRepol`  | I_Kr / I_Ks                  | class III, hypokalaemia, hypocalcaemia → long QT, U wave |
| resting potential offset        | K+ gradient                  | hyperkalaemia → peaked T, flat P, sine wave   |
| plateau slope / level           | I_CaL                        | calcium blockers, hypercalcaemia (short QT)   |
| AV nodal delay, SA rate (graph) | nodal I_CaL, I_f, autonomics | beta-blockers, digoxin, adenosine, atropine   |
| refractory period (new)         | APD + post-repolarisation    | class I/III                                   |
| automaticity of foci (new)      | phase-4 slope, DADs          | digoxin toxicity, catecholamines, ischaemia   |

Represent a drug as `{ id, dose, pk: { onsetMs, halfLifeMs }, effects: (dose) → Partial<TissueModulation> }`
where `TissueModulation` is a set of multipliers/offsets applied to every
element (optionally per chamber). Effects combine multiplicatively; the
engine recomputes the activation graph when they change beyond a threshold.

### 2. RhythmEngine (replaces the one-shot Dijkstra)

Discrete-event simulation over the same conduction graph:

- State per node: `lastActivation`, `refractoryUntil`.
- Event queue of `(time, node)`; an arriving wave activates the node only if
  `time >= refractoryUntil`, then schedules its out-edges with their delays.
  This IS Dijkstra when every node is excitable, and gives re-entry when a
  late wave finds recovered tissue.
- Pacemakers: the SA node fires at its intrinsic interval (modulated by
  autonomics/drugs); each ectopic focus is a node with its own interval and
  overdrive-suppression rule (reset when activated by a passing wave).
  A focus that fires faster than the sinus captures the ventricles.
- Refractory period of an element = its APD at the current rate + ~40 ms;
  shortened by ischaemia, lengthened by class III drugs. Rate-dependent
  conduction (decremental AV node) = delay that grows as the interval
  since last activation shrinks.
- Fibrillation = many wavelets: emerges when refractoriness is short and
  conduction slow (short wavelength) and a focus or re-entrant circuit is
  present; detect it (no coherent activation for >2 s) to flag "dead".
- Defibrillation: force every node's `refractoryUntil = now + 200 ms`,
  clearing all wavelets; pacing: an external node with a fixed interval.

### 3. DipoleStream (replaces the periodic cache)

Each element keeps its last 2–3 activation times (entry and exit faces).
`dipoleAt(t)` sums `segmentDipole` over those activations; injury current
uses the element's current ischaemia. Leads are produced in 1 ms chunks
into a ring buffer that `sampleLead`-style accessors read. The renderers
already sample by absolute simulated time, so they need no change.

### 4. Presentation (XP theme)

- "Pharmacy" group box: drug list with dose sliders and an IV-push button;
  active drugs shown as XP progress bars that decay with half-life.
- "Rhythm" group box: ectopic focus toggles (RVOT, LV apex, atrial), their
  rate, and a status lamp (sinus / ectopic / VT / VF / asystole).
- "Crash cart": defibrillate, pace, CPR-pause. Keep the same button styles.

## Suggested implementation order

1. `rhythm-engine.ts`: event-driven solver that reproduces today's single
   beat exactly when no focus is enabled (regression: the validation harness
   must still pass).
2. Streaming dipole + lead ring buffer; retire the periodic cache.
3. Foci and refractoriness; PVCs, bigeminy, VT, VF, asystole.
4. Drug/ion modulation table with PK decay; validate QRS/QT changes against
   known clinical ranges.
5. XP UI.
