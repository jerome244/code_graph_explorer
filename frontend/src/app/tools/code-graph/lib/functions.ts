// /frontend/src/app/tools/code-graph/lib/functions.ts
// Cross-file name index + edges for Functions (JS/C/Python) and Styles (CSS↔HTML).
// - Declarations:
//     JS/TS/C/Python: function names
//     CSS: .class and #id tokens appearing in selector lists
// - Calls:
//     JS/TS/C/Python: free function calls like  name(...)
//     HTML: class="a b c"  → calls a,b,c ;  id="foo" → calls foo
//
// NOTE: CodePopup already highlights names from `fileToNames`. By putting CSS/HTML
// names into this map, popups will wrap them with `.fn-hit[data-fn="<name>"]` too.

import type { ParsedFile } from './types';

export type FnIndex = {
  /** name -> files where declared */
  declsByName: Map<string, Set<string>>;
  /** name -> files where called */
  callsByName: Map<string, Set<string>>;
  /** file -> names (decls or calls) that appear in that file (for highlighting) */
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

/** Normalize extensions into coarse language buckets */
function normExt(ext: string): string {
  const e = ext.toLowerCase();
  if (['js','mjs','cjs','jsx','ts','tsx'].includes(e)) return 'js';
  if (['py'].includes(e)) return 'py';
  if (['c','h'].includes(e)) return 'c';
  if (['css'].includes(e)) return 'css';
  if (['html','htm'].includes(e)) return 'html';
  return e;
}

/** Remove python import lines so call-finder won't match names in imports */
function stripPythonImports(source: string): string {
  // Single-line imports
  let s = source.replace(/^[ \t]*(?:from[ \t]+\S+[ \t]+import[ \t]+[^\n]+|import[ \t]+[^\n]+)[ \t]*\r?\n/gm, '');
  // Parenthesized multi-line imports
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

/** Extract CSS selector tokens (.class and #id) from selector lists (left of '{'). */
function collectCssSelectorNames(css: string): { classes: Set<string>, ids: Set<string> } {
  const classes = new Set<string>();
  const ids = new Set<string>();
  // Walk each selector list before a { ; tolerate newlines
  for (const m of css.matchAll(/([^{}]+)\{/g)) {
    const selectorList = m[1];
    // classes like .title, .btn-primary
    for (const c of selectorList.matchAll(/\.(?![0-9-])([A-Za-z_][A-Za-z0-9_-]*)/g)) {
      classes.add(c[1]);
    }
    // ids like #main, #app-root
    for (const i of selectorList.matchAll(/#(?![0-9-])([A-Za-z_][A-Za-z0-9_-]*)/g)) {
      ids.add(i[1]);
    }
  }
  return { classes, ids };
}

/** Extract HTML class/id attribute tokens */
function collectHtmlAttrNames(html: string): { classes: Set<string>, ids: Set<string> } {
  const classes = new Set<string>();
  const ids = new Set<string>();

  // class="a b c" or class='a b c'
  for (const m of html.matchAll(/class\s*=\s*(['"])(.*?)\1/gis)) {
    const list = (m[2] || '').trim().split(/\s+/).filter(Boolean);
    for (const name of list) {
      // ignore tailwind-like arbitrary values [x] which aren't pure class names
      if (/^\[.*\]$/.test(name)) continue;
      classes.add(name);
    }
  }
  // id="foo" or id='foo'
  for (const m of html.matchAll(/id\s*=\s*(['"])(.*?)\1/gis)) {
    const name = (m[2] || '').trim();
    if (name) ids.add(name);
  }
  return { classes, ids };
}

export function buildFunctionIndex(files: ParsedFile[]): FnIndex {
  const declsByName = new Map<string, Set<string>>();
  const callsByName = new Map<string, Set<string>>();
  const fileToNames = new Map<string, Set<string>>();

  for (const f of files) {
    const path = f.path;
    const ext0 = normExt(f.ext);
    const text = f.content;

    // ---- declarations ----
    if (ext0 === 'js') {
      for (const m of text.matchAll(JS_DECL_RE)) {
        const name = (m[1] || m[2]) as string;
        if (!name || RESERVED.has(name)) continue;
        add(declsByName, name, path);
        addFileName(fileToNames, path, name);
      }
    } else if (ext0 === 'py') {
      for (const m of text.matchAll(PY_DECL_RE)) {
        const name = m[1] as string;
        if (!name || RESERVED.has(name)) continue;
        add(declsByName, name, path);
        addFileName(fileToNames, path, name);
      }
    } else if (ext0 === 'c') {
      for (const m of text.matchAll(C_DECL_RE)) {
        const name = m[1] as string;
        if (!name || RESERVED.has(name)) continue;
        add(declsByName, name, path);
        addFileName(fileToNames, path, name);
      }
    } else if (ext0 === 'css') {
      const { classes, ids } = collectCssSelectorNames(text);
      for (const name of classes) {
        add(declsByName, name, path);
        addFileName(fileToNames, path, name);
      }
      for (const name of ids) {
        add(declsByName, name, path);
        addFileName(fileToNames, path, name);
      }
    }

    // ---- calls ----
    if (ext0 === 'py' || ext0 === 'js' || ext0 === 'c') {
      let bodyForCalls = text;
      if (ext0 === 'py') {
        bodyForCalls = stripPythonImports(text); // avoid counting import lines
      }
      for (const m of bodyForCalls.matchAll(FREE_CALL_RE)) {
        const name = m[2] as string;
        if (!name || RESERVED.has(name)) continue;
        // Skip common builtins that create noisy edges
        if (ext0 === 'py' && (name === 'print' || name === 'len')) continue;
        add(callsByName, name, path);
        addFileName(fileToNames, path, name);
      }
    } else if (ext0 === 'html') {
      const { classes, ids } = collectHtmlAttrNames(text);
      for (const name of classes) {
        add(callsByName, name, path);
        addFileName(fileToNames, path, name);
      }
      for (const name of ids) {
        add(callsByName, name, path);
        addFileName(fileToNames, path, name);
      }
    }
  }

  return { declsByName, callsByName, fileToNames };
}

// Give each function/selector name a stable hue for coloring
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
