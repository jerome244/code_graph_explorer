"use client";
import * as React from "react";
import { useRouter } from "next/navigation";

type UserLite = { id: number; username: string };

export default function UserSearch() {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<UserLite[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [active, setActive] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  React.useEffect(() => {
    const s = q.trim();
    if (!s) { setItems([]); setErr(null); setBusy(false); return; }
    setBusy(true); setErr(null);
    const h = setTimeout(async () => {
      try {
        abortRef.current?.abort();
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        const r = await fetch(`/api/auth/users/search/?q=${encodeURIComponent(s)}`, {
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (!r.ok) { setErr(`Search failed (${r.status})`); setItems([]); }
        else { setItems((await r.json()).slice(0, 8)); setOpen(true); setActive(0); }
      } catch (e: any) {
        if (e?.name !== "AbortError") { setErr("Search failed"); setItems([]); }
      } finally { setBusy(false); }
    }, 250);
    return () => clearTimeout(h);
  }, [q]);

  const pick = (u: UserLite) => {
    setOpen(false);
    router.push(`/users/${encodeURIComponent(u.username)}`); // adjust if your user page differs
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % items.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + items.length) % items.length); }
    else if (e.key === "Enter") { e.preventDefault(); pick(items[active]); }
    else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div ref={rootRef} style={{ position: "relative", width: 320 }}>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => q.trim() && setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search users…"
        aria-label="Search users"
        role="combobox"
        aria-expanded={open}
        aria-controls="user-search-listbox"
        style={{
          width: "100%",
          height: 34,
          padding: "6px 12px",
          borderRadius: 6,
          border: "1px solid #e5e7eb",
          fontSize: 14
        }}
      />
      <div style={{ position: "absolute", right: 10, top: 8, fontSize: 12, color: "#6b7280" }}>
        {busy ? "…" : err ? "!" : ""}
      </div>

      {open && (items.length > 0 || err) && (
        <div
          id="user-search-listbox"
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            right: 0,
            maxHeight: 320,
            overflowY: "auto",
            background: "white",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(0,0,0,.08)",
            zIndex: 1000
          }}
        >
          {err && (
            <div style={{ padding: 10, fontSize: 13, color: "#b91c1c", borderBottom: "1px solid #f3f4f6" }}>
              {err}
            </div>
          )}
          {items.map((u, i) => {
            const selected = i === active;
            return (
              <button
                key={u.id}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(u)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "10px 12px",
                  background: selected ? "#f3f4f6" : "white",
                  border: "none",
                  borderTop: "1px solid #f3f4f6",
                  cursor: "pointer",
                  textAlign: "left"
                }}
              >
                <div
                  style={{
                    width: 24, height: 24, borderRadius: 999, background: "#e5e7eb",
                    display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, color: "#374151"
                  }}
                >
                  {u.username[0]?.toUpperCase()}
                </div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{u.username}</div>
              </button>
            );
          })}
          {items.length === 0 && !err && (
            <div style={{ padding: 10, fontSize: 13, color: "#6b7280" }}>No users found</div>
          )}
        </div>
      )}
    </div>
  );
}
