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
import { getCardiacVector } from '../engine/cardiac-vector';
import { updateSimulation } from '../engine/simulation-cache';
import { CONDITION_PRESETS } from '../engine/pathology';
import { vectorToScene } from '../engine/coordinates';
import { useSimulationStore } from '../store/simulation-store';
import type { ArteryKey } from '../store/simulation-store';

// Scale factor: Frank vector in mV → heart-local units.
const SCALE = 0.029;

// ── Pre-computed VCG loop ─────────────────────────────────────────────────

const PHASE_COLORS = {
  p:   '#ffaa00',
  pr:  '#334455',
  qrs: '#00ee44',
  st:  '#334455',
  t:   '#00ccff',
  tp:  '#334455',
};

interface LoopSegment {
  points: [number, number, number][];
  color: string;
}

function buildLoopSegments(
  heartRateBpm: number,
  activeConditions: string[],
  arteries: Record<string, boolean>,
): LoopSegment[] {
  const sim = updateSimulation({ heartRateBpm, activeConditions, arteries });
  const cycleLen = sim.activationMap.phaseBoundaries.cycleLength;
  const N = 300;
  const segments: LoopSegment[] = [];
  let currentPhase = '';
  let currentPts: [number, number, number][] = [];

  for (let i = 0; i <= N; i++) {
    const t = (i / N) * cycleLen;
    const state = getCardiacVector(t);
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
  const { heartRateBpm, activeConditions, arteries, showVCGLoop } = useSimulationStore();

  const segments = useMemo(
    () => buildLoopSegments(heartRateBpm, activeConditions, arteries),
    [heartRateBpm, activeConditions, arteries],
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

    const { heartRateBpm, playbackSpeed, activeConditions, arteries } =
      useSimulationStore.getState();

    // Ensure simulation is up to date
    const sim = updateSimulation({ heartRateBpm, activeConditions, arteries });
    const cycleLen = sim.activationMap.phaseBoundaries.cycleLength;

    cycleRef.current = (cycleRef.current + delta * 1000 * playbackSpeed) % cycleLen;

    const state = getCardiacVector(cycleRef.current);
    const [sx, sy, sz] = vectorToScene(state.vector);
    const len = Math.sqrt(sx * sx + sy * sy + sz * sz) * SCALE;

    if (len < 0.001) {
      groupRef.current.visible = false;
      return;
    }

    groupRef.current.visible = true;

    const dir = new Vector3(sx, sy, sz).normalize();
    const helper = new ArrowHelper(dir, new Vector3(0, 0, 0), 1);
    groupRef.current.setRotationFromQuaternion(helper.quaternion);

    const headLen = Math.min(0.008, len * 0.3);
    const shaftLen = Math.max(0.001, len - headLen);

    shaftRef.current.scale.set(1, shaftLen, 1);
    shaftRef.current.position.set(0, shaftLen / 2, 0);

    headRef.current.scale.set(1, headLen, 1);
    headRef.current.position.set(0, shaftLen + headLen / 2, 0);
  });

  if (!showVectorArrow) return null;

  return (
    <group ref={groupRef}>
      <mesh ref={shaftRef} material={SHAFT_MAT}>
        <cylinderGeometry args={[0.002, 0.002, 1, 8]} />
      </mesh>
      <mesh ref={headRef} material={HEAD_MAT}>
        <coneGeometry args={[0.005, 1, 8]} />
      </mesh>
    </group>
  );
}

// ── Per-condition mean-vector arrows ──────────────────────────────────────────

// Compute the mean QRS vector direction for a single condition
function conditionMeanSceneVec(conditionId: string): [number, number, number] | null {
  const preset = CONDITION_PRESETS[conditionId];
  if (!preset) return null;

  // Run a temporary simulation with just this condition active
  const sim = updateSimulation({
    heartRateBpm: 75,
    activeConditions: [conditionId],
    arteries: { lad: true, d1: true, lcx: true, om: true, rca: true, pda: true },
  });

  const { qrsStart, qrsEnd } = sim.activationMap.phaseBoundaries;
  const N = 60;
  let sx = 0, sy = 0, sz = 0;
  for (let i = 0; i < N; i++) {
    const t = qrsStart + (i / N) * (qrsEnd - qrsStart);
    const state = getCardiacVector(t);
    const sv = vectorToScene(state.vector);
    sx += sv[0]; sy += sv[1]; sz += sv[2];
  }
  const mag = Math.sqrt(sx * sx + sy * sy + sz * sz);
  if (mag < 1e-6) return null;
  return [sx / mag, sy / mag, sz / mag];
}

const CONDITION_ARROW_LEN = 0.032;

function ConditionArrow({ conditionId }: { conditionId: string }) {
  const preset = CONDITION_PRESETS[conditionId];
  if (!preset) return null;

  const dir = conditionMeanSceneVec(conditionId);
  if (!dir) return null;

  const headLen = CONDITION_ARROW_LEN * 0.28;
  const shaftLen = CONDITION_ARROW_LEN - headLen;

  const vec3dir = new Vector3(dir[0], dir[1], dir[2]);
  const helper = new ArrowHelper(vec3dir, new Vector3(0, 0, 0), 1);

  const mat = new MeshStandardMaterial({
    color: preset.vectorColor,
    emissive: preset.vectorColor,
    emissiveIntensity: 0.4,
    roughness: 0.4,
    metalness: 0.1,
    transparent: true,
    opacity: 0.85,
  });

  return (
    <group quaternion={helper.quaternion}>
      <mesh material={mat} position={[0, shaftLen / 2, 0]} scale={[1, shaftLen, 1]}>
        <cylinderGeometry args={[0.0014, 0.0014, 1, 8]} />
      </mesh>
      <mesh material={mat} position={[0, shaftLen + headLen / 2, 0]} scale={[1, headLen, 1]}>
        <coneGeometry args={[0.004, 1, 8]} />
      </mesh>
    </group>
  );
}

export function ConditionVectors() {
  const { activeConditions, showVectorArrow } = useSimulationStore();

  if (!showVectorArrow || activeConditions.length === 0) return null;

  return (
    <group>
      {activeConditions.map((id) => (
        <ConditionArrow key={id} conditionId={id} />
      ))}
    </group>
  );
}

// ── Ischemia injury-current vectors ──────────────────────────────────────────

const TERRITORY_CENTERS: Record<ArteryKey, [number, number, number]> = {
  lad: [ 0.005, -0.010,  0.040],
  d1:  [ 0.025,  0.000,  0.032],
  lcx: [ 0.040,  0.000,  0.000],
  om:  [ 0.038, -0.005, -0.025],
  rca: [ 0.000, -0.030, -0.015],
  pda: [ 0.010, -0.040, -0.025],
};

const ISCHEMIA_ARROW_SCALE = 0.025;

const ISCHEMIA_SHAFT_MAT = new MeshStandardMaterial({
  color: '#cc0000', roughness: 0.4, metalness: 0.1, emissive: '#550000',
});
const ISCHEMIA_HEAD_MAT = new MeshStandardMaterial({
  color: '#990000', roughness: 0.4, metalness: 0.1, emissive: '#440000',
});

interface IschemiaArrowProps {
  arteryKey: ArteryKey;
}

function IschemiaArrow({ arteryKey }: IschemiaArrowProps) {
  // For ischemia visualization, we compute the mean injury vector from the simulation
  // by looking at the ST-segment vector
  const { heartRateBpm, activeConditions, arteries } = useSimulationStore.getState();

  // Create a temporary config with just this artery occluded
  const testArteries = { lad: true, d1: true, lcx: true, om: true, rca: true, pda: true, [arteryKey]: false };
  const sim = updateSimulation({ heartRateBpm, activeConditions, arteries: testArteries });
  const { qrsEnd, tStart } = sim.activationMap.phaseBoundaries;

  // Sample the ST segment to get the injury vector
  const stMid = (qrsEnd + tStart) / 2;
  const state = getCardiacVector(stMid);
  const stVec = state.vector;

  // Restore the actual simulation
  updateSimulation({ heartRateBpm, activeConditions, arteries });

  const center = TERRITORY_CENTERS[arteryKey];
  const [sx, sy, sz] = vectorToScene(stVec);
  const mag = Math.sqrt(sx * sx + sy * sy + sz * sz);
  if (mag < 1e-6) return null;

  const nx = sx / mag;
  const ny = sy / mag;
  const nz = sz / mag;

  const arrowLen = ISCHEMIA_ARROW_SCALE;
  const headLen = arrowLen * 0.3;
  const shaftLen = arrowLen - headLen;

  const dir = new Vector3(nx, ny, nz);
  const helper = new ArrowHelper(dir, new Vector3(0, 0, 0), 1);

  return (
    <group position={center} quaternion={helper.quaternion}>
      <mesh material={ISCHEMIA_SHAFT_MAT} position={[0, shaftLen / 2, 0]} scale={[1, shaftLen, 1]}>
        <cylinderGeometry args={[0.0012, 0.0012, 1, 8]} />
      </mesh>
      <mesh material={ISCHEMIA_HEAD_MAT} position={[0, shaftLen + headLen / 2, 0]} scale={[1, headLen, 1]}>
        <coneGeometry args={[0.003, 1, 8]} />
      </mesh>
    </group>
  );
}

export function IschemiaVectors() {
  const { arteries, showVectorArrow } = useSimulationStore();

  if (!showVectorArrow) return null;

  const occludedKeys = (Object.keys(arteries) as ArteryKey[]).filter(
    (key) => !arteries[key],
  );

  if (occludedKeys.length === 0) return null;

  return (
    <group>
      {occludedKeys.map((key) => (
        <IschemiaArrow key={key} arteryKey={key} />
      ))}
    </group>
  );
}
