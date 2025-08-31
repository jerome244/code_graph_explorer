import Link from "next/link";
import { cookies } from "next/headers";
import LogoutButton from "../(auth)/LogoutButton";

async function getMe() {
  const access = cookies().get("access")?.value;
  if (!access) return null;
  const r = await fetch(`${process.env.DJANGO_API_BASE}/api/auth/me/`, {
    headers: { Authorization: `Bearer ${access}` },
    cache: "no-store",
  });
  if (!r.ok) return null;
  return r.json();
}

export default async function Nav() {
  const me = await getMe();

  return (
    <header
      style={{
        height: 56,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        borderBottom: "1px solid #e5e7eb",
        backgroundColor: "#ffffff",
        position: "sticky",
        top: 0,
        zIndex: 50,
        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
      }}
    >
      {/* Navigation Links (PUBLIC) */}
      <nav style={{ display: "flex", gap: 24 }}>
        <Link href={me ? "/dashboard" : "/"} style={navLinkStyle}>
          {me ? "Dashboard" : "Home"}
        </Link>

        {/* Public links — no login required */}
        <Link href="/graph" style={navLinkStyle}>
          Graph
        </Link>
        <Link href="/games" style={navLinkStyle}>
          Games
        </Link>
      </nav>

      {/* User Options */}
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        {!me ? (
          <>
            <Link href="/login" style={authLinkStyle}>
              Login
            </Link>
            <Link href="/register" style={authLinkStyle}>
              Register
            </Link>
          </>
        ) : (
          <>
            <span style={userGreetingStyle}>Hi, {me.username}</span>
            <LogoutButton />
          </>
        )}
      </div>
    </header>
  );
}

const navLinkStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 600,
  color: "#4b5563",
  textDecoration: "none",
  transition: "color 0.3s ease",
};

const authLinkStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 500,
  color: "#2563eb",
  textDecoration: "none",
  padding: "6px 12px",
  borderRadius: "4px",
  transition: "background-color 0.3s ease",
};

const userGreetingStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#4b5563",
  fontWeight: 600,
};
