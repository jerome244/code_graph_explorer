// frontend/app/messages/[username]/page.tsx
import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import ChatComposer from "./ChatComposer";
import SentToast from "./SentToast";
import MessageList, { Msg } from "./MessageList";

type MsgUser = { id: number; username: string; avatar_url?: string | null };
type PublicUser = { id: number; username: string; avatar_url?: string | null };

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

// Server action to send a reply (keeps redirect so the field resets)
export async function sendReply(formData: FormData) {
  "use server";
  const to = formData.get("to")?.toString().trim() || "";
  const body = formData.get("body")?.toString().trim() || "";
  if (!to || !body) return;

  const meResp = await fetch(`${process.env.DJANGO_API_BASE}/api/auth/me/`, {
    headers: authHeader(),
    cache: "no-store",
  });
  if (meResp.ok) {
    const me = await meResp.json();
    if ((me?.username ?? "").toLowerCase() === to.toLowerCase()) {
      return redirect("/messages");
    }
  }

  await fetch(`${process.env.DJANGO_API_BASE}/api/auth/messages/send/`, {
    method: "POST",
    headers: { ...authHeader(), "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ to, body }),
  });

  // Redirect back with ?sent=1; a client toast will auto-dismiss and clean the URL
  redirect(`/messages/${encodeURIComponent(to)}?sent=1`);
}

export default async function MessagesThreadPage({
  params,
  searchParams,
}: {
  params: { username: string };
  searchParams?: { sent?: string };
}) {
  const me = await getMe();

  // 🚫 prevent opening a thread with yourself
  if ((me.username ?? "").toLowerCase() === params.username.toLowerCase()) {
    redirect("/messages");
  }

  const [msgs, otherUser] = await Promise.all([
    getThread(params.username),
    getOtherUser(params.username),
  ]);

  const meAvatar = toMediaProxy(me?.avatar_url);
  const otherAvatar = toMediaProxy(otherUser?.avatar_url);

  return (
    <main style={{ maxWidth: 880, margin: "32px auto", padding: "0 16px" }}>
      <a href="/messages" style={{ textDecoration: "none", color: "#2563eb" }}>← All conversations</a>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, marginBottom: 8 }}>
        <div
          style={{
            width: 40, height: 40, borderRadius: 999, overflow: "hidden",
            border: "1px solid #e5e7eb", background: "#f3f4f6",
          }}
          aria-hidden
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={otherAvatar || "/api/empty-avatar.png"} alt="" width={40} height={40} />
        </div>
        {/* username → public profile */}
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>
          <Link href={`/users/${encodeURIComponent(params.username)}`} style={{ color: "#111827", textDecoration: "none" }}>
            @{params.username}
          </Link>
        </h1>
      </div>

      {/* Auto-dismissing toast */}
      <SentToast showInitially={searchParams?.sent === "1"} />

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: 12,
          maxHeight: 460,
          overflowY: "auto",
          background: "#fff",
          marginBottom: 12,
        }}
      >
        <MessageList
          initialMsgs={msgs}
          meUsername={me.username}
          meAvatar={meAvatar}
          otherAvatar={otherAvatar}
          otherUsername={params.username}  
        />
      </div>

      <ChatComposer toUsername={params.username} action={sendReply} />
    </main>
  );
}
