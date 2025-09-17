// app/page.tsx  (SERVER COMPONENT — no "use client")
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function Home() {
  const access = cookies().get("access")?.value;
  if (access) {
    redirect("/dashboard");
  }

  return (
    <main style={mainStyle}>
      <h1 style={headingStyle}>Welcome</h1>
      <p>Use the buttons below to Login or Register.</p>

      <div style={{ display: "flex", gap: "16px" }}>
        <a href="/login" style={buttonStyle}>Login</a>
        <a href="/register" style={buttonStyle}>Register</a>
      </div>
    </main>
  );
}

const mainStyle = {
  display: "flex",
  flexDirection: "column" as const,
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
  fontSize: "36px",
  fontWeight: 700,
  color: "#333",
  marginBottom: "1rem",
};

const buttonStyle = {
  display: "inline-block",
  padding: "12px",
  fontSize: "16px",
  backgroundColor: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: "8px",
  textDecoration: "none",
  cursor: "pointer",
  transition: "background-color 0.3s ease, transform 0.2s ease",
} as const;