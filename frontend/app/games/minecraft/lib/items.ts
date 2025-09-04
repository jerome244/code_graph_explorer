// app/games/minecraft/lib/items.ts
import type { BlockId } from "./types";
import { BLOCKS } from "./constants";

export type ToolItemId =
  | "stick"
  | "wooden_shovel"
  | "stone_shovel"
  | "wooden_pickaxe"
  | "stone_pickaxe"
  | "wooden_sword"
  | "stone_sword"
  | "wooden_axe"
  | "stone_axe";

// Anything you can have in an inventory slot:
export type ItemId = BlockId | ToolItemId;

export function isBlockId(id: ItemId): id is BlockId {
  return typeof id === "number";
}

// Simple visual spec for non-block items so the Slot can render them.
export const ITEM_SPEC: Record<ToolItemId, { name: string; color: string; transparent?: boolean }> = {
  stick: { name: "Stick", color: "#8b5a2b" },
  wooden_shovel: { name: "Wooden Shovel", color: "#c49a6c" },
  stone_shovel: { name: "Stone Shovel", color: "#888888" },
  wooden_pickaxe: { name: "Wooden Pickaxe", color: "#c49a6c" },
  stone_pickaxe: { name: "Stone Pickaxe", color: "#888888" },
  wooden_sword: { name: "Wooden Sword", color: "#c49a6c" },
  stone_sword: { name: "Stone Sword", color: "#888888" },
  wooden_axe: { name: "Wooden Axe", color: "#c49a6c" },
  stone_axe: { name: "Stone Axe", color: "#888888" },
};

// Helpers to detect “wood” and “stone” *materials* by block name
// (so you don’t need to hardcode numeric BlockIds)
export function isWoodMaterialBlock(id: ItemId) {
  if (!isBlockId(id)) return false;
  const spec = BLOCKS[id];
  if (!spec) return false;
  const name = (spec.name || "").toLowerCase();
  return name.includes("wood") || name.includes("log") || name.includes("plank");
}

export function isStoneMaterialBlock(id: ItemId) {
  if (!isBlockId(id)) return false;
  const spec = BLOCKS[id];
  if (!spec) return false;
  const name = (spec.name || "").toLowerCase();
  return name.includes("stone") || name.includes("cobble");
}
