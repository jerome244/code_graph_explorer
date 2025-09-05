// app/games/minecraft/lib/items.ts
import type { BlockId } from "./types";
import { BLOCKS } from "./constants";

/** Buckets for tool efficiencies */
export type BlockTag = "stone" | "wood" | "dirt" | "sand" | "glass" | "generic";

/** Best-effort tag detection from block name */
export function blockTagOf(id: BlockId): BlockTag {
  const spec = BLOCKS[id];
  const name = (spec?.name || "").toLowerCase();
  if (name.includes("stone") || name.includes("brick") || name.includes("cobble")) return "stone";
  if (name.includes("wood") || name.includes("log") || name.includes("plank")) return "wood";
  if (name.includes("dirt")) return "dirt";
  if (name.includes("sand")) return "sand";
  if (name.includes("glass")) return "glass";
  return "generic";
}

/** Tool ids you craft */
export type ToolItemId =
  | "wooden_shovel"
  | "stone_shovel"
  | "wooden_pickaxe"
  | "stone_pickaxe"
  | "wooden_sword"
  | "stone_sword"
  | "wooden_axe"
  | "stone_axe";

/** Non-block items (strings) */
export type NonBlockItemId = "stick" | ToolItemId;

/** Anything that can be in a slot: either a numeric BlockId or a string item id */
export type ItemId = BlockId | NonBlockItemId;

export function isToolItemId(x: unknown): x is ToolItemId {
  return typeof x === "string" && x in TOOL_SPECS;
}

/** Visual spec for non-block items so the UI can draw them */
export const ITEM_SPEC: Record<NonBlockItemId, { name: string; color: string; transparent?: boolean }> = {
  stick: { name: "Stick", color: "#8b5a2b" },

  wooden_shovel:   { name: "Wooden Shovel",   color: "#c49a6c" },
  stone_shovel:    { name: "Stone Shovel",    color: "#888888" },
  wooden_pickaxe:  { name: "Wooden Pickaxe",  color: "#c49a6c" },
  stone_pickaxe:   { name: "Stone Pickaxe",   color: "#888888" },
  wooden_sword:    { name: "Wooden Sword",    color: "#c49a6c" },
  stone_sword:     { name: "Stone Sword",     color: "#888888" },
  wooden_axe:      { name: "Wooden Axe",      color: "#c49a6c" },
  stone_axe:       { name: "Stone Axe",       color: "#888888" },
};

/** Tool behavior for mining speed & drops */
type ToolKind = "pickaxe" | "shovel" | "axe" | "sword";
type ToolTier = "wood" | "stone";

type ToolSpec = {
  kind: ToolKind;
  tier: ToolTier;
  baseSpeed: number; // 1 = bare hands; higher is faster
  multipliers?: Partial<Record<BlockTag, number>>;
  drops?: Partial<Record<BlockTag, boolean>>;
};

// Defaults for bare hands
const HAND_SPEED_BY_TAG: Record<BlockTag, number> = {
  stone: 0.35,
  wood: 0.6,
  dirt: 0.8,
  sand: 0.9,
  glass: 0.25,
  generic: 0.6,
};
const HAND_DROPS_BY_TAG: Partial<Record<BlockTag, boolean>> = {
  glass: false,
};

export const TOOL_SPECS: Record<ToolItemId, ToolSpec> = {
  wooden_pickaxe: { kind: "pickaxe", tier: "wood", baseSpeed: 1.4, multipliers: { stone: 2.0, glass: 1.5, generic: 1.1 }, drops: { glass: true } },
  stone_pickaxe:  { kind: "pickaxe", tier: "stone", baseSpeed: 1.8, multipliers: { stone: 3.0, glass: 2.0, generic: 1.2 }, drops: { glass: true } },

  wooden_shovel:  { kind: "shovel",  tier: "wood", baseSpeed: 1.3, multipliers: { dirt: 2.5, sand: 2.5, generic: 1.0 } },
  stone_shovel:   { kind: "shovel",  tier: "stone", baseSpeed: 1.6, multipliers: { dirt: 3.0, sand: 3.0, generic: 1.1 } },

  wooden_axe:     { kind: "axe",     tier: "wood", baseSpeed: 1.3, multipliers: { wood: 3.0, generic: 1.0 } },
  stone_axe:      { kind: "axe",     tier: "stone", baseSpeed: 1.6, multipliers: { wood: 3.5, generic: 1.1 } },

  wooden_sword:   { kind: "sword",   tier: "wood", baseSpeed: 1.0, multipliers: { generic: 0.9 } },
  stone_sword:    { kind: "sword",   tier: "stone", baseSpeed: 1.0, multipliers: { generic: 0.9 } },
};

/** Compute mining effect for an equipped tool vs. a block id */
export function getMiningEffectFor(tool: ToolItemId | null | undefined, blockId: BlockId): {
  speedMultiplier: number;
  allowDrop: boolean;
} {
  const tag = blockTagOf(blockId);
  if (!tool || !isToolItemId(tool)) {
    const speed = HAND_SPEED_BY_TAG[tag] ?? 0.6;
    const allowDrop = HAND_DROPS_BY_TAG[tag] ?? true;
    return { speedMultiplier: Math.max(0.1, speed), allowDrop };
  }
  const spec = TOOL_SPECS[tool];
  const mul = spec.multipliers?.[tag] ?? spec.multipliers?.generic ?? 1;
  const speed = spec.baseSpeed * mul;
  const allowDrop = spec.drops?.[tag] ?? HAND_DROPS_BY_TAG[tag] ?? true;
  return { speedMultiplier: Math.max(0.1, speed), allowDrop };
}
