"use client";
import React from "react";

export default function ConnectionStatus({
  connected,
  peers,
}: { connected: boolean; peers: string[] }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 8,
        left: 8,
        padding: "8px 10px",
        borderRadius: 8,
        background: "rgba(0,0,0,0.55)",
        color: "white",
        fontSize: 12,
        lineHeight: 1.2,
        maxWidth: 280,
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6 }}>
        {connected ? "🟢 Connected" : "🔴 Disconnected"}
      </div>
      <div style={{ opacity: 0.85, marginBottom: 4 }}>Peers: {peers.length}</div>
      {peers.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 14 }}>
          {peers.map((id) => (
            <li key={id} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {id}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
