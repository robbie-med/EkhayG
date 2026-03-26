# Reference: Cardiac Vector Loop Data

## Sources
This data is derived from published vectorcardiographic norms:
- Frank E. "An Accurate, Clinically Practical System for Spatial Vectorcardiography." Circulation 1956;13:737-749
- Chou TC. "Electrocardiography in Clinical Practice." 6th ed. Saunders, 2008.
- Malmivuo J, Plonsey R. "Bioelectromagnetism." Oxford University Press, 1995.

## Normal VCG Loop Control Points

All values in millivolt-meters (mV·m). These are approximate and should be tuned
iteratively against known 12-lead morphologies.

### Coordinate Convention
- X: positive = leftward
- Y: positive = inferior  
- Z: positive = anterior

### P-wave Loop (Atrial Depolarization)
Duration: 80ms at 75bpm
The P-wave vector loop is small and generally directed leftward, inferior, and slightly anterior.

```json
{
  "p_wave": {
    "duration_fraction": 0.10,
    "segments": [
      {
        "comment": "Initial rightward then sweeps left and inferior",
        "p0": [0.00, 0.00, 0.00],
        "p1": [0.03, 0.02, 0.02],
        "p2": [0.08, 0.06, 0.03],
        "p3": [0.12, 0.08, 0.03]
      },
      {
        "comment": "Returns to baseline",
        "p0": [0.12, 0.08, 0.03],
        "p1": [0.10, 0.06, 0.02],
        "p2": [0.05, 0.03, 0.01],
        "p3": [0.00, 0.00, 0.00]
      }
    ]
  }
}
```

Expected result:
- Lead II: upright, smooth, ~0.1-0.15 mV amplitude
- Lead aVR: inverted
- V1: may be biphasic (initial positive, terminal negative)

### PR Segment
Duration: 80ms at 75bpm
Vector = [0, 0, 0] (isoelectric, AV node delay)

### QRS Loop (Ventricular Depolarization)
Duration: 90ms at 75bpm
The QRS loop is the largest and most complex. It has three distinct phases.

```json
{
  "qrs": {
    "duration_fraction": 0.1125,
    "segments": [
      {
        "comment": "Phase 1: Septal depolarization (L→R, anterior). Produces q in I/aVL, r in V1",
        "p0": [0.00, 0.00, 0.00],
        "p1": [-0.03, 0.01, 0.06],
        "p2": [-0.07, 0.02, 0.10],
        "p3": [-0.10, 0.03, 0.12]
      },
      {
        "comment": "Phase 2: Main free wall depolarization (leftward, inferior, slightly posterior). Big R in I, II, V5-V6",
        "p0": [-0.10, 0.03, 0.12],
        "p1": [0.15, 0.20, 0.10],
        "p2": [0.60, 0.50, 0.00],
        "p3": [1.00, 0.70, -0.15]
      },
      {
        "comment": "Phase 2 continued: peak and turning",
        "p0": [1.00, 0.70, -0.15],
        "p1": [1.10, 0.60, -0.25],
        "p2": [0.90, 0.30, -0.30],
        "p3": [0.50, 0.05, -0.25]
      },
      {
        "comment": "Phase 3: Basal/terminal depolarization (rightward, superior). S wave in lateral leads",
        "p0": [0.50, 0.05, -0.25],
        "p1": [0.20, -0.15, -0.15],
        "p2": [0.05, -0.10, -0.05],
        "p3": [0.00, 0.00, 0.00]
      }
    ]
  }
}
```

Expected result:
- Lead I: small q, tall R, small s
- Lead II: small r, tall R
- Lead III: variable (depends on axis)
- V1: small r, deep S
- V6: small q, tall R, small s
- QRS axis: ~60° (between 0° and +90° is normal)

### ST Segment (Normal)
Duration: 80ms at 75bpm
Vector ≈ [0, 0, 0] in normal hearts (isoelectric)
In STEMI: this is where the injury vector is added.

### T-wave Loop (Ventricular Repolarization)
Duration: 160ms at 75bpm
Normally concordant with QRS (same general direction), because
repolarization proceeds epicardium→endocardium (reverse of depolarization).

```json
{
  "t_wave": {
    "duration_fraction": 0.20,
    "segments": [
      {
        "comment": "Onset: gradual rise leftward, inferior, anterior",
        "p0": [0.00, 0.00, 0.00],
        "p1": [0.10, 0.05, 0.05],
        "p2": [0.25, 0.15, 0.12],
        "p3": [0.35, 0.22, 0.18]
      },
      {
        "comment": "Peak and return",
        "p0": [0.35, 0.22, 0.18],
        "p1": [0.40, 0.25, 0.15],
        "p2": [0.30, 0.15, 0.08],
        "p3": [0.00, 0.00, 0.00]
      }
    ]
  }
}
```

Expected result:
- T-wave upright in I, II, V3-V6
- T-wave inverted in aVR
- T-wave variable in III, aVL, V1-V2

### TP Segment
Duration: remaining time in cycle
Vector = [0, 0, 0] (electrical diastole)


## Standard 12-Lead Electrode Positions (3D Torso Coordinates)

Normalized torso: height -0.5 (shoulder) to +0.5 (hip), width -0.4 to +0.4, depth -0.2 to +0.2

```json
{
  "electrodes": {
    "RA": { "pos": [-0.35, -0.30, 0.00], "label": "Right Arm" },
    "LA": { "pos": [0.35, -0.30, 0.00], "label": "Left Arm" },
    "RL": { "pos": [-0.15, 0.45, 0.00], "label": "Right Leg" },
    "LL": { "pos": [0.15, 0.45, 0.00], "label": "Left Leg" },
    "V1": { "pos": [-0.05, -0.12, 0.19], "label": "V1: 4th ICS, R sternal" },
    "V2": { "pos": [0.05, -0.12, 0.19], "label": "V2: 4th ICS, L sternal" },
    "V3": { "pos": [0.11, -0.07, 0.17], "label": "V3: Between V2 and V4" },
    "V4": { "pos": [0.17, -0.02, 0.14], "label": "V4: 5th ICS, MCL" },
    "V5": { "pos": [0.24, 0.00, 0.07], "label": "V5: 5th ICS, AAL" },
    "V6": { "pos": [0.30, 0.02, -0.02], "label": "V6: 5th ICS, MAL" }
  }
}
```

## Additional Lead Positions (for advanced mode)

```json
{
  "extended_leads": {
    "V7":  { "pos": [0.34, 0.03, -0.10], "label": "V7: 5th ICS, PAL" },
    "V8":  { "pos": [0.30, 0.04, -0.17], "label": "V8: 5th ICS, mid-scapular" },
    "V9":  { "pos": [0.18, 0.05, -0.19], "label": "V9: 5th ICS, L paraspinal" },
    "V3R": { "pos": [-0.11, -0.07, 0.17], "label": "V3R: Mirror of V3" },
    "V4R": { "pos": [-0.17, -0.02, 0.14], "label": "V4R: Mirror of V4 (RV infarct)" },
    "V5R": { "pos": [-0.24, 0.00, 0.07], "label": "V5R: Mirror of V5" }
  }
}
```

## Pathology Vector Modifications

### ST Vectors for Coronary Occlusions

The ST injury vector points TOWARD the ischemic zone.

```json
{
  "pathology_st_vectors": {
    "lad_proximal": {
      "st_vector": [0.25, -0.10, 0.50],
      "comment": "Anterior + slightly superior. STE in V1-V4, aVL. Reciprocal: II, III, aVF",
      "territory": "Anterior wall, septum, apex"
    },
    "lad_mid": {
      "st_vector": [0.20, 0.10, 0.45],
      "comment": "Anterior + slightly inferior. STE V2-V5. Less reciprocal inferiorly",
      "territory": "Anterior wall, apex"
    },
    "rca_proximal": {
      "st_vector": [-0.05, 0.50, 0.10],
      "comment": "Inferior + slightly anterior. STE II, III, aVF. Reciprocal: I, aVL",
      "territory": "Inferior wall, RV"
    },
    "rca_distal": {
      "st_vector": [0.00, 0.45, 0.05],
      "comment": "Inferior. STE II, III, aVF",
      "territory": "Inferior wall"
    },
    "lcx": {
      "st_vector": [0.40, 0.10, -0.20],
      "comment": "Lateral + posterior. STE I, aVL, V5-V6. May show posterior changes in V1-V2",
      "territory": "Lateral wall, posterior"
    },
    "lcx_dominant": {
      "st_vector": [0.30, 0.35, -0.15],
      "comment": "Lateral + inferior + posterior. STE II, III, aVF, V5-V6",
      "territory": "Inferolateral, posterior"
    }
  }
}
```

### QRS Modifications for Bundle Branch Blocks

```json
{
  "lbbb_modifications": {
    "comment": "Septal activation reversed (R→L instead of L→R). QRS widened to 120-160ms.",
    "remove_septal_q": true,
    "initial_vector_direction": [0.05, 0.02, -0.03],
    "main_vector_scale": { "x": 1.3, "y": 1.0, "z": 0.6 },
    "terminal_vector": [0.20, -0.10, -0.20],
    "qrs_duration_ms": 140,
    "secondary_st_t_changes": true,
    "st_vector": [-0.15, 0.00, 0.10],
    "t_wave_discordance": true
  },
  "rbbb_modifications": {
    "comment": "Delayed RV activation. Terminal rightward anterior vector (RSR' in V1).",
    "initial_normal": true,
    "terminal_vector_addition": [-0.30, -0.05, 0.25],
    "qrs_duration_ms": 130,
    "secondary_st_t_changes": "V1-V3 only"
  }
}
```

### QRS Modifications for Ventricular Hypertrophy

```json
{
  "lvh_modifications": {
    "comment": "Increased leftward and posterior QRS forces",
    "qrs_scale": { "x": 1.8, "y": 1.2, "z": 0.8 },
    "strain_pattern": {
      "applies_to": "lateral leads",
      "st_depression": true,
      "t_inversion": true,
      "st_vector": [-0.15, 0.00, -0.10]
    },
    "voltage_criteria_reference": "SV1 + RV5 > 3.5mV"
  },
  "rvh_modifications": {
    "comment": "Increased rightward and anterior QRS forces",
    "qrs_scale": { "x": 0.6, "y": 1.0, "z": 1.5 },
    "right_axis_deviation": true,
    "dominant_r_v1": true,
    "strain_pattern": {
      "applies_to": "right precordial",
      "st_vector": [0.10, 0.00, -0.10]
    }
  }
}
```

## Timing Adjustment for Heart Rate

At different heart rates, segment durations change non-linearly.
The TP segment absorbs most of the rate change. QRS is nearly constant.

```
At HR bpm, cycle_length = 60000/HR ms

Approximate scaling:
- P-wave: ~80ms (nearly constant)
- PR interval: 120-200ms (shortens slightly with rate)
- QRS: 80-100ms (essentially constant)
- QT interval: Use Bazett's: QTc = QT / sqrt(RR in seconds)
  - At 75bpm (RR=0.8s): QT ≈ 360ms
  - At 100bpm (RR=0.6s): QT ≈ 310ms  
  - At 50bpm (RR=1.2s): QT ≈ 420ms
- TP segment: whatever remains
```

Formula for QT:
```
QT(ms) = QTc * sqrt(RR_seconds)
where QTc ≈ 400ms for normal
RR_seconds = 60 / heart_rate_bpm
```
