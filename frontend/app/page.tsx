// app/page.tsx — server component (protected by middleware)
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import type { CSSProperties } from "react";

type Me = {
  id: number;
  username: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: "USER" | "ADMIN";
};

export default async function HomePage() {
  let me: Me | null = null;
  try {
    me = await apiFetch("/api/users/me/");
  } catch {
    // middleware should redirect unauthenticated users to /login
  }

  let users: Me[] = [];
  if (me?.role === "ADMIN") {
    try {
      users = await apiFetch("/api/users/");
    } catch {
      users = [];
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <h1 style={{ margin: 0 }}>Code Graph Explorer</h1>
        <nav style={{ display: "flex", gap: 12 }}>
          <Link
            href="/graph"
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              textDecoration: "none",
              fontWeight: 600,
            }}
          >
            Go to Graph
          </Link>

          <form action="/api/refresh" method="post">
            <button type="submit">Refresh token</button>
          </form>
          <form action="/api/logout" method="post">
            <button type="submit">Logout</button>
          </form>
        </nav>
      </header>

      {!me ? (
        <section>
          <h2>Not logged in</h2>
          <p>
            You were redirected here without a valid session.{" "}
            <a href="/login">Go to login</a>.
          </p>
        </section>
      ) : (
        <>
          <section
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 16,
              marginBottom: 24,
            }}
          >
            <h2 style={{ marginTop: 0 }}>Welcome, {me.first_name || me.username} 👋</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "160px 1fr",
                rowGap: 8,
              }}
            >
              <div style={{ fontWeight: 600 }}>Username</div>
              <div>{me.username}</div>

              <div style={{ fontWeight: 600 }}>Email</div>
              <div>{me.email || "—"}</div>

              <div style={{ fontWeight: 600 }}>Name</div>
              <div>
                {me.first_name || me.last_name
                  ? `${me.first_name ?? ""} ${me.last_name ?? ""}`.trim()
                  : "—"}
              </div>

              <div style={{ fontWeight: 600 }}>Role</div>
              <div>{me.role}</div>
            </div>
          </section>

          {me.role === "ADMIN" && (
            <section
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: 16,
              }}
            >
              <h3 style={{ marginTop: 0 }}>Admin · Users</h3>
              {users.length === 0 ? (
                <p>No users yet.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      minWidth: 600,
                    }}
                  >
                    <thead>
                      <tr>
                        <th style={th}>ID</th>
                        <th style={th}>Username</th>
                        <th style={th}>Email</th>
                        <th style={th}>Name</th>
                        <th style={th}>Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id}>
                          <td style={td}>{u.id}</td>
                          <td style={td}>{u.username}</td>
                          <td style={td}>{u.email || "—"}</td>
                          <td style={td}>
                            {u.first_name || u.last_name
                              ? `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim()
                              : "—"}
                          </td>
                          <td style={td}>{u.role}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p style={{ marginTop: 12 }}>
                Role updates can be done via the Django endpoint{" "}
                <code>POST /api/users/&lt;id&gt;/set_role/</code>. Want me to add a quick toggle UI?
              </p>
            </section>
          )}
        </>
      )}
    </main>
  );
}

const th: CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #e5e7eb",
  padding: "8px 6px",
  fontWeight: 600,
};

const td: CSSProperties = {
  borderBottom: "1px solid #f3f4f6",
  padding: "8px 6px",
};
