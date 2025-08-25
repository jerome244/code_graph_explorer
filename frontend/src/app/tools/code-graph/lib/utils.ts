import type { ElementDefinition } from 'cytoscape';
import type { ParsedFile, SupportedType, TreeNode } from './types';

// ------------ path helpers ------------
export function extOf(path: string): SupportedType | null {
  const m = path.toLowerCase().match(/\.([a-z0-9]+)$/);
  if (!m) return null;
  const e = m[1] as SupportedType;
  return (['c','py','html','css','js'] as SupportedType[]).includes(e) ? e : null;
}
export function normPath(p: string) { return p.replace(/\\/g, '/').replace(/^\/+/, ''); }
export function dirname(p: string) { const parts = normPath(p).split('/'); parts.pop(); return parts.join('/'); }
export function basename(p: string) { const parts = normPath(p).split('/'); return parts.pop() || ''; }
export function folderChain(dir: string): string[] {
  if (!dir) return [];
  const parts = dir.split('/').filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) out.push(parts.slice(0, i + 1).join('/'));
  return out;
}
export function humanBytes(n: number) {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024; if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024; return `${mb.toFixed(1)} MB`;
}

// ------------ dependency sniffers (light) ------------
export function extractDeps(file: ParsedFile, all: ParsedFile[]): string[] {
  const text = file.content;
  const targets: string[] = [];

  const byPathOrName = (spec: string) => {
    const cleaned = spec.replace(/^\.?\//, '');
    const found =
      all.find(f => f.path === cleaned) ||
      all.find(f => f.path.endsWith('/' + cleaned)) ||
      all.find(f => f.name === cleaned) ||
      all.find(f => f.name === cleaned + '.' + f.ext);
    return found?.path;
  };

  if (file.ext === 'js' || file.ext === 'html') {
    const importFrom = [...text.matchAll(/import[^'"]*['"]([^'"]+)['"]/g)].map(m => m[1]);
    const requireRe = [...text.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]);
    for (const spec of [...importFrom, ...requireRe]) {
      const t = byPathOrName(spec); if (t) targets.push(t);
    }
    if (file.ext === 'html') {
      const srcHref = [...text.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)].map(m => m[1]);
      for (const spec of srcHref) {
        const t = byPathOrName(spec); if (t) targets.push(t);
      }
    }
  } else if (file.ext === 'py') {
    const pyMods = new Set<string>();
    for (const m of text.matchAll(/^\s*import\s+([a-zA-Z0-9_\.]+)/gm)) pyMods.add(m[1]);
    for (const m of text.matchAll(/^\s*from\s+([a-zA-Z0-9_\.]+)\s+import/gm)) pyMods.add(m[1]);
    for (const mod of pyMods) {
      const base = mod.split('.').pop()!;
      const t =
        all.find(f => f.name === base + '.py')?.path ||
        all.find(f => f.path.endsWith('/' + base + '.py'))?.path;
      if (t) targets.push(t);
    }
  } else if (file.ext === 'c') {
    const inc = [...text.matchAll(/#\s*include\s*[<"]([^">]+)[">]/g)].map(m => m[1]);
    for (const spec of inc) {
      const t =
        all.find(f => f.path.endsWith('/' + spec))?.path ||
        all.find(f => f.name === spec)?.path;
      if (t) targets.push(t);
    }
  } else if (file.ext === 'css') {
    const cssImp = [...text.matchAll(/@import\s+["']([^"']+)["']/g)].map(m => m[1]);
    for (const spec of cssImp) {
      const t = byPathOrName(spec); if (t) targets.push(t);
    }
  }

  return [...new Set(targets.filter(t => t !== file.path))];
}

// ------------ build Cytoscape elements ------------
export function buildElements(files: ParsedFile[], includeDeps: boolean): ElementDefinition[] {
  if (files.length === 0) return [];

  const folderSet = new Set<string>();
  files.forEach(f => folderChain(f.dir).forEach(d => folderSet.add(d)));

  const folderNodes: ElementDefinition[] = [
    // synthetic root so parent: '__root__' works
    { data: { id: '__root__', label: 'root' }, classes: 'folder' },
    ...[...folderSet].map(d => ({
      data: { id: d, label: d.split('/').slice(-1)[0] },
      classes: 'folder',
    })),
  ];

  const fileNodes: ElementDefinition[] = files.map(f => ({
    data: {
      id: f.path,
      label: f.name,
      parent: f.dir || '__root__',
      path: f.path,
      type: f.ext,
      size: f.size,
    },
    classes: `file ${f.ext}`,
    grabbable: true,
  }));

  const edges: ElementDefinition[] = [];
  if (includeDeps) {
    for (const f of files) {
      const targets = extractDeps(f, files);
      targets.forEach((t, i) => {
        edges.push({
          data: { id: `e:${f.path}->${t}:${i}`, source: f.path, target: t },
          classes: 'dep',
        });
      });
    }
  }

  return [...folderNodes, ...fileNodes, ...edges];
}

// ------------ build tree + filter ------------
export function buildTree(files: ParsedFile[]): TreeNode {
  const root: TreeNode = {
    id: '__root__',
    type: 'folder',
    name: 'root',
    path: null,
    children: [],
    open: true,
    count: 0,
  };
  const folderMap = new Map<string, TreeNode>();
  folderMap.set('__root__', root);

  function ensureFolder(path: string): TreeNode {
    const id = path || '__root__';
    if (folderMap.has(id)) return folderMap.get(id)!;
    const name = path.split('/').filter(Boolean).pop() || 'root';
    const node: TreeNode = {
      id, type: 'folder', name, path: path || null, children: [],
      open: path.split('/').length <= 2, count: 0,
    };
    folderMap.set(id, node);
    const parentPath = path.split('/').slice(0, -1).join('/');
    const parent = ensureFolder(parentPath);
    parent.children.push(node);
    return node;
  }

  for (const f of files) {
    const chain = folderChain(f.dir);
    const parent = chain.length ? ensureFolder(chain[chain.length - 1]) : root;
    parent.children.push({ id: f.path, type: 'file', name: f.name, path: f.path, ext: f.ext });
  }

  function sortAndCount(n: TreeNode): number {
    if (n.type === 'file') return 1;
    n.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    let c = 0; for (const ch of n.children) c += sortAndCount(ch); n.count = c; return c;
  }
  sortAndCount(root);
  return root;
}

export function filterTree(node: TreeNode, q: string): TreeNode | null {
  if (!q.trim()) return node;
  const query = q.toLowerCase();
  if (node.type === 'file') {
    return (node.name.toLowerCase().includes(query) || node.path.toLowerCase().includes(query)) ? node : null;
  }
  const kept: TreeNode[] = [];
  for (const ch of node.children) {
    const k = filterTree(ch, q);
    if (k) kept.push(k);
  }
  if (kept.length > 0 || node.name.toLowerCase().includes(query)) {
    return { ...node, children: kept, open: true };
  }
  return null;
}

// badge color
export function extBadgeBg(ext: SupportedType) {
  switch (ext) {
    case 'js': return '#FEF3C7';
    case 'py': return '#DBEAFE';
    case 'html': return '#FDE68A';
    case 'css': return '#DCFCE7';
    case 'c': return '#E9D5FF';
  }
}
