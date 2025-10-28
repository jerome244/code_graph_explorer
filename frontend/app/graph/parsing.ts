// /frontend/app/graph/parsing.ts

// ---- File types + parsing helpers (no React, no 'use client') ----

export const ALLOWED_EXTS = new Set([
  ".c",
  ".h",
  ".py",
  ".html",
  ".css",
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
]);

export const CANDIDATE_RESOLVE_EXTS = ["", ".ts", ".tsx", ".js", ".jsx", ".py", ".css", ".html", ".c", ".h"];

export type TreeNode = {
  name: string;
  path: string;
  isDir: boolean;
  children?: TreeNode[];
  ext?: string;
};

export function extname(p: string) {
  const i = p.lastIndexOf(".");
  if (i <= 0) return "";
  return p.slice(i).toLowerCase();
}

export function dirname(p: string): string {
  const i = p.lastIndexOf("/");
  if (i < 0) return "";
  return p.slice(0, i);
}

export function basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i < 0 ? p : p.slice(i + 1);
}

export function normalize(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

export function resolveRelative(fromFile: string, rel: string) {
  if (!rel.startsWith(".")) return null;
  const baseDir = dirname(fromFile);
  return normalize(baseDir ? `${baseDir}/${rel}` : rel);
}

// ------------------------------ function declaration/call extraction ------------------------------
export type FunctionFacts = {
  declared: string[];
  called: string[];
};

const JS_DECLARATION_RES = [
  /\bfunction\s+([A-Za-z_]\w*)\s*\(/g,
  /\bconst\s+([A-Za-z_]\w*)\s*=\s*async?\s*\(/g,
  /\bconst\s+([A-Za-z_]\w*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
  /\bexport\s+function\s+([A-Za-z_]\w*)\s*\(/g,
  /\blet\s+([A-Za-z_]\w*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
];

const JS_CALL_RE = /\b([A-Za-z_]\w*)\s*\(/g;

const PY_DECL_RE = /^[ \t]*def\s+([A-Za-z_]\w*)\s*\(/gm;
const PY_CALL_RE = /\b([A-Za-z_]\w*)\s*\(/g;

// Heuristic C/C++ (used for .c/.h). We strip comments/strings first.
const C_DEF_RE = /^[ \t]*(?:[_A-Za-z]\w*[\s\*]+)*([A-Za-z_]\w*)\s*\([^;{]*\)\s*\{/gm;   // function definitions
const C_PROTO_RE = /^[ \t]*(?:[_A-Za-z]\w*[\s\*]+)*([A-Za-z_]\w*)\s*\([^;{]*\)\s*;/gm;  // prototypes in headers/same file
const C_CALL_RE = /\b([A-Za-z_]\w*)\s*\(/g;

const RESERVED_WORDS = new Set([
  // shared
  "if","for","while","switch","return","class","def","with","lambda","print","range","int","str","float",
  "async","await","try","catch","except","finally","yield","new","function",
  // C/C
  "sizeof","alignof","_Alignof","__alignof__",
]);

function stripCNoise(src: string): string {
  // Remove block comments, line comments, strings, and char literals.
  return src
    .replace(/\/\*[^]*?\*\//g, m => " ".repeat(m.length))
    .replace(/\/\/[^\n\r]*/g, m => " ".repeat(m.length))
    .replace(/"(?:\\.|[^"\\])*"/g, m => " ".repeat(m.length))
    .replace(/'(?:\\.|[^'\\])'/g, m => " ".repeat(m.length));
}

export function extractFunctionFacts(filename: string, content: string): FunctionFacts {
  const ext = extname(filename);
  const declared: string[] = [];
  const called: string[] = [];

  if (ext === ".py") {
    let m: RegExpExecArray | null;
    while ((m = PY_DECL_RE.exec(content))) declared.push(m[1]);
    while ((m = PY_CALL_RE.exec(content))) {
      const name = m[1];
      if (RESERVED_WORDS.has(name)) continue;
      const prev = content.slice(Math.max(0, m.index - 2), m.index);
      if (prev.includes(".")) continue; // skip obj.method()
      called.push(name);
    }
  } else if (ext === ".js" || ext === ".ts" || ext === ".tsx" || ext === ".jsx") {
    let m: RegExpExecArray | null;
    for (const re of JS_DECLARATION_RES) {
      while ((m = re.exec(content))) declared.push(m[1]);
    }
    while ((m = JS_CALL_RE.exec(content))) {
      const name = m[1];
      if (RESERVED_WORDS.has(name)) continue;
      const prev = content.slice(Math.max(0, m.index - 2), m.index);
      if (prev.includes(".")) continue; // skip obj.method()
      called.push(name);
    }
  } else if (ext === ".html") {
    // HTML class/id usage -> treat as "called"
    let m: RegExpExecArray | null;
    const classAttrRe = /class\s*=\s*["']([^"']+)["']/gi;
    while ((m = classAttrRe.exec(content))) {
      m[1].trim().split(/\s+/).forEach(cls => { if (cls) called.push(cls); });
    }
    const idAttrRe = /id\s*=\s*["']([^"']+)["']/gi;
    while ((m = idAttrRe.exec(content))) {
      const idv = m[1].trim();
      if (idv) called.push(idv);
    }
  } else if (ext === ".css") {
    // CSS declarations
    let m: RegExpExecArray | null;
    const cssClassSelRe = /(^|[^A-Za-z0-9_-])\.([A-Za-z_-][\w-]*)/g;
    while ((m = cssClassSelRe.exec(content))) declared.push(m[2]);
    const cssIdSelRe = /(^|[^A-Za-z0-9_-])#(?![0-9a-fA-F]{3,8}\b)(-?[_A-Za-z][\w-]*)/g;
    while ((m = cssIdSelRe.exec(content))) declared.push(m[2]);
  } else if (ext === ".c" || ext === ".h") {
    const clean = stripCNoise(content);

    // declarations (definitions + prototypes)
    let m: RegExpExecArray | null;
    while ((m = C_DEF_RE.exec(clean))) {
      const name = m[1];
      if (!RESERVED_WORDS.has(name)) declared.push(name);
    }
    while ((m = C_PROTO_RE.exec(clean))) {
      const name = m[1];
      if (!RESERVED_WORDS.has(name)) declared.push(name);
    }

    // calls
    while ((m = C_CALL_RE.exec(clean))) {
      const name = m[1];
      if (RESERVED_WORDS.has(name)) continue;

      // skip likely function-pointer deref patterns: "*name)(" or ")(" right after name
      const next = clean.slice(m.index + name.length, m.index + name.length + 2);
      if (next.startsWith(")(")) continue;

      // crude pre-scan to avoid macro-like keywords after '#'
      const prev2 = clean.slice(Math.max(0, m.index - 2), m.index);
      if (prev2.includes("#")) continue;

      called.push(name);
    }
  }

  return { declared: Array.from(new Set(declared)), called: Array.from(new Set(called)) };
}

// ------------------------------ index + coloring ------------------------------
export type FunctionIndex = {
  [funcName: string]: {
    color: string;
    declaredIn: string[];
    calledIn: string[];
  };
};

function palette(n: number): string[] {
  const base = [
    "#EF4444","#F59E0B","#10B981","#3B82F6","#8B5CF6",
    "#EC4899","#22C55E","#06B6D4","#F97316","#84CC16",
    "#14B8A6","#A855F7","#F43F5E","#EAB308","#0EA5E9",
  ];
  if (n <= base.length) return base.slice(0, n);
  const extra: string[] = [];
  for (let i = 0; i < n - base.length; i++) {
    const h = Math.floor((360 * i) / Math.max(1, n - base.length));
    extra.push(`hsl(${h} 70% 45%)`);
  }
  return base.concat(extra);
}

export function buildFunctionIndex(files: {path:string; content:string}[]) {
  const byFile: Record<string, FunctionFacts> = {};
  const allNames = new Set<string>();
  for (const f of files) {
    const facts = extractFunctionFacts(f.path, f.content);
    byFile[f.path] = facts;
    facts.declared.forEach((n) => allNames.add(n));
    facts.called.forEach((n) => allNames.add(n));
  }

  const names = Array.from(allNames).sort((a,b)=>a.localeCompare(b));
  const colors = palette(names.length);
  const colorMap = new Map(names.map((n, i) => [n, colors[i]]));

  const index: FunctionIndex = {};
  for (const name of names) {
    index[name] = { color: colorMap.get(name)!, declaredIn: [], calledIn: [] };
  }
  for (const [path, facts] of Object.entries(byFile)) {
    for (const n of facts.declared) index[n].declaredIn.push(path);
    for (const n of facts.called) index[n].calledIn.push(path);
  }

  return { byFile, index };
}

// ------------------------------ imports/edges ------------------------------
export function inferEdges(filename: string, content: string): string[] {
  const edges: string[] = [];
  const ext = extname(filename);

  if (ext === ".js" || ext === ".ts" || ext === ".tsx" || ext === ".jsx") {
    const importRe = /import[^'"\n]*from\s*['"]([^'"\n]+)['"]/g;
    const requireRe = /require\(\s*['"]([^'"\n]+)['"]\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(content))) edges.push(m[1]);
    while ((m = requireRe.exec(content))) edges.push(m[1]);
  } else if (ext === ".py") {
    const fromRel = /from\s+(\.+[\w_/]+)\s+import\s+/g;
    let m: RegExpExecArray | null;
    while ((m = fromRel.exec(content))) edges.push(m[1]);
  } else if (ext === ".html") {
    const scriptRe = /<script[^>]*src=["']([^"']+)["'][^>]*>/gi;
    const linkRe = /<link[^>]*href=["']([^"']+)["'][^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = scriptRe.exec(content))) edges.push(m[1]);
    while ((m = linkRe.exec(content))) edges.push(m[1]);
  } else if (ext === ".css") {
    const importRe = /@import\s+["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(content))) edges.push(m[1]);
  } else if (ext === ".c" || ext === ".h") {
    // local includes only: #include "path"
    const incLocal = /^\s*#\s*include\s*"([^"]+)"/gm;
    let m: RegExpExecArray | null;
    while ((m = incLocal.exec(content))) edges.push(m[1]);
  }
  return edges;
}

// ------------------------------ buildTree ------------------------------
export function buildTree(paths: string[]): TreeNode {
  const root: TreeNode = { name: "", path: "", isDir: true, children: [] };
  const map = new Map<string, TreeNode>();
  map.set("", root);

  for (const p of paths) {
    const parts = p.split("/");
    let cur = "";
    let parent = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const curPath = cur ? `${cur}/${part}` : part;
      if (!map.has(curPath)) {
        const node: TreeNode = {
          name: part,
          path: curPath,
          isDir: !isLast,
          children: !isLast ? [] : undefined,
          ext: isLast ? extname(curPath) : undefined,
        };
        (parent.children = parent.children || []).push(node);
        map.set(curPath, node);
      }
      parent = map.get(curPath)!;
      cur = curPath;
    }
  }
  const sortRec = (n: TreeNode) => {
    if (!n.children) return;
    n.children.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name));
    n.children.forEach(sortRec);
  };
  sortRec(root);
  return root;
}
