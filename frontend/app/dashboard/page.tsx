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
    <main style={{ maxWidth: 720, margin: "2rem auto" }}>
      <h1>Dashboard</h1>
      {!me ? (
        <>
          {/* If the access token is expired, this will refresh it and trigger a re-render */}
          <RefreshOnMount />
          <p>Loading…</p>
        </>
      ) : (
        <div>
          <p>
            Welcome, <strong>{me.username}</strong> ({me.email || "no email"})
          </p>
          <form action="/api/auth/logout" method="post">
            <button type="submit">Logout</button>
          </form>
        </div>
      )}
    </main>
  );
}
