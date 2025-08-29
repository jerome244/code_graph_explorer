// frontend/app/(auth)/login/page.tsx
"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");

  function safeNext(p?: string | null) {
    return p && p.startsWith("/") && !p.startsWith("//") ? p : "/dashboard";
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr(null);

    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (r.ok) {
      // Navigate then force server components (e.g., Nav) to refetch with new cookies
      router.replace(safeNext(next));
      router.refresh();
    } else {
      setErr(await r.text().catch(() => "Invalid credentials"));
    }
  };

  return (
    <main>
      <h1>Login</h1>
      <form onSubmit={onSubmit}>
        <div>
          <label>Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
          />
        </div>
        <div>
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>
        {err && <p style={{ color: "crimson" }}>{err}</p>}
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
