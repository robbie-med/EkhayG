/**
 * coordinates.ts
 * Conversion between cardiac vector coords (Frank convention) and Three.js scene coords.
 *
 * Frank:    X+ = leftward,  Y+ = inferior,  Z+ = anterior
 * Three.js: X+ = rightward, Y+ = superior,  Z+ = anterior (toward viewer)
 *
 * Conversion: sceneX = -vectorX, sceneY = -vectorY, sceneZ = vectorZ
 */

import type { Vec3 } from './cardiac-vector';

export function vectorToScene(v: Vec3): [number, number, number] {
  // X: both systems positive = patient-left (no flip)
  // Y: Frank+ = inferior, Three.js+ = superior (flip)
  // Z: both positive = anterior (no flip)
  return [v[0], -v[1], v[2]];
}

export function sceneToVector(s: { x: number; y: number; z: number }): Vec3 {
  return [s.x, -s.y, s.z];
}
