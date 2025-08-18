import ast, re, zipfile, io, hashlib
from pathlib import Path
from typing import Dict, List, Set, Tuple

LANG_PY="py"; LANG_JS="js"; LANG_C="c"; LANG_HTML="html"; LANG_CSS="css"
FUNC_KW_BLOCK = {"if","for","while","switch","return","catch","new","else","sizeof"}

def _sha(s: bytes) -> str: return hashlib.sha1(s).hexdigest()

def _detect_lang(path: str) -> str | None:
    p = Path(path.lower())
    ext = p.suffix
    return {
        ".py": LANG_PY, ".js": LANG_JS, ".mjs": LANG_JS, ".c": LANG_C, ".h": LANG_C,
        ".html": LANG_HTML, ".htm": LANG_HTML, ".css": LANG_CSS,
    }.get(ext)

# ---------- parsers ----------
def parse_python(src: str) -> Tuple[Set[str], Set[str]]:
    decl, calls = set(), set()
    try:
        tree = ast.parse(src)
    except Exception:
        return decl, calls
    class V(ast.NodeVisitor):
        def visit_FunctionDef(self, node): decl.add(node.name); self.generic_visit(node)
        def visit_AsyncFunctionDef(self, node): decl.add(node.name); self.generic_visit(node)
        def visit_Call(self, node):
            # best effort: foo(), obj.foo() -> "foo"
            n = node.func
            if isinstance(n, ast.Name): calls.add(n.id)
            elif hasattr(n, "attr"): calls.add(n.attr)
            self.generic_visit(node)
    V().visit(tree)
    return decl, calls

def parse_js(src: str) -> Tuple[Set[str], Set[str]]:
    decl, calls = set(), set()
    # function foo(...) { }
    for m in re.finditer(r"\bfunction\s+([A-Za-z_]\w*)\s*\(", src): decl.add(m.group(1))
    # const foo = (...) => { }   |   let foo = function(...)
    for m in re.finditer(r"\b(?:const|let|var)\s+([A-Za-z_]\w*)\s*=\s*(?:\([^=]*\)\s*=>|function\s*\()", src):
        decl.add(m.group(1))
    # object method: foo: function(...) { }
    for m in re.finditer(r"([A-Za-z_]\w*)\s*:\s*function\s*\(", src): decl.add(m.group(1))
    # calls: name(    (avoid keywords)
    for m in re.finditer(r"\b([A-Za-z_]\w*)\s*\(", src):
        name = m.group(1)
        if name not in FUNC_KW_BLOCK: calls.add(name)
    return decl, calls

def parse_c(src: str) -> Tuple[Set[str], Set[str]]:
    decl, calls = set(), set()
    # crude decl: type name(args) {   (skip typedef/struct etc.)
    for m in re.finditer(r"^[ \t]*[A-Za-z_][\w\s\*\(\)]*\s+([A-Za-z_]\w*)\s*\([^;]*\)\s*\{", src, re.MULTILINE):
        name = m.group(1)
        if name not in {"if","for","while","switch"}: decl.add(name)
    # calls: name(...) ; avoid control keywords
    for m in re.finditer(r"\b([A-Za-z_]\w*)\s*\(", src):
        name = m.group(1)
        if name not in {"if","for","while","switch","return","sizeof"}: calls.add(name)
    return decl, calls

def parse_css(src: str) -> Tuple[Set[str], Set[str]]:
    classes, ids = set(), set()
    # selectors before {  (very rough but good enough)
    for sel in re.findall(r"([^{]+)\{", src):
        classes.update(re.findall(r"\.([A-Za-z_][\w\-]*)", sel))
        ids.update(re.findall(r"#([A-Za-z_][\w\-]*)", sel))
    return classes, ids

def parse_html(src: str) -> Tuple[Set[str], Set[str]]:
    ids, classes = set(), set()
    for m in re.finditer(r'\bid\s*=\s*"([^"]+)"', src): ids.add(m.group(1).strip())
    for m in re.finditer(r"\bid\s*=\s*'([^']+)'", src): ids.add(m.group(1).strip())
    for m in re.finditer(r'\bclass\s*=\s*"([^"]+)"', src):
        classes.update([c for c in m.group(1).split() if c])
    for m in re.finditer(r"\bclass\s*=\s*'([^']+)'", src):
        classes.update([c for c in m.group(1).split() if c])
    return ids, classes

# ---------- main ----------
def analyze_zip(file_bytes: bytes) -> dict:
    """
    Returns dict with nodes/edges/tree and summary.
    """
    z = zipfile.ZipFile(io.BytesIO(file_bytes))
    per_file = {}  # path -> data
    # walk files
    for info in z.infolist():
        if info.is_dir(): continue
        path = info.filename
        lang = _detect_lang(path)
        if not lang: continue
        data = z.read(info)
        text = ""
        try:
            text = data.decode("utf-8", errors="ignore")
        except Exception:
            continue
        entry = {"file": path, "lang": lang, "sha": _sha(data),
                 "declared": [], "calls": [], "css_classes": [], "css_ids": [],
                 "html_ids": [], "html_classes": []}
        if lang == LANG_PY:
            d, c = parse_python(text); entry["declared"]=sorted(d); entry["calls"]=sorted(c)
        elif lang == LANG_JS:
            d, c = parse_js(text); entry["declared"]=sorted(d); entry["calls"]=sorted(c)
        elif lang == LANG_C:
            d, c = parse_c(text); entry["declared"]=sorted(d); entry["calls"]=sorted(c)
        elif lang == LANG_CSS:
            cl, ids = parse_css(text); entry["css_classes"]=sorted(cl); entry["css_ids"]=sorted(ids)
        elif lang == LANG_HTML:
            ids, cl = parse_html(text); entry["html_ids"]=sorted(ids); entry["html_classes"]=sorted(cl)
        per_file[path] = entry

    # build graph
    nodes, edges = [], []
    def nid(kind, name, file=None): return f"{kind}:{name}" + (f"@{file}" if file else "")
    # file nodes
    for path, e in per_file.items():
        nodes.append({"id": nid("file", path), "type":"file", "label": path})
    # function nodes + edges (declared-in and calls)
    # index declared by (lang,name)
    declared_index = {}
    for path,e in per_file.items():
        if e["lang"] in (LANG_PY, LANG_JS, LANG_C):
            for fn in e["declared"]:
                id_ = nid(f"{e['lang']}-func", fn, path)
                nodes.append({"id": id_, "type":"function", "lang": e["lang"], "name": fn, "file": path})
                edges.append({"source": nid("file", path), "target": id_, "type": "declares"})
                declared_index.setdefault((e["lang"], fn), []).append(id_)
    # calls
    for path,e in per_file.items():
        if e["lang"] in (LANG_PY, LANG_JS, LANG_C):
            for caller in e["declared"]:
                caller_id = nid(f"{e['lang']}-func", caller, path)
                for callee in e["calls"]:
                    cands = declared_index.get((e["lang"], callee))
                    if cands:
                        for callee_id in cands:
                            edges.append({"source": caller_id, "target": callee_id, "type": "calls"})
                    else:
                        # unresolved node once per name
                        u_id = nid(f"{e['lang']}-unresolved", callee)
                        if not any(n["id"]==u_id for n in nodes):
                            nodes.append({"id": u_id, "type":"unresolved", "lang": e["lang"], "name": callee})
                        edges.append({"source": caller_id, "target": u_id, "type":"calls"})

    # css/html cross-links
    css_classes, css_ids = {}, {}
    html_classes, html_ids = {}, {}
    for path,e in per_file.items():
        if e["lang"] == LANG_CSS:
            for c in e["css_classes"]:
                id_ = nid("css-class", c, path)
                nodes.append({"id": id_, "type":"css-class", "name": c, "file": path})
                css_classes.setdefault(c, []).append(id_)
            for i in e["css_ids"]:
                id_ = nid("css-id", i, path)
                nodes.append({"id": id_, "type":"css-id", "name": i, "file": path})
                css_ids.setdefault(i, []).append(id_)
            edges.append({"source": nid("file", path), "target": nid("file", path), "type": "styles"})  # noop anchor
        elif e["lang"] == LANG_HTML:
            for i in e["html_ids"]:
                id_ = nid("html-id", i, path)
                nodes.append({"id": id_, "type":"html-id", "name": i, "file": path})
                html_ids.setdefault(i, []).append(id_)
            for c in e["html_classes"]:
                id_ = nid("html-class", c, path)
                nodes.append({"id": id_, "type":"html-class", "name": c, "file": path})
                html_classes.setdefault(c, []).append(id_)
    # match ids (#foo) and classes (.bar)
    for name, html_nodes in html_ids.items():
        for css_node in css_ids.get(name, []):
            for h in html_nodes:
                edges.append({"source": h, "target": css_node, "type": "styled-by"})
    for name, html_nodes in html_classes.items():
        for css_node in css_classes.get(name, []):
            for h in html_nodes:
                edges.append({"source": h, "target": css_node, "type": "styled-by"})

    # simple tree by file
    tree = {}
    for path,e in per_file.items():
        tree[path] = {
            "lang": e["lang"],
            "functions": e["declared"],
            "calls": e["calls"],
            "html_ids": e["html_ids"],
            "html_classes": e["html_classes"],
            "css_ids": e["css_ids"],
            "css_classes": e["css_classes"],
        }

    summary = {
        "files": len(per_file),
        "functions": sum(len(per_file[p]["declared"]) for p in per_file),
        "calls": sum(len(per_file[p]["calls"]) for p in per_file),
        "css_classes": sum(len(per_file[p]["css_classes"]) for p in per_file),
        "css_ids": sum(len(per_file[p]["css_ids"]) for p in per_file),
        "html_ids": sum(len(per_file[p]["html_ids"]) for p in per_file),
        "html_classes": sum(len(per_file[p]["html_classes"]) for p in per_file),
    }
    return {
        "nodes": nodes,
        "edges": edges,
        "tree_by_file": tree,
        "summary": summary,
    }
