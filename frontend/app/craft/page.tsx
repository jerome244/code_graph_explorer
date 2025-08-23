// app/craft/page.tsx
"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import * as THREE from "three";

/**
 * Craft (Minecraft-like) — Infinite terrain + Multiplayer
 * - FBM terrain per chunk (grass/dirt/stone), water at sea level
 * - Walk/jump/gravity + AABB collisions; ZQSD/WASD, Space to jump, E to craft, N noclip
 * - Dig/place blocks; simple crafting (logs → planks, planks → sticks/table, rocks → stone)
 * - Multiplayer (WebSocket, same server namespace as Graph):
 *   • Join room via ?room=<name> (header UI lets you change / copy link)
 *   • Avatars shown as cylinder+head + floating name tag
 *   • Immediate/keepalive PLAYER_STATE so others see you even when idle
 *   • Sync place/remove (dynamic & terrain), late-join snapshot
 */

/* -------------------- RNG + Perlin -------------------- */
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
class Perlin2D {
  p: Uint8Array;
  constructor(seed = 1337) {
    const rand = mulberry32(seed);
    const perm = new Uint8Array(256);
    for (let i = 0; i < 256; i++) perm[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = (rand() * (i + 1)) | 0;
      const t = perm[i];
      perm[i] = perm[j];
      perm[j] = t;
    }
    this.p = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
  }
  private fade(t: number) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  private lerp(a: number, b: number, t: number) {
    return a + t * (b - a);
  }
  private grad(h: number, x: number, y: number) {
    switch (h & 7) {
      case 0: return x + y;
      case 1: return x - y;
      case 2: return -x + y;
      case 3: return -x - y;
      case 4: return x;
      case 5: return -x;
      case 6: return y;
      default: return -y;
    }
  }
  noise(x: number, y: number) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = this.fade(xf);
    const v = this.fade(yf);
    const p = this.p;

    const aa = p[p[X] + Y];
    const ab = p[p[X] + Y + 1];
    const ba = p[p[X + 1] + Y];
    const bb = p[p[X + 1] + Y + 1];

    const x1 = this.lerp(this.grad(aa, xf, yf), this.grad(ba, xf - 1, yf), u);
    const x2 = this.lerp(this.grad(ab, xf, yf - 1), this.grad(bb, xf - 1, yf - 1), u);
    return this.lerp(x1, x2, v);
  }
}
function fbm2(perlin: Perlin2D, x: number, y: number, octaves = 4, lac = 2, gain = 0.5) {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * perlin.noise(x * freq, y * freq);
    norm += amp;
    amp *= gain;
    freq *= lac;
  }
  return sum / norm;
}

/* -------------------- Multiplayer types -------------------- */
type BlockType = "grass" | "dirt" | "stone" | "log" | "leaves" | "plank" | "table";
type Inventory = { log: number; plank: number; stick: number; rock: number; table: number; stone: number };

type Chunk = {
  cx: number;
  cz: number;
  terrain: Map<string, BlockType>;
  dynKeys: string[];
  terrainMeshes: Map<BlockType, THREE.InstancedMesh>;
  waterMesh: THREE.InstancedMesh | null;
  waterKeys: string[];
};

type RTMessage =
  | { type: "USER_JOIN"; payload: { name?: string }; clientId?: string; ts?: number }
  | { type: "USER_LEAVE"; payload: {}; clientId?: string; ts?: number }
  | { type: "PLAYER_STATE"; payload: { p: [number, number, number]; yaw: number; name?: string }; clientId?: string; ts?: number }
  | { type: "PLACE_BLOCK"; payload: { x: number; y: number; z: number; b: BlockType }; clientId?: string; ts?: number }
  | { type: "REMOVE_BLOCK_DYN"; payload: { x: number; y: number; z: number }; clientId?: string; ts?: number }
  | { type: "REMOVE_BLOCK_TERRAIN"; payload: { x: number; y: number; z: number }; clientId?: string; ts?: number }
  | { type: "REQUEST_SNAPSHOT"; payload: { requesterId: string }; clientId?: string; ts?: number }
  | { type: "SNAPSHOT"; payload: { dyn: Array<[number, number, number, BlockType]>; removed: Array<[number, number, number]>; targetClientId?: string }; clientId?: string; ts?: number }
  | { type: "PING"; clientId?: string; ts?: number }
  | { type: "PONG"; clientId?: string; ts?: number };

/* -------------------- Utils & constants -------------------- */
const key = (x: number, y: number, z: number) => `${x}|${y}|${z}`;
const ck = (cx: number, cz: number) => `${cx}|${cz}`;

const SKY = 0x87ceeb;

const CHUNK_SIZE = 16;
const MAX_HEIGHT = 48;
const RENDER_DISTANCE = 3; // chunks radius
const SEA_LEVEL = 12;

const WORLD_SEED = 424242;
const HEIGHT_BASE = 14;
const HEIGHT_AMP = 12;
const HEIGHT_SCALE = 1 / 48;
const TREE_CHANCE = 0.018;
const ROCK_CHANCE = 0.028;

const MOVE_SPEED = 5.2;
const JUMP_SPEED = 7.9;
const GRAVITY = -22.0;
const MOUSE_SENS = 0.0022;

const EYE_HEIGHT = 1.62;
const HALF_W = 0.35;
const EPS = 1e-3;

const COLORS: Record<BlockType, number> = {
  grass: 0x58a84b,
  dirt: 0x8b6b4a,
  stone: 0x777777,
  log: 0x8b5a2b,
  leaves: 0x3faa45,
  plank: 0xcaa472,
  table: 0x8d6e63,
};
const TERRAIN_TYPES: BlockType[] = ["grass", "dirt", "stone"];
const DYN_TYPES: BlockType[] = ["log", "leaves", "plank", "table", "stone"];

function uuid() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
function colorForClient(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return new THREE.Color(`hsl(${h}, 85%, 55%)`).convertSRGBToLinear();
}
const WS_BASE =
  process.env.NEXT_PUBLIC_WS_BASE?.replace(/\/$/, "") ||
  (typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`
    : "");

/* -------------------- Component -------------------- */
export default function CraftPage() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const search = useSearchParams();
  const router = useRouter();

  const initialRoom = (search?.get("room") || "craft-lobby").slice(0, 64);
  const [room, setRoom] = useState(initialRoom);
  const [pendingRoom, setPendingRoom] = useState(initialRoom);

  // UI
  const [pointerLocked, setPointerLocked] = useState(false);
  const [showCraft, setShowCraft] = useState(false);
  const [nearTable, setNearTable] = useState(false);
  const [hotbar, setHotbar] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [wsStatus, setWsStatus] = useState<"Disconnected" | "Connecting" | "Live">("Disconnected");
  const [shareLink, setShareLink] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("room", room);
      setShareLink(url.toString());
    } catch {}
  }, [room]);

  // input & player
  const keysRef = useRef<Record<string, boolean>>({});
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const posRef = useRef(new THREE.Vector3(8, EYE_HEIGHT + 0.1, 8));
  const vyRef = useRef(0);
  const groundedRef = useRef(false);
  const noclipRef = useRef(false);

  // three
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rayRef = useRef(new THREE.Raycaster());

  // selection outline
  const outlineRef = useRef<THREE.LineSegments | null>(null);

  // noise
  const perlinRef = useRef(new Perlin2D(WORLD_SEED));

  // world state
  const worldSolidsRef = useRef(new Set<string>());
  const terrainGlobalRef = useRef(new Map<string, BlockType>());
  const dynMapRef = useRef(new Map<string, BlockType>());
  const removedTerrainRef = useRef(new Set<string>());

  const chunksRef = useRef(new Map<string, Chunk>());
  const pickMeshesRef = useRef<THREE.Object3D[]>([]);

  // dynamic meshes per type
  const dynamicMeshesRef = useRef<Map<BlockType, THREE.InstancedMesh>>(new Map());

  // multiplayer refs
  const clientIdRef = useRef(uuid());
  const myNameRef = useRef(`Guest-${clientIdRef.current.slice(0, 4)}`);
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<number | null>(null);
  const lastPongRef = useRef<number>(0);
  const lastStateSentRef = useRef<number>(0);
  const lastStateCacheRef = useRef<{ p: [number, number, number]; yaw: number } | null>(null);
  const forceStateTimerRef = useRef<number | null>(null);

  // remote players
  type Remote = { group: THREE.Group; sprite: THREE.Sprite };
  const remotePlayersRef = useRef<Map<string, Remote>>(new Map());
  const remoteMaterialCacheRef = useRef<Map<string, THREE.MeshStandardMaterial>>(new Map());

  // player names list (UI)
  const playerNamesRef = useRef<Map<string, string>>(new Map());
  const [playerList, setPlayerList] = useState<Array<{ id: string; name: string }>>([]);

  // materials (shared)
  const waterMatRef = useRef<THREE.MeshPhongMaterial | null>(null);

  // anim
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);
  const lastChunkKeyRef = useRef<string>("");

  // inventory
  const [inv, setInv] = useState<Inventory>({ log: 0, plank: 0, stick: 0, rock: 0, table: 0, stone: 0 });
  const addItem = (name: keyof Inventory, n = 1) => setInv((s) => ({ ...s, [name]: s[name] + n }));
  const takeItem = (name: keyof Inventory, n = 1) => setInv((s) => ({ ...s, [name]: Math.max(0, s[name] - n) }));
  const isSolid = (x: number, y: number, z: number) => worldSolidsRef.current.has(key(x, y, z));

  const refreshPlayerList = useCallback(() => {
    const arr: Array<{ id: string; name: string }> = [];
    arr.push({ id: clientIdRef.current, name: `${myNameRef.current} (you)` });
    for (const [id, name] of playerNamesRef.current) {
      if (id === clientIdRef.current) continue;
      arr.push({ id, name });
    }
    setPlayerList(arr);
  }, []);

  /* -------------------- Terrain generation -------------------- */
  function heightAt(wx: number, wz: number) {
    const n = fbm2(perlinRef.current, wx * HEIGHT_SCALE, wz * HEIGHT_SCALE, 4, 2, 0.5);
    const h = Math.floor(HEIGHT_BASE + n * HEIGHT_AMP);
    return Math.max(1, Math.min(MAX_HEIGHT - 1, h));
  }
  function rand01ForColumn(wx: number, wz: number) {
    let h = wx * 374761393 + wz * 668265263 + WORLD_SEED * 1442695041;
    h = (h ^ (h >> 13)) >>> 0;
    return (h % 100000) / 100000;
  }
  function getChunkCoord(x: number, z: number) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    return [cx, cz] as const;
  }

  /* ---------- materials cache ---------- */
  const terrainMatCache = useRef<Map<BlockType, THREE.Material>>(new Map());
  const dynMatCache = useRef<Map<BlockType, THREE.Material>>(new Map());
  const lin = (hex: number) => new THREE.Color(hex).convertSRGBToLinear();
  function getTerrainMat(type: BlockType) {
    let m = terrainMatCache.current.get(type);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color: lin(COLORS[type]) });
      terrainMatCache.current.set(type, m);
    }
    return m;
  }
  function getDynMat(type: BlockType) {
    let m = dynMatCache.current.get(type);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color: lin(COLORS[type]) });
      dynMatCache.current.set(type, m);
    }
    return m;
  }

  /* ---------- build / remove chunk meshes ---------- */
  function buildChunkMeshes(chunk: Chunk) {
    const scene = sceneRef.current!;
    const box = new THREE.BoxGeometry(1, 1, 1);

    // group terrain by type
    const grouped: Record<BlockType, number[][]> = {
      grass: [], dirt: [], stone: [],
      log: [], leaves: [], plank: [], table: [],
    };
    for (const [kk, type] of chunk.terrain) {
      if (!TERRAIN_TYPES.includes(type)) continue;
      const [x, y, z] = kk.split("|").map(Number);
      grouped[type].push([x, y, z]);
    }

    chunk.terrainMeshes = new Map<BlockType, THREE.InstancedMesh>();
    for (const t of TERRAIN_TYPES) {
      const arr = grouped[t];
      if (!arr.length) continue;
      const mesh = new THREE.InstancedMesh(box, getTerrainMat(t), arr.length);
      const dummy = new THREE.Object3D();
      let i = 0;
      for (const [x, y, z] of arr) {
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i++, dummy.matrix);
      }
      mesh.count = arr.length;
      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);
      chunk.terrainMeshes.set(t, mesh);
      pickMeshesRef.current.push(mesh);
    }

    // water
    const waterGeo = new THREE.BoxGeometry(1, 1, 1);
    const waterMat =
      waterMatRef.current ||
      (waterMatRef.current = new THREE.MeshPhongMaterial({
        color: lin(0x3388ff),
        transparent: true,
        opacity: 0.6,
        shininess: 60,
        specular: lin(0x88aaff),
        depthWrite: false,
      }));
    const waterMesh = new THREE.InstancedMesh(waterGeo, waterMat, Math.max(1, chunk.waterKeys.length));
    const dummy = new THREE.Object3D();
    let w = 0;
    for (const kk of chunk.waterKeys) {
      const [x, y, z] = kk.split("|").map(Number);
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      waterMesh.setMatrixAt(w++, dummy.matrix);
    }
    waterMesh.count = w;
    waterMesh.instanceMatrix.needsUpdate = true;
    (waterMesh as any).userData = { isWater: true };
    chunk.waterMesh = waterMesh;
    scene.add(waterMesh);
    pickMeshesRef.current.push(waterMesh);
  }

  function removeChunkMeshes(chunk: Chunk) {
    const scene = sceneRef.current!;
    for (const mesh of chunk.terrainMeshes.values()) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      pickMeshesRef.current = pickMeshesRef.current.filter((m) => m !== mesh);
    }
    chunk.terrainMeshes.clear();
    if (chunk.waterMesh) {
      scene.remove(chunk.waterMesh);
      chunk.waterMesh.geometry.dispose();
      pickMeshesRef.current = pickMeshesRef.current.filter((m) => m !== chunk.waterMesh);
      chunk.waterMesh = null;
    }
  }

  /* ---------- world gen per chunk ---------- */
  function generateChunk(cx: number, cz: number) {
    const ckey = ck(cx, cz);
    if (chunksRef.current.has(ckey)) return chunksRef.current.get(ckey)!;

    const terrain = new Map<string, BlockType>();
    const dynKeys: string[] = [];
    const waterKeys: string[] = [];

    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wx = cx * CHUNK_SIZE + lx;
        const wz = cz * CHUNK_SIZE + lz;

        const h = heightAt(wx, wz);
        for (let y = 0; y <= h; y++) {
          const t: BlockType = y === h ? "grass" : y >= h - 2 ? "dirt" : "stone";
          const kStr = key(wx, y, wz);
          terrain.set(kStr, t);
          terrainGlobalRef.current.set(kStr, t);
          worldSolidsRef.current.add(kStr);
        }

        if (h < SEA_LEVEL) {
          for (let y = h + 1; y <= SEA_LEVEL; y++) waterKeys.push(key(wx, y, wz));
        }

        const r = rand01ForColumn(wx, wz);
        if (h > SEA_LEVEL) {
          if (r < TREE_CHANCE) {
            for (let y = h + 1; y <= h + 4; y++) {
              const K = key(wx, y, wz);
              dynMapRef.current.set(K, "log");
              worldSolidsRef.current.add(K);
              dynKeys.push(K);
            }
            for (let dx = -2; dx <= 2; dx++) {
              for (let dz = -2; dz <= 2; dz++) {
                if (Math.abs(dx) + Math.abs(dz) <= 3) {
                  const K = key(wx + dx, h + 5, wz + dz);
                  dynMapRef.current.set(K, "leaves");
                  worldSolidsRef.current.add(K);
                  dynKeys.push(K);
                }
              }
            }
          } else if (r < TREE_CHANCE + ROCK_CHANCE) {
            const K = key(wx, h + 1, wz);
            dynMapRef.current.set(K, "stone");
            worldSolidsRef.current.add(K);
            dynKeys.push(K);
          }
        }
      }
    }

    const chunk: Chunk = { cx, cz, terrain, dynKeys, terrainMeshes: new Map(), waterMesh: null, waterKeys };
    chunksRef.current.set(ckey, chunk);
    return chunk;
  }

  function unloadChunk(cx: number, cz: number) {
    const ckey = ck(cx, cz);
    const chunk = chunksRef.current.get(ckey);
    if (!chunk) return;
    for (const kStr of chunk.terrain.keys()) {
      worldSolidsRef.current.delete(kStr);
      terrainGlobalRef.current.delete(kStr);
    }
    for (const K of chunk.dynKeys) {
      dynMapRef.current.delete(K);
      worldSolidsRef.current.delete(K);
    }
    chunk.dynKeys.length = 0;
    removeChunkMeshes(chunk);
    chunksRef.current.delete(ckey);
    rebuildDynamicMesh();
  }

  function ensureChunksAround(cx: number, cz: number) {
    const need = new Set<string>();
    for (let dz = -RENDER_DISTANCE; dz <= RENDER_DISTANCE; dz++) {
      for (let dx = -RENDER_DISTANCE; dx <= RENDER_DISTANCE; dx++) {
        const nk = ck(cx + dx, cz + dz);
        need.add(nk);
        if (!chunksRef.current.has(nk)) {
          const ch = generateChunk(cx + dx, cz + dz);
          buildChunkMeshes(ch);
        }
      }
    }
    for (const kStr of Array.from(chunksRef.current.keys())) {
      if (!need.has(kStr)) {
        const [xS, zS] = kStr.split("|");
        unloadChunk(parseInt(xS, 10), parseInt(zS, 10));
      }
    }
  }

  /* -------------------- Dynamic mesh (trees/rocks/placed) -------------------- */
  function rebuildDynamicMesh() {
    const scene = sceneRef.current!;
    for (const m of dynamicMeshesRef.current.values()) {
      scene.remove(m);
      m.geometry.dispose();
      pickMeshesRef.current = pickMeshesRef.current.filter((x) => x !== m);
    }
    dynamicMeshesRef.current.clear();

    // group by type
    const grouped: Record<BlockType, number[][]> = {
      grass: [], dirt: [], stone: [], log: [], leaves: [], plank: [], table: [],
    };
    for (const [kk, type] of dynMapRef.current) {
      const [x, y, z] = kk.split("|").map(Number);
      grouped[type].push([x, y, z]);
    }

    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const dummy = new THREE.Object3D();

    for (const t of DYN_TYPES) {
      const arr = grouped[t];
      if (!arr.length) continue;
      const mesh = new THREE.InstancedMesh(boxGeo, getDynMat(t), arr.length);
      let i = 0;
      for (const [x, y, z] of arr) {
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(i++, dummy.matrix);
      }
      mesh.count = arr.length;
      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);
      dynamicMeshesRef.current.set(t, mesh);
      pickMeshesRef.current.push(mesh);
    }
  }

  /* -------------------- Scene setup -------------------- */
  const setup = useCallback(() => {
    const mount = mountRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    // color management
    if ("outputColorSpace" in renderer) (renderer as any).outputColorSpace = (THREE as any).SRGBColorSpace;
    else (renderer as any).outputEncoding = (THREE as any).sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;

    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, mount.clientWidth / mount.clientHeight, 0.1, 1000);
    camera.position.copy(posRef.current);
    cameraRef.current = camera;

    // lights (bright, daylight)
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x506070, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(0.7, 1.1, 0.6);
    scene.add(sun);

    // crosshair
    const cross = document.createElement("div");
    cross.style.position = "absolute";
    cross.style.left = "50%";
    cross.style.top = "50%";
    cross.style.width = "16px";
    cross.style.height = "16px";
    cross.style.marginLeft = "-8px";
    cross.style.marginTop = "-8px";
    cross.style.pointerEvents = "none";
    cross.style.zIndex = "10";
    cross.innerHTML = `<svg viewBox="0 0 20 20" width="16" height="16">
      <path d="M10 2v4M10 14v4M2 10h4M14 10h4" stroke="#111827" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
    mount.appendChild(cross);

    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    const cnv = renderer.domElement;
    const onClick = () => cnv.requestPointerLock();
    cnv.addEventListener("click", onClick);

    const onPointerLockChange = () => setPointerLocked(document.pointerLockElement === cnv);
    document.addEventListener("pointerlockchange", onPointerLockChange);

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== cnv) return;
      yawRef.current -= e.movementX * MOUSE_SENS;
      pitchRef.current -= e.movementY * MOUSE_SENS;
      const maxPitch = Math.PI / 2 - 0.01;
      pitchRef.current = Math.max(-maxPitch, Math.min(maxPitch, pitchRef.current));
    };
    window.addEventListener("mousemove", onMouseMove);

    const onKey = (e: KeyboardEvent) => {
      const down = e.type === "keydown";
      keysRef.current[e.code] = down;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
      if (down && e.key >= "1" && e.key <= "5") setHotbar((+e.key - 1) as any);
      if (down && e.key.toLowerCase() === "n") {
        noclipRef.current = !noclipRef.current;
        vyRef.current = 0; groundedRef.current = false;
      }
      if (down && e.key.toLowerCase() === "e") setShowCraft((s) => !s);
      if (down && e.code === "Space" && groundedRef.current && !noclipRef.current) {
        vyRef.current = JUMP_SPEED; groundedRef.current = false;
      }
    };
    window.addEventListener("keydown", onKey as any, { passive: false } as any);
    window.addEventListener("keyup", onKey as any, { passive: false } as any);

    const onMouseDown = (e: MouseEvent) => {
      if (!cameraRef.current) return;
      if (e.button === 0) removeTargeted();
      else if (e.button === 2) placeTargeted();
    };
    cnv.addEventListener("mousedown", onMouseDown);
    cnv.addEventListener("contextmenu", (ev) => ev.preventDefault());

    // initial chunks & position
    {
      const h = heightAt(8, 8);
      posRef.current.set(8 + 0.5, h + EYE_HEIGHT + 0.01, 8 + 0.5);
      camera.position.copy(posRef.current);
      const [cx, cz] = getChunkCoord(posRef.current.x, posRef.current.z);
      ensureChunksAround(cx, cz);
      rebuildDynamicMesh();
      lastChunkKeyRef.current = ck(cx, cz);
    }

    lastTsRef.current = performance.now();
    const loop = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastTsRef.current) / 1000);
      lastTsRef.current = now;

      stepPlayer(dt);

      const [ccx, ccz] = getChunkCoord(posRef.current.x, posRef.current.z);
      const curKey = ck(ccx, ccz);
      if (curKey !== lastChunkKeyRef.current) {
        lastChunkKeyRef.current = curKey;
        ensureChunksAround(ccx, ccz);
      }

      updateOutline();
      camera.position.copy(posRef.current);
      camera.rotation.set(pitchRef.current, yawRef.current, 0, "YXZ");
      setNearTable(checkNearTable());

      // broadcast player state (throttled)
      maybeSendPlayerState(now);

      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("keydown", onKey as any);
      window.removeEventListener("keyup", onKey as any);
      cnv.removeEventListener("mousedown", onMouseDown);
      cnv.removeEventListener("click", onClick);

      for (const ch of chunksRef.current.values()) removeChunkMeshes(ch);
      chunksRef.current.clear();

      for (const m of dynamicMeshesRef.current.values()) {
        scene.remove(m); m.geometry.dispose();
      }
      dynamicMeshesRef.current.clear();

      if (outlineRef.current) {
        scene.remove(outlineRef.current);
        outlineRef.current.geometry.dispose();
        (outlineRef.current.material as THREE.Material).dispose();
        outlineRef.current = null;
      }

      for (const obj of remotePlayersRef.current.values()) scene.remove(obj.group);
      remotePlayersRef.current.clear();
      remoteMaterialCacheRef.current.clear();

      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      const last = mount.lastElementChild;
      if (last && last.tagName.toLowerCase() === "div") mount.removeChild(last);
    };
  }, []);

  /* -------------------- Player movement + collisions -------------------- */
  const stepPlayer = (dt: number) => {
    const pos = posRef.current;
    const yaw = yawRef.current;

    let dirX = 0, dirZ = 0;
    const forward = (keysRef.current["KeyW"] || keysRef.current["ArrowUp"]) ? 1 :
                    (keysRef.current["KeyS"] || keysRef.current["ArrowDown"]) ? -1 : 0;
    const strafe  = (keysRef.current["KeyD"] || keysRef.current["ArrowRight"]) ? 1 :
                    (keysRef.current["KeyA"] || keysRef.current["ArrowLeft"] || keysRef.current["KeyQ"]) ? -1 : 0;

    if (forward !== 0) { dirX += -Math.sin(yaw) * forward; dirZ += -Math.cos(yaw) * forward; }
    if (strafe  !== 0) { dirX +=  Math.cos(yaw) * strafe;  dirZ += -Math.sin(yaw) * strafe; }

    const len = Math.hypot(dirX, dirZ);
    if (len > 0) { dirX /= len; dirZ /= len; }

    if (noclipRef.current) {
      const climb = (keysRef.current["Space"] ? 1 : 0) + (keysRef.current["ShiftLeft"] || keysRef.current["ShiftRight"] ? -1 : 0);
      pos.x += dirX * MOVE_SPEED * dt; pos.z += dirZ * MOVE_SPEED * dt; pos.y += climb * MOVE_SPEED * dt;
      groundedRef.current = false; vyRef.current = 0;
      return;
    }

    vyRef.current += GRAVITY * dt;
    if (keysRef.current["Space"] && groundedRef.current) { vyRef.current = JUMP_SPEED; groundedRef.current = false; }

    const dx = dirX * MOVE_SPEED * dt;
    const dz = dirZ * MOVE_SPEED * dt;
    const dy = vyRef.current * dt;

    const y0 = pos.y;
    const y1 = resolveAxis(pos.x, pos.y, pos.z, 0, dy, 0, "y");
    if (y1 !== y0 + dy) { vyRef.current = 0; groundedRef.current = dy < 0; }
    pos.y = y1;

    pos.x = resolveAxis(pos.x, pos.y, pos.z, dx, 0, 0, "x");
    pos.z = resolveAxis(pos.x, pos.y, pos.z, 0, 0, dz, "z");

    if (pos.y < EYE_HEIGHT + EPS) { pos.y = EYE_HEIGHT + EPS; groundedRef.current = true; vyRef.current = 0; }
  };

  function resolveAxis(px: number, py: number, pz: number, dx: number, dy: number, dz: number, axis: "x" | "y" | "z") {
    let target = axis === "x" ? px + dx : axis === "y" ? py + dy : pz + dz;

    const minX = (axis === "x" ? target : px) - HALF_W;
    const maxX = (axis === "x" ? target : px) + HALF_W;
    const minY = (axis === "y" ? target : py) - EYE_HEIGHT;
    const maxY = (axis === "y" ? target : py) + 0.05;
    const minZ = (axis === "z" ? target : pz) - HALF_W;
    const maxZ = (axis === "z" ? target : pz) + HALF_W;

    const x0 = Math.floor(minX), x1 = Math.floor(maxX);
    const y0 = Math.floor(minY), y1 = Math.floor(maxY);
    const z0 = Math.floor(minZ), z1 = Math.floor(maxZ);

    const sign = axis === "x" ? Math.sign(dx) : axis === "y" ? Math.sign(dy) : Math.sign(dz);

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        for (let z = z0; z <= z1; z++) {
          if (!isSolid(x, y, z)) continue;
          if (axis === "x")       { if (sign > 0) target = Math.min(target, x - HALF_W - EPS); else if (sign < 0) target = Math.max(target, x + 1 + HALF_W + EPS); }
          else if (axis === "y")  { if (sign > 0) target = Math.min(target, y - EPS);         else if (sign < 0) target = Math.max(target, y + 1 + EYE_HEIGHT + EPS); }
          else                    { if (sign > 0) target = Math.min(target, z - HALF_W - EPS); else if (sign < 0) target = Math.max(target, z + 1 + HALF_W + EPS); }
        }
      }
    }
    return target;
  }

  /* -------------------- Selection + block ops -------------------- */
  const updateOutline = () => {
    const camera = cameraRef.current!;
    let outline = outlineRef.current;
    if (!outline) {
      const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.01, 1.01, 1.01));
      outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.85 }));
      outline.visible = false;
      outlineRef.current = outline;
      sceneRef.current!.add(outline);
    }

    const ray = rayRef.current;
    ray.setFromCamera({ x: 0, y: 0 }, camera);

    const hits = ray.intersectObjects(pickMeshesRef.current, false);
    if (!hits.length) { outline.visible = false; return; }

    // prefer solid over water if both hit
    let hit = hits[0];
    for (const h of hits) {
      if (!(h.object as any).userData?.isWater) { hit = h; break; }
    }
    const n = hit.face?.normal?.clone() || new THREE.Vector3(0, 1, 0);
    const removeCenter = (hit.point as THREE.Vector3).clone().addScaledVector(n, -0.5);
    const cx = Math.round(removeCenter.x);
    const cy = Math.round(removeCenter.y);
    const cz = Math.round(removeCenter.z);

    outline.position.set(cx, cy, cz);
    outline.visible = true;
  };

  const blockWouldClipPlayer = (x: number, y: number, z: number) => {
    const minX = posRef.current.x - HALF_W, maxX = posRef.current.x + HALF_W;
    const minY = posRef.current.y - EYE_HEIGHT, maxY = posRef.current.y + 0.05;
    const minZ = posRef.current.z - HALF_W, maxZ = posRef.current.z + HALF_W;
    return !(x + 1 <= minX || x >= maxX || y + 1 <= minY || y >= maxY || z + 1 <= minZ || z >= maxZ);
  };

  function rebuildChunkAt(x: number, z: number) {
    const [cx, cz] = getChunkCoord(x, z);
    const chunk = chunksRef.current.get(ck(cx, cz));
    if (!chunk) return;
    removeChunkMeshes(chunk);
    buildChunkMeshes(chunk);
  }

  const placeDyn = (x: number, y: number, z: number, type: BlockType, consume = false, quiet = false) => {
    const K = key(x, y, z);
    if (worldSolidsRef.current.has(K)) return false;
    dynMapRef.current.set(K, type);
    worldSolidsRef.current.add(K);
    if (consume) {
      if (type === "plank" && inv.plank > 0) takeItem("plank", 1);
      else if (type === "stone" && inv.stone > 0) takeItem("stone", 1);
      else if (type === "log" && inv.log > 0) takeItem("log", 1);
      else if (type === "table" && inv.table > 0) takeItem("table", 1);
    }
    rebuildDynamicMesh();
    if (!quiet) sendRT({ type: "PLACE_BLOCK", payload: { x, y, z, b: type }, clientId: clientIdRef.current, ts: Date.now() });
    return true;
  };

  const removeDyn = (x: number, y: number, z: number, quiet = false) => {
    const K = key(x, y, z);
    const type = dynMapRef.current.get(K);
    if (!type) return false;
    dynMapRef.current.delete(K);
    worldSolidsRef.current.delete(K);
    rebuildDynamicMesh();
    if (!quiet) sendRT({ type: "REMOVE_BLOCK_DYN", payload: { x, y, z }, clientId: clientIdRef.current, ts: Date.now() });
    if (type === "log") addItem("log", 1);
    if (type === "stone") addItem("rock", 1);
    if (type === "plank") addItem("plank", 1);
    if (type === "table") addItem("table", 1);
    return true;
  };

  const placeTargeted = () => {
    const camera = cameraRef.current!;
    const ray = rayRef.current;
    ray.setFromCamera({ x: 0, y: 0 }, camera);
    const hits = ray.intersectObjects(pickMeshesRef.current, false);
    if (!hits.length) return;
    const hit = hits[0];
    const n = hit.face?.normal?.clone() || new THREE.Vector3(0, 1, 0);
    const addCenter = (hit.point as THREE.Vector3).clone().addScaledVector(n, 0.5);
    const x = Math.round(addCenter.x);
    const y = Math.round(addCenter.y);
    const z = Math.round(addCenter.z);

    const type: BlockType = ["plank", "stone", "log", "leaves", "table"][hotbar];
    if (type === "plank" && inv.plank <= 0) return;
    if (type === "stone" && inv.stone <= 0) return;
    if (type === "log"   && inv.log   <= 0) return;
    if (type === "table" && inv.table <= 0) return;
    if (blockWouldClipPlayer(x, y, z)) return;

    placeDyn(x, y, z, type, true);
  };

  const removeTargeted = () => {
    const camera = cameraRef.current!;
    const ray = rayRef.current;
    ray.setFromCamera({ x: 0, y: 0 }, camera);
    const hits = ray.intersectObjects(pickMeshesRef.current, false);
    if (!hits.length) return;

    let hit = hits[0];
    for (const h of hits) { if (!(h.object as any).userData?.isWater) { hit = h; break; } }

    const n = hit.face?.normal?.clone() || new THREE.Vector3(0, 1, 0);
    const removeCenter = (hit.point as THREE.Vector3).clone().addScaledVector(n, -0.5);
    const x = Math.round(removeCenter.x);
    const y = Math.round(removeCenter.y);
    const z = Math.round(removeCenter.z);

    if (removeDyn(x, y, z)) return;

    // terrain removal
    const K = key(x, y, z);
    const t = terrainGlobalRef.current.get(K);
    if (t) {
      terrainGlobalRef.current.delete(K);
      worldSolidsRef.current.delete(K);
      removedTerrainRef.current.add(K);
      const [cx, cz] = getChunkCoord(x, z);
      const ch = chunksRef.current.get(ck(cx, cz));
      if (ch) ch.terrain.delete(K);
      rebuildChunkAt(x, z);
      if (t === "stone") addItem("rock", 1);
      sendRT({ type: "REMOVE_BLOCK_TERRAIN", payload: { x, y, z }, clientId: clientIdRef.current, ts: Date.now() });
    }
  };

  const checkNearTable = () => {
    const p = posRef.current;
    let near = false;
    for (const [kk, type] of dynMapRef.current) {
      if (type !== "table") continue;
      const [x, y, z] = kk.split("|").map(Number);
      if (Math.hypot(p.x - (x + 0.5), p.z - (z + 0.5)) < 2.2 && Math.abs(p.y - (y + 0.5)) < 2.0) {
        near = true; break;
      }
    }
    return near;
  };

  /* -------------------- Mount scene -------------------- */
  useEffect(() => {
    if (!mountRef.current) return;
    const cleanup = setup();
    return () => { cleanup && cleanup(); };
  }, [setup]);

  /* -------------------- Multiplayer: WebSocket -------------------- */
  const sendRT = useCallback((msg: RTMessage) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== ws.OPEN) return;
    if ((ws as any).bufferedAmount > 256 * 1024) return;
    ws.send(JSON.stringify(msg));
  }, []);

  // connect WS whenever `room` changes
  useEffect(() => {
    if (!WS_BASE) return;
    const url = `${WS_BASE}/ws/projects/${encodeURIComponent(room)}/`;
    setWsStatus("Connecting");

    // clear existing remote state
    playerNamesRef.current.clear();
    refreshPlayerList();

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsStatus("Live");

        // self presence
        playerNamesRef.current.set(clientIdRef.current, myNameRef.current);
        refreshPlayerList();

        sendRT({ type: "USER_JOIN", payload: { name: myNameRef.current }, clientId: clientIdRef.current, ts: Date.now() });
        sendRT({ type: "REQUEST_SNAPSHOT", payload: { requesterId: clientIdRef.current }, clientId: clientIdRef.current, ts: Date.now() });

        // broadcast current pose immediately
        sendRT({
          type: "PLAYER_STATE",
          payload: { p: [posRef.current.x, posRef.current.y, posRef.current.z], yaw: yawRef.current, name: myNameRef.current },
          clientId: clientIdRef.current,
          ts: Date.now(),
        });

        // keepalive pose every 1s (bypass dedupe)
        if (forceStateTimerRef.current) clearInterval(forceStateTimerRef.current);
        forceStateTimerRef.current = window.setInterval(() => {
          if (!wsRef.current || wsRef.current.readyState !== 1) return;
          lastStateCacheRef.current = null;
          lastStateSentRef.current = 0;
          maybeSendPlayerState(performance.now());
        }, 1000) as unknown as number;

        // heartbeat
        lastPongRef.current = Date.now();
        if (heartbeatRef.current) window.clearInterval(heartbeatRef.current);
        heartbeatRef.current = window.setInterval(() => {
          if (ws.readyState !== 1) return;
          ws.send(JSON.stringify({ type: "PING", clientId: clientIdRef.current, ts: Date.now() }));
          if (Date.now() - lastPongRef.current > 30000) ws.close();
        }, 10000) as unknown as number;

        const onLeave = () => {
          try { ws.send(JSON.stringify({ type: "USER_LEAVE", payload: {}, clientId: clientIdRef.current, ts: Date.now() })); } catch {}
        };
        window.addEventListener("beforeunload", onLeave, { once: true });
        window.addEventListener("pagehide", onLeave, { once: true });
      };

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as RTMessage;
          const originId = (msg as any).clientId;
          if (originId && originId === clientIdRef.current) return;

          switch (msg.type) {
            case "PONG":
              lastPongRef.current = Date.now();
              break;

            case "USER_JOIN": {
              const id = originId;
              const name = msg.payload?.name || `Guest-${(id || "").slice(0, 4)}`;
              if (id) { playerNamesRef.current.set(id, name); refreshPlayerList(); }
              // nudge for state
              sendRT({ type: "REQUEST_SNAPSHOT", payload: { requesterId: clientIdRef.current }, clientId: clientIdRef.current, ts: Date.now() });
              break;
            }

            case "USER_LEAVE": {
              const id = originId; if (!id) break;
              const rp = remotePlayersRef.current.get(id);
              if (rp && sceneRef.current) sceneRef.current.remove(rp.group);
              remotePlayersRef.current.delete(id);
              playerNamesRef.current.delete(id);
              refreshPlayerList();
              break;
            }

            case "PLAYER_STATE": {
              const id = originId; if (!id || !sceneRef.current) break;
              const nm = msg.payload?.name;
              if (nm) { playerNamesRef.current.set(id, nm); refreshPlayerList(); updateNameTag(id, nm); }
              const rem = ensureRemotePlayer(id);
              const { p, yaw } = msg.payload;
              rem.group.position.set(p[0], p[1] - EYE_HEIGHT, p[2]);
              rem.group.rotation.set(0, yaw, 0);
              rem.sprite.position.set(0, 1.8, 0);
              break;
            }

            case "PLACE_BLOCK": {
              const { x, y, z, b } = msg.payload;
              placeDyn(x, y, z, b, false, /*quiet*/ true);
              break;
            }

            case "REMOVE_BLOCK_DYN": {
              const { x, y, z } = msg.payload;
              removeDyn(x, y, z, /*quiet*/ true);
              break;
            }

            case "REMOVE_BLOCK_TERRAIN": {
              const { x, y, z } = msg.payload;
              const K = key(x, y, z);
              if (terrainGlobalRef.current.has(K)) {
                terrainGlobalRef.current.delete(K);
                worldSolidsRef.current.delete(K);
                removedTerrainRef.current.add(K);
                const [cx, cz] = getChunkCoord(x, z);
                const ch = chunksRef.current.get(ck(cx, cz));
                if (ch) ch.terrain.delete(K);
                rebuildChunkAt(x, z);
              }
              break;
            }

            case "REQUEST_SNAPSHOT": {
              const target = msg.payload.requesterId;
              const dynArr: Array<[number, number, number, BlockType]> = [];
              for (const [kk, t] of dynMapRef.current) {
                const [x, y, z] = kk.split("|").map(Number);
                dynArr.push([x, y, z, t]);
              }
              const remArr: Array<[number, number, number]> = [];
              for (const kk of removedTerrainRef.current) {
                const [x, y, z] = kk.split("|").map(Number);
                remArr.push([x, y, z]);
              }
              sendRT({ type: "SNAPSHOT", payload: { dyn: dynArr, removed: remArr, targetClientId: target }, clientId: clientIdRef.current, ts: Date.now() });
              break;
            }

            case "SNAPSHOT": {
              const target = msg.payload.targetClientId;
              if (target && target !== clientIdRef.current) break;
              for (const [x, y, z, t] of msg.payload.dyn) {
                const K = key(x, y, z);
                if (!dynMapRef.current.has(K)) { dynMapRef.current.set(K, t); worldSolidsRef.current.add(K); }
              }
              for (const [x, y, z] of msg.payload.removed) {
                const K = key(x, y, z);
                if (terrainGlobalRef.current.has(K)) {
                  terrainGlobalRef.current.delete(K);
                  worldSolidsRef.current.delete(K);
                  removedTerrainRef.current.add(K);
                  const [cx, cz] = getChunkCoord(x, z);
                  const ch = chunksRef.current.get(ck(cx, cz));
                  if (ch) ch.terrain.delete(K);
                }
              }
              rebuildDynamicMesh();
              for (const ch of chunksRef.current.values()) { removeChunkMeshes(ch); buildChunkMeshes(ch); }
              break;
            }

            default: break;
          }
        } catch (err) {
          console.error("WS parse/apply error:", err);
        }
      };

      ws.onclose = () => {
        setWsStatus("Disconnected");
        if (heartbeatRef.current) { window.clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
        if (forceStateTimerRef.current) { clearInterval(forceStateTimerRef.current); forceStateTimerRef.current = null; }
        if (sceneRef.current) for (const rp of remotePlayersRef.current.values()) sceneRef.current.remove(rp.group);
        remotePlayersRef.current.clear();
        playerNamesRef.current.clear();
        refreshPlayerList();
      };

      ws.onerror = () => { setWsStatus("Disconnected"); };
    } catch (err) {
      console.error("WebSocket error:", err);
      setWsStatus("Disconnected");
    }

    return () => {
      try { wsRef.current?.close(); } catch {}
      if (heartbeatRef.current) { window.clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
      if (forceStateTimerRef.current) { clearInterval(forceStateTimerRef.current); forceStateTimerRef.current = null; }
    };
  }, [room, refreshPlayerList, sendRT]);

  function maybeSendPlayerState(nowMs: number) {
    if (!wsRef.current || wsRef.current.readyState !== 1) return;
    if (nowMs - lastStateSentRef.current < 90) return; // ~11 Hz
    const p: [number, number, number] = [posRef.current.x, posRef.current.y, posRef.current.z];
    const yaw = yawRef.current;
    const prev = lastStateCacheRef.current;
    if (prev && Math.hypot(prev.p[0] - p[0], prev.p[1] - p[1], prev.p[2] - p[2]) < 0.02 && Math.abs(prev.yaw - yaw) < 0.01) {
      return;
    }
    lastStateCacheRef.current = { p, yaw };
    lastStateSentRef.current = nowMs;
    sendRT({ type: "PLAYER_STATE", payload: { p, yaw, name: myNameRef.current }, clientId: clientIdRef.current, ts: Date.now() });
  }

  /* -------------------- Remote avatars + name tags -------------------- */
  function makeNameSprite(text: string) {
    const canvas = document.createElement("canvas");
    const scale = 2;
    canvas.width = 256 * scale;
    canvas.height = 64 * scale;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // bg rounded
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    const r = 16 * scale, w = canvas.width, h = canvas.height;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.arcTo(w, 0, w, h, r);
    ctx.arcTo(w, h, 0, h, r);
    ctx.arcTo(0, h, 0, 0, r);
    ctx.arcTo(0, 0, w, 0, r);
    ctx.closePath();
    ctx.fill();
    // text
    ctx.fillStyle = "#ffffff";
    ctx.font = `${24 * scale}px ui-sans-serif, system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, h / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    const mat = new THREE.SpriteMaterial({ map: texture, depthWrite: false, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.6, 0.4, 1);
    return sprite;
  }

  function updateNameTag(id: string, name: string) {
    const rem = remotePlayersRef.current.get(id);
    if (!rem) return;
    const old = rem.sprite;
    const sprite = makeNameSprite(name);
    sprite.position.copy(old.position);
    rem.group.remove(old);
    rem.group.add(sprite);
    rem.sprite = sprite;
  }

  function ensureRemotePlayer(id: string): Remote {
    const existing = remotePlayersRef.current.get(id);
    if (existing) return existing;
    const scene = sceneRef.current!;
    const group = new THREE.Group();
    const color = colorForClient(id);
    let mat = remoteMaterialCacheRef.current.get(id);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.0 });
      remoteMaterialCacheRef.current.set(id, mat);
    }
    // Use cylinder + sphere (capsule-friendly fallback)
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.2, 12), mat);
    body.position.set(0, 1.2 / 2, 0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), mat);
    head.position.set(0, 1.2 + 0.38, 0);
    const sprite = makeNameSprite(playerNamesRef.current.get(id) || `Guest-${id.slice(0, 4)}`);
    sprite.position.set(0, 1.8, 0);

    group.add(body);
    group.add(head);
    group.add(sprite);
    group.position.set(0, 0, 0);
    scene.add(group);

    const remote: Remote = { group, sprite };
    remotePlayersRef.current.set(id, remote);
    return remote;
  }

  /* -------------------- UI -------------------- */
  const hotbarLabels = useMemo(() => ["Plank", "Stone", "Log", "Leaves", "Table"], []);
  const haveForHotbar = [inv.plank > 0, inv.stone > 0, inv.log > 0, true, inv.table > 0];

  const CraftPanel = () => (
    <div
      style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)", display: "grid", placeItems: "center", zIndex: 20 }}
      onClick={() => setShowCraft(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, minWidth: 320, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <strong>{nearTable ? "Crafting Table" : "Inventory Crafting"}</strong>
          <span style={{ fontSize: 12, color: "#64748b" }}>E to close</span>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          <button onClick={() => { if (inv.log >= 1) { takeItem("log", 1); addItem("plank", 4); } }}
            disabled={inv.log < 1} style={btnStyle(inv.log >= 1)}>1× Log → 4× Planks</button>
          <button onClick={() => { if (inv.plank >= 2) { takeItem("plank", 2); addItem("stick", 4); } }}
            disabled={inv.plank < 2} style={btnStyle(inv.plank >= 2)}>2× Planks → 4× Sticks</button>
          <button onClick={() => { if (inv.plank >= 4) { takeItem("plank", 4); addItem("table", 1); } }}
            disabled={inv.plank < 4} style={btnStyle(inv.plank >= 4)}>4× Planks → 1× Crafting Table</button>
          <hr style={{ border: 0, borderTop: "1px solid #e5e7eb", margin: "8px 0" }} />
          <button onClick={() => { if (inv.rock >= 4) { takeItem("rock", 4); addItem("stone", 1); } }}
            disabled={inv.rock < 4} style={btnStyle(inv.rock >= 4)}>4× Rocks → 1× Stone Block</button>
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: "#64748b" }}>
          Inventory — Logs: {inv.log} • Planks: {inv.plank} • Sticks: {inv.stick} • Rocks: {inv.rock} • Stone: {inv.stone} • Tables: {inv.table}
        </div>
      </div>
    </div>
  );

  const copyShare = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };
  const joinPendingRoom = () => {
    const name = pendingRoom.trim() || "craft-lobby";
    setRoom(name);
    router.push(`/craft?room=${encodeURIComponent(name)}`);
  };

  return (
    <main style={{ display: "grid", gridTemplateRows: "auto 1fr", height: "100vh" }}>
      <header
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr auto",
          alignItems: "center",
          gap: 12,
          padding: 12,
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <Link href="/" style={{ textDecoration: "none", fontSize: 13 }}>← Home</Link>
          <strong style={{ fontSize: 14, whiteSpace: "nowrap" }}>Craft — infinite terrain (multiplayer)</strong>
        </div>

        {/* Room controls */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", justifySelf: "center", flexWrap: "wrap" }}>
          <input
            value={pendingRoom}
            onChange={(e) => setPendingRoom(e.target.value)}
            placeholder="room name"
            style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 8px", minWidth: 180 }}
          />
          <button onClick={joinPendingRoom} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb", cursor: "pointer" }}>
            Join / Create
          </button>

          <span style={{ fontSize: 12, color: "#64748b" }}>Room:</span>
          <code style={{ fontSize: 12, background: "#f1f5f9", padding: "2px 6px", borderRadius: 6 }}>{room}</code>

          <button onClick={copyShare} title="Copy share link" style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb", cursor: "pointer" }}>
            {copied ? "Copied!" : "Copy Link"}
          </button>
          <a href={shareLink} target="_blank" rel="noreferrer" style={{ fontSize: 12, textDecoration: "none", color: "#2563eb" }}>
            Open link
          </a>
        </div>

        {/* Status + player list */}
        <div style={{ justifySelf: "end", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: wsStatus === "Live" ? "#059669" : wsStatus === "Connecting" ? "#d97706" : "#ef4444" }}>
            WS: {wsStatus}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {playerList.map((p) => (
              <div key={p.id} title={p.name} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: new THREE.Color(
                      `hsl(${[...p.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0)},85%,55%)`
                    ).getStyle(),
                    border: "1px solid rgba(0,0,0,0.2)",
                  }}
                />
                <span style={{ fontSize: 12, color: "#334155", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
              </div>
            ))}
          </div>
          <span style={{ marginLeft: 4, fontSize: 12, color: "#64748b" }}>({playerList.length})</span>

          <span style={{ marginLeft: 8, fontSize: 12, color: pointerLocked ? "#059669" : "#64748b" }}>
            {pointerLocked ? "Mouse: Captured" : "Mouse: Free"}
          </span>
        </div>
      </header>

      <section style={{ position: "relative", overflow: "hidden" }}>
        <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />

        {/* Hotbar */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: 20,
            transform: "translateX(-50%)",
            display: "flex",
            gap: 6,
            background: "rgba(15,23,42,0.6)",
            padding: 6,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.15)",
            backdropFilter: "blur(4px)",
            zIndex: 12,
          }}
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <button
              key={i}
              onClick={() => setHotbar(i as any)}
              style={{
                minWidth: 84,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                background: i === hotbar ? "#e0f2fe" : "white",
                opacity: haveForHotbar[i] ? 1 : 0.5,
                cursor: "pointer",
                fontSize: 12,
              }}
              title={hotbarLabels[i]}
            >
              {i + 1}. {hotbarLabels[i]}
            </button>
          ))}
        </div>

        {/* Inventory/Crafting */}
        {showCraft && <CraftPanel />}
      </section>
    </main>
  );

  /* -------------------- helpers -------------------- */
  function btnStyle(enabled: boolean): React.CSSProperties {
    return {
      padding: "8px 10px",
      borderRadius: 8,
      border: "1px solid #e5e7eb",
      background: enabled ? "#f8fafc" : "#f3f4f6",
      cursor: enabled ? "pointer" : "not-allowed",
      textAlign: "left",
    };
  }
}
