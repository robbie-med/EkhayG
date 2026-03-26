# Technical Specification: Cardiac Vector Engine

## 1. The Cardiac Dipole Model

### 1.1 Core Equation
At any time t in the cardiac cycle, the heart's net electrical activity is represented as:

```
V(t) = [Vx(t), Vy(t), Vz(t)]   (millivolts × meters, effectively a dipole moment)
```

The EKG voltage seen by any surface lead is the scalar projection:

```
V_lead(t) = V(t) · L̂   where L̂ is the unit lead vector
```

### 1.2 Coordinate System (Frank Lead Convention)
- **X-axis:** Left-to-Right. Positive = leftward.
- **Y-axis:** Superior-to-Inferior. Positive = inferior (foot-ward).
- **Z-axis:** Anterior-to-Posterior. Positive = anterior (chest-ward).
- Origin: center of the heart (electrical center).

### 1.3 Time Base
- One cardiac cycle = 60000 / heart_rate_bpm milliseconds
- Default: 75 bpm → 800ms cycle
- Simulation runs in real-time, loop repeats

## 2. Vector Loop Definition

The cardiac vector V(t) is defined as a **piecewise parametric curve** through 3D space. Each segment corresponds to a phase of the cardiac cycle.

### 2.1 Cardiac Cycle Segments (at 75 bpm, 800ms total)

| Segment        | Duration (ms) | Time Range (ms) | Description                          |
|----------------|---------------|------------------|--------------------------------------|
| P-wave         | 80            | 0–80             | Atrial depolarization                |
| PR segment     | 80            | 80–160           | AV node delay (vector ≈ 0)          |
| QRS complex    | 90            | 160–250          | Ventricular depolarization           |
| ST segment     | 80            | 250–330          | Plateau phase (vector ≈ 0 normally) |
| T-wave         | 160           | 330–490          | Ventricular repolarization           |
| TP segment     | 310           | 490–800          | Electrical diastole (vector = 0)    |

### 2.2 Normal Sinus Rhythm Vector Loops

Each cardiac phase traces a loop in 3D space defined by Bezier control points.

#### P-wave Loop (atrial depolarization)
- Direction: rightward → leftward → inferior
- Peak magnitude: ~0.1-0.2 mV·m
- Shape: small elliptical loop in the frontal plane
- Control points (approximate, [Vx, Vy, Vz] in mV·m):
  ```
  Start: [0, 0, 0]
  CP1:   [0.05, 0.05, 0.02]
  CP2:   [0.10, 0.08, 0.03]
  Peak:  [0.12, 0.10, 0.02]
  CP3:   [0.08, 0.06, 0.01]
  End:   [0, 0, 0]
  ```

#### QRS Loop (ventricular depolarization)
- Phase 1 (septal, 0-20ms): Left-to-right and anterior (small q in lateral leads, r in V1)
  ```
  Direction: [-0.1, 0.0, 0.15]
  ```
- Phase 2 (main, 20-60ms): Leftward, inferior, and slightly posterior (big R in lateral leads)
  ```
  Peak vector: [1.2, 0.8, -0.2]
  ```
- Phase 3 (terminal, 60-90ms): Superior and rightward (S wave)
  ```
  Direction: [-0.3, -0.5, -0.3]
  ```
- Total QRS loop inscribes a figure-8 or ellipse in the horizontal plane
- Peak magnitude: ~1.0-1.5 mV·m

#### T-wave Loop (ventricular repolarization)
- Direction: Generally concordant with QRS (leftward, inferior, anterior)
- This is because repolarization proceeds epicardium → endocardium (opposite to depolarization)
- Peak magnitude: ~0.3-0.5 mV·m
- Shape: smooth elliptical loop
  ```
  Peak vector: [0.4, 0.3, 0.2]
  ```

### 2.3 Implementation: Cubic Bezier Segments

Each loop phase is a sequence of cubic Bezier curves in 3D:

```typescript
interface BezierSegment3D {
  p0: [number, number, number]; // start point
  p1: [number, number, number]; // control point 1
  p2: [number, number, number]; // control point 2
  p3: [number, number, number]; // end point
}

function evaluateBezier(seg: BezierSegment3D, t: number): [number, number, number] {
  const u = 1 - t;
  return [
    u*u*u*seg.p0[0] + 3*u*u*t*seg.p1[0] + 3*u*t*t*seg.p2[0] + t*t*t*seg.p3[0],
    u*u*u*seg.p0[1] + 3*u*u*t*seg.p1[1] + 3*u*t*t*seg.p2[1] + t*t*t*seg.p3[1],
    u*u*u*seg.p0[2] + 3*u*u*t*seg.p1[2] + 3*u*t*t*seg.p2[2] + t*t*t*seg.p3[2],
  ];
}
```

### 2.4 Smooth Transitions
- Each segment starts and ends at [0,0,0] (except QRS phases which chain)
- Use ease-in/ease-out timing within each segment
- PR, ST, TP segments hold at [0,0,0] (baseline)

## 3. Lead Vector Definitions

### 3.1 Standard Electrode Positions (3D coordinates on torso surface)

Using a normalized torso model (torso height = 1.0, centered at origin):

```typescript
const ELECTRODE_POSITIONS = {
  // Limb leads (conceptual positions — in practice, Einthoven uses fixed directions)
  RA: [-0.40, -0.20, 0.00],  // right arm/shoulder
  LA: [0.40, -0.20, 0.00],   // left arm/shoulder
  LL: [0.15, 0.50, 0.00],    // left leg/lower torso
  RL: [-0.15, 0.50, 0.00],   // right leg (ground reference)

  // Precordial leads (anterior chest)
  V1: [-0.06, -0.10, 0.20],  // 4th ICS, right sternal border
  V2: [0.06, -0.10, 0.20],   // 4th ICS, left sternal border
  V3: [0.12, -0.06, 0.18],   // midway V2-V4
  V4: [0.18, -0.02, 0.15],   // 5th ICS, mid-clavicular line
  V5: [0.26, 0.00, 0.08],    // 5th ICS, anterior axillary line
  V6: [0.32, 0.02, -0.02],   // 5th ICS, mid-axillary line
};
```

### 3.2 Lead Vector Calculations

```typescript
// Wilson's Central Terminal (WCT)
const WCT = [
  (RA[0] + LA[0] + LL[0]) / 3,
  (RA[1] + LA[1] + LL[1]) / 3,
  (RA[2] + LA[2] + LL[2]) / 3,
];

// Bipolar limb leads
Lead_I   = LA - RA      // left arm to right arm
Lead_II  = LL - RA      // left leg to right arm
Lead_III = LL - LA      // left leg to left arm

// Augmented limb leads (Goldberger)
aVR = RA - (LA + LL) / 2
aVL = LA - (RA + LL) / 2
aVF = LL - (RA + LA) / 2

// Precordial leads (unipolar, referenced to WCT)
V1 = V1_position - WCT
V2 = V2_position - WCT
// ... etc

// For ANY user-placed electrode at position P:
// Unipolar: lead_vector = P - WCT
// Bipolar:  lead_vector = P_positive - P_negative
```

### 3.3 Voltage Computation

```typescript
function computeLeadVoltage(
  cardiacVector: [number, number, number],
  leadVector: [number, number, number]
): number {
  const magnitude = Math.sqrt(
    leadVector[0]**2 + leadVector[1]**2 + leadVector[2]**2
  );
  if (magnitude === 0) return 0;
  
  // Dot product normalized by lead vector magnitude
  return (
    cardiacVector[0] * leadVector[0] +
    cardiacVector[1] * leadVector[1] +
    cardiacVector[2] * leadVector[2]
  ) / magnitude;
}
```

## 4. Pathology Modifications

### 4.1 Coronary Occlusion → ST Segment Changes

When an artery is occluded, ischemic tissue generates a persistent "injury current" during the ST segment. This is modeled as an additive ST vector that shifts the vector loop during the ST segment.

```typescript
interface PathologyModification {
  id: string;
  name: string;
  // Additive vector during ST segment
  stVector?: [number, number, number];
  // Modifications to QRS loop (e.g., for BBB)
  qrsLoopTransform?: (original: BezierSegment3D[]) => BezierSegment3D[];
  // Modifications to P-wave (e.g., for atrial enlargement)
  pWaveTransform?: (original: BezierSegment3D[]) => BezierSegment3D[];
  // T-wave changes
  tWaveTransform?: (original: BezierSegment3D[]) => BezierSegment3D[];
  // Timing changes
  timingOverrides?: Partial<CycleTimings>;
}

const PATHOLOGIES: Record<string, PathologyModification> = {
  // --- STEMI Patterns ---
  'lad-occlusion': {
    id: 'lad-occlusion',
    name: 'LAD Occlusion (Anterior STEMI)',
    // ST vector points anterior and leftward → elevation in V1-V4
    stVector: [0.3, 0.0, 0.5],
    // T-wave inversion in same territory (evolving MI)
    tWaveTransform: invertAnterior,
  },
  'rca-occlusion': {
    id: 'rca-occlusion',
    name: 'RCA Occlusion (Inferior STEMI)',
    // ST vector points inferior → elevation in II, III, aVF
    stVector: [0.0, 0.5, 0.1],
    tWaveTransform: invertInferior,
  },
  'lcx-occlusion': {
    id: 'lcx-occlusion',
    name: 'LCx Occlusion (Lateral STEMI)',
    // ST vector points leftward and posterior → elevation in I, aVL, V5-V6
    stVector: [0.4, 0.0, -0.2],
    tWaveTransform: invertLateral,
  },

  // --- Conduction Abnormalities ---
  'lbbb': {
    id: 'lbbb',
    name: 'Left Bundle Branch Block',
    qrsLoopTransform: (loops) => {
      // Widen QRS to 120-160ms
      // Remove initial septal vector (no septal q)
      // Main vector more leftward and posterior
      // Secondary repolarization changes (discordant T waves)
      return widenAndReorientQRS(loops, 'left');
    },
    timingOverrides: { qrsDuration: 140 },
  },
  'rbbb': {
    id: 'rbbb',
    name: 'Right Bundle Branch Block',
    qrsLoopTransform: (loops) => {
      // Widen QRS
      // Add terminal rightward and anterior vector (RSR' in V1)
      return widenAndReorientQRS(loops, 'right');
    },
    timingOverrides: { qrsDuration: 130 },
  },

  // --- Hypertrophy ---
  'lvh': {
    id: 'lvh',
    name: 'Left Ventricular Hypertrophy',
    qrsLoopTransform: (loops) => {
      // Increase leftward and posterior QRS magnitude
      // Strain pattern: ST depression + T inversion in lateral leads
      return scaleQRS(loops, { x: 1.8, y: 1.2, z: 0.8 });
    },
    stVector: [-0.15, 0.0, -0.1], // Strain pattern
  },
};
```

### 4.2 Reciprocal Changes
The beauty of the dipole model: reciprocal changes happen **automatically**. If the ST vector points anteriorly (causing ST elevation in V1-V4), leads oriented away from that direction (II, III, aVF) automatically show ST depression. No special coding needed.

## 5. EKG Display Specifications

### 5.1 Paper Standards
- Small square: 1mm × 1mm = 0.04s × 0.1mV
- Large square: 5mm × 5mm = 0.20s × 0.5mV
- Standard speed: 25mm/s
- Standard gain: 10mm/mV (1mV = 10mm deflection)
- Grid color: #FFB3B3 (light red/pink)
- Background: #FFF5F5 (near white with warm tint)
- Tracing color: #1a1a1a (near black)

### 5.2 12-Lead Layout (Standard)
```
| I    | aVR  | V1   | V4   |
| II   | aVL  | V2   | V5   |
| III  | aVF  | V3   | V6   |
|          Lead II rhythm strip          |
```
Each cell: 2.5 seconds wide (= 62.5mm at 25mm/s)
Rhythm strip: 10 seconds wide

### 5.3 Canvas Rendering Strategy
- Separate Canvas for each lead strip
- Draw grid as background (can be pre-rendered as a pattern)
- Tracing drawn as a polyline with 1-2px stroke
- Scroll from right to left (new data appears at right edge)
- For 12-lead snapshot: render all 12 simultaneously for 2.5s each

## 6. 3D Scene Specifications

### 6.1 Torso Model
- Semi-transparent ellipsoid or simplified mesh
- Material: MeshPhysicalMaterial with transmission: 0.7, roughness: 0.3
- Skin-toned color with transparency
- Dimensions roughly: width 0.6, height 1.0, depth 0.3 (normalized units)

### 6.2 Heart Model
- Positioned at approximately [-0.02, -0.08, 0.05] within torso
- Rotated ~30° around Y-axis (leftward) and ~15° anterior tilt
- Gentle pulsation animation: scale oscillates 1.0 → 1.05 synced to QRS
- Material: MeshStandardMaterial, deep red (#8B0000)

### 6.3 Coronary Arteries
- TubeGeometry along predefined paths on heart surface
- LAD: anterior descending, from left main → apex
- LCx: wraps leftward and posterior
- RCA: wraps rightward and inferior
- Color: red (#CC0000), toggleable visibility
- When "occluded": color changes to gray, X marker appears

### 6.4 Cardiac Vector Arrow
- ArrowHelper originating from heart center
- Direction and magnitude = V(t) at current time
- Color-coded: blue during P, green during QRS, orange during T
- Trail: last N positions rendered as a fading line (the VCG loop)

## 7. Interaction Model

### 7.1 Electrode Placement
- Click on torso surface → place electrode marker (Raycaster)
- Drag electrode on surface (constrained to mesh) → live tracing update
- Right-click/long-press → remove electrode
- Standard 12-lead button: auto-place all electrodes at correct positions

### 7.2 Controls
- Heart rate slider: 40-150 bpm
- Artery toggles: LAD on/off, LCx on/off, RCA on/off
- Pathology presets dropdown
- Display mode: Scrolling strip / 12-lead snapshot / single lead zoom
- Vector display toggle: show/hide 3D vector arrow and VCG loop
- Torso transparency slider
- Playback speed: 0.25x, 0.5x, 1x, 2x

## 8. Validation Checklist

After each phase, verify:
- [ ] Einthoven's equation: Lead III = Lead II - Lead I (must be exact to floating point)
- [ ] aVR is predominantly negative in normal sinus
- [ ] R-wave progression: small R in V1, progressively larger R to V5, slightly smaller R in V6
- [ ] Normal axis: QRS predominantly positive in I and II
- [ ] P-wave: upright in II, inverted in aVR
- [ ] T-wave: upright in I, II, V3-V6 in normals
- [ ] LAD occlusion: ST elevation V1-V4, reciprocal ST depression II, III, aVF
- [ ] Moving electrode between V1 and V6 positions produces smooth R-wave progression
- [ ] Electrode at right shoulder (RA equivalent) gives aVR-like tracing
