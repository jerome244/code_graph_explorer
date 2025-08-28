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
    <header style={{
      height: 56,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 16px",
      borderBottom: "1px solid #e5e7eb",
      background: "white",
      position: "sticky",
      top: 0,
      zIndex: 50
    }}>
      <nav style={{ display: "flex", gap: 12 }}>
        <Link href="/">Home</Link>
        <Link href="/graph">Graph</Link>
        {me && <Link href="/dashboard">Dashboard</Link>}
      </nav>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        {!me ? (
          <>
            <Link href="/login">Login</Link>
            <Link href="/register">Register</Link>
          </>
        ) : (
          <>
            <span style={{ fontSize: 12, color: "#6b7280" }}>Hi, {me.username}</span>
            <LogoutButton />
          </>
        )}
      </div>
    </header>
  );
}
