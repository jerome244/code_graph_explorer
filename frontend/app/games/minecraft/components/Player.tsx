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

/* ---- Crouch + camera tuning (local to player) ---- */
const CROUCH_MULT = 0.6;                        // crouch speed factor
const STAND_EYE = EYE_HEIGHT;                   // meters above feet
const CROUCH_EYE = Math.max(0.8, EYE_HEIGHT - 0.42);
const EYE_LERP = 0.25;                          // smoothing for camera height

const Player = React.forwardRef<PlayerAPI, Props>(function Player({ active, solid, worldSize }, ref) {
  const { camera } = useThree();
  const keys = useMovementKeys();

  const pos = React.useRef(new THREE.Vector3(worldSize / 2, 3, worldSize / 2)); // feet
  const vel = React.useRef(new THREE.Vector3());
  const grounded = React.useRef(false);

  // sprint/crouch state + jump sprint latch (for mid-air behavior)
  const crouchHeldRef = React.useRef(false);
  const sprintAirLatchRef = React.useRef(1);    // 1 or SPRINT_MULT, fixed per airborne arc
  const wasGroundedRef = React.useRef(true);

  // camera smoothing for crouch eye height
  const eyeHeightRef = React.useRef(STAND_EYE);

  const isSolid = React.useMemo(() => makeIsSolid(solid, worldSize), [solid, worldSize]);

  React.useEffect(() => {
    if (!active) return;
    let tries = 0;
    while (aabbIntersects(pos.current, isSolid) && tries++ < 10) pos.current.y += 0.2;
  }, [active, isSolid]);

  // Hook up Ctrl for crouch (keep using your existing hook for all other keys)
  React.useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code === "ControlLeft" || e.code === "ControlRight") crouchHeldRef.current = true;
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === "ControlLeft" || e.code === "ControlRight") crouchHeldRef.current = false;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

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

    // --- Jump: when we take off, latch sprint multiplier for the whole airborne arc
    const crouching = crouchHeldRef.current;
    if (k.jump && grounded.current) {
      vel.current.y = JUMP_VEL;
      grounded.current = false;
      // latch sprint at the instant of takeoff (disabled if crouching)
      const sprintLiveAtTakeoff = k.sprint && !crouching;
      sprintAirLatchRef.current = sprintLiveAtTakeoff ? SPRINT_MULT : 1;
    } else {
      vel.current.y -= GRAVITY * dt;
      if (vel.current.y < -30) vel.current.y = -30;
    }

    // --- Integrate Y early to detect ground transition (so we can also latch when walking off edges)
    const p = pos.current;
    const prevX = p.x, prevY = p.y, prevZ = p.z;

    p.y += vel.current.y * dt;
    let hitFloor = false;
    if (aabbIntersects(p, isSolid)) { if (vel.current.y < 0) hitFloor = true; p.y = prevY; vel.current.y = 0; }
    grounded.current = hitFloor;

    // If we just left ground without jumping (e.g., stepped off), latch sprint state now
    if (wasGroundedRef.current && !grounded.current && vel.current.y > -1e-6) {
      const sprintLive = k.sprint && !crouching;
      sprintAirLatchRef.current = sprintLive ? SPRINT_MULT : 1;
    }
    wasGroundedRef.current = grounded.current;

    // --- Ground / air speed selection
    const groundSprintMult = (k.sprint && !crouching) ? SPRINT_MULT : 1; // sprint disabled while crouched
    const speedMult = grounded.current ? groundSprintMult : sprintAirLatchRef.current;
    const crouchMult = crouching ? CROUCH_MULT : 1;
    const speed = WALK_SPEED * speedMult * crouchMult;

    // Apply horizontal velocity from wish direction
    vel.current.x = wish.x * speed;
    vel.current.z = wish.z * speed;

    // Integrate X/Z with collisions
    p.x += vel.current.x * dt;
    if (aabbIntersects(p, isSolid)) { p.x = prevX; vel.current.x = 0; }

    p.z += vel.current.z * dt;
    if (aabbIntersects(p, isSolid)) { p.z = prevZ; vel.current.z = 0; }

    // Clamp world bounds
    p.x = THREE.MathUtils.clamp(p.x, 0 + PLAYER_RADIUS, worldSize - PLAYER_RADIUS);
    p.z = THREE.MathUtils.clamp(p.z, 0 + PLAYER_RADIUS, worldSize - PLAYER_RADIUS);

    // Smooth camera height for crouch
    const eyeTarget = crouching ? CROUCH_EYE : STAND_EYE;
    eyeHeightRef.current = THREE.MathUtils.lerp(eyeHeightRef.current, eyeTarget, EYE_LERP);

    camera.position.set(p.x, p.y + eyeHeightRef.current, p.z);
  });

  return null;
});

export default Player;
