"use client";

import { useEffect } from "react";
import { BLOCKS } from "../lib/constants";
import type { BlockId } from "../lib/types";
import { ITEM_SPEC, type ItemId } from "../lib/items";
import type { MaybeItem } from "../lib/crafting";

type Props = {
  hotbar: MaybeItem[];                 // length 9
  selectedSlot: number;                // 0..8
  setSelectedSlot: (i: number) => void;
  disabled?: boolean;                  // e.g. when inventory is open or pointer unlocked
};

export default function Hotbar({ hotbar, selectedSlot, setSelectedSlot, disabled }: Props) {
  // number keys 1..9 pick slots 0..8; mouse wheel cycles
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (disabled) return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 9) setSelectedSlot(n - 1);
    };

    const onWheel = (e: WheelEvent) => {
      if (disabled) return;
      let next = selectedSlot + (e.deltaY > 0 ? 1 : -1);
      if (next < 0) next = 8;
      if (next > 8) next = 0;
      setSelectedSlot(next);
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onWheel);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onWheel);
    };
  }, [disabled, selectedSlot, setSelectedSlot]);

  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: 20,
        transform: "translateX(-50%)",
        display: "grid",
        gridTemplateColumns: "repeat(9, 48px)",
        gap: 8,
        padding: 8,
        background: "rgba(17,24,39,0.65)",
        border: "1px solid #1f2937",
        borderRadius: 12,
        backdropFilter: "blur(6px)",
        pointerEvents: "none",
        zIndex: 30,
      }}
    >
      {hotbar.map((cell, i) => {
        const isSelected = i === selectedSlot;

        // Visuals for either a block (number id) or an item/tool (string id)
        let bg = "transparent";
        let label = "";
        let title = "Empty";

        if (cell) {
          const id = cell.id as ItemId;
          if (typeof id === "number") {
            const spec = BLOCKS[id as BlockId];
            bg = spec.color;
            title = `${id} – ${spec.name} ×${cell.count}`;
          } else {
            const spec = ITEM_SPEC[id];
            bg = "#111827";
            label = spec?.short ?? id; // short code or fallback to id
            title = `${spec?.name ?? id} ×${cell.count}`;
          }
        }

        return (
          <div
            key={i}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setSelectedSlot(i);
            }}
            title={title}
            style={{
              width: 48,
              height: 48,
              borderRadius: 8,
              border: isSelected ? "3px solid #2563eb" : "2px solid #1f2937",
              boxShadow: isSelected ? "0 0 0 4px rgba(37,99,235,.2)" : undefined,
              background: bg,
              opacity: bg === "transparent" ? 1 : 1,
              pointerEvents: "auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              userSelect: "none",
              fontFamily: "system-ui, sans-serif",
              fontSize: 12,
              color: "#e5e7eb",
            }}
          >
            {label && <span style={{ opacity: 0.9 }}>{label}</span>}
            {cell && cell.count > 1 && (
              <span
                style={{
                  position: "absolute",
                  right: 6,
                  bottom: 4,
                  fontSize: 11,
                  fontWeight: 700,
                  textShadow: "0 1px 1px rgba(0,0,0,.7)",
                }}
              >
                {cell.count}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
