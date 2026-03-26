/**
 * Scene3D.tsx
 * Main Three.js scene via @react-three/fiber Canvas.
 *
 * Lighting per 3D_GEOMETRY_SPEC.md:
 *   - Ambient: intensity 0.4
 *   - Directional 1: intensity 0.8, position (5, 5, 5)
 *   - Directional 2: intensity 0.3, position (-3, 2, -3) — fill light
 *
 * Camera: PerspectiveCamera fov=50, initial position (0, 0, 2)
 * Controls: OrbitControls, minDistance 0.5, maxDistance 5
 */

import { Component, useCallback, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { TorsoMesh } from '../models/torso';
import { HeartGroup } from '../models/heart';
import { ElectrodeMarkers } from '../models/electrode';
import { sceneToVector } from '../engine/coordinates';
import { useSimulationStore } from '../store/simulation-store';

function SceneLights() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight intensity={0.8} position={[5, 5, 5]} />
      <directionalLight intensity={0.3} position={[-3, 2, -3]} />
    </>
  );
}

/** Inner scene content (must be inside Canvas). */
function SceneContent() {
  const isPlacementMode = useSimulationStore((s) => s.isPlacementMode);
  const setCustomElectrodePos = useSimulationStore((s) => s.setCustomElectrodePos);

  const handleTorsoClick = useCallback(
    (e: { point: { x: number; y: number; z: number } }) => {
      if (!isPlacementMode) return;
      setCustomElectrodePos(sceneToVector(e.point));
    },
    [isPlacementMode, setCustomElectrodePos],
  );

  return (
    <>
      <SceneLights />
      <TorsoMesh onClick={handleTorsoClick} />
      <HeartGroup />
      <ElectrodeMarkers />
      <OrbitControls
        minDistance={0.5}
        maxDistance={5}
        enablePan={false}
        dampingFactor={0.08}
        enableDamping
      />
    </>
  );
}

// ── Error boundary for WebGL failures ────────────────────────────────────────
interface EBProps { children: ReactNode; fallback: ReactNode }
interface EBState { hasError: boolean }

class WebGLErrorBoundary extends Component<EBProps, EBState> {
  state: EBState = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function WebGLFallback({ width, height }: { width: number | string; height: number | string }) {
  return (
    <div
      style={{
        width, height, borderRadius: 8, overflow: 'hidden',
        background: '#0d1117',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 8,
      }}
    >
      <p style={{ color: '#9ca3af', fontFamily: 'monospace', fontSize: 14, textAlign: 'center', padding: 20 }}>
        WebGL is not available in this browser.
        <br />
        The 3D heart/torso scene requires WebGL to render.
        <br />
        <span style={{ color: '#6b7280', fontSize: 12 }}>
          Try Chrome/Firefox with GPU acceleration enabled.
        </span>
      </p>
    </div>
  );
}

function isWebGLAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

// ── Main component ───────────────────────────────────────────────────────────
interface Props {
  width?: number | string;
  height?: number | string;
}

export function Scene3D({ width = 420, height = 520 }: Props) {
  if (!isWebGLAvailable()) {
    return <WebGLFallback width={width} height={height} />;
  }

  return (
    <WebGLErrorBoundary fallback={<WebGLFallback width={width} height={height} />}>
      <div
        style={{
          width,
          height,
          borderRadius: 8,
          overflow: 'hidden',
          background: '#0d1117',
        }}
      >
        <Canvas
          camera={{ fov: 50, position: [0, 0, 2], near: 0.01, far: 20 }}
          gl={{ antialias: true }}
          style={{ width: '100%', height: '100%' }}
        >
          <SceneContent />
        </Canvas>
      </div>
    </WebGLErrorBoundary>
  );
}
