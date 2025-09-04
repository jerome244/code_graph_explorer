
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { BLOCKS } from "../lib/constants";
import type { BlockId } from "../lib/types";

type ItemStack = { id: BlockId; count: number };
type MaybeItem = ItemStack | null;

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
  addToInventory?: (id: BlockId, count: number) => void;
}) {
  return (
    <div
      onMouseDown={(e) => { e.stopPropagation(); }}
      onClick={(e) => { e.stopPropagation(); }}
      onWheel={(e) => { e.stopPropagation(); }}
      onMouseDown={(e) => {
        // Special: return items from craft/hotbar to inventory on right-click when cursor empty
        if (e.button === 2 && (context === "craft" || context === "hotbar") && item) {
          const cursorJson0 = sessionStorage.getItem("__cursor_item__");
          const cursor0: MaybeItem = cursorJson0 ? JSON.parse(cursorJson0) : null;
          if (!cursor0 && addToInventory) {
            addToInventory(item.id as BlockId, item.count);
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

        // Left click: pick up whole stack OR place/swap/merge
        if (e.button === 0) {
          if (!cursor && item) {
            nextCursor = item;
            nextSlot = null;
          } else if (cursor && !item) {
            nextSlot = cursor;
            nextCursor = null;
          } else if (cursor && item) {
            if (cursor.id === item.id) {
              // merge up to 64
              const total = cursor.count + item.count;
              const place = Math.min(total, 64);
              const remain = total - place;
              nextSlot = { id: item.id, count: place as number };
              nextCursor = remain > 0 ? { id: item.id, count: remain as number } : null;
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

        // Persist and paint
        sessionStorage.setItem("__cursor_item__", JSON.stringify(nextCursor));
        onChange(nextSlot);
      }}
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
      {item && (
        <div
          title={BLOCKS[item.id].name}
          style={{
            width: size - 14,
            height: size - 14,
            borderRadius: 6,
            background: BLOCKS[item.id].color,
            opacity: BLOCKS[item.id].transparent ? 0.7 : 1,
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
      )}
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
  inventory: (MaybeItem)[];
  setInventory: (updater: (curr: (MaybeItem)[]) => (MaybeItem)[]) => void;
  craft: (MaybeItem)[]; // 3x3 == 9
  setCraft: (updater: (curr: (MaybeItem)[]) => (MaybeItem)[]) => void;
  hotbar: (MaybeItem)[]; // 9
  setHotbar: (updater: (curr: (MaybeItem)[]) => (MaybeItem)[]) => void;
  addToInventory: (id: BlockId, amount: number) => void;
}) {
  // Render the cursor item following the mouse when open
  const [cursor, setCursor] = useState<MaybeItem>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const c = sessionStorage.getItem("__cursor_item__");
      setCursor(c ? JSON.parse(c) : null);
    }, 30);
    return () => clearInterval(id);
  }, []);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "grid",
        placeItems: "center",
        background: "rgba(0,0,0,.45)",
      }}
      onMouseDown={(e) => {
        // Special: return items from craft/hotbar to inventory on right-click when cursor empty
        if (e.button === 2 && (context === "craft" || context === "hotbar") && item) {
          const cursorJson0 = sessionStorage.getItem("__cursor_item__");
          const cursor0: MaybeItem = cursorJson0 ? JSON.parse(cursorJson0) : null;
          if (!cursor0 && addToInventory) {
            addToInventory(item.id as BlockId, item.count);
            onChange(null);
            sessionStorage.setItem("__cursor_item__", JSON.stringify(null));
            e.preventDefault();
            return;
          }
        }

        // Clicking the dim outside shouldn't close to avoid losing items.
      }}
    >
      <div
        style={{
          width: 900,
          maxWidth: "95vw",
          background: "linear-gradient(180deg, rgba(31,41,55,.92), rgba(17,24,39,.92))",
          border: "1px solid rgba(255,255,255,.08)",
          borderRadius: 16,
          padding: 16,
          color: "white",
          boxShadow: "0 20px 60px rgba(0,0,0,.4)",
        }}
      >
        <div style={{ display: "flex", gap: 16 }}>
          {/* Crafting (3x3) on the left */}
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
                <Slot context="craft" addToInventory={addToInventory}
                  key={idx}
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

          {/* Inventory on the right */}
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
                <Slot context="inventory" addToInventory={addToInventory}
                  key={idx}
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
                <Slot context="hotbar" addToInventory={addToInventory}
                  key={idx}
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
            transform: `translate3d(${(window as any).lastMouseX || 0}px, ${(window as any).lastMouseY || 0}px, 0)`,
            zIndex: 60,
          }}
        >
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 8,
              background: BLOCKS[cursor.id].color,
              opacity: BLOCKS[cursor.id].transparent ? 0.7 : 1,
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
        </div>
      )}
    </div>
  );
}
