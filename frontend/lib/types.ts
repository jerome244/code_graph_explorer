export type Project = {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  owner: number;
  owner_username?: string;
  visibility?: "private" | "public";
  created_at: string;
};

export type ProjectAnalysis = {
  id: number;
  name: string;
  summary?: string | null;
  graph?: unknown;
  created_at: string;
};
