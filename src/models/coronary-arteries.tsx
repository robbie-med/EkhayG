/**
 * coronary-arteries.tsx
 * Loads real coronary artery meshes from the Visible Human vascular GLB.
 * Both models (heart + vasculature) share the same VH coordinate system,
 * so we apply the same centering offset to align them.
 */

import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { Box3, Vector3, MeshStandardMaterial } from 'three';
import type { Object3D, Mesh, BufferGeometry } from 'three';
import { useSimulationStore } from '../store/simulation-store';

export type ArteryKey = 'lad' | 'lcx' | 'rca';

// Node names in the vascular GLB that belong to each artery territory
const LAD_NAMES = [
  'VH_M_left_anterior_descending_artery',
  'VH_M_diagonal_branch_of_anterior_descending_branch_of_left_coronary_artery',
  'VH_M_diagonal_branch_of_left_anterior_descending_artery',
];

const LCX_NAMES = [
  'VH_M_left_coronary_artery',
  'VH_M_left_marginal_branch',
];

const RCA_NAMES = [
  'VH_M_right_coronary_artery',
  'VH_M_right_marginal_artery',
  'VH_M_right_posterior_descending_artery',
];

const PATENT_MAT = new MeshStandardMaterial({
  color: '#CC0000',
  roughness: 0.4,
  metalness: 0.1,
});

const OCCLUDED_MAT = new MeshStandardMaterial({
  color: '#666666',
  roughness: 0.6,
  metalness: 0.05,
});

/**
 * Collect BufferGeometry from named nodes in a GLTF scene.
 */
function collectGeometries(
  scene: Object3D,
  names: string[],
): BufferGeometry[] {
  const nameSet = new Set(names);
  const geos: BufferGeometry[] = [];
  scene.traverse((child: Object3D) => {
    if (nameSet.has(child.name) && (child as Mesh).isMesh) {
      geos.push((child as Mesh).geometry);
    }
  });
  return geos;
}

/**
 * Compute the center of the heart GLB's bounding box so we can apply
 * the same centering transform to the vascular meshes.
 */
function getHeartCenter(heartScene: Object3D): Vector3 {
  const box = new Box3().setFromObject(heartScene);
  return box.getCenter(new Vector3());
}

interface ArteryGroupProps {
  geometries: BufferGeometry[];
  patent: boolean;
}

function ArteryGroup({ geometries, patent }: ArteryGroupProps) {
  const mat = patent ? PATENT_MAT : OCCLUDED_MAT;
  return (
    <group>
      {geometries.map((geo, i) => (
        <mesh key={i} geometry={geo} material={mat} />
      ))}
    </group>
  );
}

export function CoronaryArteries() {
  const arteries = useSimulationStore((s) => s.arteries);

  const { scene: vascScene } = useGLTF('/3d-vh-m-blood-vasculature.glb');
  const { scene: heartScene } = useGLTF('/3d-vh-m-heart.glb');

  // Extract geometries and compute centering offset to match the heart
  const { centerOffset, ladGeos, lcxGeos, rcaGeos } = useMemo(() => {
    const center = getHeartCenter(heartScene);

    return {
      centerOffset: center.clone().negate(),
      ladGeos: collectGeometries(vascScene, LAD_NAMES),
      lcxGeos: collectGeometries(vascScene, LCX_NAMES),
      rcaGeos: collectGeometries(vascScene, RCA_NAMES),
    };
  }, [vascScene, heartScene]);

  return (
    <group>
      {/* Offset to match heart centering (both GLBs share VH coord system) */}
      <group position={[centerOffset.x, centerOffset.y, centerOffset.z]}>
        <ArteryGroup geometries={ladGeos} patent={arteries.lad} />
        <ArteryGroup geometries={lcxGeos} patent={arteries.lcx} />
        <ArteryGroup geometries={rcaGeos} patent={arteries.rca} />
      </group>
    </group>
  );
}

useGLTF.preload('/3d-vh-m-blood-vasculature.glb');
