// frontend/components/LoginForm.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    setLoading(false);
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      setErr(data?.detail || "Login failed");
      return;
    }
    // Tell header & pages to re-check auth immediately
    window.dispatchEvent(new Event("auth:changed"));
    // Refresh server components / data that depend on cookies
    router.refresh();
    // Optional: router.push("/projects");
  };

  return (
    <form onSubmit={onSubmit} className="grid gap-2">
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Username"
        autoComplete="username"
      />
      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        type="password"
        autoComplete="current-password"
      />
      <button className="btn primary" type="submit" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </button>
      {err && <p className="dz-sub" style={{ color: "crimson" }}>{err}</p>}
    </form>
  );
}
