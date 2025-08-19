import { Project, ProjectAnalysis } from "@/lib/types";

export async function login(username: string, password: string) {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
    credentials: "include",
  });
  if (!res.ok) throw new Error("Login failed");
}

export async function listProjects(): Promise<Project[]> {
  const res = await fetch("/api/projects", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch projects");
  return res.json();
}

export async function getLatestAnalysis(slug: string): Promise<ProjectAnalysis> {
  const res = await fetch(`/api/projects/${slug}/analysis/latest`, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch analysis");
  return res.json();
}
