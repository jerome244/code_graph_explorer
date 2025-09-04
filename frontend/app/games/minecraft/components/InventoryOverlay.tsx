"use client";

import * as React from "react";

type Context = "inventory" | "craft" | "hotbar";

export type Item = {
  id: string;
  count: number;
  icon?: string;
};
type MaybeItem = Item | null;

interface Props {
  craftSlots?: MaybeItem[] | null;
  hotbarSlots?: MaybeItem[] | null;
  inventorySlots?: MaybeItem[] | null;
  addToInventory?: (
    item: Item,
    source: { context: Context; index: number }
  ) => void;
}

const CURSOR_KEY = "__cursor_item__";

export default function InventoryOverlay({
  craftSlots,
  hotbarSlots,
  inventorySlots,
  addToInventory,
}: Props) {
  // Coerce possibly-undefined/null props to arrays
  const craft = React.useMemo(
    () => (Array.isArray(craftSlots) ? craftSlots : []),
    [craftSlots]
  );
  const hotbar = React.useMemo(
    () => (Array.isArray(hotbarSlots) ? hotbarSlots : []),
    [hotbarSlots]
  );
  const inv = React.useMemo(
    () => (Array.isArray(inventorySlots) ? inventorySlots : []),
    [inventorySlots]
  );

  const getCursor = React.useCallback((): MaybeItem => {
    try {
      const raw = sessionStorage.getItem(CURSOR_KEY);
      return raw ? (JSON.parse(raw) as MaybeItem) : null;
    } catch {
      return null;
    }
  }, []);

  // Curried handler captures context + index + item (no free variables)
  const handleMouseDown =
    (ctx: Context, index: number, item: MaybeItem) =>
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 2) return; // right-click only
      if ((ctx === "craft" || ctx === "hotbar") && item) {
        const cursor0 = getCursor();
        if (!cursor0 && addToInventory) {
          addToInventory(item, { context: ctx, index });
          // clear the source slot in parent state after this call
        }
      }
    };

  return (
    <div
      className="inventory-overlay"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Craft */}
      <section className="section">
        <h3>Craft</h3>
        <div className="grid">
          {craft.map((item, i) => (
            <div
              key={`craft-${i}`}
              className="slot"
              onMouseDown={handleMouseDown("craft", i, item)}
            >
              <Slot item={item} />
            </div>
          ))}
        </div>
      </section>

      {/* Hotbar */}
      <section className="section">
        <h3>Hotbar</h3>
        <div className="grid">
          {hotbar.map((item, i) => (
            <div
              key={`hotbar-${i}`}
              className="slot"
              onMouseDown={handleMouseDown("hotbar", i, item)}
            >
              <Slot item={item} />
            </div>
          ))}
        </div>
      </section>

      {/* Inventory */}
      <section className="section">
        <h3>Inventory</h3>
        <div className="grid">
          {inv.map((item, i) => (
            <div
              key={`inv-${i}`}
              className="slot"
              onMouseDown={handleMouseDown("inventory", i, item)}
            >
              <Slot item={item} />
            </div>
          ))}
        </div>
      </section>

      <style jsx>{`
        .grid {
          display: grid;
          grid-template-columns: repeat(9, 48px);
          gap: 8px;
        }
        .slot {
          width: 48px;
          height: 48px;
        }
      `}</style>
    </div>
  );
}

function Slot({ item }: { item: MaybeItem }) {
  return (
    <div className="slot-inner">
      {item ? (
        <>
          {item.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.icon} alt={item.id} className="icon" />
          ) : (
            <div className="placeholder">{item.id}</div>
          )}
          {item.count > 1 && <span className="count">{item.count}</span>}
        </>
      ) : (
        <div className="empty" />
      )}
      <style jsx>{`
        .slot-inner {
          position: relative;
          width: 48px;
          height: 48px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 6px;
          background: rgba(0, 0, 0, 0.25);
          user-select: none;
        }
        .icon {
          width: 36px;
          height: 36px;
          object-fit: contain;
          image-rendering: pixelated;
        }
        .placeholder {
          font-size: 10px;
          opacity: 0.7;
        }
        .count {
          position: absolute;
          right: 4px;
          bottom: 2px;
          font-size: 11px;
          font-weight: 700;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
        }
        .empty {
          width: 24px;
          height: 24px;
          opacity: 0.1;
          border: 1px dashed currentColor;
          border-radius: 4px;
        }
      `}</style>
    </div>
  );
}
