// frontend/app/games/minecraft/components/CloudLayer.tsx
// Lightweight, dependency-free cloud layer for React Three Fiber.
// One huge, camera-centered plane at a fixed altitude renders animated FBM noise
// with transparent alpha. No textures, no postprocessing.

import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

export type CloudLayerProps = {
  /** Y altitude of clouds in world units (should be above your tallest mountains). */
  height?: number;
  /** Size of the camera-centered plane; keep comfortably larger than far-draw distance. */
  size?: number;
  /** World units per noise tile. Larger = bigger, puffier clouds. */
  tile?: number;
  /** Base opacity multiplier of the clouds (0..1). */
  opacity?: number;
  /** Movement speed in world UV space. */
  speed?: number;
  /** Edge softness of clouds (0..1). Higher = softer edges. */
  softness?: number;
  /** Density threshold (0..1). Higher = fewer clouds. */
  threshold?: number;
};

export default function CloudLayer({
  height = 60,
  size = 2000,
  tile = 260,
  opacity = 0.85,
  speed = 0.012,
  softness = 0.28,
  threshold = 0.48,
}: CloudLayerProps) {
  const mesh = useRef<THREE.Mesh>(null);
  const material = useRef<THREE.ShaderMaterial>(null);
  const { camera } = useThree();

  const shader = useMemo(() => {
    const uniforms = {
      uTime: { value: 0.0 },
      uTileScale: { value: tile },
      uOpacity: { value: opacity },
      uSoft: { value: softness },
      uThresh: { value: threshold },
      uWind: { value: new THREE.Vector2(0.7, 0.25) },
    };

    const vertexShader = /* glsl */`
      uniform float uTileScale;
      varying vec2 vUvWorld;
      void main() {
        // World-space UVs so clouds don't "swim" when we move the mesh
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vUvWorld = wp.xz / uTileScale;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = /* glsl */`
      precision highp float;
      uniform float uTime;
      uniform float uOpacity;
      uniform float uSoft;
      uniform float uThresh;
      uniform vec2 uWind;
      varying vec2 vUvWorld;

      // ---- 2D hash + value noise + fbm (tile-free, cheap) ----
      float hash(vec2 p) {
        // Large constants for decorrelated hashing
        const vec2 k = vec2(127.1, 311.7);
        return fract(sin(dot(p, k)) * 43758.5453123);
      }
      float valueNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }
      float fbm(vec2 p) {
        float s = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          s += a * valueNoise(p);
          p *= 2.0;
          a *= 0.5;
        }
        return s;
      }

      void main() {
        // Two moving octaves with slight directional difference for parallax-like feel
        vec2 p = vUvWorld;
        float t = uTime * 0.1;
        float d1 = fbm(p * 1.2 + uWind * t);
        float d2 = fbm(p * 0.55 - uWind.yx * (t * 0.7));
        float density = (d1 * 0.65 + d2 * 0.45);

        // Threshold with softness (remap via smoothstep)
        float a = smoothstep(uThresh - uSoft, uThresh + uSoft, density) * uOpacity;

        if (a < 0.02) discard; // keep overdraw low

        // Slightly blue-ish white
        vec3 col = mix(vec3(1.0), vec3(0.94, 0.97, 1.0), 0.20);
        gl_FragColor = vec4(col, a);
      }
    `;

    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });

    return mat;
  }, [tile, opacity, softness, threshold]);

  useFrame((_state, dt) => {
    // Keep the cloud deck centered under the camera to avoid finite edges
    if (mesh.current) {
      mesh.current.position.set(camera.position.x, height, camera.position.z);
      mesh.current.rotation.set(-Math.PI / 2, 0, 0); // lay flat
    }
    if (material.current) {
      material.current.uniforms.uTime.value += dt;
    }
  });

  return (
    <mesh ref={mesh} frustumCulled={false}>
      <planeGeometry args={[size, size, 1, 1]} />
      {/* @ts-ignore — three types are okay with ShaderMaterial */}
      <primitive ref={material as any} object={shader} attach="material" />
    </mesh>
  );
}

// --- Tips ---
// • Drop <CloudLayer /> anywhere inside your <Canvas> scene.
// • Adjust `height` so clouds sit well above mountains (your world top is ~30–35 by default).
// • For more overcast: raise `opacity` or lower `threshold`.
// • For scattered cumulus: raise `threshold` or lower `opacity`.
// • You can stack two layers (different heights/speeds) for depth.
