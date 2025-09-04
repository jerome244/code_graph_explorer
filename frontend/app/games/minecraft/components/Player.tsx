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
  const onGround = useRef(true);
  const pressed = useRef<Set<string>>(new Set());

  useEffect(() => {
    const down = (e: KeyboardEvent) => pressed.current.add(e.key.toLowerCase());
    const up = (e: KeyboardEvent) => pressed.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    // Spawn one block above ground, with eye height on top
    camera.position.set(0, 1 + PLAYER_HEIGHT, 6);
  }, [camera]);

  useFrame((_, dt) => {
    const SPEED = 6;
    const GRAVITY = 24;
    const JUMP_V = 8;

    // --- NEW: if something spawned on us, push out before doing anything ---
    {
      const { position: fixed, moved } = depenetrate(camera.position, hasBlock);
      if (moved) camera.position.copy(fixed);
    }

    // movement intent
    const forward = Array.from(pressed.current).some((k) => FORWARD_KEYS.has(k));
    const backward = Array.from(pressed.current).some((k) => BACKWARD_KEYS.has(k));
    const left = Array.from(pressed.current).some((k) => LEFT_KEYS.has(k));
    const right = Array.from(pressed.current).some((k) => RIGHT_KEYS.has(k));

    const fAxis = (forward ? 1 : 0) + (backward ? -1 : 0);
    const rAxis = (right ? 1 : 0) + (left ? -1 : 0);

    dir.current.set(rAxis, 0, fAxis);
    if (dir.current.lengthSq() > 0) dir.current.normalize();

    // basis vectors
    const forwardVec = new THREE.Vector3();
    camera.getWorldDirection(forwardVec);
    forwardVec.y = 0;
    if (forwardVec.lengthSq() > 0) forwardVec.normalize();

    const rightVec = new THREE.Vector3().crossVectors(forwardVec, new THREE.Vector3(0, 1, 0)).normalize();

    // desired horizontal direction
    const move = new THREE.Vector3();
    move.addScaledVector(forwardVec, dir.current.z);
    move.addScaledVector(rightVec, dir.current.x);
    if (move.lengthSq() > 0) move.normalize();

    const sprint = pressed.current.has("shift") && !pressed.current.has(" ");
    const speed = SPEED * (sprint ? 1.5 : 1);

    // vertical velocity (jump / gravity)
    if (pressed.current.has(" ") && onGround.current) {
      vel.current.y = JUMP_V;
      onGround.current = false;
    } else {
      vel.current.y -= GRAVITY * dt;
    }

    // full velocity vector
    const desiredVel = new THREE.Vector3(
      move.x * speed,
      vel.current.y,
      move.z * speed
    );

    // collide & slide
    const { position, velocity, onGround: grounded } = moveWithCollisions(
      camera.position,
      desiredVel,
      dt,
      hasBlock
    );

    camera.position.copy(position);
    vel.current.copy(velocity);
    onGround.current = grounded;

    // Safety clamp: never let eye sink below ground top + player height
    const groundEyeY = 1 + PLAYER_HEIGHT;
    if (camera.position.y < groundEyeY) {
      camera.position.y = groundEyeY;
      vel.current.y = 0;
      onGround.current = true;
    }
  });

  return null;
}
