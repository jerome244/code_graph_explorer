"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { BACKWARD_KEYS, FORWARD_KEYS, LEFT_KEYS, RIGHT_KEYS } from "../lib/utils";
import { moveWithCollisions, PLAYER_HEIGHT, depenetrate } from "../lib/physics";

export default function Player({ hasBlock }: { hasBlock: (x: number, y: number, z: number) => boolean }) {
  const { camera } = useThree();
  const vel = useRef(new THREE.Vector3());
  const dir = useRef(new THREE.Vector3());
  const grounded = useRef(true);

  // input & jump helpers
  const pressed = useRef<Set<string>>(new Set());
  const lastFrameTime = useRef<number>(0);
  const coyoteTimer = useRef<number>(0);    // ms remaining
  const bufferTimer = useRef<number>(0);    // ms remaining

  const COYOTE_MS = 100;
  const BUFFER_MS = 100;

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      pressed.current.add(k);
      if (k === " ") bufferTimer.current = BUFFER_MS; // start buffer when space is pressed
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      pressed.current.delete(k);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    camera.position.set(0, 1 + PLAYER_HEIGHT, 6);
  }, [camera]);

  useFrame((state, dt) => {
    const now = state.clock.elapsedTime * 1000; // ms
    const frameDtMs = Math.min(50, now - (lastFrameTime.current || now)); // clamp huge spikes
    lastFrameTime.current = now;

    // --- Phase 0: depenetrate if something spawned on us ---
    {
      const { position: fixed, moved } = depenetrate(camera.position, hasBlock);
      if (moved) camera.position.copy(fixed);
    }

    const SPEED = 6;
    const GRAVITY = 24;
    const JUMP_V = 8;

    // --- Phase 1: read movement intent ---
    const forward = Array.from(pressed.current).some((k) => FORWARD_KEYS.has(k));
    const backward = Array.from(pressed.current).some((k) => BACKWARD_KEYS.has(k));
    const left = Array.from(pressed.current).some((k) => LEFT_KEYS.has(k));
    const right = Array.from(pressed.current).some((k) => RIGHT_KEYS.has(k));

    const fAxis = (forward ? 1 : 0) + (backward ? -1 : 0);
    const rAxis = (right ? 1 : 0) + (left ? -1 : 0);

    dir.current.set(rAxis, 0, fAxis);
    if (dir.current.lengthSq() > 0) dir.current.normalize();

    const fwd = new THREE.Vector3();
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() > 0) fwd.normalize();
    const rightVec = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();

    const move = new THREE.Vector3()
      .addScaledVector(fwd, dir.current.z)
      .addScaledVector(rightVec, dir.current.x);
    if (move.lengthSq() > 0) move.normalize();

    const sprint = pressed.current.has("shift") && !pressed.current.has(" ");
    const speed = SPEED * (sprint ? 1.5 : 1);

    // --- Phase 2: timers (coyote & buffer) ---
    // decrement timers each frame
    coyoteTimer.current = Math.max(0, coyoteTimer.current - frameDtMs);
    bufferTimer.current = Math.max(0, bufferTimer.current - frameDtMs);

    // if we are grounded *this frame*, refresh coyote time
    if (grounded.current) coyoteTimer.current = COYOTE_MS;

    // consume buffered jump if available & allowed
    let doJump = false;
    if (bufferTimer.current > 0 && coyoteTimer.current > 0) {
      doJump = true;
      bufferTimer.current = 0; // consume
      coyoteTimer.current = 0; // consume
    }

    // --- Phase 3: vertical velocity (gravity / jump) ---
    if (doJump) {
      vel.current.y = JUMP_V;            // start jump
      grounded.current = false;          // leave ground immediately
    } else {
      vel.current.y -= GRAVITY * dt;     // gravity otherwise
    }

    // --- Phase 4: integrate with collisions ---
    const desiredVel = new THREE.Vector3(move.x * speed, vel.current.y, move.z * speed);

    const { position, velocity, onGround } = moveWithCollisions(
      camera.position,
      desiredVel,
      dt,
      hasBlock
    );

    camera.position.copy(position);
    vel.current.copy(velocity);
    grounded.current = onGround;

    // --- Phase 5: safety clamp (in case empty world below) ---
    const groundEyeY = 1 + PLAYER_HEIGHT;
    if (camera.position.y < groundEyeY) {
      camera.position.y = groundEyeY;
      vel.current.y = 0;
      grounded.current = true;
    }
  });

  return null;
}
