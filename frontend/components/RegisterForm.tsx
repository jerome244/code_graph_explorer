"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

function toErrorMessage(x: any, fallback = "Request failed"): string {
  if (!x) return fallback;
  if (typeof x === "string") return x;
  if (typeof x.detail === "string") return x.detail;
  if (typeof x.error === "string") return x.error;
  if (x.error) return toErrorMessage(x.error, fallback);
  if (typeof x === "object") {
    try {
      return Object.entries(x)
        .map(([k, v]) =>
          `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`
        )
        .join("; ");
    } catch {}
  }
  return fallback;
}

export default function RegisterForm() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");          // optional
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload: Record<string, string> = { username, password };
    if (email.trim()) payload.email = email.trim(); // only send if non-empty

    const r = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      setError(toErrorMessage(data, "Registration failed"));
      return;
    }

    // auto login then redirect to home
    const login = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (login.ok) router.push("/");
    else setError("Registered but login failed. Try signing in.");
  }

  return (
    <form onSubmit={onSubmit} className="max-w-sm space-y-3">
      <h2 className="text-xl font-semibold">Register</h2>

      <input
        className="w-full border rounded p-2"
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        required
      />

      <input
        className="w-full border rounded p-2"
        placeholder="Email (optional)"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        // no `required` here
      />

      <input
        className="w-full border rounded p-2"
        placeholder="Password (min 8)"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
      />

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <button className="w-full border rounded p-2" type="submit">
        Create account
      </button>
    </form>
  );
}
