// frontend/app/settings/profile/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import AvatarPicker from "./AvatarPicker";

// Next 14: cookies() is sync
function apiHeaders(init?: HeadersInit) {
  const access = cookies().get("access")?.value;
  if (!access) redirect("/login?next=/settings/profile");
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
    const idx = u.pathname.indexOf("/media/");
    if (idx === -1) return "";
    const pathAfter = u.pathname.slice(idx + "/media/".length);
    const qs = u.search || "";
    return `/api/media/${pathAfter}${qs}`;
  } catch {
    return "";
  }
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

  revalidatePath("/settings/profile");
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

  redirect("/settings/profile?uploaded=1");
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

/* ───────────────── Theme ───────────────── */
const dark = {
  pageBg: "#0b1020",
  glow: "radial-gradient(1200px 400px at 50% -10%, rgba(124,143,255,0.12), rgba(11,16,32,0))",
  text: "#e6e8ee",
  subText: "rgba(230,232,238,0.75)",
  panelBg: "rgba(255,255,255,0.06)",
  panelBorder: "rgba(255,255,255,0.10)",
  inputBg: "rgba(255,255,255,0.05)",
  inputBorder: "rgba(255,255,255,0.14)",
  headerBg: "rgba(255,255,255,0.08)",
  accent: "#9bb8ff",
  primary: "#2563eb",
  primaryBorder: "#1d4ed8",
  danger: "#ef4444",
  warnBg: "rgba(255, 187, 92, 0.12)",
  warnBorder: "rgba(255, 187, 92, 0.45)",
  warnText: "#ffd28a",
} as const;

/* ───────────────── Shared styles ───────────────── */
const mainStyle: React.CSSProperties = {
  maxWidth: 900,
  margin: "32px auto",
  padding: "0 16px 40px",
  color: dark.text,
  background: dark.glow,
  minHeight: "calc(100vh - 56px)",
};

const h1Style: React.CSSProperties = {
  fontSize: 30,
  fontWeight: 800,
  marginBottom: 8,
  backgroundImage: "linear-gradient(180deg, #fff, rgba(255,255,255,0.72))",
  WebkitBackgroundClip: "text",
  color: "transparent",
  letterSpacing: "-0.01em",
};

const subStyle: React.CSSProperties = {
  color: dark.subText,
  marginBottom: 24,
  lineHeight: 1.6,
};

const card: React.CSSProperties = {
  border: `1px solid ${dark.panelBorder}`,
  borderRadius: 12,
  padding: 16,
  background: dark.panelBg,
  boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
};

const h2: React.CSSProperties = { fontSize: 18, fontWeight: 800, marginBottom: 12, color: dark.text };

const label: React.CSSProperties = { display: "grid", gap: 6 };
const labelTitle: React.CSSProperties = { fontWeight: 700, color: dark.subText };

const input: React.CSSProperties = {
  padding: "10px 12px",
  border: `1px solid ${dark.inputBorder}`,
  borderRadius: 10,
  fontSize: 14,
  background: dark.inputBg,
  color: dark.text,
  outline: "none",
};

const primaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: `1px solid ${dark.primaryBorder}`,
  background: dark.primary,
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: `1px solid ${dark.panelBorder}`,
  background: dark.headerBg,
  color: dark.text,
  fontWeight: 800,
  cursor: "pointer",
};

const dangerBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: `1px solid ${dark.danger}`,
  background: dark.danger,
  color: "#fff",
  fontWeight: 900,
  cursor: "pointer",
};

/* ───────────────── Page ───────────────── */
export default async function SettingsProfilePage({
  searchParams,
}: {
  searchParams?: { uploaded?: string | string[] };
}) {
  const me = await getMe();
  if (!me) redirect("/login?next=/settings/profile");

  const uploadedFlag =
    typeof searchParams?.uploaded === "string"
      ? searchParams.uploaded
      : Array.isArray(searchParams?.uploaded)
      ? searchParams.uploaded[0]
      : undefined;

  let avatarSrc = toMediaProxy(me.avatar_url);
  if (avatarSrc && uploadedFlag) {
    avatarSrc = `${avatarSrc}${avatarSrc.includes("?") ? "&" : "?"}t=${Date.now()}`;
  }

  return (
    <main style={mainStyle}>
      <h1 style={h1Style}>Edit Profile</h1>
      <p style={subStyle}>Update your personal information, profile photo, or delete your account.</p>

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
                background: dark.inputBg,
                border: `1px solid ${dark.inputBorder}`,
              }}
            >
              {avatarSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarSrc} alt="Avatar" width={80} height={80} />
              ) : (
                <div style={{ width: 80, height: 80 }} />
              )}
            </div>
            <div style={{ color: dark.subText }}>PNG or JPG up to 5MB.</div>
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

        {/* Danger Zone */}
        <section
          style={{
            ...card,
            border: `1px solid ${dark.warnBorder}`,
            background: dark.warnBg,
          }}
        >
          <h2 style={{ ...h2, color: dark.warnText }}>Danger Zone</h2>
          <p style={{ color: dark.warnText, marginBottom: 12 }}>
            This action is irreversible. Your data will be permanently removed.
          </p>
          <form action={deleteAccount}>
            <label style={label}>
              <span style={{ ...labelTitle, color: dark.warnText }}>
                Type <code>DELETE</code> to confirm
              </span>
              <input name="confirm" placeholder="DELETE" style={input} />
            </label>
            <button type="submit" style={{ ...dangerBtn, marginTop: 12 }}>
              Delete my account
            </button>
          </form>
        </section>
      </div>

      <style>{`
        :root { background-color: ${dark.pageBg}; }
        a, button { transition: transform 120ms ease, opacity 160ms ease; }
        a:hover, button:hover { transform: translateY(-1px); }
      `}</style>
    </main>
  );
}
