import Link from "next/link";
import { revalidatePath } from "next/cache";
import ProjectList from "@/components/projects/ProjectList";
import { getProjects } from "./getProjects";
import { createProject } from "./actions";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await getProjects();
  return (
    <main className="p-6 max-w-5xl mx-auto space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <form action="/api/auth/logout" method="post">
          <button className="border rounded px-3 py-1">Logout</button>
        </form>
      </header>

      <ProjectList projects={projects} />

      <CreateProjectForm />
    </main>
  );
}

function CreateProjectForm() {
  return (
    <form action={createProject} className="border rounded-xl p-4 space-y-2">
      <h2 className="text-lg font-semibold">Create a project</h2>
      <input className="w-full border rounded p-2" name="name" placeholder="Project name" required />
      <textarea className="w-full border rounded p-2" name="description" placeholder="Description (optional)" rows={3} />
      <button className="bg-black text-white rounded px-3 py-1">Create</button>
    </form>
  );
}
