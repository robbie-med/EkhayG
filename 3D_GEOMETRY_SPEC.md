# 3D GEOMETRY SPEC — All Procedural, No External Files

## CRITICAL RULE
Do NOT use any external 3D model files (no GLTF, GLB, OBJ, FBX). 
All geometry is built in code using Three.js primitives.
No downloads, no assets folder, no model loading.

---

## 1. Torso Shell

**What it is:** A deformed SphereGeometry that looks like a human torso from shoulders to hips. This is the surface where electrodes get placed, so it needs smooth normals and enough vertex density for accurate raycasting.

**How to build it:**
- Start with `new SphereGeometry(1, 64, 48)`
- Loop through every vertex and reshape:
  - **Width (X axis):** Wider at shoulders (top), narrowest at waist (~60% up), slightly wider at hips (bottom)
  - **Depth (Z axis):** Flatten front-to-back to ~60% of width. Slightly flatter in back, slightly rounder in front (chest)
  - **Height (Y axis):** Scale to be taller than wide. Total height ~1.3 units, width ~0.9 at shoulders
- Call `computeVertexNormals()` after deformation

**Material:**
- `MeshPhysicalMaterial`
- Color: `0xE8BEAC` (skin tone)
- `transparent: true`, `opacity: 0.3`
- `side: DoubleSide`
- `depthWrite: false` (so heart is visible inside)

**Scene position:** Centered at origin.

---

## 2. Heart

**What it is:** A stylized anatomical heart shape. Not a cartoon Valentine heart. Not photorealistic either. Think "medical illustration" level — recognizable as a heart with two atrial bumps on top and a pointed apex at the bottom.

**How to build it (parametric surface approach):**

Use the "heart surface" parametric equations:
```
x(u,v) = sin(v) * (15*sin(u) - 4*sin(3u))
y(u,v) = 8*cos(v)  
z(u,v) = sin(v) * (15*cos(u) - 5*cos(2u) - 2*cos(3u) - cos(4u))
```
Where `u ∈ [0, 2π]`, `v ∈ [0, π]`.

Build this as a `ParametricGeometry` or manually generate vertices/faces.
Scale the output down so the heart fits inside the torso (~0.12 unit radius).

**Alternative approach (CSG/merge):**
If the parametric surface is hard to get looking right, build from primitives:
- Main body: `SphereGeometry` slightly elongated vertically, squished a bit front-to-back
- Two atrial bumps: two smaller spheres merged into the upper-left and upper-right
- Taper the bottom vertices downward to form the apex
- Smooth the whole thing with `mergeVertices()` + `computeVertexNormals()`

Either approach is fine. Pick whichever produces a better-looking result.

**Material:**
- `MeshStandardMaterial`
- Color: `0x8B0000` (dark red)
- `roughness: 0.6`, `metalness: 0.1`

**Scene position & rotation:**
- Position: `(-0.03, 0.05, 0.02)` — slightly left of center, slightly high, slightly forward
- Rotation: `(0, -0.2, -0.5)` — tilted leftward and anteriorly, matching real anatomical orientation
- The heart's long axis runs from upper-right to lower-left in the frontal plane

**Animation:**
- Gentle pulsation synced to cardiac cycle
- Scale oscillates `1.0 → 1.06 → 1.0` during QRS phase (~90ms)
- Smooth ease-in-out
- Rest of cycle: scale = 1.0

---

## 3. Coronary Arteries

**What they are:** Three tubes on the heart surface representing LAD, LCx, and RCA. Each is a `TubeGeometry` following a `CatmullRomCurve3`. They must be separate meshes so each can be toggled independently.

**All coordinates are relative to the heart mesh center (before heart rotation/positioning is applied).** The heart is roughly radius 0.12, so these points sit on or just outside that surface.

### LAD (Left Anterior Descending)
Courses down the front of the heart in the anterior interventricular groove, from the left main origin to the apex.
```
Points:
  (-0.02,  0.08,  0.10)   // origin at left main bifurcation
  (-0.01,  0.04,  0.12)   // descends anteriorly
  ( 0.00,  0.00,  0.12)   // mid-anterior surface
  ( 0.01, -0.04,  0.11)   // continuing down
  ( 0.01, -0.08,  0.08)   // approaching apex
  ( 0.00, -0.10,  0.05)   // apex
```

### LCx (Left Circumflex)
Wraps leftward and posteriorly from the left main, running in the AV groove along the lateral and posterior wall.
```
Points:
  (-0.02,  0.08,  0.10)   // origin (same as LAD — they share the left main)
  (-0.06,  0.07,  0.08)   // courses leftward
  (-0.10,  0.05,  0.03)   // wrapping lateral
  (-0.11,  0.04, -0.03)   // going posterior
  (-0.09,  0.02, -0.08)   // posterolateral surface
```

### RCA (Right Coronary Artery)
Starts from the right side of the aortic root, courses rightward in the AV groove, wraps posteriorly and inferiorly to the crux.
```
Points:
  ( 0.04,  0.08,  0.08)   // origin at right aortic cusp
  ( 0.08,  0.07,  0.06)   // courses rightward
  ( 0.11,  0.05,  0.02)   // right AV groove
  ( 0.10,  0.03, -0.04)   // wrapping posterior
  ( 0.06,  0.00, -0.08)   // inferior surface
  ( 0.02, -0.03, -0.09)   // crux / PDA territory
```

**For each artery:**
```
const curve = new CatmullRomCurve3(points);
const geo = new TubeGeometry(curve, 64, 0.004, 8, false);
```
- Tube radius: `0.004` (thin but visible)
- Segments: `64` (smooth curves)

**Materials:**
- Patent (open): `MeshStandardMaterial({ color: 0xCC0000 })` — bright red
- Occluded: `MeshStandardMaterial({ color: 0x666666 })` — gray

**When occluded:** Change the material to gray and optionally add a small marker (a tiny red sphere or X) at the proximal third of the artery to indicate the occlusion point.

**Arteries are children of the heart mesh** so they inherit the heart's position, rotation, and pulsation animation automatically.

---

## 4. Electrodes

**What they are:** Small spheres placed on the torso surface to represent ECG electrode positions.

**Geometry:** `SphereGeometry(0.012, 16, 16)` — small enough to not obscure the torso, large enough to click.

**Materials:**
- Default: `MeshStandardMaterial({ color: 0x2196F3 })` — blue
- Selected/active: `MeshStandardMaterial({ color: 0xFF9800 })` — orange
- Standard 12-lead positions: `MeshStandardMaterial({ color: 0x4CAF50 })` — green

**Placement:** Electrodes snap to the torso surface. When the user clicks the torso, use `Raycaster` to find the intersection point and place the electrode sphere at that point, oriented along the surface normal.

**Dragging:** Electrodes can be dragged along the torso surface. On each drag frame, re-raycast to keep the electrode constrained to the mesh surface.

---

## 5. Cardiac Vector Arrow

**What it is:** A 3D arrow originating from the heart center, showing the instantaneous cardiac dipole vector V(t).

**How to build it:** `ArrowHelper` from Three.js.
- Origin: heart center position
- Direction: normalized V(t)
- Length: proportional to |V(t)|, scaled so max QRS magnitude = ~0.15 scene units
- Color: changes with cardiac phase
  - P-wave: `0x2196F3` (blue)
  - QRS: `0x4CAF50` (green)  
  - T-wave: `0xFF9800` (orange)
  - Isoelectric: hide or make very small

**VCG Loop Trail:** Store the last full cycle of arrow tip positions. Render as a `Line` or `BufferGeometry` with `LineBasicMaterial`. This traces the vectorcardiogram loop in 3D space. Fade opacity from newest (1.0) to oldest (0.1).

---

## 6. Einthoven's Triangle Overlay

**What it is:** A wireframe equilateral triangle in the frontal plane showing the three limb lead axes.

**How to build it:** Three `Line` segments connecting RA, LA, LL positions.
- `LineBasicMaterial({ color: 0xFFFFFF, opacity: 0.4, transparent: true })`
- Label each vertex: RA (-), LA (+I), LL (+II)
- Label each edge with the lead name: I (top), II (right), III (left)
- Optional: show the hexaxial reference system (add aVR, aVL, aVF axes through center)

**Toggle:** This is a display option the user can turn on/off.

---

## Lighting Setup

```
- Ambient light: intensity 0.4, color white
- Directional light 1: intensity 0.8, position (5, 5, 5), castShadow false
- Directional light 2: intensity 0.3, position (-3, 2, -3) — fill light
- No harsh shadows needed — keep it clinical and well-lit
```

## Camera

- `PerspectiveCamera`, fov 50
- Initial position: `(0, 0, 2)` looking at origin
- `OrbitControls` from drei for rotate/zoom/pan
- Min distance: 0.5, max distance: 5
