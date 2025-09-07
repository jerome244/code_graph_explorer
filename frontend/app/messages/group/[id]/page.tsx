// frontend/app/messages/group/[id]/page.tsx
import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import GroupComposer from "./GroupComposer";
import GroupMessageList, { type GroupMsg } from "./GroupMessageList";

type MsgUser = { id: number; username: string; avatar_url?: string | null };
type Group = {
  id: number | string;
  title?: string | null;
  participants: MsgUser[];
  messages?: GroupMsg[];
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

// Map raw/absolute/relative Django media URL to our HTTPS proxy route
function toMediaProxy(raw?: string | null) {
  if (!raw) return "";
  try {
    const base = (process.env.DJANGO_API_BASE || "").replace(/\/$/, "");
    const u = new URL(raw, base);
    const idx = u.pathname.indexOf("/media/");
    if (idx === -1) return raw;
    const pathAfter = u.pathname.slice(idx + "/media/".length);
    const qs = u.search || "";
    return `/api/media/${pathAfter}${qs}`;
  } catch {
    return raw || "";
  }
}

async function getMe() {
  const r = await fetch(`${process.env.DJANGO_API_BASE}/api/auth/me/`, {
    headers: authHeader(),
    cache: "no-store",
  });
  if (!r.ok) redirect(`/login?next=${encodeURIComponent(`/messages`)}`);
  return r.json();
}

async function getGroup(id: string): Promise<Group | null> {
  const r = await fetch(absoluteUrl(`/api/messages/groups/${encodeURIComponent(id)}?page_size=200`), {
    headers: authHeader(),
    cache: "no-store",
  });
  if (!r.ok) return null;
  return r.json();
}

export default async function GroupChatPage({ params }: { params: { id: string } }) {
  const [me, group] = await Promise.all([getMe(), getGroup(params.id)]);

  if (!group) {
    return (
      <main style={{ maxWidth: 880, margin: "32px auto", padding: "0 16px" }}>
        <a href="/messages" style={{ textDecoration: "none", color: "#2563eb" }}>← All conversations</a>
        <div style={{ marginTop: 16, color: '#ef4444', fontWeight: 700 }}>Group not found or server does not support groups.</div>
      </main>
    );
  }

  const title = group.title || `Group #${group.id}`;
  const participants = group.participants || [];

  // proxy avatars (sender avatars come from serializer)
  const meAvatar = toMediaProxy(me?.avatar_url);
  const msgs: GroupMsg[] = (group.messages || []).map(m => ({
    ...m,
    sender: { ...m.sender, avatar_url: toMediaProxy(m.sender?.avatar_url) }
  }));

  return (
    <main style={{ maxWidth: 880, margin: "32px auto", padding: "0 16px" }}>
      <a href="/messages" style={{ textDecoration: "none", color: "#2563eb" }}>← All conversations</a>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, marginBottom: 8 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>{title}</h1>
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          {participants.length} members · {participants.map(p => '@' + p.username).join(', ')}
        </div>
      </div>

      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, maxHeight: 460, overflowY: "auto", background: "#fff", marginBottom: 12 }}>
        <GroupMessageList
          groupId={group.id}
          initialMsgs={msgs}
          meUsername={me.username}
          meAvatar={meAvatar}
        />
      </div>

      <GroupComposer groupId={String(group.id)} />
    </main>
  );
}
