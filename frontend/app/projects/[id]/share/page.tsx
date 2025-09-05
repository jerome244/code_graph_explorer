import { cookies } from "next/headers";
import SharePanel from "../../../_components/SharePanel";

async function getProject(id: string) {
  const access = cookies().get("access")?.value;
  if (!access) return null;
  const r = await fetch(`${process.env.DJANGO_API_BASE}/api/projects/${id}/`, { headers: { Authorization: `Bearer ${access}` }, cache: "no-store" });
  if (!r.ok) return null;
  return r.json();
}

export default async function SharePage({ params }: { params: { id: string } }) {
  const p = await getProject(params.id);
  if (!p) return <main style={{ maxWidth: 800, margin: "2rem auto" }}><p>Not found or no access.</p></main>;

  return (
    <main style={{ maxWidth: 800, margin: "2rem auto", padding: "0 16px" }}>
      <h1>Share “{p.name}”</h1>
      <div style={{ marginTop: 12 }}>
        <SharePanel projectId={p.id} />
      </div>
    </main>
  );
}
