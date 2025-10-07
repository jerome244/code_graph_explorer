"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState(""); // optional
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const router = useRouter();

  function humanizeErrors(e: any): string {
    if (!e) return "Registration failed";
    if (typeof e === "string") return e;
    if (e.detail) return String(e.detail);
    try {
      const parts: string[] = [];
      Object.entries(e).forEach(([k, v]) => {
        if (Array.isArray(v) && v.length) parts.push(`${k}: ${v[0]}`);
        else if (typeof v === "string") parts.push(`${k}: ${v}`);
      });
      return parts.join(" ") || "Registration failed";
    } catch {
      return "Registration failed";
    }
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr(null);

    const uname = username.trim();
    if (!uname) return setErr("Username is required");
    if (password !== confirmPassword) return setErr("Passwords do not match");
    if (password.length < 8) return setErr("Password must be at least 8 characters");

    // 1) Register (proxy to Django)
    const r = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: uname, email: email.trim() || undefined, password }),
    });

    if (!r.ok) {
      let errorPayload: any;
      try {
        errorPayload = await r.json();
      } catch {
        errorPayload = await r.text();
      }
      return setErr(humanizeErrors(errorPayload));
    }

    // 2) Auto-login so httpOnly cookies are set by the server
    const login = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: uname, password }),
    });

    if (!login.ok) {
      return setErr("Registered successfully, but sign-in failed. Please log in.");
    }

    router.replace("/dashboard");
    router.refresh();
  };

  return (
    <main style={mainStyle}>
      <h1 style={headingStyle}>Register</h1>
      <form onSubmit={onSubmit} style={formStyle}>
        <div style={inputGroupStyle}>
          <label htmlFor="username" style={labelStyle}>Username</label>
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
          <label htmlFor="email" style={labelStyle}>Email (optional)</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            style={inputStyle}
          />
        </div>

        <div style={inputGroupStyle}>
          <label htmlFor="password" style={labelStyle}>Password</label>
          <div style={{ position: "relative" }}>
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              style={{ ...inputStyle, height: 40 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              style={toggleButtonStyle}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <div style={inputGroupStyle}>
          <label htmlFor="confirmPassword" style={labelStyle}>Confirm Password</label>
          <div style={{ position: "relative" }}>
            <input
              id="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              style={{ ...inputStyle, height: 40 }}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((s) => !s)}
              style={toggleButtonStyle}
            >
              {showConfirmPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        {err && <p style={errorStyle}>{err}</p>}
        <button type="submit" style={submitButtonStyle}>Register</button>
      </form>

      <div style={loginLinkStyle}>
        <p>
          Already have an account?{" "}
          <a href="/login" style={linkStyle}>Login here</a>
        </p>
      </div>
    </main>
  );
}

/* ---- styles ---- */
const mainStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  maxWidth: "500px",
  margin: "auto",
  padding: "2rem 1rem",
  backgroundColor: "#ffffff",
  boxShadow: "0 4px 12px rgba(0,0,0,.1)",
  borderRadius: 8,
};

const headingStyle: CSSProperties = {
  fontSize: 32,
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
  fontSize: 14,
  color: "#6b7280",
  fontWeight: 500,
};

const inputStyle: CSSProperties = {
  padding: "10px",
  fontSize: 16,
  borderRadius: 8,
  border: "1px solid #d1d5db",
  outline: "none",
  transition: "border-color .3s",
  width: "100%",
  backgroundColor: "#f9fafb",
  boxSizing: "border-box",
};

const toggleButtonStyle: CSSProperties = {
  position: "absolute",
  top: "50%",
  right: 10,
  transform: "translateY(-50%)",
  background: "none",
  border: "none",
  color: "#2563eb",
  cursor: "pointer",
  fontSize: 14,
};

const errorStyle: CSSProperties = {
  fontSize: 14,
  color: "crimson",
  marginTop: 8,
};

const submitButtonStyle: CSSProperties = {
  padding: 12,
  fontSize: 16,
  backgroundColor: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  transition: "background-color .3s ease, transform .2s ease",
};

const loginLinkStyle: CSSProperties = {
  marginTop: 16,
  textAlign: "center",
  fontSize: 14,
};

const linkStyle: CSSProperties = {
  color: "#2563eb",
  textDecoration: "none",
  fontWeight: 600,
};
