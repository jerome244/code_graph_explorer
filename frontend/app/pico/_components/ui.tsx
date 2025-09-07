"use client";

import * as React from "react";

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
};

export function PressButton({ busy, children, style, ...rest }: BtnProps) {
  const [pressed, setPressed] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  const disabled = rest.disabled || busy;

  const base: React.CSSProperties = {
    padding: "10px 16px",
    borderRadius: 8,
    border: "1px solid #e5e7eb",
    background: disabled ? "#f3f4f6" : hovered ? "#eef2ff" : "#f1f5f9",
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "transform 120ms ease, background 160ms ease, box-shadow 160ms ease",
    transform: pressed ? "translateY(0.5px) scale(0.985)" : "translateY(0)",
    boxShadow: hovered && !disabled ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    userSelect: "none",
  };

  return (
    <button
      {...rest}
      disabled={disabled}
      style={{ ...base, ...style }}
      onMouseDown={(e) => { setPressed(true); rest.onMouseDown?.(e); }}
      onMouseUp={(e) => { setPressed(false); rest.onMouseUp?.(e); }}
      onMouseLeave={(e) => { setPressed(false); setHovered(false); rest.onMouseLeave?.(e); }}
      onMouseEnter={(e) => { setHovered(true); rest.onMouseEnter?.(e); }}
    >
      {busy && (
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden focusable="false">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.25"/>
          <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" fill="none">
            <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite"/>
          </path>
        </svg>
      )}
      <span>{children}</span>
    </button>
  );
}
