import * as THREE from "three";

export const PLAYER_RADIUS = 0.3;
export const PLAYER_HEIGHT = 1.75;
export const EYE_HEIGHT = 1.6;
export const GRAVITY = 12;
export const WALK_SPEED = 4.2;
export const SPRINT_MULT = 1.6;
export const JUMP_VEL = 5.5;

export type IsSolid = (x: number, y: number, z: number) => boolean;

export function makeIsSolid(solid: Set<string>, worldSize: number): IsSolid {
  return (x, y, z) => {
    if (x < 0 || x >= worldSize || z < 0 || z >= worldSize) return true;
    if (y < 0) return true;
    return solid.has(`${x},${y},${z}`);
  };
}

export function aabbIntersects(p: THREE.Vector3, isSolid: IsSolid, r=PLAYER_RADIUS, h=PLAYER_HEIGHT) {
  const minX = Math.floor(p.x - r);
  const maxX = Math.floor(p.x + r);
  const minY = Math.floor(p.y);
  const maxY = Math.floor(p.y + h);
  const minZ = Math.floor(p.z - r);
  const maxZ = Math.floor(p.z + r);
  for (let x = minX; x <= maxX; x++)
    for (let y = minY; y <= maxY; y++)
      for (let z = minZ; z <= maxZ; z++)
        if (isSolid(x, y, z)) return true;
  return false;
}
