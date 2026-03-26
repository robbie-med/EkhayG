/**
 * heart.tsx
 * Anatomical heart loaded from GLB (Visible Human Project),
 * with QRS-synced pulsation and procedural coronary arteries.
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Box3, Vector3, MeshStandardMaterial, Mesh } from 'three';
import type { Group, Object3D } from 'three';
import { CoronaryArteries } from './coronary-arteries';
import { VCGLoopTrail, VectorArrow } from '../components/VectorDisplay';
import { getDefaultTimings } from '../engine/cardiac-vector';
import { getCombinedPathology } from '../engine/pathology';
import { useSimulationStore } from '../store/simulation-store';

// Shared materials — semi-transparent so VCG loop is visible inside
const CHAMBER_MAT = new MeshStandardMaterial({
  color: 0x8B0000,
  roughness: 0.55,
  metalness: 0.08,
  transparent: true,
  opacity: 0.38,
  depthWrite: false,
});
const VALVE_MAT = new MeshStandardMaterial({
  color: 0xA01020,
  roughness: 0.4,
  metalness: 0.12,
  transparent: true,
  opacity: 0.45,
  depthWrite: false,
});

function isValveOrMuscle(name: string): boolean {
  return name.includes('valve') || name.includes('papillary');
}

export function HeartGroup() {
  const { scene } = useGLTF('/3d-vh-m-heart.glb');
  const outerRef = useRef<Group>(null);
  const innerRef = useRef<Group>(null);
  const cycleTimeMsRef = useRef(0);

  // Clone, center, and re-material the model once
  const heartScene = useMemo(() => {
    const clone = scene.clone(true);

    // Center at origin
    const box = new Box3().setFromObject(clone);
    const center = box.getCenter(new Vector3());
    clone.position.sub(center);

    // Apply materials based on part type
    clone.traverse((child: Object3D) => {
      if ((child as Mesh).isMesh) {
        (child as Mesh).material = isValveOrMuscle(child.name)
          ? VALVE_MAT
          : CHAMBER_MAT;
      }
    });

    return clone;
  }, [scene]);

  // Pulsation animation
  useFrame((_, delta) => {
    if (!innerRef.current) return;

    const { heartRateBpm, playbackSpeed, activePathologyId, arteries } =
      useSimulationStore.getState();
    const combined = getCombinedPathology(activePathologyId, arteries);
    const timings = { ...getDefaultTimings(heartRateBpm), ...combined.timingOverrides };
    const cycleLen = 60000 / heartRateBpm;

    cycleTimeMsRef.current =
      (cycleTimeMsRef.current + delta * 1000 * playbackSpeed) % cycleLen;

    const qrsStart = timings.pDuration + timings.prDuration;
    const qrsEnd = qrsStart + timings.qrsDuration;
    const t = cycleTimeMsRef.current;

    let scale = 1.0;
    if (t >= qrsStart && t <= qrsEnd) {
      const progress = (t - qrsStart) / timings.qrsDuration;
      scale = 1.0 + 0.06 * Math.sin(progress * Math.PI);
    }

    innerRef.current.scale.setScalar(scale);
  });

  return (
    <group
      ref={outerRef}
      position={[0.06, 0.10, 0.04]}
      rotation={[0, -0.2, -0.5]}
      scale={2}
    >
      {/* Inner group: scales with heartbeat */}
      <group ref={innerRef}>
        <primitive object={heartScene} />
      </group>

      {/* Coronary arteries */}
      <CoronaryArteries />

      {/* Phase 6: VCG loop + vector arrow — inside heart, shares heart transform */}
      <VCGLoopTrail />
      <VectorArrow />
    </group>
  );
}

// Preload GLB so it's ready when the component mounts
useGLTF.preload('/3d-vh-m-heart.glb');
