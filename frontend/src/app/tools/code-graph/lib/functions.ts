// Lightweight cross-file function index + call edges.
// Heuristic regexes for JS, Python, C; HTML/CSS are ignored for function parsing.

import type { ElementDefinition } from 'cytoscape';
import type { ParsedFile } from './types';
import { basename } from './utils';

export type FnIndex = {
  declsByName: Map<string, Set<string>>;   // name -> files where declared
  callsByName: Map<string, Set<string>>;   // name -> files where called
  fileToNames: Map<string, Set<string>>;   // file -> names (decls or calls) that appear in that file
};

const IDENT = `[A-Za-z_][A-Za-z0-9_]*`;

function add(map: Map<string, Set<string>>, key: string, value: string) {
  const s = map.get(key) ?? new Set<string>();
  s.add(value);
  map.set(key, s);
}

export function buildFunctionIndex(files: ParsedFile[]): FnIndex {
  const declsByName = new Map<string, Set<string>>();
  const callsByName = new Map<string, Set<string>>();
  const fileToNames = new Map<string, Set<string>>();

  for (const f of files) {
    const text = f.content;

    const addFileName = (name: string) => {
      const s = fileToNames.get(f.path) ?? new Set<string>();
      s.add(name);
      fileToNames.set(f.path, s);
    };

    if (f.ext === 'py') {
      // def foo(...):
      for (const m of text.matchAll(new RegExp(`^\\s*def\\s+(${IDENT})\\s*\\(`, 'gm'))) {
        const name = m[1];
        add(declsByName, name, f.path);
        addFileName(name);
      }
      // calls: (^|[^.\\w])name(
      for (const m of text.matchAll(new RegExp(`(^|[^.\\w])(${IDENT})\\s*\\(`, 'g'))) {
        const name = m[2];
        // skip if looks like built-in keywords (very small set)
        if (['if','for','while','return','print','with','yield','class','def','lambda'].includes(name)) continue;
        add(callsByName, name, f.path);
        addFileName(name);
      }
    } else if (f.ext === 'js') {
      // function foo(…)
      for (const m of text.matchAll(new RegExp(`\\bfunction\\s+(${IDENT})\\s*\\(`, 'g'))) {
        const name = m[1];
        add(declsByName, name, f.path);
        addFileName(name);
      }
      // export function foo(…)
      for (const m of text.matchAll(new RegExp(`\\bexport\\s+function\\s+(${IDENT})\\s*\\(`, 'g'))) {
        const name = m[1];
        add(declsByName, name, f.path);
        addFileName(name);
      }
      // const foo = (...) => or = function(
      for (const m of text.matchAll(new RegExp(`\\b(?:const|let|var)\\s+(${IDENT})\\s*=\\s*(?:\\([^)]*\\)\\s*=>|function\\s*\\()`, 'g'))) {
        const name = m[1];
        add(declsByName, name, f.path);
        addFileName(name);
      }
      // calls: (^|[^.\\w$])name(
      for (const m of text.matchAll(new RegExp(`(^|[^.\\w$])(${IDENT})\\s*\\(`, 'g'))) {
        const name = m[2];
        if (['if','for','while','switch','return','function'].includes(name)) continue;
        add(callsByName, name, f.path);
        addFileName(name);
      }
    } else if (f.ext === 'c') {
      // Very rough: type-ish + name ( ... ) {   (skip prototypes by requiring "{")
      for (const m of text.matchAll(new RegExp(`\\b([A-Za-z_][\\w\\s\\*]+)\\s+(${IDENT})\\s*\\([^;{]*\\)\\s*\\{`, 'g'))) {
        const name = m[2];
        add(declsByName, name, f.path);
        addFileName(name);
      }
      // calls: (^|[^.\\w])name(
      for (const m of text.matchAll(new RegExp(`(^|[^.\\w])(${IDENT})\\s*\\(`, 'g'))) {
        const name = m[2];
        if (['if','for','while','switch','return','sizeof'].includes(name)) continue;
        add(callsByName, name, f.path);
        addFileName(name);
      }
    } else {
      // html/css: ignore
    }
  }

  return { declsByName, callsByName, fileToNames };
}

export function buildCallEdges(fnIndex: FnIndex): ElementDefinition[] {
  const edges: ElementDefinition[] = [];
  for (const [name, callers] of fnIndex.callsByName) {
    const decls = fnIndex.declsByName.get(name);
    if (!decls || decls.size === 0) continue;
    for (const src of callers) {
      for (const dst of decls) {
        const id = `call:${name}:${src}->${dst}`;
        if (src === dst) continue; // skip self-file edges to reduce clutter (optional)
        edges.push({
          data: { id, source: src, target: dst, label: name },
          classes: 'call',
        });
      }
    }
  }
  return edges;
}

// Color for a function name: stable hue based on string hash
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
