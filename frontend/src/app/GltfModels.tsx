'use client';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useGLTF, useAnimations } from '@react-three/drei';
import * as THREE from 'three';

type RealProps = {
  url: string;
  scale?: number;
  rotationY?: number;
  moving?: boolean;
  idle?: string;   // animation names in your GLB
  walk?: string;
};

const availabilityCache = new Map<string, boolean>();

async function checkURL(url: string): Promise<boolean> {
  if (availabilityCache.has(url)) return availabilityCache.get(url)!;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const ok = res.ok;
    availabilityCache.set(url, ok);
    return ok;
  } catch {
    availabilityCache.set(url, false);
    return false;
  }
}

function RealGLTFCharacter({ url, scale = 1, rotationY = 0, moving = false, idle = 'Idle', walk = 'Walk' }: RealProps) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(url);
  const { actions } = useAnimations(animations, group);

  // clone so each instance has its own skeleton
  const cloned = useMemo(() => scene.clone(true), [scene]);

  useEffect(() => {
    if (!actions) return;
    const idleAction = actions[idle];
    const walkAction = actions[walk] || actions['Run'] || actions['WalkCycle'];

    if (moving && walkAction) {
      idleAction?.fadeOut(0.2);
      walkAction.reset().fadeIn(0.2).play();
    } else if (idleAction) {
      walkAction?.fadeOut(0.2);
      idleAction.reset().fadeIn(0.2).play();
    }

    return () => { Object.values(actions).forEach(a => a?.stop()); };
  }, [moving, actions, idle, walk]);

  return (
    <Suspense fallback={null}>
      <group ref={group} rotation-y={rotationY} scale={scale}>
        <primitive object={cloned} />
      </group>
    </Suspense>
  );
}

/** Renders GLTF if the file exists, otherwise renders the provided voxel fallback. */
export function GLTFSwitch(
  { url, voxel, ...rest }: { url: string; voxel: React.ReactNode } & Omit<RealProps, 'url'>
) {
  const [ok, setOk] = useState<boolean>(availabilityCache.get(url) ?? false);
  const [checked, setChecked] = useState<boolean>(availabilityCache.has(url));

  useEffect(() => {
    let mounted = true;
    if (!checked) {
      checkURL(url).then(res => { if (mounted) { setOk(res); setChecked(true); } });
    }
    return () => { mounted = false; };
  }, [url, checked]);

  if (ok) return <RealGLTFCharacter url={url} {...rest} />;
  return <>{voxel}</>;
}

// Note: we intentionally do NOT call useGLTF.preload() here to avoid throwing on 404.
