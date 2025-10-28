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
}
