// frontend/app/messages/[username]/page.tsx
import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";

type MsgUser = { id: number; username: string; avatar_url?: string | null };
type Msg = { id: number; sender: MsgUser; recipient: MsgUser; body: string; created_at: string; is_read: boolean };

function absoluteUrl(path: string) {
  const h = headers();
  const base =
    process.env.NEXT_PUBLIC_BASE_URL ||
    `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
  return `${base}${path}`;
}

function authHeader() {
  const access = cookies().get("access")?.value;
  if (!access) redirect(`/login?next=${encodeURIComponent(`/messages`)}`);
  return { Authorization: `Bearer ${access}` };
}

async function getMe() {
  const r = await fetch(`${process.env.DJANGO_API_BASE}/api/auth/me/`, {
    headers: authHeader(),
    cache: "no-store",
  });
  if (!r.ok) redirect(`/login?next=${encodeURIComponent(`/messages`)}`);
  return r.json();
}

async function getThread(withUser: string): Promise<Msg[]> {
  const r = await fetch(absoluteUrl(`/api/messages/thread/${encodeURIComponent(withUser)}?page_size=200`), {
    headers: authHeader(),
    cache: "no-store",
  });
  if (!r.ok) return [];
  const j = await r.json();
  return Array.isArray(j) ? j : (j?.results ?? []);
}

export async function sendReply(formData: FormData) {
  "use server";
  const to = formData.get("to")?.toString().trim() || "";
  const body = formData.get("body")?.toString().trim() || "";
  if (!to || !body) return;

  await fetch(`${process.env.DJANGO_API_BASE}/api/auth/messages/send/`, {
    method: "POST",
    headers: { ...authHeader(), "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ to, body }),
  });

  redirect(`/messages/${encodeURIComponent(to)}?sent=1`);
}

export default async function MessagesThreadPage({ params, searchParams }: { params: { username: string }, searchParams?: { sent?: string } }) {
  const me = await getMe();
  const msgs = await getThread(params.username);

  return (
    <main style={{ maxWidth: 880, margin: "32px auto", padding: "0 16px" }}>
      <a href="/messages" style={{ textDecoration: "none", color: "#2563eb" }}>← All conversations</a>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>@{params.username}</h1>

      {searchParams?.sent && (
        <div style={{ marginBottom: 8, color: "#059669", fontWeight: 600 }}>Message sent ✓</div>
      )}

      <div style={{
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        padding: 12,
        maxHeight: 420,
        overflowY: "auto",
        background: "#fff",
        marginBottom: 12,
      }}>
        {msgs.length === 0 ? (
          <div style={{ color: "#6b7280" }}>No messages yet.</div>
        ) : (
          msgs.map((m) => {
            const mine = (me.username ?? "").toLowerCase() === (m.sender?.username ?? "").toLowerCase();
            return (
              <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", marginBottom: 8 }}>
                <div style={{
                  maxWidth: "70%",
                  background: mine ? "#4f46e5" : "#f3f4f6",
                  color: mine ? "#fff" : "#111827",
                  padding: "8px 10px",
                  borderRadius: 12,
                }}>
                  <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 4 }}>
                    {mine ? "You" : "@" + (m.sender?.username ?? "user")} · {new Date(m.created_at).toLocaleString()}
                  </div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form action={sendReply} style={{ display: "flex", gap: 8 }}>
        <input type="hidden" name="to" value={params.username} />
        <textarea name="body" rows={2} placeholder={`Message @${params.username}…`} style={{
          flex: 1, border: "1px solid #e5e7eb", borderRadius: 8, padding: 10, outline: "none", resize: "vertical"
        }} />
        <button type="submit" style={{
          padding: "10px 14px", borderRadius: 8, border: "1px solid #2563eb", background: "#2563eb",
          color: "#fff", fontWeight: 600, cursor: "pointer",
        }}>Send</button>
      </form>
    </main>
  );
}
