"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (r.ok) {
      router.push("/");
    } else {
      const data = await r.json().catch(() => ({}));
      setError(data?.error?.detail || "Login failed");
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-sm space-y-3">
      <h2 className="text-xl font-semibold">Login</h2>
      <input
        className="w-full border rounded p-2"
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        required
      />
      <input
        className="w-full border rounded p-2"
        placeholder="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button className="w-full border rounded p-2" type="submit">
        Sign in
      </button>
    </form>
  );
}