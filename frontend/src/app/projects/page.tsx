import { Project } from "@/types";

export const dynamic = "force-dynamic"; // no cache

async function getProjects(): Promise<Project[]> {
  const r = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/projects`, {
    cache: "no-store",
  });
  if (!r.ok) {
    if (r.status === 401) {
      // not logged in
      return [];
    }
    throw new Error("Failed to load projects");
  }
  return r.json();
}

export default async function ProjectsPage() {
  const projects = await getProjects();

  return (
    <main className="p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <form action="/api/auth/logout" method="post">
          <button className="border rounded px-3 py-1" formAction="/api/auth/logout">Logout</button>
        </form>
      </div>

      {projects.length === 0 ? (
        <p className="text-gray-600">No projects yet (or you’re not logged in).</p>
      ) : (
        <ul className="space-y-2">
          {projects.map(p => (
            <li key={p.id} className="border rounded p-3">
              <div className="font-medium">{p.name}</div>
              <div className="text-sm text-gray-600">{p.slug}</div>
              <p className="text-sm">{p.description}</p>
            </li>
          ))}
        </ul>
      )}

      <CreateProjectForm />
    </main>
  );
}

function CreateProjectForm() {
  async function create(formData: FormData) {
    "use server";
    const name = formData.get("name");
    const description = formData.get("description");
    await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? ""}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
  }

  return (
    <form action={create} className="border rounded p-4 space-y-2">
      <input className="w-full border rounded p-2" name="name" placeholder="New project name" required />
      <textarea className="w-full border rounded p-2" name="description" placeholder="Description" />
      <button className="bg-black text-white rounded px-3 py-1">Create</button>
    </form>
  );
}
