"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false); // New state to control password visibility
  const [showConfirmPassword, setShowConfirmPassword] = useState(false); // New state to control confirm password visibility
  const router = useRouter();

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErr(null);

    if (password !== confirmPassword) {
      setErr("Passwords do not match");
      return;
    }

    const r = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (r.ok) {
      const data = await r.json();
      if (data?.token) {
        document.cookie = `access=${data.token}; path=/`;
        router.replace("/dashboard");
      } else {
        setErr("Unexpected error occurred. Please try again.");
      }
    } else {
      const errorData = await r.json();
      setErr(errorData?.message || "Registration failed");
    }
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
          <label htmlFor="password" style={labelStyle}>Password</label>
          <div style={{ position: "relative" }}>
            <input
              id="password"
              type={showPassword ? "text" : "password"} // Toggle between text and password input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              style={{ ...inputStyle, height: "40px" }} // Adjusted height for better look
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
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
              type={showConfirmPassword ? "text" : "password"} // Toggle between text and password input
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              style={{ ...inputStyle, height: "40px" }} // Adjusted height for better look
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
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

const mainStyle = {
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

const headingStyle = {
  fontSize: "32px",
  fontWeight: 600,
  color: "#333",
  marginBottom: "1rem",
};

const formStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "16px",
  width: "100%",
};

const inputGroupStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "4px",
};

const labelStyle = {
  fontSize: "14px",
  color: "#6b7280",
  fontWeight: 500,
};

const inputStyle = {
  padding: "10px",  // Moderate padding for better spacing
  fontSize: "16px",
  borderRadius: "8px",
  border: "1px solid #d1d5db",
  outline: "none",
  transition: "border-color 0.3s",
  width: "100%",
  backgroundColor: "#f9fafb", // Light background for input fields
  boxSizing: "border-box", // Ensures the input field and button align properly
};

const toggleButtonStyle = {
  position: "absolute",
  top: "50%",
  right: "10px",
  transform: "translateY(-50%)",
  background: "none",
  border: "none",
  color: "#2563eb",
  cursor: "pointer",
  fontSize: "14px",
};

const errorStyle = {
  fontSize: "14px",
  color: "crimson",
  marginTop: "8px",
};

const submitButtonStyle = {
  padding: "12px",
  fontSize: "16px",
  backgroundColor: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  transition: "background-color 0.3s ease, transform 0.2s ease",
};

const loginLinkStyle = {
  marginTop: "16px",
  textAlign: "center",
  fontSize: "14px",
};

const linkStyle = {
  color: "#2563eb",
  textDecoration: "none",
  fontWeight: 600,
};
