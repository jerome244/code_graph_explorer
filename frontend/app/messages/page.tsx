// frontend/app/messages/page.tsx
import { headers, cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

type PublicUser = { id: number; username: string; avatar_url?: string | null };
type LastMsg = {
  id: number;
  body: string;
  created_at: string;
  from_me?: boolean;
  sender?: PublicUser; // present for groups
};

type DMItem = {
  type: "dm";
  user: PublicUser;
  last_message: LastMsg | null;
  unread_count: number;
};

type GroupMini = { id: number | string; title: string; participants: PublicUser[] };
type GroupItem = {
  type: "group";
  group: GroupMini;
  last_message: LastMsg | null;
  unread_count: number;
};

type Conversation = DMItem | GroupItem;

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

// Map any raw/absolute/relative Django media URL to our HTTPS proxy route
function toMediaProxy(raw?: string | null) {
  if (!raw) return "";
  try {
    const base = (process.env.DJANGO_API_BASE || "").replace(/\/$/, "");
    const u = new URL(raw, base); // resolves relative -> absolute
    const idx = u.pathname.indexOf("/media/");
    if (idx === -1) return raw; // not a media URL; use as-is
    const pathAfter = u.pathname.slice(idx + "/media/".length);
    const qs = u.search || "";
    return `/api/media/${pathAfter}${qs}`;
  } catch {
    return raw || "";
  }
}

async function getConversations(): Promise<Conversation[]> {
  const r = await fetch(absoluteUrl(`/api/messages/conversations?limit=100`), {
    headers: authHeader(),
    cache: "no-store",
  });
  if (!r.ok) return [];
  return r.json();
}

function formatWhen(iso?: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso || "";
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MessagesIndexPage() {
  const items = await getConversations();

  return (
    <main style={{ maxWidth: 880, margin: "32px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, marginBottom: 12 }}>Messages</h1>

      <div style={{ display: "grid", gap: 8 }}>
        {items.length === 0 && (
          <div style={{ color: "#6b7280" }}>No conversations yet.</div>
        )}

        {items.map((it, idx) => {
          const isGroup = it.type === "group";
          const href = isGroup
            ? `/messages/group/${encodeURIComponent((it as GroupItem).group.id)}`
            : `/messages/${encodeURIComponent((it as DMItem).user.username)}`;

          const title = isGroup
            ? ((it as GroupItem).group.title || (it as GroupItem).group.participants.map(p => "@" + p.username).join(", "))
            : "@" + (it as DMItem).user.username;

          const avatar =
            isGroup
              ? "" // you can pick a group avatar if you add one; for now show a circle with member count
              : toMediaProxy((it as DMItem).user.avatar_url);

          const last = it.last_message as LastMsg | null;
          const when = last?.created_at ? formatWhen(last.created_at) : "";
          const preview = last?.body || (isGroup ? "(no messages yet)" : "(no messages yet)");

          const unread = it.unread_count || 0;

          return (
            <Link key={idx} href={href} style={{ textDecoration: "none", color: "inherit" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: 10,
                  background: "#fff",
                }}
              >
                {/* Avatar bubble */}
                <div
                  aria-hidden
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 999,
                    overflow: "hidden",
                    border: "1px solid #e5e7eb",
                    background: isGroup ? "#eef2ff" : "#f3f4f6",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 12,
                    fontWeight: 800,
                    color: "#4f46e5",
                  }}
                >
                  {isGroup ? (it as GroupItem).group.participants.length : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={avatar || "/api/empty-avatar.png"} alt="" width={36} height={36} />
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <div style={{ fontWeight: 800 }}>{title}</div>
                    {when && <div style={{ fontSize: 12, color: "#6b7280" }}>· {when}</div>}
                    {unread > 0 && (
                      <span style={{ marginLeft: "auto", fontSize: 12, background: "#2563eb", color: "#fff", borderRadius: 999, padding: "2px 8px" }}>
                        {unread}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {isGroup && last?.sender ? `@${last.sender.username}: ` : ""}
                    {preview}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
