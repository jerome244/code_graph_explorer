// frontend/app/profile/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import AvatarPicker from "./AvatarPicker";

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

// Map any raw/absolute/relative Django media URL to our HTTPS proxy route
function toMediaProxy(raw?: string | null) {
  if (!raw) return "";
  try {
    const base = (process.env.DJANGO_API_BASE || "").replace(/\/$/, "");
    const u = new URL(raw, base); // resolves relative -> absolute
    // Expect Django media path like /media/avatars/...
    const idx = u.pathname.indexOf("/media/");
    if (idx === -1) return ""; // not a media URL
    const pathAfter = u.pathname.slice(idx + "/media/".length); // avatars/...
    const qs = u.search || "";
    return `/api/media/${pathAfter}${qs}`;
  } catch {
    return "";
  }
}

// ───────────────── Extras: Social + Messages helpers ─────────────────
type SocialInfo = {
  followers_count?: number;
  following_count?: number;
};

async function getSocialCounts(username: string): Promise<SocialInfo | null> {
  // requires enriched endpoint: GET /api/auth/users/<username>/
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

// ───────────────── Server Actions ─────────────────
export async function updateProfile(formData: FormData) {
  "use server";
  const payload: Record<string, unknown> = {};
  const username = formData.get("username")?.toString().trim();
  const email = formData.get("email")?.toString().trim();
  const bio = formData.get("bio")?.toString();

  if (username) payload.username = username;
  if (email) payload.email = email;
  if (bio !== undefined) payload.bio = bio;

  const r = await apiFetch("/api/auth/me/", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    const text = await r.text();
    return { ok: false, error: text || `Update failed (${r.status})` };
  }

  revalidatePath("/profile");
  return { ok: true };
}

export async function uploadAvatar(formData: FormData) {
  "use server";
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Please choose an image file." };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, error: "Image must be ≤ 5MB." };
  }
  if (file.type && !file.type.startsWith("image/")) {
    return { ok: false, error: "File must be an image." };
  }

  const fd = new FormData();
  fd.set("avatar", file);

  const r = await apiFetch("/api/auth/me/avatar/", { method: "PUT", body: fd });
  if (!r.ok) {
    const text = await r.text();
    return { ok: false, error: text || `Upload failed (${r.status})` };
  }

  // Force a fresh navigation + one-time cache-buster
  redirect("/profile?uploaded=1");
}

export async function deleteAccount(formData: FormData) {
  "use server";
  const confirm = formData.get("confirm")?.toString().trim();
  if (confirm !== "DELETE") return { ok: false, error: "Type DELETE to confirm." };

  const r = await apiFetch("/api/auth/me/", { method: "DELETE" });
  if (!r.ok && r.status !== 204) {
    const text = await r.text();
    return { ok: false, error: text || `Delete failed (${r.status})` };
  }

  cookies().delete("access");
  cookies().delete("refresh");
  redirect("/goodbye");
}

// Send a quick DM from the profile page
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

  // Back to the same page, keeping the conversation in view
  redirect(`/profile?with=${encodeURIComponent(to)}&sent=1`);
}

// ───────────────── Page ─────────────────
export default async function ProfilePage({
  searchParams,
}: {
  searchParams?: { uploaded?: string | string[]; with?: string | string[]; sent?: string | string[] };
}) {
  const me = await getMe();
  if (!me) redirect("/login?next=/profile");

  const uploadedFlag =
    typeof searchParams?.uploaded === "string"
      ? searchParams.uploaded
      : Array.isArray(searchParams?.uploaded)
      ? searchParams.uploaded[0]
      : undefined;

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

  let avatarSrc = toMediaProxy(me.avatar_url);
  if (avatarSrc && uploadedFlag) {
    avatarSrc = `${avatarSrc}${avatarSrc.includes("?") ? "&" : "?"}t=${Date.now()}`;
  }

  // Social counts (if enriched endpoint exists)
  const social = me?.username ? await getSocialCounts(me.username) : null;

  // Optional messages thread with someone (opened via ?with=username)
  const thread = withUser ? await getThread(withUser) : [];

  return (
    <main style={{ maxWidth: 880, margin: "32px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Your Profile</h1>
      <p style={{ color: "#6b7280", marginBottom: 24 }}>
        Update your personal information, profile photo, view your followers, and message other users.
      </p>

      <div style={{ display: "grid", gap: 24 }}>
        {/* Basic Info */}
        <section style={card}>
          <h2 style={h2}>Basic Info</h2>
          <form action={updateProfile}>
            <div style={{ display: "grid", gap: 12 }}>
              <label style={label}>
                <span style={labelTitle}>Username</span>
                <input name="username" defaultValue={me.username ?? ""} style={input} />
              </label>
              <label style={label}>
                <span style={labelTitle}>Email</span>
                <input name="email" type="email" defaultValue={me.email ?? ""} style={input} />
              </label>
              <label style={label}>
                <span style={labelTitle}>Bio</span>
                <textarea
                  name="bio"
                  defaultValue={me.bio ?? ""}
                  rows={4}
                  style={{ ...input, resize: "vertical" }}
                />
              </label>
              <div style={{ display: "flex", gap: 12 }}>
                <button type="submit" style={primaryBtn}>
                  Save changes
                </button>
              </div>
            </div>
          </form>
        </section>

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

        {/* Profile Photo */}
        <section style={card}>
          <h2 style={h2}>Profile Photo</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: "50%",
                overflow: "hidden",
                background: "#f3f4f6",
                border: "1px solid #e5e7eb",
              }}
            >
              {avatarSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarSrc} alt="Avatar" width={80} height={80} />
              ) : (
                <div style={{ width: 80, height: 80 }} />
              )}
            </div>
            <div style={{ color: "#6b7280" }}>PNG or JPG up to 5MB.</div>
          </div>

          <form action={uploadAvatar}>
            <AvatarPicker name="avatar" />
            <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
              <button type="submit" style={secondaryBtn}>
                Upload
              </button>
            </div>
          </form>
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

        {/* Danger Zone */}
        <section style={{ ...card, border: "1px solid #fde68a", background: "#fffbeb" }}>
          <h2 style={{ ...h2, color: "#92400e" }}>Danger Zone</h2>
          <p style={{ color: "#92400e", marginBottom: 12 }}>
            This action is irreversible. Your data will be permanently removed.
          </p>
          <form action={deleteAccount}>
            <label style={label}>
              <span style={labelTitle}>
                Type <code>DELETE</code> to confirm
              </span>
              <input name="confirm" placeholder="DELETE" style={input} />
            </label>
            <button type="submit" style={dangerBtn}>
              Delete my account
            </button>
          </form>
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
const label: React.CSSProperties = { display: "grid", gap: 6 };
const labelTitle: React.CSSProperties = { fontWeight: 600 };
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
const dangerBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid #ef4444",
  background: "#ef4444",
  color: "#fff",
  fontWeight: 700,
  cursor: "pointer",
};
