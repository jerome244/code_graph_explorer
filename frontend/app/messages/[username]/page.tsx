// frontend/app/messages/[username]/page.tsx
import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import ChatComposer from "./ChatComposer";
import MessageList, { Msg } from "./MessageList";
import BlockToggle from "./BlockToggle";

type MsgUser = { id: number; username: string; avatar_url?: string | null };
type PublicUser = {
  id: number;
  username: string;
  avatar_url?: string | null;
  is_blocked_by_me?: boolean;
  has_blocked_me?: boolean;
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

async function getMe() {
  const r = await fetch(`${process.env.DJANGO_API_BASE}/api/auth/me/`, {
    headers: authHeader(),
    cache: "no-store",
  });
  if (!r.ok) redirect(`/login?next=${encodeURIComponent(`/messages`)}`);
  return r.json();
}

async function getOtherUser(username: string): Promise<PublicUser | null> {
  const r = await fetch(`${process.env.DJANGO_API_BASE}/api/auth/users/${encodeURIComponent(username)}/`, {
    headers: authHeader(),
    cache: "no-store",
  });
  if (!r.ok) return null;
  return r.json();
}

async function getThread(withUser: string): Promise<Msg[]> {
  const r = await fetch(
    absoluteUrl(`/api/messages/thread/${encodeURIComponent(withUser)}?page_size=200`),
    { headers: authHeader(), cache: "no-store" }
  );
  if (!r.ok) return [];
  const j = await r.json();
  return Array.isArray(j) ? j : (j?.results ?? []);
}

export default async function MessagesThreadPage({ params }: { params: { username: string } }) {
  const me = await getMe();

  // 🚫 prevent opening a thread with yourself
  if ((me.username ?? "").toLowerCase() === params.username.toLowerCase()) {
    redirect("/messages");
  }

  const [otherUser, msgs] = await Promise.all([
    getOtherUser(params.username),
    getThread(params.username),
  ]);

  const meAvatar = toMediaProxy(me?.avatar_url);
  const otherAvatar = toMediaProxy(otherUser?.avatar_url);

  const blockedByMe = !!otherUser?.is_blocked_by_me;
  const hasBlockedMe = !!otherUser?.has_blocked_me;

  return (
    <main style={{ maxWidth: 880, margin: "32px auto", padding: "0 16px" }}>
      <a href="/messages" style={{ textDecoration: "none", color: "#2563eb" }}>← All conversations</a>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, marginBottom: 8 }}>
        <div
          style={{ width: 40, height: 40, borderRadius: 999, overflow: "hidden", border: "1px solid #e5e7eb", background: "#f3f4f6" }}
          aria-hidden
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={otherAvatar || "/api/empty-avatar.png"} alt="" width={40} height={40} />
        </div>

        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>
          <Link href={`/users/${encodeURIComponent(params.username)}`} style={{ color: "#111827", textDecoration: "none" }}>
            @{params.username}
          </Link>
        </h1>

        <div style={{ marginLeft: "auto" }}>
          <BlockToggle username={params.username} isBlockedByMe={blockedByMe} hasBlockedMe={hasBlockedMe} />
        </div>
      </div>

      <div
        style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, maxHeight: 460, overflowY: "auto", background: "#fff", marginBottom: 12 }}
      >
        {hasBlockedMe ? (
          <div style={{ color: "#ef4444", fontWeight: 600 }}>
            You can’t view this conversation because @{params.username} has blocked you.
          </div>
        ) : blockedByMe ? (
          <div style={{ color: "#6b7280" }}>
            You’ve blocked @{params.username}. Unblock to view and send messages.
          </div>
        ) : (
          <MessageList
            initialMsgs={msgs}
            meUsername={me.username}
            meAvatar={meAvatar}
            otherAvatar={otherAvatar}
            otherUsername={params.username}
          />
        )}
      </div>

      {hasBlockedMe ? (
        <div style={{ color: "#ef4444", fontWeight: 600 }}>
          You can’t message @{params.username} because they have blocked you.
        </div>
      ) : blockedByMe ? (
        <div style={{ color: "#6b7280" }}>
          You’ve blocked @{params.username}. Unblock to send a message.
        </div>
      ) : (
        <ChatComposer toUsername={params.username} />
      )}
    </main>
  );
}
