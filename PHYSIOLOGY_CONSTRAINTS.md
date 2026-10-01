# Physiology Constraints — Hard Rules

These constraints are non-negotiable. A change that violates them must be
REJECTED even if it makes the output look more like a real ECG.
The model must produce correct output for correct reasons.

## The model (read this before touching `src/engine/`)

Each myocardial element is a 1-D cable along its propagation direction.
Its dipole is the uniform-double-layer identity

    p(t) = GAIN · A · health · [Vm_entry(t) − Vm_exit(t)] · direction

- `direction` of a ventricular element is the **outward wall normal computed
  from the chamber geometry** (`heart-model.ts`: LV ellipsoid, RV offset
  cylinder). It is NOT the myofibre direction and must never be hand-edited
  per element.
- `A` is the front cross-section, `slowFraction · mass / (density · v · crossingTime)`.
- `Vm` is the normalised action potential (`action-potential.ts`), started at
  the activation time of each face. The exit face starts one transmural
  crossing later (or, for dual-entry septal elements, when the right bundle
  reaches it).
- QRS, isoelectric ST, T wave, Ta wave, bundle-branch morphology, strain,
  injury currents and pathological Q waves all follow from this identity.
  There is no separate T-wave term, ST vector, repolarisation sign or
  per-wave amplitude anywhere in the engine.

## The only free scalar

`GAIN` in `action-potential.ts` maps dipole units to millivolts. It is set so
that lead II R ≈ 1.0 mV in normal sinus rhythm. Everything else is anatomy or
cellular electrophysiology with a literature source noted in the code.

## What you may change (with a physiological justification in the comment)

- Anatomical orientation: `APEX_DIRECTION` (anatomical long axis) and
  `SECTOR_ROTATION_DEG` (rotation about the long axis). These are the
  "vertical/horizontal heart" and "clockwise/counter-clockwise rotation" of
  ECG textbooks and legitimately move the frontal axis and the precordial
  transition. Keep them within anatomical ranges (axis 30–60° to each plane,
  rotation −15° to −45°).
- Element masses (±30 % of AHA-segment values), wall thicknesses (Hutchins
  1978), conduction velocities (0.3–0.5 m/s transverse, 0.6–0.9 m/s along
  fibres, 0.8–1.0 m/s atrial), Purkinje breakthrough times (must stay within
  ±10 ms of Durrer 1970).
- Action-potential parameters: `tauUp` 2–6 ms, `tauRepol` 8–15 ms
  (ventricle), APD values and gradients (transmural 30–50 ms, apex–base
  10–25 ms, RV 10–20 ms shorter than LV), rate exponent 0.4–0.6.
- RV front dispersion and coherence (`RV_ACTIVATION_DISPERSION_MS`,
  `RV_FRONT_COHERENCE`) — these encode the tangential, multi-breakthrough
  activation of the thin RV wall (Durrer 1970). Justify any change from the
  activation maps, not from the V1 amplitude.
- Electrode positions (`lead-calculator.ts`) only from torso anatomy.

## What you must NEVER do

- Flip, scale or hand-edit an element `direction`.
- Add a sign, gain or shape term that applies to one wave (P, QRS, ST, T) but
  not the others. If the T wave is wrong, the cause is an APD or timing value.
- Add a per-lead or per-chamber fudge factor to fix one lead's amplitude.
- Reorder activation times away from the Durrer sequence to fix morphology.
- Invert an APD gradient (epi must stay shorter than endo in healthy tissue;
  pathology presets may change this with a stated mechanism, e.g. LVH strain).
- Draw, splice or template any waveform in the rendering layer. Renderers
  only sample `simulation-cache.ts`.

## Decision rule before any fix

Ask: "Does this change model a real physical property of cardiac tissue or
anatomy, or does it move a parameter to make the output look more like an
ECG?" If the latter — STOP. Report the problem and ask for direction.

## Validation

`npx tsx src/engine/ecg-debug.ts` prints intervals, axes and per-lead
amplitudes with pass/fail against clinical ranges; `… all` runs every
condition and artery. Run it after every engine change and paste the
relevant rows. Baseline (2026-10-01): 21/23 NSR checks pass; the two misses
are V1 r ≈ |S| (r 0.44 / S 0.45 mV) and V2 R > S — accepted limitations of
~30 lumped elements, not to be fixed by scaling.

## Known limitations (accepted; do not "fix" by parameter manipulation)

- V1/V2 initial r is ~0.4 mV (upper normal). Finer septal/RV segmentation
  would reduce it.
- Bundle-branch-block QRS complexes are notched/fragmented because activation
  hops between ~30 discrete elements; finer segmentation smooths this.
- RVH shifts the axis only ~10° rightward.
- The torso is a point-dipole, unbounded-conductor model with a 1/d
  proximity factor for the precordials; no Brody effect, no lung/bone
  inhomogeneity.
- The engine is periodic (one cached beat). Ectopy, re-entry, rate-dependent
  conduction and drug kinetics need the beat-by-beat rhythm layer described
  in `DESIGN_RHYTHM_AND_DRUGS.md`.
