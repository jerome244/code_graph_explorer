<<<<<<< HEAD
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
=======
// frontend/app/games/minecraft/lib/items.ts
import { BLOCKS } from "./constants";
import type { BlockId } from "./types";

// ───────────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────────
export type ToolTier = "wooden" | "stone" | "iron" | "diamond" | "gold" | "netherite";
export type ToolKind = "axe" | "pickaxe" | "shovel";
export type ToolItemId =
  | "wooden_axe" | "stone_axe" | "iron_axe" | "diamond_axe" | "gold_axe" | "netherite_axe"
  | "wooden_pickaxe" | "stone_pickaxe" | "iron_pickaxe" | "diamond_pickaxe" | "gold_pickaxe" | "netherite_pickaxe"
  | "wooden_shovel" | "stone_shovel" | "iron_shovel" | "diamond_shovel" | "gold_shovel" | "netherite_shovel";

// Inventory/Hotbar items can be either a block (number) or a tool (string)
export type ItemId = BlockId | ToolItemId;

// ───────────────────────────────────────────────────────────────────────────────
// Visual spec for tools (used by InventoryOverlay + Hotbar labels)
// ───────────────────────────────────────────────────────────────────────────────
type ItemSpec = { name: string; short: string };

export const ITEM_SPEC: Record<ToolItemId, ItemSpec> = {
  // Axes
  wooden_axe:    { name: "Wooden Axe",    short: "Axe W" },
  stone_axe:     { name: "Stone Axe",     short: "Axe S" },
  iron_axe:      { name: "Iron Axe",      short: "Axe I" },
  diamond_axe:   { name: "Diamond Axe",   short: "Axe D" },
  gold_axe:      { name: "Gold Axe",      short: "Axe G" },
  netherite_axe: { name: "Netherite Axe", short: "Axe N" },

  // Pickaxes
  wooden_pickaxe:    { name: "Wooden Pickaxe",    short: "Pick W" },
  stone_pickaxe:     { name: "Stone Pickaxe",     short: "Pick S" },
  iron_pickaxe:      { name: "Iron Pickaxe",      short: "Pick I" },
  diamond_pickaxe:   { name: "Diamond Pickaxe",   short: "Pick D" },
  gold_pickaxe:      { name: "Gold Pickaxe",      short: "Pick G" },
  netherite_pickaxe: { name: "Netherite Pickaxe", short: "Pick N" },

  // Shovels
  wooden_shovel:    { name: "Wooden Shovel",    short: "Shov W" },
  stone_shovel:     { name: "Stone Shovel",     short: "Shov S" },
  iron_shovel:      { name: "Iron Shovel",      short: "Shov I" },
  diamond_shovel:   { name: "Diamond Shovel",   short: "Shov D" },
  gold_shovel:      { name: "Gold Shovel",      short: "Shov G" },
  netherite_shovel: { name: "Netherite Shovel", short: "Shov N" },
};

// ───────────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────────
const TOOL_IDS = new Set(Object.keys(ITEM_SPEC) as ToolItemId[]);
export function isToolItemId(x: unknown): x is ToolItemId {
  return typeof x === "string" && TOOL_IDS.has(x as ToolItemId);
}

function parseTool(id: ToolItemId): { tier: ToolTier; kind: ToolKind } {
  const [tier, kind] = id.split("_") as [ToolTier, ToolKind];
  return { tier, kind };
}

// ───────────────────────────────────────────────────────────────────────────────
// Mining logic: tool × block-type determines speed + drop behavior
// ───────────────────────────────────────────────────────────────────────────────

// Rebalanced relative speeds by tier (bigger = faster)
const TIER_SPEED: Record<ToolTier, number> = {
  wooden: 0.5,
  stone: 0.8,
  iron: 1.1,
  diamond: 1.35,
  gold: 1.5,
  netherite: 1.45,
};

// Coarse tags for block families, based on BLOCKS[].name
type BlockTag = "wood" | "leaves" | "stone" | "ore" | "metal" | "dirt" | "sand" | "gravel" | "snow" | "clay" | "other";

function inferTag(bid: BlockId): BlockTag {
  const spec = (BLOCKS as any)[Number(bid)];
  const name = (spec?.name ?? "").toLowerCase();
  if (/log|wood|plank|stem|mangrove|oak|spruce|birch|acacia|dark|jungle/.test(name)) return "wood";
  if (/leaves|leaf/.test(name)) return "leaves";
  if (/ore/.test(name)) return "ore";
  if (/iron|gold|copper|metal|anvil|block of (iron|gold|copper)/.test(name)) return "metal";
  if (/stone|deepslate|cobble|cobblestone|granite|diorite|andesite|basalt|blackstone|obsidian/.test(name)) return "stone";
  if (/dirt|grass path|grass block|mud/.test(name)) return "dirt";
  if (/sand|red sand/.test(name)) return "sand";
  if (/gravel/.test(name)) return "gravel";
  if (/snow/.test(name)) return "snow";
  if (/clay/.test(name)) return "clay";
  return "other";
}

function matchMultiplier(kind: ToolKind, tag: BlockTag): number {
  const rightTool =
    (kind === "axe"     && (tag === "wood" || tag === "leaves")) ||
    (kind === "pickaxe" && (tag === "stone" || tag === "ore" || tag === "metal")) ||
    (kind === "shovel"  && (tag === "dirt" || tag === "sand" || tag === "gravel" || tag === "snow" || tag === "clay"));
  return rightTool ? 1.6 : 0.6;   // faster with the right tool, not instant
}

/**
 * Returns how the current tool affects mining a given block:
 *  - speedMultiplier: multiplied against (1 / seconds). Bigger = faster.
 *  - allowDrop: whether the block should drop when mined with this tool.
 */
export function getMiningEffectFor(
  tool: ToolItemId | null,
  block: BlockId
): { speedMultiplier: number; allowDrop: boolean } {
  const tag = inferTag(block);

  if (!tool) {
    // Bare hands: okay for soft stuff; slow for hard materials/ores.
    const soft = tag === "dirt" || tag === "sand" || tag === "gravel" || tag === "snow" || tag === "clay" || tag === "leaves" || tag === "wood";
    return { speedMultiplier: soft ? 0.5 : 0.18, allowDrop: soft };
  }

  const { tier, kind } = parseTool(tool);
  const tierMul = TIER_SPEED[tier];
  const matchMul = matchMultiplier(kind, tag);
  const speedMultiplier = Math.max(0.05, tierMul * matchMul);

  // Simple drop rules:
  // - Ores/stone/metal need a pickaxe to drop
  // - Others drop regardless
  const needsPick = tag === "ore" || tag === "metal" || tag === "stone";
  const allowDrop = needsPick ? kind === "pickaxe" : true;

  return { speedMultiplier, allowDrop };
>>>>>>> origin/try_implement_recipes
}
