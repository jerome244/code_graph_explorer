// lib/github.ts
export type RepoSpec = { owner: string; repo: string; ref?: string };

export function parseRepoInput(input: string): RepoSpec | null {
  const trimmed = input.trim();
  // Support "owner/repo[@ref]" (e.g. vercel/next.js@canary)
  const simple = /^([\w.-]+)\/([\w.-]+)(?:@([\w./-]+))?$/;
  const m1 = trimmed.match(simple);
  if (m1) return { owner: m1[1], repo: m1[2], ref: m1[3] };

  // Support full URLs like:
  // https://github.com/owner/repo
  // https://github.com/owner/repo/tree/branch
  try {
    const url = new URL(trimmed);
    if (url.hostname !== "github.com") return null;
    const parts = url.pathname.replace(/^\/+/, "").split("/");
    if (parts.length < 2) return null;
    const [owner, repo, maybeTree, ...rest] = parts;
    let ref: string | undefined;
    if (maybeTree === "tree" && rest.length > 0) {
      ref = rest.join("/"); // branch or path-ish; GitHub zipball accepts branch/commit tags
    }
    return { owner, repo, ref };
  } catch {
    return null;
  }
}
