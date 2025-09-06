// frontend/app/profile/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Next 14: cookies() is sync
function apiHeaders(init?: HeadersInit) {
  const access = cookies().get("access")?.value;
  if (!access) redirect("/login?next=/profile");
  const h = new Headers(init);
  h.set("Authorization", `Bearer ${access}`);
  return h;
}

async function apiFetch(path: string, init: RequestInit = {}) {
  return fetch(`${process.env.DJANGO_API_BASE}${path}`, {
    ...init,
    headers: apiHeaders(init.headers),
    cache: "no-store",
  });
}

async function getMe() {
  const r = await apiFetch("/api/auth/me/");
  if (!r.ok) return null;
  return r.json();
}

// ───────────── Social + Messages helpers ─────────────
type SocialInfo = {
  followers_count?: number;
  following_count?: number;
};

async function getSocialCounts(username: string): Promise<SocialInfo | null> {
  const r = await apiFetch(`/api/auth/users/${encodeURIComponent(username)}/`);
  if (!r.ok) return null;
  return r.json();
}

type MsgUser = { id: number; username: string; avatar_url?: string | null };
type Msg = {
  id: number;
  sender: MsgUser;
  recipient: MsgUser;
  body: string;
  created_at: string;
  is_read: boolean;
};

async function getThread(withUsername: string): Promise<Msg[]> {
  const r = await apiFetch(`/api/auth/messages/thread/${encodeURIComponent(withUsername)}/?page_size=50`);
  if (!r.ok) return [];
  const j = await r.json();
  return Array.isArray(j) ? j : (j?.results ?? []);
}

// Server action to send a quick DM
export async function sendQuickMessage(formData: FormData) {
  "use server";
  const to = formData.get("to")?.toString().trim() || "";
  const body = formData.get("body")?.toString().trim() || "";
  if (!to || !body) return { ok: false, error: "Recipient and message are required." };

  const r = await apiFetch("/api/auth/messages/send/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to, body }),
  });

  if (!r.ok) {
    const text = await r.text();
    return { ok: false, error: text || `Send failed (${r.status})` };
  }

  // stay on /profile and keep the convo open
  redirect(`/profile?with=${encodeURIComponent(to)}&sent=1`);
}

// ───────────────── Page ─────────────────
export default async function ProfilePage({
  searchParams,
}: {
  searchParams?: { with?: string | string[]; sent?: string | string[] };
}) {
  const me = await getMe();
  if (!me) redirect("/login?next=/profile");

  const withUser =
    typeof searchParams?.with === "string"
      ? searchParams.with
      : Array.isArray(searchParams?.with)
      ? searchParams.with[0]
      : "";

  const sentFlag =
    typeof searchParams?.sent === "string"
      ? searchParams.sent
      : Array.isArray(searchParams?.sent)
      ? searchParams.sent[0]
      : undefined;

  const social = me?.username ? await getSocialCounts(me.username) : null;
  const thread = withUser ? await getThread(withUser) : [];

  return (
    <main style={{ maxWidth: 880, margin: "32px auto", padding: "0 16px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Your Profile</h1>
        <a
          href="/settings/profile"
          style={{
            marginLeft: "auto",
            textDecoration: "none",
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            background: "#fff",
            color: "#111827",
            fontWeight: 600,
          }}
        >
          Edit profile
        </a>
      </div>
      <p style={{ color: "#6b7280", marginBottom: 24 }}>
        See your social stats and messages. Use “Edit profile” to update your info and avatar.
      </p>

      <div style={{ display: "grid", gap: 24 }}>
        {/* Social */}
        <section style={card}>
          <h2 style={h2}>Social</h2>
          {social ? (
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div><strong>{social.followers_count ?? 0}</strong> followers</div>
              <div><strong>{social.following_count ?? 0}</strong> following</div>
              <a
                href={`/users/${me.username}`}
                style={{ marginLeft: "auto", textDecoration: "none", fontWeight: 600 }}
              >
                View my public profile →
              </a>
            </div>
          ) : (
            <div style={{ color: "#6b7280" }}>Followers data not available.</div>
          )}
        </section>

        {/* Messages */}
        <section style={card}>
          <h2 style={h2}>Messages</h2>
          <form method="GET" action="/profile" style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input
              name="with"
              defaultValue={withUser}
              placeholder="Enter a username to view conversation"
              style={{ ...input, flex: 1 }}
            />
            <button type="submit" style={secondaryBtn}>Open</button>
          </form>

          {withUser ? (
            <>
              {sentFlag && (
                <div style={{ marginBottom: 8, color: "#059669", fontWeight: 600 }}>Message sent ✓</div>
              )}
              <div style={{
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 12,
                maxHeight: 360,
                overflowY: "auto",
                background: "#fff",
                marginBottom: 12,
              }}>
                {thread.length === 0 ? (
                  <div style={{ color: "#6b7280" }}>No messages yet.</div>
                ) : (
                  thread.map((m) => {
                    const mine =
                      (me.username ?? "").toLowerCase() === (m.sender?.username ?? "").toLowerCase();
                    return (
                      <div
                        key={m.id}
                        style={{
                          display: "flex",
                          justifyContent: mine ? "flex-end" : "flex-start",
                          marginBottom: 8,
                        }}
                      >
                        <div
                          style={{
                            maxWidth: "70%",
                            background: mine ? "#4f46e5" : "#f3f4f6",
                            color: mine ? "#fff" : "#111827",
                            padding: "8px 10px",
                            borderRadius: 12,
                          }}
                        >
                          <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 4 }}>
                            {mine ? "You" : "@" + (m.sender?.username ?? "user")}
                            {" · "}
                            {new Date(m.created_at).toLocaleString()}
                          </div>
                          <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Quick reply */}
              <form action={sendQuickMessage} style={{ display: "flex", gap: 8 }}>
                <input type="hidden" name="to" value={withUser} />
                <textarea
                  name="body"
                  rows={2}
                  placeholder={`Message @${withUser}…`}
                  style={{ ...input, flex: 1, resize: "vertical" }}
                />
                <button type="submit" style={primaryBtn}>Send</button>
              </form>
            </>
          ) : (
            <div style={{ color: "#6b7280" }}>Open a conversation to read and reply.</div>
          )}
        </section>
      </div>
    </main>
  );
}

const card: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  padding: 16,
  background: "#fff",
};
const h2: React.CSSProperties = { fontSize: 18, fontWeight: 700, marginBottom: 12 };
const input: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #e5e7eb",
  borderRadius: 8,
  fontSize: 14,
};
const primaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #2563eb",
  background: "#2563eb",
  color: "#fff",
  fontWeight: 600,
  cursor: "pointer",
};
const secondaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: "#fff",
  color: "#111827",
  fontWeight: 600,
  cursor: "pointer",
};
