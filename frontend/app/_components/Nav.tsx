// frontend/app/_components/Nav.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import LogoutButton from "../(auth)/LogoutButton";
import UserSearch from "./UserSearch";

type Me = { id: number; username: string } | null;

function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="lg" x1="6" y1="6" x2="42" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6366F1" />
          <stop offset="1" stopColor="#06B6D4" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="20" stroke="url(#lg)" strokeWidth="2.5" />
      <circle cx="14" cy="16" r="4" fill="#6366F1" />
      <circle cx="34" cy="14" r="4" fill="#06B6D4" />
      <circle cx="36" cy="32" r="4" fill="#22C55E" />
      <circle cx="16" cy="34" r="4" fill="#F59E0B" />
      <path
        d="M18 18 L30 16 M18 18 L18 30 M30 16 L34 28 M18 30 L32 32"
        stroke="url(#lg)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function Nav() {
  const [me, setMe] = useState<Me>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch("/api/auth/me", { cache: "no-store", credentials: "include" });
        if (!alive) return;
        if (r.ok) {
          const u = await r.json();
          setMe({ id: u.id, username: u.username });
        } else {
          setMe(null);
        }
      } catch {
        setMe(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // simple active path highlight
  const pathname = useMemo(() => (typeof window !== "undefined" ? window.location.pathname : "/"), []);

  const navItem = (href: string, label: string) => {
    const active = pathname.startsWith(href);
    return (
      <Link
        href={href}
        style={{
          position: "relative",
          fontSize: 15,
          fontWeight: 600,
          color: active ? "#111827" : "#4b5563",
          textDecoration: "none",
          padding: "8px 4px",
          transition: "color 150ms ease",
        }}
      >
        {label}
        <span
          aria-hidden
          style={{
            content: '""',
            position: "absolute",
            left: 0,
            right: 0,
            bottom: -6,
            height: 2,
            borderRadius: 2,
            background: active ? "linear-gradient(90deg,#6366F1,#06B6D4)" : "transparent",
            transition: "background 150ms ease,width 150ms ease",
          }}
        />
      </Link>
    );
  };

  return (
    <header
      style={{
        height: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 20px",
        position: "sticky",
        top: 0,
        zIndex: 70,
        // pretty background with subtle blur
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "saturate(160%) blur(10px)",
        WebkitBackdropFilter: "saturate(160%) blur(10px)",
        borderBottom: "1px solid #e5e7eb",
        boxShadow: "0 4px 18px rgba(2,6,23,0.06)",
      }}
    >
      {/* Left: brand + nav */}
      <div style={{ display: "flex", alignItems: "center", gap: 18, minWidth: 0 }}>
        <Link
          href={me ? "/dashboard" : "/"}
          aria-label="Home"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
            padding: "6px 6px",
            borderRadius: 10,
          }}
        >
          <Logo />
          <span
            style={{
              fontSize: 16,
              fontWeight: 800,
              letterSpacing: 0.3,
              color: "#0f172a",
              whiteSpace: "nowrap",
            }}
          >
            CodeGraphExplorer
          </span>
        </Link>

        <nav style={{ display: "flex", gap: 16, alignItems: "center", marginLeft: 6 }}>
          {navItem("/graph", "Graph")}
          {navItem("/games", "Games")}
          {navItem("/osint", "OSINT")}
          {navItem("/pico", "Pico")}
          {navItem("/animal-detector", "Animal Detector")}
          {!!me && (
            <>
              {navItem("/messages", "Messages")}
              {navItem("/profile", "Profile")}
            </>
          )}
        </nav>
      </div>

      {/* Right: search + auth */}
      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
        {!!me && <UserSearch />}

        {!loading && !me && (
          <div style={{ display: "flex", gap: 8 }}>
            <Link
              href="/login"
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#1d4ed8",
                textDecoration: "none",
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid #bfdbfe",
                background: "#eff6ff",
              }}
            >
              Login
            </Link>
            <Link
              href="/register"
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#0f172a",
                textDecoration: "none",
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#ffffff",
              }}
            >
              Register
            </Link>
          </div>
        )}

        {!!me && (
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span
              style={{
                fontSize: 13,
                color: "#475569",
                fontWeight: 700,
                padding: "6px 10px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: 999,
              }}
              title={`Signed in as ${me.username}`}
            >
              Hi, {me.username}
            </span>
            <LogoutButton />
          </div>
        )}
      </div>
    </header>
  );
}
