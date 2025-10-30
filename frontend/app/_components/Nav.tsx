"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";                // ⬅️ NEW
import LogoutButton from "../(auth)/LogoutButton";
import UserSearch from "./UserSearch";

type Me = { id: number; username: string } | null;

function Logo({ size = 28 }: { size?: number }) { /* ... keep your logo exactly ... */ }

export default function Nav() {
  const [me, setMe] = useState<Me>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();                              // ⬅️ NEW

  async function fetchMe() {
    try {
      setLoading(true);
      const r = await fetch("/api/auth/me", { cache: "no-store", credentials: "include" });
      if (r.ok) {
        const u = await r.json();
        setMe({ id: u.id, username: u.username });
      } else {
        setMe(null);
      }
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;
    fetchMe();
    // listen for explicit auth-change events (login/logout)
    const onAuthChange = () => { if (alive) fetchMe(); };
    window.addEventListener("cge-auth-change", onAuthChange);
    return () => { alive = false; window.removeEventListener("cge-auth-change", onAuthChange); };
  }, []);

  // Refetch when the URL changes (covers redirects after logout/login)
  useEffect(() => { fetchMe(); }, [pathname]);                 // ⬅️ NEW

  // simple active path highlight (keep your logic)
  const activePath = useMemo(() => pathname || "/", [pathname]);

  const navItem = (href: string, label: string) => {
    const active = activePath.startsWith(href);
    return (
      <Link
        href={href}
        style={{
          position: "relative",
          fontSize: 15,
          fontWeight: 600,
          color: active ? "#e6e8ee" : "rgba(230,232,238,0.65)",
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
        background: "rgba(11,16,32,0.72)",
        backdropFilter: "saturate(160%) blur(10px)",
        WebkitBackdropFilter: "saturate(160%) blur(10px)",
        borderBottom: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 10px 30px rgba(0,0,0,0.30)",
      }}
    >
      {/* Left: brand + nav */}
      <div style={{ display: "flex", alignItems: "center", gap: 18, minWidth: 0 }}>
        <Link href={me ? "/dashboard" : "/"} aria-label="Home" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", padding: "6px 6px", borderRadius: 10 }}>
          <Logo />
          <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: 0.3, backgroundImage: "linear-gradient(180deg, #fff, rgba(255,255,255,0.72))", WebkitBackgroundClip: "text", color: "transparent", whiteSpace: "nowrap" }}>
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

      {/* Right: search + auth (your latest spacing + white chip) */}
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        {!!me && <UserSearch />}

        {!loading && !me && (
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/login" style={{ fontSize: 14, fontWeight: 800, color: "#e6e8ee", textDecoration: "none", padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: "linear-gradient(180deg, #6366F1 0%, #06B6D4 100%)", boxShadow: "0 8px 20px rgba(0,0,0,0.25)" }}>
              Login
            </Link>
            <Link href="/register" style={{ fontSize: 14, fontWeight: 800, color: "#e6e8ee", textDecoration: "none", padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.06)" }}>
              Register
            </Link>
          </div>
        )}

        {!!me && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginLeft: 20 }}>
            <span style={{ fontSize: 13, color: "#ffffff", fontWeight: 800, padding: "6px 10px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 999 }} title={`Signed in as ${me.username}`}>
              Hi, {me.username}
            </span>
            <LogoutButton />
          </div>
        )}
      </div>
    </header>
  );
}
