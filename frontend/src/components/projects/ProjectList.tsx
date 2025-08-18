"use client";

import Link from "next/link";
import type { Project } from "@/app/projects/getProjects";

export default function ProjectList({ projects }: { projects: Project[] }) {
  if (!projects.length) {
    return (
      <div className="border rounded-xl p-6 text-center text-gray-600">
        <p>No projects yet (or you’re not logged in).</p>
        <p className="text-sm mt-1">Use the form below to create your first project.</p>
      </div>
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {projects.map((p) => (
        <li key={p.id} className="border rounded-xl p-4 flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <div className="truncate">
              <div className="font-medium truncate">{p.name}</div>
              <div className="text-xs text-gray-500 truncate">{p.slug}</div>
            </div>
            <time className="text-xs text-gray-500" title={new Date(p.created_at).toLocaleString()}>
              {new Date(p.created_at).toLocaleDateString()}
            </time>
          </div>
          {p.description ? (
            <p className="text-sm text-gray-700 line-clamp-3">{p.description}</p>
          ) : (
            <p className="text-sm text-gray-400">— no description —</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href={`/projects/${p.slug}/analyze`} className="inline-block border rounded px-3 py-1 hover:bg-gray-50">
              Analyze
            </Link>
            <Link href={`/projects/${p.slug}/graph`} className="inline-block border rounded px-3 py-1 hover:bg-gray-50">
              Graph
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
