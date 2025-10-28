// frontend/app/_components/Nav.tsx
import Link from "next/link";
import { cookies } from "next/headers";
import LogoutButton from "../(auth)/LogoutButton";
import UserSearch from "./UserSearch";
//import ThemeToggle from "./ThemeToggle"; // ← 追加（client component)

type Me = { username: string } | null;

async function getMe(): Promise<Me> {
  const cookieStore = await cookies();
  const access = cookieStore.get("access")?.value;
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
<<<<<<< HEAD
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
        gap: 16,
      }}
    >
      {/* Left: navigation links */}
      <nav style={{ display: "flex", gap: 24, alignItems: "center" }}>
        <Link href={me ? "/dashboard" : "/"} style={navLinkStyle}>
          {me ? "Dashboard" : "Home"}
        </Link>
        <Link href="/graph" style={navLinkStyle}>Graph</Link>
        <Link href="/games" style={navLinkStyle}>Games</Link>
        <Link href="/osint" style={navLinkStyle}>OSINT</Link>
        <Link href="/pico" style={navLinkStyle}>Pico</Link>
        <Link href="/animal-detector" style={navLinkStyle}>Animal Detector</Link>
        
        {me && (
          <>
            <Link href="/messages" style={navLinkStyle}>Messages</Link>
            <Link href="/profile" style={navLinkStyle}>Profile</Link>
          </>
        )}
      </nav>
=======
    <div className="nav-wrap">
      <header className="nav">
        <div className="nav__inner container" style={{ paddingInline: 12 }}>
          {/* Left: navigation links（元の並びを維持） */}
          <nav className="nav__links" aria-label="Primary">
            <Link href={me ? "/dashboard" : "/"} className="nav__link">
              {me ? "Dashboard" : "Home"}
            </Link>
            <Link href="/graph" className="nav__link">Graph</Link>
            <Link href="/games" className="nav__link">Games</Link>
            <Link href="/osint" className="nav__link">OSINT</Link>
            <Link href="/pico" className="nav__link">Pico</Link>
            {me && (
              <>
                <Link href="/messages" className="nav__link">Messages</Link>
                <Link href="/profile" className="nav__link">Profile</Link>
              </>
            )}
          </nav>

          {/* Right: search + theme + auth/user actions（機能は現状維持） */}
          <div className="nav__actions">
            {/* テーマ切替（light/dark） */}
>>>>>>> landing

            {me && <UserSearch />}

            {!me ? (
              <>
                <Link href="/login" className="btn btn--ghost">Login</Link>
                <Link href="/register" className="btn btn--primary">Register</Link>
              </>
            ) : (
              <>
                <span className="nav__greet">Hi, {me.username}</span>
                <LogoutButton />
              </>
            )}
          </div>
        </div>
      </header>
    </div>
  );
}