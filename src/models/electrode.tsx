/**
 * electrode.tsx
 * Electrode marker spheres placed on the torso surface.
 *
 * Per 3D_GEOMETRY_SPEC.md:
 *   SphereGeometry(0.012, 16, 16)
 *   Green = standard 12-lead positions
 *   Orange = user-placed custom electrode
 *   Blue = default
 *
 * Standard electrode positions are converted from cardiac-vector (Frank) coords
 * to Three.js scene coords via vectorToScene().
 */

import { useMemo } from 'react';
import { useSimulationStore } from '../store/simulation-store';
import { ELECTRODE_POSITIONS } from '../engine/lead-calculator';
import { vectorToScene } from '../engine/coordinates';
import type { Vec3 } from '../engine/cardiac-vector';

const STANDARD_NAMES = ['RA', 'LA', 'RL', 'LL', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'] as const;

// Limb leads = blue, precordial = green
function electrodeColor(name: string): string {
  if (['RA', 'LA', 'RL', 'LL'].includes(name)) return '#2196F3';
  return '#4CAF50';
}

function ElectrodeSphere({
  position,
  color,
  size = 0.012,
}: {
  position: [number, number, number];
  color: string;
  size?: number;
}) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[size, 16, 16]} />
      <meshStandardMaterial color={color} roughness={0.4} metalness={0.2} />
    </mesh>
  );
}

/** Label sprite next to an electrode (billboard text). */
function ElectrodeLabel({
  position,
  text,
}: {
  position: [number, number, number];
  text: string;
}) {
  const canvas = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 32;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'white';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 32, 16);
    return c;
  }, [text]);

  return (
    <sprite
      position={[position[0], position[1] + 0.025, position[2]]}
      scale={[0.06, 0.03, 1]}
    >
      <spriteMaterial>
        <canvasTexture attach="map" image={canvas} />
      </spriteMaterial>
    </sprite>
  );
}

/** Renders standard 12-lead electrode markers (when enabled) + custom electrode. */
export function ElectrodeMarkers() {
  const showStandard = useSimulationStore((s) => s.showStandardElectrodes);
  const customPos = useSimulationStore((s) => s.customElectrodePos);

  return (
    <group>
      {/* Standard 12-lead electrodes */}
      {showStandard &&
        STANDARD_NAMES.map((name) => {
          const vecPos = ELECTRODE_POSITIONS[name] as Vec3;
          const scPos = vectorToScene(vecPos);
          return (
            <group key={name}>
              <ElectrodeSphere position={scPos} color={electrodeColor(name)} />
              <ElectrodeLabel position={scPos} text={name} />
            </group>
          );
        })}

      {/* Custom user-placed electrode */}
      {customPos && (
        <group>
          <ElectrodeSphere
            position={vectorToScene(customPos)}
            color="#FF9800"
            size={0.014}
          />
          <ElectrodeLabel position={vectorToScene(customPos)} text="⊕" />
        </group>
      )}
    </group>
  );
}
