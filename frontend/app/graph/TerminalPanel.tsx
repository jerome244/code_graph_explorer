"use client";
import React from "react";

export type LogLine = { type: "out" | "err" | "info"; text: string };

export default function TerminalPanel({
  lines,
  onClear,
}: {
  lines: LogLine[];
  onClear: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        background: "#0b1020",
        color: "white",
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: 12,
        maxHeight: "40vh",
        overflow: "auto",
        borderTop: "1px solid #1f2937",
        zIndex: 60,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "8px 12px",
          borderBottom: "1px solid #1f2937",
        }}
      >
        <strong style={{ opacity: 0.8 }}>Terminal</strong>
        <div style={{ marginLeft: "auto" }}>
          <button
            onClick={onClear}
            style={{
              padding: "4px 8px",
              background: "#111827",
              color: "white",
              border: "1px solid #374151",
              borderRadius: 6,
            }}
          >
            Clear
          </button>
        </div>
      </div>
      <div style={{ padding: 12 }}>
        {lines.length === 0 ? (
          <div style={{ opacity: 0.6 }}>
            No output yet. Press Run to execute the active file.
          </div>
        ) : (
          lines.map((l, i) => (
            <div key={i} style={{ whiteSpace: "pre-wrap" }}>
              <span
                style={{
                  color:
                    l.type === "err"
                      ? "#fca5a5"
                      : l.type === "info"
                      ? "#93c5fd"
                      : "#e5e7eb",
                }}
              >
                {l.text}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
