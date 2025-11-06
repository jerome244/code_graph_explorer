// ------------------------------ Inline code highlighter ------------------------------

// Function to escape HTML characters
export function htmlEscape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Function to escape regex special characters
export function regexEscape(lit: string) {
  return lit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Function to highlight code with functions (called and declared)
export function highlightWithFunctions(
  path: string,
  code: string,
  funcIndex: { byFile?: Record<string, { declared: string[]; called: string[] }>; index?: any }
): string {
  const facts = funcIndex.byFile?.[path];
  const index = funcIndex.index || {};
  if (!facts) return htmlEscape(code);

  const declaredSet = new Set(facts.declared);
  const calledSet = new Set(facts.called);
  const names = Array.from(new Set([...facts.declared, ...facts.called].filter((n) => index[n])));
  if (names.length === 0) return htmlEscape(code);

  // Build a single regex of all names, word-boundary matched
  const re = new RegExp(`\\b(${names.map(regexEscape).join("|")})\\b`, "g");
  const escaped = htmlEscape(code);

  return escaped.replace(re, (m) => {
    const color = index[m]?.color || "#111827";
    const isDecl = declaredSet.has(m);
    const isCall = calledSet.has(m) && !isDecl;
    const role = isDecl ? "decl" : isCall ? "call" : "ref";
    const deco = isDecl ? " text-decoration: underline dotted;" : "";
    // Tag spans so we can anchor lines to the *actual* name positions
    return `<span data-func="${m}" data-role="${role}" data-path="${path}" style="color:${color};${deco}">${m}</span>`;
  });
}
