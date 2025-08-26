// /frontend/src/app/tools/code-graph/lib/functions.ts
// Two-domain cross-file index (functions + styles), with a robust two-pass call finder
// that matches only calls to known declared functions.
//
// Domains:
// 1) functions (code): JS/TS, Python, C
//    - decls: function names
//    - calls: occurrences of those names in "name(" form (ignores imports in Py)
// 2) styles: CSS ↔ HTML
//    - CSS decls: .class / #id in selector lists
//    - HTML calls: class="..." names, id="..." names
//
// fileToNames is the union (for highlighting inside CodePopup).

import type { ParsedFile } from './types';

export type NameMap = Map<string, Set<string>>;

export type FnIndex = {
  fn: { declsByName: NameMap; callsByName: NameMap };
  style: { declsByName: NameMap; callsByName: NameMap };
  fileToNames: Map<string, Set<string>>;
};

const IDENT = `[A-Za-z_][A-Za-z0-9_]*`;

// ---------- small helpers ----------
function add(map: NameMap, key: string, value: string) {
  let set = map.get(key);
  if (!set) { set = new Set(); map.set(key, set); }
  set.add(value);
}
function addFileName(fileToNames: Map<string, Set<string>>, file: string, name: string) {
  let set = fileToNames.get(file);
  if (!set) { set = new Set(); fileToNames.set(file, set); }
  set.add(name);
}
function escRe(s: string) {
  return s.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}
function extFromPath(path: string): string {
  const m = path.match(/\.([A-Za-z0-9]+)$/);
  return m ? m[1] : '';
}
function normExt(ext: string, path: string, content: string): string {
  let e = (ext || '').toLowerCase();
  if (!e) e = (extFromPath(path) || '').toLowerCase();
  if (['js','mjs','cjs','jsx','ts','tsx'].includes(e)) return 'js';
  if (e === 'py') return 'py';
  if (['c','h'].includes(e)) return 'c';
  if (e === 'css') return 'css';
  if (['html','htm'].includes(e)) return 'html';

  // Heuristics if extension is missing/odd
  if (/^#!.*\bpython[0-9.]*\b/m.test(content) || /^\s*def\s+[A-Za-z_]\w*\s*\(/m.test(content)) return 'py';
  if (/<\/?(?:html|head|body|div|span|script|link|meta)\b/i.test(content)) return 'html';
  if (/\bfunction\s+[A-Za-z_]\w*\s*\(|\bconst\s+[A-Za-z_]\w*\s*=\s*\(/m.test(content)) return 'js';
  if (/\.[A-Za-z_][\w-]*\s*[^{}]*\{/.test(content)) return 'css';
  return e || 'other';
}

// Python: remove import lines so calls finder won’t match them
function stripPythonImports(source: string): string {
  let s = source.replace(/^[ \t]*(?:from[ \t]+\S+[ \t]+import[ \t]+[^\n]+|import[ \t]+[^\n]+)[ \t]*\r?\n/gm, '');
  s = s.replace(/^[ \t]*from[ \t]+\S+[ \t]+import[ \t]*\([\s\S]*?\)[ \t]*\r?\n/gm, '');
  return s;
}

// ---------- declarations ----------
const JS_DECL_RE = new RegExp([
  `(?:^|[;\\s])function[\\s]+(${IDENT})[\\s]*\\(`, // function foo(
  `|(?:^|[;\\s])(?:const|let|var)[\\s]+(${IDENT})[\\s]*=[\\s]*(?:function|\\([^)\\n]*\\)[\\s]*=>|${IDENT}[\\s]*=>)`, // const foo = ...
].join(''), 'gm');

const C_DECL_RE  = new RegExp(String.raw`(?:^|[\s;])(?:[A-Za-z_][A-Za-z0-9_*\s]+?\s+)?(${IDENT})\s*\([^;{}]*\)\s*(?:\{|;)`, 'gm');
const PY_DECL_RE = new RegExp(String.raw`^[ \t]*def[ \t]+(${IDENT})[ \t]*\(`, 'gm');

// ---------- Python line-start calls (helper(), return helper(), await helper(), etc.) ----------
const PY_LINE_CALL_RE = new RegExp(String.raw`^[ \t]*(?:return\s+|await\s+|yield\s+)?(${IDENT})[ \t]*\(`, 'gm');

// Words to ignore as identifiers
const RESERVED = new Set([
  'if','for','while','switch','return','with','yield','class','def','lambda','except','try','assert','raise',
  'from','import','new','catch','finally','delete','typeof','void','in','of','case','break','continue',
  'self','cls',
]);

// ---------- CSS/HTML helpers ----------
function collectCssSelectorNames(css: string): { classes: Set<string>, ids: Set<string> } {
  const classes = new Set<string>();
  const ids = new Set<string>();
  for (const m of css.matchAll(/([^{}]+)\{/g)) {
    const selectorList = m[1];
    for (const c of selectorList.matchAll(/\.(?![0-9-])([A-Za-z_][A-Za-z0-9_-]*)/g)) classes.add(c[1]);
    for (const i of selectorList.matchAll(/#(?![0-9-])([A-Za-z_][A-Za-z0-9_-]*)/g)) ids.add(i[1]);
  }
  return { classes, ids };
}
function collectHtmlAttrNames(html: string): { classes: Set<string>, ids: Set<string> } {
  const classes = new Set<string>();
  const ids = new Set<string>();
  for (const m of html.matchAll(/class\s*=\s*(['"])(.*?)\1/gis)) {
    for (const name of (m[2] || '').trim().split(/\s+/).filter(Boolean)) {
      if (/^\[.*\]$/.test(name)) continue; // ignore arbitrary Tailwind values
      classes.add(name);
    }
  }
  for (const m of html.matchAll(/id\s*=\s*(['"])(.*?)\1/gis)) {
    const name = (m[2] || '').trim();
    if (name) ids.add(name);
  }
  return { classes, ids };
}

export function buildFunctionIndex(files: ParsedFile[]): FnIndex {
  const fnDecls: NameMap = new Map();
  const fnCalls: NameMap = new Map();
  const styleDecls: NameMap = new Map();
  const styleCalls: NameMap = new Map();
  const fileToNames: Map<string, Set<string>> = new Map();

  // ---------- PASS 1: gather declarations (code + css) ----------
  for (const f of files) {
    const path = f.path;
    const ext = normExt((f as any).ext ?? '', path, f.content);
    const text = f.content;

    if (ext === 'js') {
      for (const m of text.matchAll(JS_DECL_RE)) {
        const name = (m[1] || m[2]) as string;
        if (!name || RESERVED.has(name)) continue;
        add(fnDecls, name, path);
        addFileName(fileToNames, path, name);
      }
    } else if (ext === 'py') {
      for (const m of text.matchAll(PY_DECL_RE)) {
        const name = m[1] as string;
        if (!name || RESERVED.has(name)) continue;
        add(fnDecls, name, path);
        addFileName(fileToNames, path, name);
      }
    } else if (ext === 'c') {
      for (const m of text.matchAll(C_DECL_RE)) {
        const name = m[1] as string;
        if (!name || RESERVED.has(name)) continue;
        add(fnDecls, name, path);
        addFileName(fileToNames, path, name);
      }
    } else if (ext === 'css') {
      const { classes, ids } = collectCssSelectorNames(text);
      for (const n of classes) { add(styleDecls, n, path); addFileName(fileToNames, path, n); }
      for (const n of ids)     { add(styleDecls, n, path); addFileName(fileToNames, path, n); }
    }
  }

  // Build one alternation regex of all declared function names (only code domain)
  const declaredFnNames = Array.from(fnDecls.keys());
  if (declaredFnNames.length) {
    // Sort longest-first to make alternation a bit safer (fooBar before foo)
    declaredFnNames.sort((a, b) => b.length - a.length);
  }
  const anyFn = declaredFnNames.length ? `(?:${declaredFnNames.map(escRe).join('|')})` : '';

  // Combined call regex: (^|[^.\w])(Name1|Name2|...)\s*\(
  const CALLS_ANY_RE = anyFn
    ? new RegExp(String.raw`(^|[^.\w])(${anyFn})[ \t]*\(`, 'gm')
    : null;

  // ---------- PASS 2: gather calls (code + html) ----------
  for (const f of files) {
    const path = f.path;
    const ext = normExt((f as any).ext ?? '', path, f.content);
    const text = f.content;

    if (ext === 'js' || ext === 'py' || ext === 'c') {
      if (CALLS_ANY_RE) {
        let body = text;
        if (ext === 'py') body = stripPythonImports(text);

        for (const m of body.matchAll(CALLS_ANY_RE)) {
          const name = m[2] as string;
          if (!name || RESERVED.has(name)) continue;
          if (ext === 'py' && (name === 'print' || name === 'len')) continue;
          add(fnCalls, name, path);
          addFileName(fileToNames, path, name);
        }

        // Extra pass for Python indentation starts (covers odd DOM splits)
        if (ext === 'py') {
          for (const m of body.matchAll(PY_LINE_CALL_RE)) {
            const name = m[1] as string;
            if (!name || RESERVED.has(name)) continue;
            if (!fnDecls.has(name)) continue; // ensure it's one of our declared names
            if (name === 'print' || name === 'len') continue;
            add(fnCalls, name, path);
            addFileName(fileToNames, path, name);
          }
        }
      }
    } else if (ext === 'html') {
      const { classes, ids } = collectHtmlAttrNames(text);
      for (const n of classes) { add(styleCalls, n, path); addFileName(fileToNames, path, n); }
      for (const n of ids)     { add(styleCalls, n, path); addFileName(fileToNames, path, n); }
    }
  }

  return {
    fn:    { declsByName: fnDecls,    callsByName: fnCalls },
    style: { declsByName: styleDecls, callsByName: styleCalls },
    fileToNames,
  };
}

// Stable hue per name (shared across domains)
function hashHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return ((h % 360) + 360) % 360;
}
export function buildFnHueMap(idx: FnIndex): Record<string, number> {
  const hues: Record<string, number> = {};
  const all = new Set<string>([
    ...idx.fn.declsByName.keys(),    ...idx.fn.callsByName.keys(),
    ...idx.style.declsByName.keys(), ...idx.style.callsByName.keys(),
  ]);
  for (const name of all) hues[name] = hashHue(name);
  return hues;
}
