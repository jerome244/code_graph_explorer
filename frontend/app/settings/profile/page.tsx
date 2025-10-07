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
async function updateProfile(formData: FormData) {
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

async function uploadAvatar(formData: FormData) {
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

async function deleteAccount(formData: FormData) {
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

// ───────────────── Page ─────────────────
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
    <main style={{ maxWidth: 880, margin: "32px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 8 }}>Edit Profile</h1>
      <p style={{ color: "#6b7280", marginBottom: 24 }}>
        Update your personal information, profile photo, or delete your account.
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
