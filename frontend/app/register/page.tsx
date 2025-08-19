// app/register/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/users/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password }),
    });
    if (res.ok) {
      window.location.href = "/login?registered=1";
    } else {
      const msg = await res.text();
      setError(msg || "Registration failed");
    }
  };

  return (
    <main style={{ padding: 24, maxWidth: 420, margin: "0 auto" }}>
      <h1>Create your account</h1>
      <form onSubmit={submit} style={{ display: "grid", gap: 12, marginTop: 12 }}>
        <input
          placeholder="Username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          placeholder="Email (optional)"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          placeholder="Password"
          required
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p style={{ color: "crimson" }}>{error}</p>}
        <button type="submit">Create account</button>
      </form>

      <p style={{ marginTop: 12 }}>
        Already have an account? <Link href="/login">Login</Link>
      </p>
    </main>
  );
}
