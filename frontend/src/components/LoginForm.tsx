"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const [username, setU] = useState("");
  const [password, setP] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (r.ok) router.push("/projects");
    else setErr("Invalid credentials");
  }

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 border rounded-xl p-6">
        <h1 className="text-2xl font-semibold">Login</h1>
        <input className="w-full border rounded p-2" placeholder="Username"
               value={username} onChange={e => setU(e.target.value)} />
        <input className="w-full border rounded p-2" type="password" placeholder="Password"
               value={password} onChange={e => setP(e.target.value)} />
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <button className="w-full bg-black text-white rounded p-2">Sign in</button>
      </form>
    </div>
  );
}
