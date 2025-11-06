import Link from "next/link";
import { cookies } from "next/headers";

type UserLite = { id: number; username: string };

const DJ = process.env.DJANGO_API_BASE!;

export default async function UserSearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const q = (searchParams.q ?? "").trim();
  const ck = await cookies();
  const access = ck.get("access")?.value;

  let results: UserLite[] = [];
  if (access && q) {
    const r = await fetch(
      `${DJ}/api/auth/users/search/?q=${encodeURIComponent(q)}`,
      { headers: { Authorization: `Bearer ${access}` }, cache: "no-store" }
    );
    if (r.ok) results = await r.json();
  }

  return (
    <main style={{ maxWidth: 800, margin: "2rem auto", padding: "0 16px" }}>
      <h1 style={{ marginTop: 0 }}>Search users</h1>

      <form action="/search/users" style={{ margin: "12px 0 20px" }}>
        <input
          name="q"
          defaultValue={q}
          placeholder="Search usernames…"
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            fontSize: 14,
          }}
        />
      </form>

      {!q ? (
        <p style={{ color: "#6b7280" }}>Type to search for users.</p>
      ) : !access ? (
        <p style={{ color: "#6b7280" }}>
          You need to be logged in to search users.
        </p>
      ) : results.length === 0 ? (
        <p>No users found for “{q}”.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {results.map((u) => (
            <li
              key={u.id}
              style={{
                border: "1px solid #eee",
                borderRadius: 8,
                padding: 12,
                marginTop: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    background: "#f3f4f6",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 700,
                    color: "#374151",
                  }}
                  aria-hidden
                >
                  {u.username[0]?.toUpperCase()}
                </div>
                <div style={{ fontWeight: 600 }}>{u.username}</div>
              </div>
              <Link
                href={`/users/${encodeURIComponent(u.username)}`}
                style={{
                  border: "1px solid #ddd",
                  padding: "6px 10px",
                  borderRadius: 6,
                  background: "white",
                  textDecoration: "none",
                  fontSize: 14,
                }}
              >
                View profile
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
