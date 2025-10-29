// app/games/minecraft/lib/crafting.ts
import { BLOCKS } from "./constants";
import type { BlockId } from "./types";
import type { ItemId } from "./items"; // type-only, safe at runtime

export type ItemStack = { id: ItemId; count: number };
export type MaybeItem = ItemStack | null;

// 3×3 crafting grid is a flat array length 9, row-major
export type CraftGrid = MaybeItem[]; // length 9

export type CraftResult = {
  result: ItemStack | null;
  consume: Array<{ index: number; amount: number }>; // cells to consume once
};

const isStick = (s: MaybeItem) => s?.id === "stick";
const isEmpty = (s: MaybeItem) => !s || s.count <= 0;

// ---- Local helpers (no runtime imports) ----
function isBlockIdLocal(id: ItemId): id is BlockId {
  return typeof id === "number";
}

function isWoodMaterialBlockLocal(id: BlockId) {
  const spec = BLOCKS[id];
  if (!spec) return false;
  const name = (spec.name || "").toLowerCase();
  return name.includes("wood") || name.includes("log") || name.includes("plank");
}

function isStoneMaterialBlockLocal(id: BlockId) {
  const spec = BLOCKS[id];
  if (!spec) return false;
  const name = (spec.name || "").toLowerCase();
  return name.includes("stone") || name.includes("cobble") || name.includes("brick");
}

function noExtrasOutsidePattern(grid: CraftGrid, used: Set<number>) {
  for (let i = 0; i < 9; i++) {
    if (!used.has(i) && !isEmpty(grid[i])) return false;
  }
  return true;
}

/** Try to match a pattern anywhere in the 3×3.
 * pattern rows example:
 *  - Pickaxe: ["MMM"," S "," S "]
 *  - Shovel:  [" M "," S "," S "]
 * Where:
 *  M = material cell (wood/stone by recipe), S = stick, space = must be empty
 */
function matchPattern(
  grid: CraftGrid,
  pattern: string[],
  opts: { material: "wood" | "stone" }
):
  | { ok: true; used: Array<{ index: number; amount: number }>; materialKind: "wood" | "stone" }
  | { ok: false } {
  const rows = pattern.length;
  const cols = pattern[0].length;

  const materialPred =
    opts.material === "wood" ? isWoodMaterialBlockLocal : isStoneMaterialBlockLocal;

  for (let offR = 0; offR <= 3 - rows; offR++) {
    for (let offC = 0; offC <= 3 - cols; offC++) {
      const used = new Set<number>();
      let ok = true;

      for (let r = 0; r < rows && ok; r++) {
        for (let c = 0; c < cols; c++) {
          const ch = pattern[r][c];
          const idx = (offR + r) * 3 + (offC + c);
          const cell = grid[idx];

          if (ch === " ") {
            if (!isEmpty(cell)) { ok = false; break; }
            continue;
          }
          if (ch === "S") {
            if (!isStick(cell)) { ok = false; break; }
            used.add(idx);
            continue;
          }
          if (ch === "M") {
            if (!cell || !isBlockIdLocal(cell.id) || !materialPred(cell.id)) { ok = false; break; }
            used.add(idx);
            continue;
          }
        }
      }

      if (!ok) continue;
      if (!noExtrasOutsidePattern(grid, used)) continue;

      const consume = [...used].map((index) => ({ index, amount: 1 }));
      return { ok: true, used: consume, materialKind: opts.material };
    }
  }
  return { ok: false };
}

// --- Recipes ---

// 1) Shapeless: 1 wood/log/plank block → 4 sticks
function tryShapelessLogToSticks(grid: CraftGrid): CraftResult | null {
  let nonEmptyCount = 0;
  let logIndex = -1;

  for (let i = 0; i < 9; i++) {
    const s = grid[i];
    if (!isEmpty(s)) {
      nonEmptyCount++;
      if (s && isBlockIdLocal(s.id) && isWoodMaterialBlockLocal(s.id)) logIndex = i;
    }
  }

  if (nonEmptyCount === 1 && logIndex !== -1 && (grid[logIndex]?.count ?? 0) >= 1) {
    return {
      result: { id: "stick", count: 4 },
      consume: [{ index: logIndex, amount: 1 }],
    };
  }
  return null;
}

const PATTERNS = {
  pickaxe: ["MMM", " S ", " S "],
  shovel:  [" M ", " S ", " S "],
  sword:   [" M ", " M ", " S "],
  axeA:    ["MM ", "MS ", " S "], // mirrored variants
  axeB:    [" MM", " SM", " S "],
};

function tryTools(grid: CraftGrid): CraftResult | null {
  for (const mat of ["wood", "stone"] as const) {
    // Pickaxe
    {
      const m = matchPattern(grid, PATTERNS.pickaxe, { material: mat });
      if (m.ok) return { result: { id: (mat === "wood" ? "wooden_pickaxe" : "stone_pickaxe"), count: 1 }, consume: m.used };
    }
    // Shovel
    {
      const m = matchPattern(grid, PATTERNS.shovel, { material: mat });
      if (m.ok) return { result: { id: (mat === "wood" ? "wooden_shovel" : "stone_shovel"), count: 1 }, consume: m.used };
    }
    // Sword
    {
      const m = matchPattern(grid, PATTERNS.sword, { material: mat });
      if (m.ok) return { result: { id: (mat === "wood" ? "wooden_sword" : "stone_sword"), count: 1 }, consume: m.used };
    }
    // Axe (mirrors)
    {
      const m1 = matchPattern(grid, PATTERNS.axeA, { material: mat });
      const m2 = matchPattern(grid, PATTERNS.axeB, { material: mat });
      const m = m1.ok ? m1 : m2.ok ? m2 : { ok: false as const };
      if ((m as any).ok) {
        return { result: { id: (mat === "wood" ? "wooden_axe" : "stone_axe"), count: 1 }, consume: (m as any).used };
      }
    }
  }
  return null;
}

// Public: compute result for current grid (crafts exactly one)
export function evaluateCraft(grid: CraftGrid): CraftResult {
  const s = tryShapelessLogToSticks(grid);
  if (s) return s;

  const t = tryTools(grid);
  if (t) return t;

  return { result: null, consume: [] };
}

// Apply the craft once: mutate a copy of the grid, return new grid + result
export function applyCraftOnce(grid: CraftGrid): { grid: CraftGrid; result: ItemStack | null } {
  const { result, consume } = evaluateCraft(grid);
  if (!result) return { grid, result: null };

  const next = grid.slice();
  for (const { index, amount } of consume) {
    const s = next[index];
    if (!s) continue;
    const left = s.count - amount;
    next[index] = left > 0 ? { ...s, count: left } : null;
  }
  return { grid: next, result };
}
