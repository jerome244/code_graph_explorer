"use client";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  const goToLogin = () => {
    router.push("/login");  // Redirect to login page
  };

  const goToRegister = () => {
    router.push("/register");  // Redirect to register page
  };

  return (
    <main style={mainStyle}>
      <h1 style={headingStyle}>Welcome</h1>
      <p>This is a public homepage. Use the buttons below to Login or Register.</p>
      <div style={{ display: "flex", gap: "16px" }}>
        <button
          onClick={goToLogin}
          style={buttonStyle}
        >
          Login
        </button>
        <button
          onClick={goToRegister}
          style={buttonStyle}
        >
          Register
        </button>
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
  fontSize: "36px",
  fontWeight: 700,
  color: "#333",
  marginBottom: "1rem",
};

const buttonStyle = {
  padding: "12px",
  fontSize: "16px",
  backgroundColor: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  transition: "background-color 0.3s ease, transform 0.2s ease",
};
