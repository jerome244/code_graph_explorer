// frontend/app/_components/Nav.tsx
import Link from "next/link";
import { cookies } from "next/headers";
import LogoutButton from "../(auth)/LogoutButton";
import UserSearch from "./UserSearch";

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
    <div className="nav-wrap">
      <header className="nav">
        <div className="nav__inner container" style={{ paddingInline: 12 }}>
          {/* Left: navigation links */}
          <nav className="nav__links" aria-label="Primary">
            <Link href={me ? "/dashboard" : "/"} className="nav__link">
              {me ? "Dashboard" : "Home"}
            </Link>
            <Link href="/graph" className="nav__link">Graph</Link>
            <Link href="/games" className="nav__link">Games</Link>
            <Link href="/osint" className="nav__link">OSINT</Link>
            <Link href="/pico" className="nav__link">Pico</Link>
            <Link href="/animal-detector" className="nav__link">Animal Detector</Link>
            {me && (
              <>
                <Link href="/messages" className="nav__link">Messages</Link>
                <Link href="/profile" className="nav__link">Profile</Link>
              </>
            )}
          </nav>

          {/* Right: search + auth/user actions */}
          <div className="nav__actions">
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
