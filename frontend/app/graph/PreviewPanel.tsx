"use client";
import React from "react";

export default function PreviewPanel({
  html,
  onClose,
}: { html: string | null; onClose: () => void }) {
  if (html == null) return null;
  return (
    <div style={{
      position: "fixed", left: 0, right: 0, bottom: 0, height: "40vh",
      background: "#0b1020", borderTop: "1px solid #1f2937", zIndex: 59, display: "flex", flexDirection: "column",
    }}>
      <div style={{ display: "flex", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid #1f2937", color: "white" }}>
        <strong style={{ opacity: 0.8 }}>Preview</strong>
        <div style={{ marginLeft: "auto" }}>
          <button onClick={onClose} style={{ padding: "4px 8px", background: "#111827", color: "white", border: "1px solid #374151", borderRadius: 6 }}>
            Close
          </button>
        </div>
      </div>
      <iframe
        title="Preview"
        style={{ flex: 1, border: 0, background: "white" }}
        srcDoc={html}
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}
