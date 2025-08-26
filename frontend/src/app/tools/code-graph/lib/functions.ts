// /frontend/src/app/tools/code-graph/lib/functions.ts
// Lightweight cross-file function index + call edges.
// Heuristic regexes for JS, Python, C; HTML/CSS are ignored for function parsing.

import type { ParsedFile } from './types';

export type FnIndex = {
  /** name -> files where declared */
  declsByName: Map<string, Set<string>>;
  /** name -> files where called */
  callsByName: Map<string, Set<string>>;
  /** file -> names (decls or calls) that appear in that file */
  fileToNames: Map<string, Set<string>>;
};

const IDENT = `[A-Za-z_][A-Za-z0-9_]*`;

/** tiny helper for adding to set maps */
function add(map: Map<string, Set<string>>, key: string, value: string) {
  let set = map.get(key);
  if (!set) { set = new Set(); map.set(key, set); }
  set.add(value);
}

/** keep a reverse map of file -> names (for coloring in the code popup) */
function addFileName(fileToNames: Map<string, Set<string>>, file: string, name: string) {
  let set = fileToNames.get(file);
  if (!set) { set = new Set(); fileToNames.set(file, set); }
  set.add(name);
}

/** Remove python import lines so call-finder won't match names in imports */
function stripPythonImports(source: string): string {
  // Single-line imports
  let s = source.replace(/^[ \t]*(?:from[ \t]+\S+[ \t]+import[ \t]+[^\n]+|import[ \t]+[^\n]+)[ \t]*\r?\n/gm, '');
  // Parenthesized multi-line:
  s = s.replace(/^[ \t]*from[ \t]+\S+[ \t]+import[ \t]*\([\s\S]*?\)[ \t]*\r?\n/gm, '');
  return s;
}

/** crude: JS/TS free function declaration name */
const JS_DECL_RE = new RegExp([
  // function foo(...) { ... }
  `(?:^|[;\\s])function[\\s]+(${IDENT})[\\s]*\\(`,
  // const foo = (...) =>  ,  let foo = function (...)
  `|(?:^|[;\\s])(?:const|let|var)[\\s]+(${IDENT})[\\s]*=[\\s]*(?:function|\\([^)\\n]*\\)[\\s]*=>|${IDENT}[\\s]*=>)`,
].join(''), 'gm');

/** crude: C free function declarations: return_type name( ... ) { or ; */
const C_DECL_RE = new RegExp(
  String.raw`(?:^|[\s;])(?:[A-Za-z_][A-Za-z0-9_*\s]+?\s+)?(${IDENT})\s*\([^;{}]*\)\s*(?:\{|;)`,
  'gm'
);

/** crude: Python def name(...): */
const PY_DECL_RE = new RegExp(String.raw`^[ \t]*def[ \t]+(${IDENT})[ \t]*\(`, 'gm');

/** free function call: name(...), avoiding .name( and obj.name( */
const FREE_CALL_RE = new RegExp(String.raw`(^|[^.\w])(${IDENT})[ \t]*\(`, 'g');

/** Reserved words that can look like identifiers in some contexts */
const RESERVED = new Set([
  'if','for','while','switch','return','with','yield','class','def','lambda','except','try','assert','raise',
  'from','import','new','catch','finally','delete','typeof','void','in','of','case','break','continue',
]);

export function buildFunctionIndex(files: ParsedFile[]): FnIndex {
  const declsByName = new Map<string, Set<string>>();
  const callsByName = new Map<string, Set<string>>();
  const fileToNames = new Map<string, Set<string>>();

  for (const f of files) {
    const path = f.path;
    const ext = f.ext;
    const text = f.content;

    // ---- declarations ----
    if (ext === 'js') {
      for (const m of text.matchAll(JS_DECL_RE)) {
        const name = (m[1] || m[2]) as string;
        if (!name || RESERVED.has(name)) continue;
        add(declsByName, name, path);
        addFileName(fileToNames, path, name);
      }
    } else if (ext === 'py') {
      for (const m of text.matchAll(PY_DECL_RE)) {
        const name = m[1] as string;
        if (!name || RESERVED.has(name)) continue;
        add(declsByName, name, path);
        addFileName(fileToNames, path, name);
      }
    } else if (ext === 'c') {
      for (const m of text.matchAll(C_DECL_RE)) {
        const name = m[1] as string;
        if (!name || RESERVED.has(name)) continue;
        add(declsByName, name, path);
        addFileName(fileToNames, path, name);
      }
    }

    // ---- calls ----
    let bodyForCalls = text;
    if (ext === 'py') {
      bodyForCalls = stripPythonImports(text); // remove import lines so we don't count imported names
    }
    for (const m of bodyForCalls.matchAll(FREE_CALL_RE)) {
      const name = m[2] as string;
      if (!name || RESERVED.has(name)) continue;
      // skip obvious language builtins you don't want to draw links for
      if (ext === 'py' && (name === 'print' || name === 'len')) continue;
      add(callsByName, name, path);
      addFileName(fileToNames, path, name);
    }
  }

  return { declsByName, callsByName, fileToNames };
}

// Give each function name a stable hue for coloring
function hashHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return ((h % 360) + 360) % 360;
}

export function buildFnHueMap(fnIndex: FnIndex): Record<string, number> {
  const hues: Record<string, number> = {};
  const all = new Set<string>([
    ...Array.from(fnIndex.declsByName.keys()),
    ...Array.from(fnIndex.callsByName.keys()),
  ]);
  for (const name of all) {
    hues[name] = hashHue(name);
  }
  return hues;
}
