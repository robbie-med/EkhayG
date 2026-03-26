# EKG Simulator — Quick Start

## Setup with Claude Code

1. Open a terminal in this folder (`ekg-simulator/`)
2. Run `claude` to start Claude Code
3. Tell it: "Read CLAUDE.md and start building Phase 1"

## File Overview

| File | Purpose |
|------|---------|
| `CLAUDE.md` | **Primary project guide.** Architecture, phases, tech stack, quality criteria. Claude Code reads this automatically. |
| `TECHNICAL_SPEC.md` | Deep-dive on the cardiac vector math, lead calculations, pathology modifications, and EKG display specs. |
| `VECTOR_REFERENCE.md` | Raw data: Bezier control points for vector loops, electrode positions, pathology presets. Copy-paste ready for implementation. |
| `README.md` | This file. |

## Build Order

Claude Code should follow the phases in CLAUDE.md:

1. **Phase 1:** Vector engine + single Lead II tracing (validate the math)
2. **Phase 2:** Full 12-lead display
3. **Phase 3:** 3D heart + torso scene
4. **Phase 4:** Interactive electrode placement
5. **Phase 5:** Pathology engine (artery toggles)
6. **Phase 6:** Vector visualization + polish

## Validation After Phase 1

Before moving on, verify:
- Lead II shows upright P, narrow QRS, upright T
- aVR is predominantly negative
- Lead III = Lead II - Lead I (exact)

## Running the App

```bash
npm create vite@latest . -- --template react-ts
npm install three @react-three/fiber @react-three/drei zustand
npm install -D tailwindcss @tailwindcss/vite
npm run dev
```

Then open http://localhost:5173
