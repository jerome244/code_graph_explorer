// /frontend/src/app/tools/code-graph/lib/functions.ts
// Cross-file index for two domains:
//
// 1) functions (code): JS/TS, Python, C
//    - decls: function names
//    - calls: free calls  name(...)
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

// helpers
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

function normExt(ext: string): string {
  const e = (ext || '').toLowerCase();
  if (['js','mjs','cjs','jsx','ts','tsx'].includes(e)) return 'js';
  if (e === 'py') return 'py';
  if (['c','h'].includes(e)) return 'c';
  if (e === 'css') return 'css';
  if (['html','htm'].includes(e)) return 'html';
  return e;
}

// Python: remove import lines so calls finder won’t match them
function stripPythonImports(source: string): string {
  let s = source.replace(/^[ \t]*(?:from[ \t]+\S+[ \t]+import[ \t]+[^\n]+|import[ \t]+[^\n]+)[ \t]*\r?\n/gm, '');
  s = s.replace(/^[ \t]*from[ \t]+\S+[ \t]+import[ \t]*\([\s\S]*?\)[ \t]*\r?\n/gm, '');
  return s;
}

// Decls
const JS_DECL_RE = new RegExp([
  `(?:^|[;\\s])function[\\s]+(${IDENT})[\\s]*\\(`, // function foo(
  `|(?:^|[;\\s])(?:const|let|var)[\\s]+(${IDENT})[\\s]*=[\\s]*(?:function|\\([^)\\n]*\\)[\\s]*=>|${IDENT}[\\s]*=>)`, // const foo = ...
].join(''), 'gm');

const C_DECL_RE  = new RegExp(String.raw`(?:^|[\s;])(?:[A-Za-z_][A-Za-z0-9_*\s]+?\s+)?(${IDENT})\s*\([^;{}]*\)\s*(?:\{|;)`, 'gm');

const PY_DECL_RE = new RegExp(String.raw`^[ \t]*def[ \t]+(${IDENT})[ \t]*\(`, 'gm');

// Calls: free call name( ... ) avoiding foo.bar(
// NOTE: 'm' so ^ and $ work line-wise
const FREE_CALL_RE = new RegExp(String.raw`(^|[^.\w])(${IDENT})[ \t]*\(`, 'gm');

// Python-specific "start-of-line/indented" call matcher (helper(), return helper(), await helper(), etc.)
const PY_LINE_CALL_RE = new RegExp(String.raw`^[ \t]*(?:return\s+|await\s+|yield\s+)?(${IDENT})[ \t]*\(`, 'gm');

// Words to ignore as identifiers
const RESERVED = new Set([
  'if','for','while','switch','return','with','yield','class','def','lambda','except','try','assert','raise',
  'from','import','new','catch','finally','delete','typeof','void','in','of','case','break','continue',
]);

// CSS selectors -> .class / #id before '{'
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

// HTML class/id attributes
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

  for (const f of files) {
    const path = f.path;
    const ext = normExt(f.ext);
    const text = f.content;

    // ---- Declarations
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

    // ---- Calls
    if (ext === 'js' || ext === 'py' || ext === 'c') {
      let body = text;
      if (ext === 'py') body = stripPythonImports(text);

      // generic: name(
      for (const m of body.matchAll(FREE_CALL_RE)) {
        const name = m[2] as string;
        if (!name || RESERVED.has(name)) continue;
        if (ext === 'py' && (name === 'print' || name === 'len')) continue;
        add(fnCalls, name, path);
        addFileName(fileToNames, path, name);
      }

      // Python-specific extra pass: start-of-line/indented calls (e.g., inside defs)
      if (ext === 'py') {
        for (const m of body.matchAll(PY_LINE_CALL_RE)) {
          const name = m[1] as string;
          if (!name || RESERVED.has(name)) continue;
          if (name === 'print' || name === 'len') continue;
          add(fnCalls, name, path);
          addFileName(fileToNames, path, name);
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
