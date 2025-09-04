"use client";

import { useEffect } from "react";
import { BLOCKS } from "../lib/constants";
import type { BlockId } from "../lib/types";

export default function Hotbar({ selected, setSelected }: { selected: BlockId; setSelected: (n: BlockId) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= 7) setSelected(n as BlockId);
    };
    const onWheel = (e: WheelEvent) => {
      setSelected((prev) => {
        let next = (prev + (e.deltaY > 0 ? 1 : -1)) as BlockId;
        if (next < 1) next = 7;
        if (next > 7) next = 1;
        return next;
      });
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("wheel", onWheel);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wheel", onWheel);
    };
  }, [setSelected]);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        gap: 8,
      }}
    >
      {(Array.from({ length: 7 }) as unknown as BlockId[])
        .map((_, i) => (i + 1) as BlockId)
        .map((id) => (
          <button
            key={id}
            onClick={() => setSelected(id)}
            style={{
              width: 44,
              height: 44,
              borderRadius: 8,
              border: id === selected ? "3px solid #2563eb" : "2px solid #1f2937",
              background: BLOCKS[id].color,
              opacity: BLOCKS[id].transparent ? 0.7 : 1,
              boxShadow: id === selected ? "0 0 0 4px rgba(37,99,235,.2)" : undefined,
              cursor: "pointer",
            }}
            title={`${id} – ${BLOCKS[id].name}`}
          />
        ))}
    </div>
  );
}
