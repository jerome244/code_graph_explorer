"use client";
import React from "react";
import TerminalPanel from "./TerminalPanel";
import { useTerminalStream } from "./useTerminalStream";

export default function TerminalBar({ projectId }: { projectId: number }) {
  // useSingleSocketPath=false means it will use /ws/projects/:id/terminal/
  const term = useTerminalStream(projectId, /* token? */ undefined, /* useSingleSocketPath */ false);

  return (
    <>
      <div style={{ position: "fixed", right: 12, bottom: "42vh", display: "flex", gap: 8, zIndex: 61 }}>
        <button
          onClick={() => term.run("node -v")}
          style={{ padding: 6, border: "1px solid #374151", borderRadius: 6, background: "#111827", color: "white" }}
        >
          Run
        </button>
        <button
          onClick={() => term.stop()}
          style={{ padding: 6, border: "1px solid #374151", borderRadius: 6, background: "#111827", color: "white" }}
        >
          Stop
        </button>
        <button
          onClick={() => term.clear()}
          style={{ padding: 6, border: "1px solid #374151", borderRadius: 6, background: "#111827", color: "white" }}
        >
          Clear
        </button>
      </div>

      <TerminalPanel lines={term.lines} onClear={() => term.clear()} />
    </>
  );
}
