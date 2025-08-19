// app/login/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");

  const params = useSearchParams();
  const justRegistered = params.get("registered") === "1";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await fetch("/api/users/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        window.location.href = "/graph";
      } else {
        const msg = await safeText(res);
        setError(msg || "Login failed");
      }
    } catch (err: any) {
      setError(err?.message || "Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main style={{ padding: 24, maxWidth: 420, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 8 }}>Sign in</h1>

      {justRegistered && (
        <p style={{ color: "#16a34a", marginTop: 0, marginBottom: 12 }}>
          Account created. Please sign in.
        </p>
      )}

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <input
          placeholder="Username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          placeholder="Password"
          required
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p style={{ color: "crimson", margin: 0 }}>{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p style={{ marginTop: 12 }}>
        New here? <Link href="/register">Create an account</Link>
      </p>
      <p style={{ marginTop: 4 }}>
        Or <Link href="/graph">use the Graph without signing in</Link>.
      </p>
      <p style={{ marginTop: 4 }}>
        ← <Link href="/">Back to home</Link>
      </p>
    </main>
  );
}

async function safeText(res: Response) {
  try {
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const j = await res.json();
      return typeof j === "string" ? j : JSON.stringify(j);
    }
    return await res.text();
  } catch {
    return "";
  }
}
