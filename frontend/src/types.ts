export type Project = {
  id: number;
  name: string;
  slug: string;
  description: string;
  owner: number | null;
  owner_username?: string;
  created_at: string;
};
