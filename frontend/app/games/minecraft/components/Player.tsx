"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { BACKWARD_KEYS, FORWARD_KEYS, LEFT_KEYS, RIGHT_KEYS } from "../lib/utils";
import { depenetrate, moveWithCollisions, PLAYER_HEIGHT } from "../lib/physics";
import { heightAt } from "../lib/worldgen";

export default function Player({ hasBlock, paused = false }: { hasBlock: (x: number, y: number, z: number) => boolean; paused?: boolean }) {
  const { camera } = useThree();

  // state
  const vel = useRef(new THREE.Vector3());
  const dir = useRef(new THREE.Vector3());
  const grounded = useRef(true);

  // input & jump helpers
  const pressed = useRef<Set<string>>(new Set());
  const lastFrameTime = useRef<number>(0);
  const coyoteTimer = useRef<number>(0);
  const bufferTimer = useRef<number>(0);

  const COYOTE_MS = 100;
  const BUFFER_MS = 100;

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      pressed.current.add(k);
      if (k === " ") bufferTimer.current = BUFFER_MS;
    };
    const up = (e: KeyboardEvent) => {
      pressed.current.delete(e.key.toLowerCase());
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Spawn ON the terrain, not at a fixed y
  useEffect(() => {
    const x = 0, z = 6; // initial camera x/z you use
    const surfaceY = heightAt(Math.round(x), Math.round(z));
    camera.position.set(x, surfaceY + PLAYER_HEIGHT + 0.001, z);
  }, [camera]);

  useFrame((state, dt) => {
    if (paused) { return; }

    const now = state.clock.elapsedTime * 1000;
    const frameDtMs = Math.min(50, now - (lastFrameTime.current || now));
    lastFrameTime.current = now;

    // 0) If something spawned on us, pop out gently
    {
      const { position: fixed, moved } = depenetrate(camera.position, hasBlock);
      if (moved) camera.position.copy(fixed);
    }

    const SPEED = 6;
    const GRAVITY = 24;
    const JUMP_V = 8;

    // 1) Movement intent
    const forward = Array.from(pressed.current).some((k) => FORWARD_KEYS.has(k));
    const backward = Array.from(pressed.current).some((k) => BACKWARD_KEYS.has(k));
    const left = Array.from(pressed.current).some((k) => LEFT_KEYS.has(k));
    const right = Array.from(pressed.current).some((k) => RIGHT_KEYS.has(k));

    const fAxis = (forward ? 1 : 0) + (backward ? -1 : 0);
    const rAxis = (right ? 1 : 0) + (left ? -1 : 0);

    dir.current.set(rAxis, 0, fAxis);
    if (dir.current.lengthSq() > 0) dir.current.normalize();

    const forwardVec = new THREE.Vector3();
    camera.getWorldDirection(forwardVec);
    forwardVec.y = 0;
    if (forwardVec.lengthSq() > 0) forwardVec.normalize();

    const rightVec = new THREE.Vector3().crossVectors(forwardVec, new THREE.Vector3(0, 1, 0)).normalize();

    const moveDir = new THREE.Vector3()
      .addScaledVector(forwardVec, dir.current.z)
      .addScaledVector(rightVec, dir.current.x);
    if (moveDir.lengthSq() > 0) moveDir.normalize();

    const sprint = pressed.current.has("shift") && !pressed.current.has(" ");
    const speed = SPEED * (sprint ? 1.5 : 1);

    // 2) Timers (coyote & jump buffer)
    coyoteTimer.current = Math.max(0, coyoteTimer.current - frameDtMs);
    bufferTimer.current = Math.max(0, bufferTimer.current - frameDtMs);
    if (grounded.current) coyoteTimer.current = COYOTE_MS;

    let doJump = false;
    if (bufferTimer.current > 0 && coyoteTimer.current > 0) {
      doJump = true;
      bufferTimer.current = 0;
      coyoteTimer.current = 0;
    }

    // 3) Vertical velocity
    if (doJump) {
      vel.current.y = JUMP_V;
      grounded.current = false;
    } else {
      vel.current.y -= GRAVITY * dt;
    }

    // 4) Integrate with collisions
    const desiredVel = new THREE.Vector3(moveDir.x * speed, vel.current.y, moveDir.z * speed);
    const { position, velocity, onGround } = moveWithCollisions(camera.position, desiredVel, dt, hasBlock);

    camera.position.copy(position);
    vel.current.copy(velocity);
    grounded.current = onGround;

    // 5) Dynamic terrain clamp: never let eye go below the local surface
    {
      const px = Math.round(camera.position.x);
      const pz = Math.round(camera.position.z);
      const surfaceY = heightAt(px, pz); // current column’s surface height
      const minEyeY = surfaceY + PLAYER_HEIGHT + 0.001;
      if (camera.position.y < minEyeY) {
        camera.position.y = minEyeY;
        vel.current.y = 0;
        grounded.current = true;
      }
    }
  });

  return null;
}
