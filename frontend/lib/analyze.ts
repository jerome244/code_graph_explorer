// frontend/lib/analyze.ts

const IDENT = "[A-Za-z_][A-Za-z0-9_]*";

export type Lang = "python" | "js" | "ts" | "unknown";

export function extToLang(path: string): Lang {
  const p = path.toLowerCase();
  if (p.endsWith(".py")) return "python";
  if (p.endsWith(".ts") || p.endsWith(".tsx")) return "ts";
  if (p.endsWith(".js") || p.endsWith(".jsx")) return "js";
  return "unknown";
}

/** Deterministic vibrant color per function name. */
export function hashColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 65% 48%)`;
}

type CallSite = { file: string; index: number };

export type ParseResult = {
  declarations: Record<string, Set<string>>;
  calls: Record<string, CallSite[]>;
  fnNames: string[];
};

function parsePython(content: string) {
  const decl = new Set<string>();
  const calls: { name: string; index: number }[] = [];

  const declRe = new RegExp(`(^|\\n)\\s*def\\s+(${IDENT})\\s*\\(`, "g");
  for (let m; (m = declRe.exec(content)); ) decl.add(m[2]);

  const callRe = new RegExp(`(?<![\\.@])\\b(${IDENT})\\s*\\(`, "g");
  for (let m; (m = callRe.exec(content)); ) calls.push({ name: m[1], index: m.index });

  return { decl, calls };
}

function parseTSJS(content: string) {
  const decl = new Set<string>();
  const calls: { name: string; index: number }[] = [];

  const declRes = [
    new RegExp(`(^|\\n)\\s*(export\\s+)?async\\s*function\\s+(${IDENT})\\s*\\(`, "g"),
    new RegExp(`(^|\\n)\\s*(export\\s+)?function\\s+(${IDENT})\\s*\\(`, "g"),
    new RegExp(`(^|\\n)\\s*(export\\s+)?const\\s+(${IDENT})\\s*=\\s*\\(`, "g"),
    new RegExp(`(^|\\n)\\s*(export\\s+)?const\\s+(${IDENT})\\s*=\\s*async\\s*\\(`, "g"),
    new RegExp(`(^|\\n)\\s*(export\\s+)?const\\s+(${IDENT})\\s*=\\s*[^=]*=>`, "g"),
  ];
  for (const re of declRes) for (let m; (m = re.exec(content)); ) decl.add(m[3] ?? m[2]);

  const callRe = new RegExp(`(?<![\\.])\\b(${IDENT})\\s*\\(`, "g");
  for (let m; (m = callRe.exec(content)); ) calls.push({ name: m[1], index: m.index });

  return { decl, calls };
}

export function analyzeFiles(files: Record<string, string>): ParseResult {
  const declarations: Record<string, Set<string>> = {};
  const calls: Record<string, CallSite[]> = {};

  for (const [path, content] of Object.entries(files)) {
    if (!content?.trim()) continue;
    const lang = extToLang(path);

    let res: { decl: Set<string>; calls: { name: string; index: number }[] };
    if (lang === "python") res = parsePython(content);
    else if (lang === "js" || lang === "ts") res = parseTSJS(content);
    else res = { decl: new Set(), calls: [] };

    for (const d of res.decl) {
      (declarations[d] ||= new Set()).add(path);
    }
    for (const c of res.calls) {
      (calls[c.name] ||= []).push({ file: path, index: c.index });
    }
  }

  const fnNames = Array.from(new Set([...Object.keys(declarations), ...Object.keys(calls)]));
  return { declarations, calls, fnNames };
}

/** Highlight occurrences of any function name with its deterministic color,
 *  but SKIP import lines (JS/TS and Python).
 */
export function highlightSource(code: string, fnNames: string[]): string {
  if (!fnNames?.length) return escapeHtml(code);

  const sorted = [...fnNames].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(`\\b(${sorted.map(s => escapeRegex(s)).join("|")})\\b`, "g");

  const lines = code.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();

    // JS/TS import lines
    const isJsImport =
      /^import\s/.test(trimmed) ||
      (/^export\s/.test(trimmed) && /\bfrom\b/.test(trimmed));

    // Python import lines
    const isPyImport =
      /^import\s/.test(trimmed) ||
      (/^from\s.+\simport\s/.test(trimmed));

    if (isJsImport || isPyImport) {
      out.push(escapeHtml(line));
      continue;
    }

    const escaped = escapeHtml(line);
    const replaced = escaped.replace(pattern, (m) => {
      const color = hashColor(m);
      return `<span class="fn-hit" data-fn="${m}" data-color="${color}" style="color:${color};font-weight:600">${m}</span>`;
    });
    out.push(replaced);
  }

  return out.join("\n");
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function escapeHtml(s: string) {
  return s
    .replaceAll(/&/g, "&amp;")
    .replaceAll(/</g, "&lt;")
    .replaceAll(/>/g, "&gt;")
    .replaceAll(/\\"/g, "&quot;");
}
