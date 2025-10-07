"use client";

import React, { useEffect, useState } from "react";
import { BLOCKS } from "../lib/constants";
import type { BlockId } from "../lib/types";
import { ITEM_SPEC, type ItemId } from "../lib/items";
import { applyCraftOnce, evaluateCraft, type MaybeItem } from "../lib/crafting";

// Local visual resolver — uses `typeof id === "number"` to detect blocks
function getVisualSpec(id: ItemId) {
  if (typeof id === "number") return BLOCKS[id as BlockId];
  return ITEM_SPEC[id]; // tools / sticks / swords, etc.
}

function Slot({
  item,
  onChange,
  size = 56,
  context = "inventory",
  addToInventory,
}: {
  item: MaybeItem;
  onChange: (next: MaybeItem) => void;
  size?: number;
  context?: "inventory" | "craft" | "hotbar";
  addToInventory?: (id: ItemId, count: number) => void;
}) {
  return (
    <div
      onMouseDown={(e) => {
        e.stopPropagation();

        // Special: return items from craft/hotbar to inventory on right-click when cursor empty
        if (e.button === 2 && (context === "craft" || context === "hotbar") && item) {
          const cursorJson0 = sessionStorage.getItem("__cursor_item__");
          const cursor0: MaybeItem = cursorJson0 ? JSON.parse(cursorJson0) : null;
          if (!cursor0 && addToInventory) {
            addToInventory(item.id as ItemId, item.count);
            onChange(null);
            sessionStorage.setItem("__cursor_item__", JSON.stringify(null));
            e.preventDefault();
            return;
          }
        }

        e.preventDefault();

        const cursorJson = sessionStorage.getItem("__cursor_item__");
        const cursor: MaybeItem = cursorJson ? JSON.parse(cursorJson) : null;
        let nextCursor: MaybeItem = cursor;
        let nextSlot: MaybeItem = item;

        // Left click: pick up / place / swap / merge (cap 64)
        if (e.button === 0) {
          if (!cursor && item) {
            nextCursor = item;
            nextSlot = null;
          } else if (cursor && !item) {
            nextSlot = cursor;
            nextCursor = null;
          } else if (cursor && item) {
            if (cursor.id === item.id) {
              const total = cursor.count + item.count;
              const place = Math.min(total, 64);
              const remain = total - place;
              nextSlot = { id: item.id, count: place };
              nextCursor = remain > 0 ? { id: item.id, count: remain } : null;
            } else {
              // swap
              nextSlot = cursor;
              nextCursor = item;
            }
          }
        }

        // Right click: place one
        if (e.button === 2) {
          if (cursor) {
            if (!item) {
              nextSlot = { id: cursor.id, count: 1 };
              nextCursor = cursor.count > 1 ? { id: cursor.id, count: cursor.count - 1 } : null;
            } else if (item.id === cursor.id && item.count < 64) {
              nextSlot = { id: item.id, count: item.count + 1 };
              nextCursor = cursor.count > 1 ? { id: cursor.id, count: cursor.count - 1 } : null;
            }
          }
        }

        sessionStorage.setItem("__cursor_item__", JSON.stringify(nextCursor));
        onChange(nextSlot);
      }}
      onClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        border: "2px solid #1f2937",
        background: "rgba(0,0,0,.35)",
        position: "relative",
        display: "grid",
        placeItems: "center",
        userSelect: "none",
        boxShadow: "inset 0 2px 10px rgba(0,0,0,.35)",
      }}
    >
      {item && (() => {
        const spec = getVisualSpec(item.id as ItemId);
        const name = (spec as any)?.name ?? String(item.id);
        const color = (spec as any)?.color ?? "#666";
        const transparent = (spec as any)?.transparent ?? false;
        return (
          <div
            title={name}
            style={{
              width: size - 14,
              height: size - 14,
              borderRadius: 6,
              background: color,
              opacity: transparent ? 0.7 : 1,
              outline: "2px solid rgba(255,255,255,.1)",
              boxShadow: "0 2px 8px rgba(0,0,0,.3)",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                right: 6,
                bottom: 4,
                fontSize: 12,
                color: "white",
                textShadow: "0 1px 1px rgba(0,0,0,.8)",
                fontWeight: 700,
              }}
            >
              {item.count}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default function InventoryOverlay({
  open,
  onClose,
  inventory,
  setInventory,
  craft,
  setCraft,
  hotbar,
  setHotbar,
  addToInventory,
}: {
  open: boolean;
  onClose: () => void;
  inventory: MaybeItem[];
  setInventory: (updater: (curr: MaybeItem[]) => MaybeItem[]) => void;
  craft: MaybeItem[]; // 3x3 == 9
  setCraft: (updater: (curr: MaybeItem[]) => MaybeItem[]) => void;
  hotbar: MaybeItem[]; // 9
  setHotbar: (updater: (curr: MaybeItem[]) => MaybeItem[]) => void;
  addToInventory: (id: ItemId, amount: number) => void;
}) {
  const [cursor, setCursor] = useState<MaybeItem>(null);

  useEffect(() => {
    const id = setInterval(() => {
      const c = sessionStorage.getItem("__cursor_item__");
      setCursor(c ? JSON.parse(c) : null);
    }, 30);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      (window as any).lastMouseX = e.clientX;
      (window as any).lastMouseY = e.clientY;
    };
    if (open) window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [open]);

  if (!open) return null;

  const craftEval = evaluateCraft(craft);
  const craftable = !!craftEval.result;

  const applyCraft = () => {
    const { grid, result } = applyCraftOnce(craft);
    setCraft(() => grid);
    if (result) addToInventory(result.id, result.count);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "grid",
        placeItems: "center",
        background: "rgba(0,0,0,.45)",
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        style={{
          width: 940,
          maxWidth: "95vw",
          background: "linear-gradient(180deg, rgba(31,41,55,.92), rgba(17,24,39,.92))",
          border: "1px solid rgba(255,255,255,.08)",
          borderRadius: 16,
          padding: 16,
          color: "white",
          boxShadow: "0 20px 60px rgba(0,0,0,.4)",
        }}
      >
        <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
          {/* Crafting (3x3) */}
          <div style={{ flex: "0 0 auto" }}>
            <div style={{ fontWeight: 700, marginBottom: 8, opacity: 0.9 }}>Crafting</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 56px)",
                gap: 8,
              }}
            >
              {craft.map((it, idx) => (
                <Slot
                  key={idx}
                  context="craft"
                  addToInventory={addToInventory}
                  item={it}
                  onChange={(next) =>
                    setCraft((curr) => {
                      const copy = curr.slice();
                      copy[idx] = next;
                      return copy;
                    })
                  }
                />
              ))}
            </div>
          </div>

          {/* Result & Craft button */}
          <div style={{ flex: "0 0 auto", display: "grid", gap: 8, alignItems: "center" }}>
            <div style={{ fontWeight: 700, opacity: 0.9 }}>Result</div>
            <div style={{ display: "grid", gridTemplateColumns: "56px", gap: 8 }}>
              <Slot
                item={craftEval.result ? { id: craftEval.result.id, count: craftEval.result.count } : null}
                onChange={() => {}}
              />
            </div>
            <button
              disabled={!craftable}
              onClick={applyCraft}
              style={{
                opacity: craftable ? 1 : 0.5,
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,.1)",
                background: craftable ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.06)",
                color: "white",
                cursor: craftable ? "pointer" : "default",
              }}
            >
              Craft
            </button>
          </div>

          {/* Inventory */}
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, marginBottom: 8, opacity: 0.9 }}>Inventory</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(9, 56px)",
                gap: 8,
                justifyContent: "flex-start",
              }}
            >
              {inventory.map((it, idx) => (
                <Slot
                  key={idx}
                  context="inventory"
                  addToInventory={addToInventory}
                  item={it}
                  onChange={(next) =>
                    setInventory((curr) => {
                      const copy = curr.slice();
                      copy[idx] = next;
                      return copy;
                    })
                  }
                />
              ))}
            </div>

            <div style={{ height: 20 }} />

            <div style={{ fontWeight: 700, marginBottom: 8, opacity: 0.9 }}>Hotbar</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(9, 56px)",
                gap: 8,
                justifyContent: "flex-start",
              }}
            >
              {hotbar.map((it, idx) => (
                <Slot
                  key={idx}
                  context="hotbar"
                  addToInventory={addToInventory}
                  item={it}
                  onChange={(next) =>
                    setHotbar((curr) => {
                      const copy = curr.slice();
                      copy[idx] = next;
                      return copy;
                    })
                  }
                />
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
          <button
            onClick={onClose}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,.1)",
              background: "rgba(255,255,255,.06)",
              color: "white",
              cursor: "pointer",
            }}
          >
            Close (I)
          </button>
        </div>
      </div>

      {/* Cursor item visual */}
      {cursor && (
        <div
          style={{
            position: "fixed",
            left: 0,
            top: 0,
            pointerEvents: "none",
            transform: `translate3d(${(window as any).lastMouseX || 0}px, ${
              (window as any).lastMouseY || 0
            }px, 0)`,
            zIndex: 1100,
          }}
        >
          {(() => {
            // Use block visuals if numeric; otherwise a neutral chip
            if (typeof cursor.id === "number") {
              const spec = BLOCKS[cursor.id as BlockId];
              return (
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 8,
                    background: spec?.color ?? "#666",
                    opacity: spec?.transparent ? 0.7 : 1,
                    outline: "2px solid rgba(255,255,255,.15)",
                    boxShadow: "0 2px 8px rgba(0,0,0,.3)",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      right: 4,
                      bottom: 2,
                      fontSize: 12,
                      color: "white",
                      textShadow: "0 1px 1px rgba(0,0,0,.8)",
                      fontWeight: 700,
                    }}
                  >
                    {cursor.count}
                  </div>
                </div>
              );
            }
            // Non-block items (stick/tools): neutral badge
            return (
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 8,
                  background: "#666",
                  outline: "2px solid rgba(255,255,255,.15)",
                  boxShadow: "0 2px 8px rgba(0,0,0,.3)",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    right: 4,
                    bottom: 2,
                    fontSize: 12,
                    color: "white",
                    textShadow: "0 1px 1px rgba(0,0,0,.8)",
                    fontWeight: 700,
                  }}
                >
                  {cursor.count}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
