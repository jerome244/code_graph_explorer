// frontend/app/graph/runner.ts
// In-browser runner for JS, Python (Pyodide), and C/C++ (JSCPP).
// - Loads Pyodide and JSCPP at runtime via <script> tags (so webpack never sees https imports).
// - Python supports multi-file projects written to /work and sys.path patched for package imports.

export type RunRequest = {
  language: "js" | "py" | "c";
  code: string;
  path: string; // e.g. "src/main.py", "main.c"
  project?: { path: string; content: string }[]; // used by Python
  rootDir?: string; // defaults to "/work" (Python only)
};

export type RunResult = {
  ok: boolean;
  stdout: string;
  stderr?: string;
  failingPath?: string;
};

declare global {
  interface Window {
    loadPyodide?: (opts: { indexURL: string }) => Promise<any>;
    JSCPP?: {
      run(
        code: string,
        input?: string,
        options?: {
          stdio?: {
            write?: (s: string) => void;
            read?: () => string;
          };
          [k: string]: any;
        }
      ): any;
    };
    __JSCPP_URL__?: string;
  }
}

function inBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/* -------------------- Shared helpers -------------------- */

const loadScript = (src: string) =>
  new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.crossOrigin = "anonymous";
    s.referrerPolicy = "no-referrer";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });

function joinPath(...parts: string[]): string {
  return parts.join("/").replace(/\/+/g, "/").replace(/\/\.\//g, "/").replace(/\/$/, "");
}

function dirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i === -1 ? "" : p.slice(0, i);
}

/* -------------------- Pyodide (Python) -------------------- */

let pyodideReady: Promise<any> | null = null;
let pyodideScriptAdded = false;

async function ensurePyodide(): Promise<any> {
  if (!inBrowser()) throw new Error("Pyodide requires a browser environment");
  if (!pyodideReady) {
    pyodideReady = (async () => {
      if (!pyodideScriptAdded) {
        pyodideScriptAdded = true;
        await loadScript("https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js");
      }
      if (!window.loadPyodide)
        throw new Error("window.loadPyodide not available after script load");
      const py = await window.loadPyodide({
        indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/",
      });
      return py;
    })();
  }
  return pyodideReady;
}

async function writeProject(
  pyodide: any,
  project: { path: string; content: string }[],
  rootDir: string
) {
  const FS = pyodide.FS;
  try {
    FS.mkdir(rootDir);
  } catch {}
  for (const f of project) {
    const full = joinPath(rootDir, f.path);
    const dir = dirname(full);
    if (dir) {
      try {
        FS.mkdirTree(dir);
      } catch {}
    }
    FS.writeFile(full, f.content, { encoding: "utf8" });
  }
  pyodide.runPython(`
import sys, importlib
_root = ${JSON.stringify(rootDir)}
if _root not in sys.path:
    sys.path.insert(0, _root)
importlib.invalidate_caches()
  `);
}

/* -------------------- JSCPP (C/C++) -------------------- */

let jscppReady: Promise<typeof window.JSCPP> | null = null;

function loadScriptWithTimeout(src: string, timeoutMs = 12000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    const id = setTimeout(() => {
      s.onerror = null;
      s.onload = null;
      try {
        s.remove();
      } catch {}
      reject(new Error(`Timeout loading ${src}`));
    }, timeoutMs);

    s.src = src;
    s.async = true;
    s.crossOrigin = "anonymous";
    s.referrerPolicy = "no-referrer";
    s.onload = () => {
      clearTimeout(id);
      resolve();
    };
    s.onerror = () => {
      clearTimeout(id);
      reject(new Error(`Failed to load ${src}`));
    };
    document.head.appendChild(s);
  });
}

async function ensureJSCPP(): Promise<typeof window.JSCPP> {
  if (typeof window === "undefined") throw new Error("JSCPP requires a browser environment");
  if (window.JSCPP) return window.JSCPP;
  if (!jscppReady) {
    jscppReady = (async () => {
      const override =
        (typeof process !== "undefined" && (process as any).env?.NEXT_PUBLIC_JSCPP_URL) ||
        (typeof window !== "undefined" && (window as any).__JSCPP_URL__);

      const local = "/vendor/jscpp.min.js";
      const cdnCandidates = [
        "https://cdn.jsdelivr.net/npm/jscpp@2.0.0/dist/jscpp.min.js",
        "https://cdn.jsdelivr.net/npm/jscpp/dist/jscpp.min.js",
        "https://unpkg.com/jscpp@2.0.0/dist/jscpp.min.js",
        "https://unpkg.com/jscpp/dist/jscpp.min.js",
      ];

      const attempts = [...(override ? [override] : []), local, ...cdnCandidates];
      let lastErr: unknown = null;
      for (const url of attempts) {
        try {
          await loadScriptWithTimeout(url, 12000);
          if (!window.JSCPP) throw new Error(`Loaded ${url} but window.JSCPP is undefined`);
          return window.JSCPP;
        } catch (e) {
          lastErr = e;
        }
      }
      const hint = `Tried: ${attempts.join("  |  ")}`;
      throw new Error(
        `JSCPP not available. ${hint}\n` +
          `Tip: self-host it by downloading jscpp.min.js into /public/vendor and/or set NEXT_PUBLIC_JSCPP_URL.`
      );
    })();
  }
  return jscppReady;
}

/* -------------------- Public API -------------------- */

export async function runInBrowser(req: RunRequest): Promise<RunResult> {
  const lines: string[] = [];
  const errLines: string[] = [];
  const log = (...args: any[]) => lines.push(args.map(String).join(" "));
  const logErr = (...args: any[]) => errLines.push(args.map(String).join(" "));

  if (!inBrowser()) {
    return {
      ok: false,
      stdout: "",
      stderr: "Runner can only execute in the browser",
      failingPath: req.path,
    };
  }

  /* ---------- JavaScript ---------- */
  if (req.language === "js") {
    const prevLog = console.log;
    const prevErr = console.error;
    (console as any).log = log;
    (console as any).error = logErr;
    try {
      const wrapped = `${req.code}\n//# sourceURL=${req.path}`;
      const fn = new Function(wrapped);
      const ret = fn();
      if (ret instanceof Promise) await ret;
      return { ok: true, stdout: lines.join("\n") };
    } catch (e: any) {
      const msg = e?.stack ? String(e.stack) : String(e);
      const match =
        msg.match(/\(([^)]+):(\d+):(\d+)\)/) || msg.match(/at ([^\s]+):(\d+):(\d+)/);
      const failingPath = match ? match[1] : req.path;
      return { ok: false, stdout: lines.join("\n"), stderr: msg, failingPath };
    } finally {
      (console as any).log = prevLog;
      (console as any).error = prevErr;
    }
  }

  /* ---------- Python ---------- */
  if (req.language === "py") {
    const rootDir = req.rootDir || "/work";
    try {
      const pyodide = await ensurePyodide();

      if (req.project && req.project.length) {
        await writeProject(pyodide, req.project, rootDir);
      }

      const filename = joinPath(rootDir, req.path);

      // add /work and parent dirs of active file to sys.path
      const injectPathsPy = `
import sys, importlib, os
_root = ${JSON.stringify(rootDir)}
_active_rel = ${JSON.stringify(req.path)}
def _add(p):
    if p not in sys.path:
        sys.path.insert(0, p)
_add(_root)
_base = os.path.dirname(_active_rel)
while _base not in ("", ".", "/"):
    _add(os.path.join(_root, _base))
    _n = os.path.dirname(_base)
    if _n == _base: break
    _base = _n
importlib.invalidate_caches()
`;
      pyodide.runPython(injectPathsPy);

      // NEW: purge cached project modules so fresh imports read latest files
      pyodide.runPython(`
import sys, os, importlib
_root = ${JSON.stringify(rootDir)}
to_del = []
for name, mod in list(sys.modules.items()):
    try:
        f = getattr(mod, "__file__", None)
        if isinstance(f, str) and (f.startswith(_root + "/") or f.startswith(_root + "\\\\")):
            to_del.append(name)
    except Exception:
        pass
for name in to_del:
    try:
        del sys.modules[name]
    except Exception:
        pass
importlib.invalidate_caches()
`);

      // Bridge Python stdout/stderr to our JS loggers
      ;(window as any)._py_stdout = (s: any) => log(String(s));
      ;(window as any)._py_stderr = (s: any) => logErr(String(s));
      pyodide.runPython(`
import sys, js
class _StdOut:
    def write(self, s):
        try:
            js._py_stdout(s)
        except Exception as _e:
            pass
    def flush(self): pass

class _StdErr:
    def write(self, s):
        try:
            js._py_stderr(s)
        except Exception as _e:
            pass
    def flush(self): pass

sys.stdout = _StdOut()
sys.stderr = _StdErr()
`);

      const res = await pyodide.runPythonAsync(req.code, { filename });
      if (typeof res !== "undefined") log(String(res));
      return { ok: true, stdout: lines.join("\n") };
    } catch (e: any) {
      const msg = String(e);
      const m = msg.match(/File \"([^\"]+)\", line (\d+)/);
      let failingPath = req.path;
      if (m) {
        const abs = m[1];
        const prefix = (req.rootDir || "/work").replace(/\/?$/, "/");
        failingPath = abs.startsWith(prefix) ? abs.slice(prefix.length) : abs;
      }
      return { ok: false, stdout: lines.join("\n"), stderr: msg, failingPath };
    }
  }

  /* ---------- C / C++ (JSCPP) ---------- */
  if (req.language === "c") {
    try {
      const JSCPP = await ensureJSCPP();
      let stdinBuf = "";
      const stdoutChunks: string[] = [];

      JSCPP.run(req.code, "", {
        stdio: {
          write: (s: string) => stdoutChunks.push(s),
          read: () => {
            const out = stdinBuf;
            stdinBuf = "";
            return out;
          },
        },
      });

      return { ok: true, stdout: stdoutChunks.join("") };
    } catch (e: any) {
      const msg = String(e?.message || e);
      return { ok: false, stdout: "", stderr: msg, failingPath: req.path };
    }
  }

  /* ---------- Unsupported ---------- */
  return { ok: false, stdout: "", stderr: "Unsupported language", failingPath: req.path };
}

/* -------------------- Preflight (multi-file syntax checks) -------------------- */

export type PreflightError = {
  path: string;
  line?: number;
  col?: number;
  message: string;
  language: "py" | "js" | "c";
};

/**
 * Scans the entire project and returns a list of syntax/compile errors
 * without executing user code. JS & Python are strong; C is best-effort
 * (checks files containing main()).
 */
export async function preflightProject(
  files: { path: string; content: string }[]
): Promise<PreflightError[]> {
  const errs: PreflightError[] = [];
  const extOf = (p: string) => (p.split(".").pop() || "").toLowerCase();

  // JS syntax (compile only)
  for (const f of files) {
    const ext = extOf(f.path);
    if (["js", "mjs", "cjs"].includes(ext)) {
      try {
        // eslint-disable-next-line no-new-func
        new Function(`${f.content}\n//# sourceURL=${f.path}`);
      } catch (e: any) {
        const msg = e?.stack ? String(e.stack) : String(e);
        let line: number | undefined;
        let col: number | undefined;
        const m =
          msg.match(/\(([^)]+):(\d+):(\d+)\)/) ||
          msg.match(/at ([^\s]+):(\d+):(\d+)/) ||
          msg.match(/<anonymous>:(\d+):(\d+)/);
        if (m) {
          line = Number(m[m.length - 2]);
          col = Number(m[m.length - 1]);
        }
        errs.push({ path: f.path, line, col, message: msg, language: "js" });
      }
    }
  }

  // Python syntax (AST parse)
  const pyFiles = files.filter(f => extOf(f.path) === "py");
  if (pyFiles.length) {
    try {
      const pyodide = await ensurePyodide();
      await writeProject(pyodide, files, "/work");
      const script = `
import ast, json
from pathlib import Path
out = []
for rel in ${JSON.stringify(pyFiles.map(f => f.path))}:
    p = "/work/" + rel
    try:
        src = Path(p).read_text(encoding="utf-8")
        ast.parse(src, filename=p)
    except SyntaxError as e:
        out.append({"path": rel, "line": e.lineno, "col": e.offset, "message": f"{e.msg} (line {e.lineno}, col {e.offset})"})
    except Exception as e:
        out.append({"path": rel, "message": str(e)})
json.dumps(out)
`;
      const raw = await pyodide.runPythonAsync(script);
      const pyErrs: Array<{path:string; line?:number; col?:number; message:string}> =
        JSON.parse(raw || "[]");
      for (const e of pyErrs) errs.push({ ...e, language: "py" });
    } catch (e: any) {
      errs.push({ path: "<python>", message: String(e), language: "py" });
    }
  }

  // C best-effort (compile files containing main())
  const cFiles = files.filter(f => ["c", "cpp", "cc", "cxx"].includes(extOf(f.path)));
  const mains = cFiles.filter(f => /\bint\s+main\s*\(/.test(f.content));
  if (mains.length) {
    try {
      const JSCPP = await ensureJSCPP();
      for (const f of mains) {
        try {
          JSCPP.run(f.content, "", { stdio: { write: () => {}, read: () => "" } });
        } catch (e: any) {
          const msg = String(e?.message || e);
          const m = msg.match(/:(\d+):(\d+)/);
          errs.push({
            path: f.path,
            line: m ? Number(m[1]) : undefined,
            col: m ? Number(m[2]) : undefined,
            message: msg,
            language: "c",
          });
        }
      }
    } catch (e: any) {
      errs.push({ path: "<c>", message: String(e), language: "c" });
    }
  }

  return errs;
}
