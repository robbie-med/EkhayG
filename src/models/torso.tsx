/**
 * torso.tsx
 * Semi-transparent deformed sphere representing the human torso.
 * Geometry built procedurally per 3D_GEOMETRY_SPEC.md.
 *
 * Three.js coordinate convention for 3D scene (Y+ = up = superior):
 *   Y = +0.65  shoulders
 *   Y =  0.00  mid-chest
 *   Y = -0.65  hips
 */

import { useMemo } from 'react';
import { SphereGeometry, DoubleSide } from 'three';
import { useSimulationStore } from '../store/simulation-store';

// ── Width profile: half-width at each normalised sphere Y ∈ [-1, +1] ────────
// -1 = hips, 0 = waist, +1 = shoulders
function widthProfile(y: number): number {
  const t = (y + 1) / 2; // 0=hips, 1=shoulders

  const pts: [number, number][] = [
    [0.00, 0.38],  // hips
    [0.35, 0.28],  // waist
    [0.65, 0.33],  // lower chest
    [1.00, 0.45],  // shoulders
  ];

  for (let i = 0; i < pts.length - 1; i++) {
    const [t0, w0] = pts[i]!;
    const [t1, w1] = pts[i + 1]!;
    if (t >= t0 && t <= t1) {
      const u = (t - t0) / (t1 - t0);
      const s = u * u * (3 - 2 * u); // smoothstep
      return w0 + (w1 - w0) * s;
    }
  }
  return 0.45;
}

function buildTorsoGeometry() {
  const geo = new SphereGeometry(1, 64, 48);
  const pos = geo.attributes['position']!;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i); // -1 (bottom/hips) to +1 (top/shoulders)
    const z = pos.getZ(i);

    const r = Math.sqrt(x * x + z * z); // radius from Y-axis on unit sphere
    if (r < 1e-8) {
      // pole — just scale height
      pos.setXYZ(i, 0, y * 0.65, 0);
      continue;
    }

    const cosT = x / r;
    const sinT = z / r;

    const xHalf = widthProfile(y);       // desired half-width in X
    const zHalf = xHalf * 0.55;          // depth = 55% of width (flatten front-to-back)

    // Each horizontal cross-section becomes an ellipse with semi-axes xHalf × zHalf
    // The original sphere maps the unit circle r=sin(v) to this ellipse
    const newX = cosT * xHalf;
    const newY = y * 0.65;               // total height ≈ ±0.65 (1.3 units)
    const newZ = sinT * zHalf;

    pos.setXYZ(i, newX, newY, newZ);
  }

  (pos as { needsUpdate: boolean }).needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

interface TorsoProps {
  onClick?: (e: { point: { x: number; y: number; z: number } }) => void;
}

export function TorsoMesh({ onClick }: TorsoProps) {
  const geo = useMemo(() => buildTorsoGeometry(), []);
  const torsoOpacity = useSimulationStore((s) => s.torsoOpacity);

  return (
    <mesh geometry={geo} renderOrder={-1} onClick={onClick}>
      <meshPhysicalMaterial
        color="#E8BEAC"
        transparent
        opacity={torsoOpacity}
        side={DoubleSide}
        depthWrite={false}
        roughness={0.4}
        metalness={0}
      />
    </mesh>
  );
}
