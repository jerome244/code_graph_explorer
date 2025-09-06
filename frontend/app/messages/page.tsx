// frontend/app/messages/page.tsx
import { headers, cookies } from "next/headers";
import Link from "next/link";

type ConvUser = { id: number; username: string; avatar_url?: string | null };
type Conversation = {
  user: ConvUser;
  last_message: { id: number; body: string; created_at: string; from_me: boolean };
  unread_count: number;
};

function absoluteUrl(path: string) {
  const h = headers();
  const base =
    process.env.NEXT_PUBLIC_BASE_URL ||
    `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  return `${base}${path}`;
}

function authHeader() {
  const access = cookies().get("access")?.value;
  return access ? { Authorization: `Bearer ${access}` } : {};
}

async function getConversations(): Promise<Conversation[]> {
  const r = await fetch(absoluteUrl("/api/messages/conversations"), {
    cache: "no-store",
    headers: authHeader(),
  });
  if (!r.ok) return [];
  return r.json();
}

export default async function MessagesPage() {
  const convos = await getConversations();

  return (
    <main style={{ maxWidth: 880, margin: "32px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Messages</h1>
      <p style={{ color: "#6b7280", marginBottom: 16 }}>All your conversations in one place.</p>

      {convos.length === 0 ? (
        <div style={{ color: "#6b7280" }}>No conversations yet.</div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {convos.map((c) => (
            <li key={c.user.id} style={{ border: "1px solid #e5e7eb", borderRadius: 10, background: "#fff" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "40px 1fr auto",
                  alignItems: "center",
                  gap: 12,
                  padding: 12,
                }}
              >
                <div
                  aria-hidden
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 999,
                    background: "#eef2ff",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 800,
                    color: "#4f46e5",
                  }}
                >
                  {c.user.username?.[0]?.toUpperCase() ?? "?"}
                </div>

                <div style={{ overflow: "hidden" }}>
                  {/* username → public profile */}
                  <Link href={`/users/${encodeURIComponent(c.user.username)}`} style={{ fontWeight: 700, color: "#111827" }}>
                    @{c.user.username}
                  </Link>
                  <div style={{ color: "#6b7280", fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.last_message.from_me ? "You: " : ""}
                    {c.last_message.body}
                  </div>
                </div>

                {/* Open thread button */}
                <Link
                  href={`/messages/${encodeURIComponent(c.user.username)}`}
                  aria-label={`Open conversation with @${c.user.username}`}
                  style={{
                    padding: "6px 10px",
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    textDecoration: "none",
                    color: "#111827",
                  }}
                >
                  Open
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
