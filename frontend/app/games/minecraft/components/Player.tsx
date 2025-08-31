import * as React from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useMovementKeys } from "../hooks/useMovementKeys";
import {
  aabbIntersects, makeIsSolid,
  PLAYER_RADIUS, PLAYER_HEIGHT, EYE_HEIGHT,
  GRAVITY, WALK_SPEED, SPRINT_MULT, JUMP_VEL
} from "../lib/collision";

export type PlayerAPI = {
  getFeet(): THREE.Vector3;   // feet position
  getPos(): THREE.Vector3;    // feet position clone
  nudgeUp(dy: number, absolute?: boolean): void; // bump up or set absolute feet Y
  isGrounded(): boolean;      // expose grounded state
};

type Props = { active: boolean; solid: Set<string>; worldSize: number };

const Player = React.forwardRef<PlayerAPI, Props>(function Player({ active, solid, worldSize }, ref) {
  const { camera } = useThree();
  const keys = useMovementKeys();

  const pos = React.useRef(new THREE.Vector3(worldSize / 2, 3, worldSize / 2)); // feet
  const vel = React.useRef(new THREE.Vector3());
  const grounded = React.useRef(false);

  const isSolid = React.useMemo(() => makeIsSolid(solid, worldSize), [solid, worldSize]);

  React.useEffect(() => {
    if (!active) return;
    let tries = 0;
    while (aabbIntersects(pos.current, isSolid) && tries++ < 10) pos.current.y += 0.2;
  }, [active, isSolid]);

  React.useImperativeHandle(ref, () => ({
    getFeet: () => pos.current.clone(),
    getPos: () => pos.current.clone(),
    nudgeUp: (dy, absolute = false) => {
      if (absolute) pos.current.y = dy;
      else pos.current.y += dy;
      grounded.current = false;
    },
    isGrounded: () => grounded.current,
  }), []);

  useFrame((_, rawDt) => {
    if (!active) return;
    const dt = Math.min(0.05, rawDt);

    // Resolve any initial penetration (e.g., player placed a block at feet)
    let pushes = 0;
    while (aabbIntersects(pos.current, isSolid) && pushes++ < 8) pos.current.y += 0.05;

    // Camera basis
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0; forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    // Input
    const k = keys.get();
    const wish = new THREE.Vector3();
    if (k.forward) wish.add(forward);
    if (k.back)    wish.sub(forward);
    if (k.right)   wish.add(right);
    if (k.left)    wish.sub(right);
    if (wish.lengthSq() > 1e-6) wish.normalize();

    const speed = WALK_SPEED * (k.sprint ? SPRINT_MULT : 1);
    vel.current.x = wish.x * speed;
    vel.current.z = wish.z * speed;

    if (k.jump && grounded.current) { vel.current.y = JUMP_VEL; grounded.current = false; }
    else { vel.current.y -= GRAVITY * dt; if (vel.current.y < -30) vel.current.y = -30; }

    // Integrate + collisions (X, Y, Z)
    const p = pos.current;
    const prevX = p.x, prevY = p.y, prevZ = p.z;

    p.x += vel.current.x * dt;
    if (aabbIntersects(p, isSolid)) { p.x = prevX; vel.current.x = 0; }

    p.y += vel.current.y * dt;
    let hitFloor = false;
    if (aabbIntersects(p, isSolid)) { if (vel.current.y < 0) hitFloor = true; p.y = prevY; vel.current.y = 0; }
    grounded.current = hitFloor;

    p.z += vel.current.z * dt;
    if (aabbIntersects(p, isSolid)) { p.z = prevZ; vel.current.z = 0; }

    // Clamp world bounds
    p.x = THREE.MathUtils.clamp(p.x, 0 + PLAYER_RADIUS, worldSize - PLAYER_RADIUS);
    p.z = THREE.MathUtils.clamp(p.z, 0 + PLAYER_RADIUS, worldSize - PLAYER_RADIUS);

    camera.position.set(p.x, p.y + EYE_HEIGHT, p.z);
  });

  return null;
});

export default Player;
