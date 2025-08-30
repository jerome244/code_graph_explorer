import { cookies } from "next/headers";
import RefreshOnMount from "../(auth)/RefreshOnMount";

async function getMe() {
  const access = cookies().get("access")?.value;
  if (!access) return null;

  const resp = await fetch(`${process.env.DJANGO_API_BASE}/api/auth/me/`, {
    headers: { Authorization: `Bearer ${access}` },
    cache: "no-store",
  });

  if (!resp.ok) return null;
  return resp.json();
}

export default async function Dashboard() {
  const me = await getMe();

  return (
    <main style={mainStyle}>
      <h1 style={headingStyle}>Dashboard</h1>
      {!me ? (
        <>
          {/* If the access token is expired, this will refresh it and trigger a re-render */}
          <RefreshOnMount />
          <p style={loadingStyle}>Loading…</p>
        </>
      ) : (
        <div style={contentStyle}>
          <p style={userInfoStyle}>
            Welcome, <strong>{me.username}</strong> ({me.email || "no email"})
          </p>
          <form action="/api/auth/logout" method="post" style={logoutFormStyle}>
            <button type="submit" style={logoutButtonStyle}>Logout</button>
          </form>
        </div>
      )}
    </main>
  );
}

const mainStyle = {
  maxWidth: "720px",
  margin: "2rem auto",
  padding: "0 16px",
  backgroundColor: "#fff",
  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
  borderRadius: "8px",
};

const headingStyle = {
  fontSize: "36px",
  fontWeight: 700,
  color: "#333",
  textAlign: "center",
  marginBottom: "16px",
};

const loadingStyle = {
  fontSize: "16px",
  color: "#4b5563",
  textAlign: "center",
};

const contentStyle = {
  padding: "16px",
};

const userInfoStyle = {
  fontSize: "18px",
  color: "#4b5563",
  marginBottom: "20px",
  textAlign: "center",
};

const logoutFormStyle = {
  display: "flex",
  justifyContent: "center",
};

const logoutButtonStyle = {
  fontSize: "16px",
  padding: "10px 20px",
  backgroundColor: "#2563eb",
  color: "#fff",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  transition: "background-color 0.3s, transform 0.2s",
};

