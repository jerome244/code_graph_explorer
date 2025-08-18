export type Project = {
  id: number;
  name: string;
  slug: string;
  description: string;
  owner: number | null;
  owner_username?: string;
  created_at: string;
};

export async function getProjects(): Promise<Project[]> {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "";
  const r = await fetch(`${base}/api/projects`, { cache: "no-store" });
  if (!r.ok) return []; // 401/500 -> empty list in UI
  return r.json();
}
