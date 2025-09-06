import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import BlockToggle from "./BlockToggle";
import FollowToggle from "./FollowToggle";

type PublicUser = {
  id: number;
  username: string;
  avatar_url?: string | null;
  bio?: string | null;
  followers_count?: number;
  following_count?: number;
  is_blocked_by_me?: boolean;
  has_blocked_me?: boolean;
  is_following?: boolean;
};

function authHeader() {
  const access = cookies().get("access")?.value;
  if (!access) redirect(`/login?next=${encodeURIComponent(`/users`)}`);
  return { Authorization: `Bearer ${access}` };
}

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
  if (!r.ok) redirect(`/login?next=${encodeURIComponent(`/users`)}`);
  return r.json();
}

async function getPublicUser(username: string): Promise<PublicUser | null> {
  const r = await fetch(`${process.env.DJANGO_API_BASE}/api/auth/users/${encodeURIComponent(username)}/`, {
    headers: authHeader(),
    cache: "no-store",
  });
  if (!r.ok) return null;
  return r.json();
}

export default async function PublicProfilePage({ params }: { params: { username: string } }) {
  const me = await getMe();
  const user = await getPublicUser(params.username);
  if (!user) {
    return <main style={{ maxWidth: 880, margin: "32px auto", padding: "0 16px" }}><h1>User not found</h1></main>;
  }

  const isMe = (me?.username ?? "").toLowerCase() === (user.username ?? "").toLowerCase();
  const isBlockedByMe = !!user.is_blocked_by_me;
  const hasBlockedMe = !!user.has_blocked_me;
  const isFollowing = !!user.is_following;

  const avatar = toMediaProxy(user.avatar_url);

  return (
    <main style={{ maxWidth: 880, margin: "32px auto", padding: "0 16px" }}>
      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: 999, overflow: "hidden", border: "1px solid #e5e7eb", background: "#f3f4f6" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatar || "/api/empty-avatar.png"} alt="" width={64} height={64} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>@{user.username}</h1>
          <div style={{ color: "#6b7280", fontSize: 14 }}>
            <span>{user.followers_count ?? 0} followers</span>
            {" · "}
            <span>{user.following_count ?? 0} following</span>
          </div>
        </div>

        {!isMe && (
          <div style={{ display: "flex", gap: 8 }}>
            <FollowToggle
              username={user.username}
              isFollowing={isFollowing}
              disabled={isBlockedByMe || hasBlockedMe}
            />
            <BlockToggle
              username={user.username}
              isBlockedByMe={isBlockedByMe}
              hasBlockedMe={hasBlockedMe}
            />
          </div>
        )}
      </div>

      {hasBlockedMe && (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: "#fee2e2", color: "#991b1b", fontWeight: 600 }}>
          You can’t interact with @{user.username} because they have blocked you.
        </div>
      )}

      {isBlockedByMe && !hasBlockedMe && (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: "#f3f4f6", color: "#374151" }}>
          You’ve blocked @{user.username}. Unblock to follow or message.
        </div>
      )}

      {user?.bio && <p style={{ marginTop: 16, whiteSpace: "pre-wrap" }}>{user.bio}</p>}

      {!isMe && (
        <section style={{ marginTop: 16, display: "grid", gap: 12 }}>
          {hasBlockedMe ? (
            <div style={{ color: "#ef4444", fontWeight: 600 }}>Messaging unavailable.</div>
          ) : isBlockedByMe ? (
            <div style={{ color: "#6b7280" }}>Unblock to send a message.</div>
          ) : (
            <Link
              href={`/messages/${encodeURIComponent(user.username)}`}
              style={{
                display: "inline-block",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #4f46e5",
                background: "#4f46e5",
                color: "#fff",
                fontWeight: 700,
                textDecoration: "none",
                width: "fit-content",
              }}
            >
              Message @{user.username}
            </Link>
          )}
        </section>
      )}
    </main>
  );
}
