"use client";

import * as React from "react";
import { Canvas, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Sky, Environment } from "@react-three/drei";
import * as THREE from "three";

type BlockId = "EMPTY" | "GRASS" | "DIRT" | "STONE" | "SAND" | "WATER" | "WOOD";
type Vec3 = [number, number, number];

type Block = { id: BlockId; pos: Vec3 };

const WORLD_SIZE = 20;   // square size (x,z: 0..WORLD_SIZE-1)
const STORAGE_KEY = "minecraft_like_world_3d_v1";

const BLOCKS: { id: BlockId; label: string; key?: string; color: string }[] = [
  { id: "GRASS", label: "Grass", key: "1", color: "#57a639" },
  { id: "DIRT",  label: "Dirt",  key: "2", color: "#6b4f2d" },
  { id: "STONE", label: "Stone", key: "3", color: "#9ca3af" },
  { id: "SAND",  label: "Sand",  key: "4", color: "#f5d08a" },
  { id: "WATER", label: "Water", key: "5", color: "#60a5fa" },
  { id: "WOOD",  label: "Wood",  key: "6", color: "#8b5a2b" },
  { id: "EMPTY", label: "Air",   key: "7", color: "#ffffff" },
];

function keyOf([x, y, z]: Vec3) {
  return `${x},${y},${z}`;
}
function parseKey(k: string): Vec3 {
  const [x, y, z] = k.split(",").map(Number);
  return [x, y, z];
}

function seedWorld(): Record<string, BlockId> {
  // Start with a flat grass ground at y=0
  const map: Record<string, BlockId> = {};
  for (let x = 0; x < WORLD_SIZE; x++) {
    for (let z = 0; z < WORLD_SIZE; z++) {
      map[keyOf([x, 0, z])] = "GRASS";
      if (Math.random() < 0.1) map[keyOf([x, 1, z])] = "DIRT";
    }
  }
  return map;
}

function loadWorld(): Record<string, BlockId> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Record<string, BlockId>;
  } catch {
    return null;
  }
}

function saveWorld(map: Record<string, BlockId>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

function colorFor(id: BlockId): string {
  switch (id) {
    case "GRASS": return "#57a639";
    case "DIRT":  return "#6b4f2d";
    case "STONE": return "#9ca3af";
    case "SAND":  return "#f5d08a";
    case "WATER": return "#60a5fa";
    case "WOOD":  return "#8b5a2b";
    case "EMPTY": return "#ffffff";
  }
}

export default function Minecraft3D() {
  const [selected, setSelected] = React.useState<BlockId>("GRASS");
  const [blocks, setBlocks] = React.useState<Record<string, BlockId>>(() => {
    if (typeof window === "undefined") return seedWorld();
    return loadWorld() ?? seedWorld();
  });

  // Hotkeys 1–7 + Ctrl/Cmd+S
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const found = BLOCKS.find((b) => b.key === e.key);
      if (found) setSelected(found.id);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveWorld(blocks);
        alert("World saved locally.");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [blocks]);

  const blockEntries = React.useMemo(
    () =>
      Object.entries(blocks).map(([k, id]) => ({
        id,
        pos: parseKey(k) as Vec3,
      })),
    [blocks]
  );

  function placeAt(pos: Vec3, id: BlockId) {
    const k = keyOf(pos);
    setBlocks((m) => {
      if (id === "EMPTY") {
        if (!m[k]) return m;
        const copy = { ...m };
        delete copy[k];
        return copy;
      } else {
        if (m[k] === id) return m;
        return { ...m, [k]: id };
      }
    });
  }

  const onSave = () => {
    saveWorld(blocks);
    alert("World saved in your browser.");
  };
  const onLoad = () => {
    const m = loadWorld();
    if (!m) return alert("No saved world found.");
    setBlocks(m);
  };
  const onClear = () => {
    if (!confirm("Clear the world? This won't remove your saved copy.")) return;
    setBlocks({});
  };
  const onExport = () => {
    const blob = new Blob([JSON.stringify(blocks)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "minecraft-world-3d.json"; a.click();
    URL.revokeObjectURL(url);
  };
  const onImport = async (f: File) => {
    try {
      const text = await f.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object") throw new Error();
      setBlocks(parsed);
    } catch {
      alert("Invalid world file.");
    }
  };

  return (
    <div
      style={{ position: "relative", height: 600, borderRadius: 12, overflow: "hidden", border: "1px solid #e5e7eb" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* UI overlay */}
      <div style={uiBar}>
        <div style={hotbar}>
          {BLOCKS.map((b) => (
            <button
              key={b.id}
              onClick={() => setSelected(b.id)}
              title={`${b.label}${b.key ? ` (Key ${b.key})` : ""}`}
              style={{
                ...hotBtn,
                outline: selected === b.id ? "3px solid #2563eb" : "1px solid #e5e7eb",
                background: b.color,
              }}
            >
              {b.label}
              {b.key && <span style={badge}>{b.key}</span>}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={onSave} style={actionBtn}>Save</button>
          <button onClick={onLoad} style={actionBtn}>Load</button>
          <button onClick={onExport} style={actionBtn}>Export</button>
          <label style={{ ...actionBtn, cursor: "pointer" }}>
            Import
            <input
              type="file"
              accept="application/json"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                if (f) onImport(f);
                e.currentTarget.value = "";
              }}
            />
          </label>
          <button onClick={onClear} style={{ ...actionBtn, borderColor: "#dc2626" }}>Clear</button>
        </div>
      </div>

      {/* 3D Canvas */}
      <Canvas
        shadows
        camera={{ position: [WORLD_SIZE * 0.8, WORLD_SIZE * 0.6, WORLD_SIZE * 0.8], fov: 50 }}
      >
        {/* Lighting & sky */}
        <Sky sunPosition={[100, 20, 100]} />
        <ambientLight intensity={0.5} />
        <directionalLight
          castShadow
          position={[20, 25, 10]}
          intensity={0.8}
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />

        {/* Controls */}
        <OrbitControls target={[WORLD_SIZE / 2, 0.5, WORLD_SIZE / 2]} maxPolarAngle={Math.PI / 2.1} />

        {/* Ground catch-plane for placing */}
        <GroundPlane
          size={WORLD_SIZE}
          onPlace={(x, z) => placeAt([x, 1, z], selected)} // place on top of ground level
        />

        {/* Render all blocks */}
        {blockEntries.map(({ id, pos }) => (
          <Voxel
            key={keyOf(pos)}
            id={id}
            pos={pos}
            onPlaceAdjacent={(p) => placeAt(p, selected)}
            onRemove={() => placeAt(pos, "EMPTY")}
          />
        ))}

        {/* Nice environment reflections */}
        <Environment preset="city" />
      </Canvas>

      <div style={hudHint}>
        <span>Left-click place · Right-click / Shift remove · 1–7 change block</span>
      </div>
    </div>
  );
}

/** A clickable cube (voxel). Left-click places on the clicked face’s neighbor; right-click/Shift removes. */
function Voxel({
  id,
  pos,
  onPlaceAdjacent,
  onRemove,
}: {
  id: BlockId;
  pos: Vec3;
  onPlaceAdjacent: (p: Vec3) => void;
  onRemove: () => void;
}) {
  const color = colorFor(id);
  const [x, y, z] = pos;

  function handlePointerDown(e: ThreeEvent<MouseEvent>) {
    e.stopPropagation(); // don’t let the ground catch it
    const rightClick = e.nativeEvent.button === 2;
    const shift = (e.nativeEvent as MouseEvent).shiftKey;

    if (rightClick || shift) {
      onRemove();
      return;
    }

    // Determine which face was clicked to compute neighbor cell
    const n = e.face?.normal?.clone();
    if (!n) return;
    const normal = n
      .applyMatrix3(new THREE.Matrix3().getNormalMatrix((e.object as THREE.Mesh).matrixWorld))
      .round();

    const nx = Math.round(normal.x);
    const ny = Math.round(normal.y);
    const nz = Math.round(normal.z);

    const adj: Vec3 = [x + nx, y + ny, z + nz];
    onPlaceAdjacent(adj);
  }

  return (
    <mesh
      position={[x + 0.5, y + 0.5, z + 0.5]} // center cubes in each grid cell
      castShadow
      receiveShadow
      onPointerDown={handlePointerDown}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={color} roughness={0.9} metalness={0} />
    </mesh>
  );
}

/** Large plane to catch ground clicks and place blocks snapped to grid. */
function GroundPlane({
  size,
  onPlace,
}: {
  size: number;
  onPlace: (x: number, z: number) => void;
}) {
  function handlePointerDown(e: ThreeEvent<MouseEvent>) {
    const rightClick = e.nativeEvent.button === 2;
    const shift = (e.nativeEvent as MouseEvent).shiftKey;
    if (rightClick || shift) return;

    const p = e.point; // world coords where the ray hit the plane
    const x = Math.floor(THREE.MathUtils.clamp(p.x, 0, size - 1));
    const z = Math.floor(THREE.MathUtils.clamp(p.z, 0, size - 1));
    onPlace(x, z);
  }

  return (
    <group>
      {/* Visible checker ground (y=0) */}
      <mesh
        position={[size / 2, 0, size / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[size, size, size, size]} />
        <meshStandardMaterial color="#6faa4a" />
      </mesh>

      {/* Subtle grid lines */}
      <gridHelper args={[size, size]} position={[size / 2, 0.01, size / 2]} />

      {/* Invisible catch plane slightly above to receive clicks */}
      <mesh
        position={[size / 2, 0.001, size / 2]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerDown={handlePointerDown}
      >
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </group>
  );
}

// --- UI styles ---
const uiBar: React.CSSProperties = {
  position: "absolute",
  inset: 12,
  top: 12,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  pointerEvents: "none",
};
const hotbar: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  pointerEvents: "auto",
};
const hotBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  minWidth: 90,
  textAlign: "center" as const,
};
const badge: React.CSSProperties = {
  marginLeft: 8,
  padding: "2px 6px",
  borderRadius: 999,
  border: "1px solid #e5e7eb",
  background: "#fff",
  fontSize: 12,
};
const actionBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: "#111827",
  color: "#fff",
  fontSize: 14,
  cursor: "pointer",
  pointerEvents: "auto",
};
const hudHint: React.CSSProperties = {
  position: "absolute",
  bottom: 10,
  left: 12,
  right: 12,
  display: "flex",
  justifyContent: "space-between",
  fontSize: 12,
  color: "#111827",
  opacity: 0.8,
  pointerEvents: "none",
};
