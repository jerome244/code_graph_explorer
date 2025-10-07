"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { CSSProperties } from "react";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false); // Password visibility state
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
    <main style={mainStyle}>
      <h1 style={headingStyle}>Login</h1>
      <form onSubmit={onSubmit} style={formStyle}>
        <div style={inputGroupStyle}>
          <label htmlFor="username" style={labelStyle}>
            Username
          </label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
            style={inputStyle}
          />
        </div>

        <div style={inputGroupStyle}>
          <label htmlFor="password" style={labelStyle}>
            Password
          </label>
          <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={showHideButtonStyle}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        {err && <p style={errorStyle}>{err}</p>}

        <button type="submit" style={submitButtonStyle}>
          Sign in
        </button>
      </form>

      {/* Registration Link */}
      <p style={{ marginTop: "1rem", fontSize: "14px", color: "#6b7280" }}>
        Don't have an account?{" "}
        <a href="/register" style={{ color: "#2563eb", textDecoration: "none" }}>
          Register here
        </a>
      </p>
    </main>
  );
}

const mainStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  maxWidth: "500px",
  margin: "auto",
  padding: "2rem 1rem",
  backgroundColor: "#ffffff",
  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
  borderRadius: "8px",
};

const headingStyle: CSSProperties = {
  fontSize: "32px",
  fontWeight: 600,
  color: "#333",
  marginBottom: "1rem",
};

const formStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "16px",
  width: "100%",
};

const inputGroupStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
};

const labelStyle: CSSProperties = {
  fontSize: "14px",
  color: "#6b7280",
  fontWeight: 500,
};

const inputStyle: CSSProperties = {
  padding: "10px",
  fontSize: "16px",
  borderRadius: "8px",
  border: "1px solid #d1d5db",
  outline: "none",
  transition: "border-color 0.3s",
  minWidth: "250px",
  maxWidth: "100%",
  width: "auto",
};

const showHideButtonStyle: CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  padding: "0 10px",
  fontSize: "16px",
  position: "absolute",
  right: "10px",
  top: "50%",
  transform: "translateY(-50%)",
};

const errorStyle: CSSProperties = {
  fontSize: "14px",
  color: "crimson",
  marginTop: "8px",
};

const submitButtonStyle: CSSProperties = {
  padding: "12px",
  fontSize: "16px",
  backgroundColor: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  transition: "background-color 0.3s ease, transform 0.2s ease",
};
