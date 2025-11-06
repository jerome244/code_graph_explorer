"use client";

export default function Crosshair() {
  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
      }}
    >
      <div style={{ width: 2, height: 16, background: "#fff", margin: "-8px auto 0" }} />
      <div style={{ width: 16, height: 2, background: "#fff", margin: "-1px auto" }} />
    </div>
  );
}
