// /app/projects/page.tsx
import { cookies } from "next/headers";
import ProjectsClient from "./projects-client";

async function getProjects() {
  const access = cookies().get("access")?.value;
  if (!access) return [];
  const r = await fetch(`${process.env.DJANGO_API_BASE}/api/projects/`, {
    headers: { Authorization: `Bearer ${access}` },
    cache: "no-store",
  });
  if (!r.ok) return [];
  return r.json();
}

export default async function ProjectsPage() {
  const projects: any[] = await getProjects();
  return <ProjectsClient initialProjects={projects} />;
}
