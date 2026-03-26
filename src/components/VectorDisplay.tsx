/**
 * VectorDisplay.tsx
 * Phase 6: 3D cardiac vector visualization inside the R3F scene.
 *
 * - VCGLoopTrail: full-cycle path of the cardiac dipole, colored by phase
 * - VectorArrow:  real-time animated arrow showing the instantaneous vector
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import {
  ArrowHelper, Vector3, Group,
  MeshStandardMaterial,
} from 'three';
import type { Mesh } from 'three';
import {
  getCardiacVector,
  getDefaultTimings,
} from '../engine/cardiac-vector';
import { getCombinedPathology } from '../engine/pathology';
import { vectorToScene } from '../engine/coordinates';
import { useSimulationStore } from '../store/simulation-store';

// Scale factor: Frank vector in mV → heart-local units.
// Lives inside HeartGroup (parent scale=2). Heart half-extent ≈ 0.062 local.
// QRS peak magnitude ≈ 1.28 mV (diagonal of peak vector).
// Target: loop fills ~60% of heart interior → 0.062 * 0.6 / 1.28 ≈ 0.029
const SCALE = 0.029;

// ── Pre-computed VCG loop ─────────────────────────────────────────────────

const PHASE_COLORS = {
  p:   '#ffaa00',  // orange-yellow
  pr:  '#334455',  // near-invisible isoelectric
  qrs: '#00ee44',  // bright green
  st:  '#334455',  // near-invisible
  t:   '#00ccff',  // cyan
  tp:  '#334455',
};

interface LoopSegment {
  points: [number, number, number][];
  color: string;
}

function buildLoopSegments(
  heartRateBpm: number,
  combined: ReturnType<typeof getCombinedPathology>,
): LoopSegment[] {
  const timings = { ...getDefaultTimings(heartRateBpm), ...combined.timingOverrides };
  const cycleLen = 60000 / heartRateBpm;
  const N = 300;
  const segments: LoopSegment[] = [];
  let currentPhase = '';
  let currentPts: [number, number, number][] = [];

  for (let i = 0; i <= N; i++) {
    const t = (i / N) * cycleLen;
    const state = getCardiacVector(t, timings, combined.stVector, combined.qrsSegments);
    const sp = vectorToScene(state.vector);

    if (state.phase !== currentPhase) {
      if (currentPts.length > 1) {
        segments.push({ points: currentPts, color: PHASE_COLORS[currentPhase as keyof typeof PHASE_COLORS] ?? '#888' });
      }
      currentPhase = state.phase;
      currentPts = [sp];
    } else {
      currentPts.push(sp);
    }
  }
  if (currentPts.length > 1) {
    segments.push({ points: currentPts, color: PHASE_COLORS[currentPhase as keyof typeof PHASE_COLORS] ?? '#888' });
  }

  return segments;
}

export function VCGLoopTrail() {
  const { heartRateBpm, activePathologyId, arteries, showVCGLoop } = useSimulationStore();

  const combined = useMemo(
    () => getCombinedPathology(activePathologyId, arteries),
    [activePathologyId, arteries],
  );

  const segments = useMemo(
    () => buildLoopSegments(heartRateBpm, combined),
    [heartRateBpm, combined],
  );

  if (!showVCGLoop) return null;

  return (
    <group scale={SCALE}>
      {segments.map((seg, i) => (
        seg.color === '#334455' ? null : (
          <Line
            key={i}
            points={seg.points}
            color={seg.color}
            lineWidth={1.5}
            transparent
            opacity={0.75}
          />
        )
      ))}
    </group>
  );
}

// ── Animated vector arrow ─────────────────────────────────────────────────

const SHAFT_MAT = new MeshStandardMaterial({ color: '#ffff00', metalness: 0.2, roughness: 0.4, emissive: '#888800' });
const HEAD_MAT  = new MeshStandardMaterial({ color: '#ffee00', metalness: 0.3, roughness: 0.3, emissive: '#aa8800' });

export function VectorArrow() {
  const groupRef  = useRef<Group>(null);
  const shaftRef  = useRef<Mesh>(null);
  const headRef   = useRef<Mesh>(null);
  const cycleRef  = useRef(0);

  const { showVectorArrow } = useSimulationStore();

  useFrame((_, delta) => {
    if (!groupRef.current || !shaftRef.current || !headRef.current) return;

    const { heartRateBpm, playbackSpeed, activePathologyId, arteries } =
      useSimulationStore.getState();
    const combined = getCombinedPathology(activePathologyId, arteries);
    const timings = { ...getDefaultTimings(heartRateBpm), ...combined.timingOverrides };
    const cycleLen = 60000 / heartRateBpm;

    cycleRef.current = (cycleRef.current + delta * 1000 * playbackSpeed) % cycleLen;

    const state = getCardiacVector(cycleRef.current, timings, combined.stVector, combined.qrsSegments);
    const [sx, sy, sz] = vectorToScene(state.vector);
    const len = Math.sqrt(sx * sx + sy * sy + sz * sz) * SCALE;

    if (len < 0.001) {
      groupRef.current.visible = false;
      return;
    }

    groupRef.current.visible = true;

    // Orient along the vector
    const dir = new Vector3(sx, sy, sz).normalize();
    const helper = new ArrowHelper(dir, new Vector3(0, 0, 0), 1);
    groupRef.current.setRotationFromQuaternion(helper.quaternion);

    // Scale shaft length; head stays fixed size
    const headLen = Math.min(0.008, len * 0.3);
    const shaftLen = Math.max(0.001, len - headLen);

    // Shaft: cylinder along +Y, centered at y = shaftLen/2
    shaftRef.current.scale.set(1, shaftLen, 1);
    shaftRef.current.position.set(0, shaftLen / 2, 0);

    // Head: cone, base at shaftLen, tip at len
    headRef.current.scale.set(1, headLen, 1);
    headRef.current.position.set(0, shaftLen + headLen / 2, 0);
  });

  if (!showVectorArrow) return null;

  return (
    <group ref={groupRef}>
      {/* Shaft */}
      <mesh ref={shaftRef} material={SHAFT_MAT}>
        <cylinderGeometry args={[0.002, 0.002, 1, 8]} />
      </mesh>
      {/* Arrowhead */}
      <mesh ref={headRef} material={HEAD_MAT}>
        <coneGeometry args={[0.005, 1, 8]} />
      </mesh>
    </group>
  );
}
