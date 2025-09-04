// app/games/minecraft/lib/crafting.ts
import type { ItemId } from "./items";
import { isBlockId, isStoneMaterialBlock, isWoodMaterialBlock } from "./items";

export type ItemStack = { id: ItemId; count: number };
export type MaybeItem = ItemStack | null;

// 3×3 crafting grid is a flat array length 9, row-major
export type CraftGrid = MaybeItem[]; // length 9

export type CraftResult = {
  result: ItemStack | null;
  // Which cells to consume (and how much) when applying the craft once:
  consume: Array<{ index: number; amount: number }>;
};

// Helpers
const isStick = (s: MaybeItem) => s?.id === "stick";
const isEmpty = (s: MaybeItem) => !s || s.count <= 0;

function gridGet(grid: CraftGrid, r: number, c: number) {
  return grid[r * 3 + c] ?? null;
}

function noExtrasOutsidePattern(grid: CraftGrid, used: Set<number>) {
  for (let i = 0; i < 9; i++) {
    if (!used.has(i) && !isEmpty(grid[i])) return false;
  }
  return true;
}

/** Try to match a pattern anywhere in the 3×3.
 * pattern rows are strings like "MMM", " S ", " S " where:
 *  - 'M' = material predicate (wood OR stone depending on recipe)
 *  - 'S' = stick
 *  - ' ' = must be empty
 */
function matchPattern(
  grid: CraftGrid,
  pattern: string[],
  opts: {
    material: "wood" | "stone";
  }
): { ok: true; used: Array<{ index: number; amount: number }>; materialKind: "wood" | "stone" } | { ok: false } {
  const rows = pattern.length;
  const cols = pattern[0].length;

  const materialPred = opts.material === "wood" ? isWoodMaterialBlock : isStoneMaterialBlock;

  // Try all top-left offsets where the pattern fits
  for (let offR = 0; offR <= 3 - rows; offR++) {
    for (let offC = 0; offC <= 3 - cols; offC++) {
      const used = new Set<number>();
      let materialCellsAllValid = true;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const ch = pattern[r][c];
          const idx = (offR + r) * 3 + (offC + c);
          const cell = grid[idx];

          if (ch === " ") {
            if (!isEmpty(cell)) {
              materialCellsAllValid = false;
              break;
            }
            continue;
          }

          if (ch === "S") {
            if (!isStick(cell)) {
              materialCellsAllValid = false;
              break;
            }
            used.add(idx);
            continue;
          }

          if (ch === "M") {
            if (!cell || !materialPred(cell.id)) {
              materialCellsAllValid = false;
              break;
            }
            used.add(idx);
            continue;
          }
        }
        if (!materialCellsAllValid) break;
      }

      if (!materialCellsAllValid) continue;
      if (!noExtrasOutsidePattern(grid, used)) continue;

      // Build consume list (1 item from each used slot)
      const consume = [...used].map((index) => ({ index, amount: 1 }));
      return { ok: true, used: consume, materialKind: opts.material };
    }
  }

  return { ok: false };
}

// --- Recipes ---

// 1) Shapeless: 1 wood log → 4 sticks
function tryShapelessLogToSticks(grid: CraftGrid): CraftResult | null {
  let nonEmptyCount = 0;
  let logIndex = -1;
  for (let i = 0; i < 9; i++) {
    const s = grid[i];
    if (!isEmpty(s)) {
      nonEmptyCount++;
      if (s && isBlockId(s.id) && isWoodMaterialBlock(s.id)) logIndex = i;
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

// 2) Patterned tools (wood or stone material)
const PATTERNS = {
  pickaxe: ["MMM", " S ", " S "],
  shovel: [" M ", " S ", " S "],
  sword: [" M ", " M ", " S "],
  axeA: ["MM ", "MS ", " S "], // two mirrored variants
  axeB: [" MM", " SM", " S "],
};

function tryTools(grid: CraftGrid): CraftResult | null {
  // Try each material kind independently
  for (const mat of ["wood", "stone"] as const) {
    // Pickaxe
    {
      const m = matchPattern(grid, PATTERNS.pickaxe, { material: mat });
      if (m.ok) {
        return {
          result: { id: (mat === "wood" ? "wooden_pickaxe" : "stone_pickaxe"), count: 1 },
          consume: m.used,
        };
      }
    }
    // Shovel
    {
      const m = matchPattern(grid, PATTERNS.shovel, { material: mat });
      if (m.ok) {
        return {
          result: { id: (mat === "wood" ? "wooden_shovel" : "stone_shovel"), count: 1 },
          consume: m.used,
        };
      }
    }
    // Sword
    {
      const m = matchPattern(grid, PATTERNS.sword, { material: mat });
      if (m.ok) {
        return {
          result: { id: (mat === "wood" ? "wooden_sword" : "stone_sword"), count: 1 },
          consume: m.used,
        };
      }
    }
    // Axe (either mirrored)
    {
      const m1 = matchPattern(grid, PATTERNS.axeA, { material: mat });
      const m2 = matchPattern(grid, PATTERNS.axeB, { material: mat });
      const m = m1.ok ? m1 : m2.ok ? m2 : { ok: false as const };
      if (m.ok) {
        return {
          result: { id: (mat === "wood" ? "wooden_axe" : "stone_axe"), count: 1 },
          consume: m.used,
        };
      }
    }
  }
  return null;
}

// Public: compute result for current grid (crafts exactly one)
export function evaluateCraft(grid: CraftGrid): CraftResult {
  // 1) shapeless log → sticks
  const s = tryShapelessLogToSticks(grid);
  if (s) return s;

  // 2) tools
  const t = tryTools(grid);
  if (t) return t;

  // Nothing craftable
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
