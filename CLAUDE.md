# EKG Simulator — Project Guide for Claude Code

## Project Overview

A browser-based, physically-modeled 12-lead EKG simulator. The core innovation: all EKG tracings are derived from a **time-varying 3D cardiac dipole vector**, not pre-recorded waveforms. This means any electrode placement on the body surface produces a physically correct tracing via vector projection.

## Tech Stack

- **Framework:** React 18+ with Vite
- **3D Rendering:** Three.js + @react-three/fiber + @react-three/drei
- **EKG Tracing:** HTML5 Canvas 2D (scrolling paper)
- **State Management:** Zustand
- **Styling:** Tailwind CSS
- **Language:** TypeScript throughout
- **No backend required** — everything runs client-side

## Architecture

```
src/
├── engine/                    # Pure math, no rendering
│   ├── cardiac-vector.ts      # V(t) = [Vx, Vy, Vz] over cardiac cycle
│   ├── vector-loop.ts         # Parametric VCG loop (P, QRS, T segments)
│   ├── lead-calculator.ts     # Dot product projection for any lead
│   ├── pathology.ts           # Modifications to vector loop per pathology
│   └── conduction.ts          # Rate, rhythm, intervals
│
├── models/                    # 3D geometry definitions
│   ├── heart.ts               # Heart mesh + animation
│   ├── torso.ts               # Semi-transparent body shell
│   ├── coronary-arteries.ts   # LAD, LCx, RCA tube geometries
│   └── electrode.ts           # Draggable electrode marker
│
├── components/                # React + Three.js components
│   ├── Scene3D.tsx            # Main Three.js canvas
│   ├── EKGStrip.tsx           # Single-lead tracing (Canvas 2D)
│   ├── TwelveLeadGrid.tsx     # Standard 4x3 + rhythm strip layout
│   ├── VectorDisplay.tsx      # 3D vector arrow + VCG loop trail
│   ├── ControlPanel.tsx       # Artery toggles, pathology presets, rate
│   └── LeadPlacement.tsx      # Raycasting UI for placing electrodes
│
├── data/                      # Reference data
│   ├── normal-vcg-loop.json   # Control points for normal sinus rhythm
│   ├── electrode-positions.json # Standard 12-lead positions on torso
│   └── pathology-presets.json # Vector modifications per pathology
│
├── store/                     # Zustand stores
│   └── simulation-store.ts    # Heart rate, active pathologies, lead positions
│
├── App.tsx
└── main.tsx
```

## Build Phases

### Phase 1: Vector Engine + Proof of Concept
**Goal:** Validate the physics. Show one EKG tracing derived from the dipole model.
- Implement `cardiac-vector.ts` — a parametric 3D vector loop for normal sinus rhythm
- Implement `lead-calculator.ts` — dot product projection
- Render a single Lead II tracing on a Canvas element
- Validate: does it look like a real Lead II? P wave, QRS, T wave in correct proportions?

### Phase 2: Full 12-Lead + Standard Positions
**Goal:** Standard clinical EKG display.
- Define standard electrode positions (RA, LA, LL, V1–V6) on torso coordinates
- Compute all 12 leads from the single vector loop
- Render the 4×3 grid (I, aVR, V1, V4 / II, aVL, V2, V5 / III, aVF, V3, V6) + Lead II rhythm strip
- Validate: R-wave progression V1→V6, axis, expected morphologies

### Phase 3: 3D Scene
**Goal:** Interactive 3D visualization.
- Torso mesh (semi-transparent ellipsoid or simplified anatomical model)
- Heart mesh positioned anatomically (rotated ~45° left, tilted anterior)
- Coronary arteries as tube geometries on heart surface
- Animate heart: subtle pulsation synced to cardiac cycle
- Camera controls (orbit, zoom)

### Phase 4: Interactive Lead Placement
**Goal:** Place a lead anywhere, get the correct tracing.
- Raycasting on torso mesh to place electrode markers
- Compute lead vector from electrode position to Wilson's Central Terminal (or between two electrodes for bipolar)
- Live tracing updates as electrode is dragged
- Snap-to for standard positions (optional)

### Phase 5: Pathology Engine
**Goal:** Toggle arteries off, see realistic EKG changes.
- Each coronary artery maps to a myocardial territory
- Occlusion modifies the vector loop:
  - LAD → anterior ST vector added → ST elevation V1-V4
  - RCA → inferior ST vector → ST elevation II, III, aVF
  - LCx → lateral ST vector → ST elevation I, aVL, V5-V6
- All leads update simultaneously (the physics enforces consistency)
- Additional presets: LBBB, RBBB, LVH, RVH, WPW

### Phase 6: Vector Visualization + Polish
**Goal:** Educational features.
- Animated 3D arrow showing instantaneous cardiac vector
- VCG loop trail (the 3D path traced over one cycle)
- Einthoven's triangle overlay
- Hexaxial reference system
- Axis calculation display
- Playback speed control

## Key Technical Decisions

### The Cardiac Vector Model
The heart's electrical activity is approximated as V(t) = [Vx(t), Vy(t), Vz(t)] — a single time-varying dipole. This is the vectorcardiographic model (Frank, 1956). The vector traces a 3D loop over one cardiac cycle:

1. **P-wave loop:** Small loop, generally directed leftward and inferior
2. **QRS loop:** Large loop, normally directed leftward, inferior, and slightly posterior
3. **T-wave loop:** Medium loop, roughly concordant with QRS in normals

Each loop segment is defined by cubic Bezier control points in 3D space.

### Lead Voltage Calculation
For any lead with axis vector `L`:
```
V_lead(t) = dot(V(t), L) / |L|
```

- **Limb leads:** Lead I axis = LA - RA, Lead II axis = LL - RA, etc.
- **Augmented leads:** aVR = RA - (LA+LL)/2, etc.
- **Precordial leads:** V1 axis = V1_position - Wilson_Central_Terminal
- **User-placed leads:** Same math, arbitrary position

### Coordinate System
- X-axis: Left (+) to Right (-)
- Y-axis: Inferior (+) to Superior (-)
- Z-axis: Anterior (+) to Posterior (-)
- This matches standard VCG conventions (Frank lead system)

### EKG Paper Standards
- Paper speed: 25 mm/s (standard), option for 50 mm/s
- Gain: 10 mm/mV (standard), options for 5 and 20 mm/mV
- Grid: 1mm small squares, 5mm large squares
- Standard paper: 25mm/large box = 0.2s, 10mm/mV

## Quality Criteria

- Lead II must show upright P, narrow QRS, upright T
- R-wave must progress V1→V6 (small R in V1, dominant R in V5-V6)
- aVR must be predominantly negative
- Lead III = Lead II - Lead I (Einthoven's equation must hold exactly)
- Occluding LAD must produce ST elevation in V1-V4 with reciprocal changes inferiorly
- Moving an electrode smoothly should produce smooth morphology transitions

## Performance Targets

- 60fps for 3D scene
- EKG tracing renders at 25mm/s real-time
- Lead recalculation < 1ms (it's just dot products)

## References

- Frank, E. "An Accurate, Clinically Practical System for Spatial Vectorcardiography." Circulation, 1956.
- Malmivuo & Plonsey, "Bioelectromagnetism," Oxford University Press, 1995 (Chapters 15-20)
- Burger & van Milaan, "Heart-Vector and Leads," British Heart Journal, 1946
