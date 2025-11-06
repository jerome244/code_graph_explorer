// app/_components/TechStack.tsx
// SERVER COMPONENT
type Tech = { name: string; label?: string };

const svgSize = 28;

// --- 追加: 名前正規化（スペルゆれ・表記ゆれ対応） ---
function normalize(raw: string) {
  const s = raw.toLowerCase().trim();
  const map: Record<string, string> = {
    "next": "nextjs",
    "next.js": "nextjs",
    "three.js": "threejs",
    "c++": "cplusplus",
    "postgre": "postgresql",
    "postgres": "postgresql",
    "cityscape": "cytoscape", // ユーザー指定の表記をCytoscape.jsに正規化
  };
  return map[s] ?? s.replace(/[^a-z0-9]/g, ""); // 句読点や記号を落とす
}

const SVGs: Record<string, JSX.Element> = {
  react: (
    <svg viewBox="0 0 256 256" width={svgSize} height={svgSize} aria-hidden>
      <g fill="none" stroke="#61dafb" strokeWidth="16">
        <ellipse rx="75" ry="175" cx="128" cy="128" transform="rotate(0 128 128)"></ellipse>
        <ellipse rx="75" ry="175" cx="128" cy="128" transform="rotate(60 128 128)"></ellipse>
        <ellipse rx="75" ry="175" cx="128" cy="128" transform="rotate(120 128 128)"></ellipse>
      </g>
      <circle cx="128" cy="128" r="16" fill="#61dafb"></circle>
    </svg>
  ),
  nextjs: (
    <svg viewBox="0 0 256 256" width={svgSize} height={svgSize} aria-hidden>
      <rect width="256" height="256" rx="48" fill="#0b0b0b"></rect>
      <path d="M96 64h24v64l40-64h24v128h-24V128l-40 64H96z" fill="#fff"></path>
    </svg>
  ),
  typescript: (
    <svg viewBox="0 0 256 256" width={svgSize} height={svgSize} aria-hidden>
      <rect width="256" height="256" rx="24" fill="#3178C6"></rect>
      <path fill="#fff" d="M108 96h40v16h-12v56h-16v-56h-12zM152 168h16c1 7 6 12 16 12 10 0 16-5 16-12 0-7-5-10-18-14l-9-3c-17-5-25-14-25-28 0-17 14-30 35-30 21 0 35 12 36 30h-16c-1-8-7-14-20-14-10 0-17 5-17 12 0 7 5 10 18 14l9 3c17 5 25 13 25 28 0 18-14 30-37 30-22 0-36-12-38-30z"></path>
    </svg>
  ),
  node: (
    <svg viewBox="0 0 256 256" width={svgSize} height={svgSize} aria-hidden>
      <rect width="256" height="256" rx="24" fill="#333"></rect>
      <path fill="#83CD29" d="M125 44 60 82v92l65 38 65-38V82z"></path>
      <path fill="#fff" d="M125 78 88 99v58l37 21 37-21v-18h-21v9l-16 9-16-9V112l16-9 16 9v10h21v-24z"></path>
    </svg>
  ),
  docker: (
    <svg viewBox="0 0 256 256" width={svgSize} height={svgSize} aria-hidden>
      <rect width="256" height="256" rx="24" fill="#1D63ED"></rect>
      <rect x="48" y="120" width="32" height="24" fill="#fff"></rect>
      <rect x="84" y="120" width="32" height="24" fill="#fff"></rect>
      <rect x="120" y="120" width="32" height="24" fill="#fff"></rect>
      <rect x="84" y="92" width="32" height="24" fill="#fff"></rect>
      <rect x="156" y="120" width="32" height="24" fill="#fff"></rect>
      <path d="M48 156h160c0 22-18 40-40 40H88c-22 0-40-18-40-40z" fill="#fff" opacity=".9"></path>
    </svg>
  ),
  python: (
    <svg viewBox="0 0 256 256" width={svgSize} height={svgSize} aria-hidden>
      <rect width="256" height="256" rx="24" fill="#2b5b84"></rect>
      <path fill="#ffd43b" d="M128 40c28 0 40 8 40 24v24H96c-16 0-24 8-24 24v16c0 16 8 24 24 24h56v8c0 16-12 24-40 24-18 0-34-2-40-8-8-6-16-16-16-32V88c0-16 8-28 16-32 10-8 26-16 64-16z"></path>
      <path fill="#4b8bbe" d="M128 216c-28 0-40-8-40-24v-24h72c16 0 24-8 24-24v-16c0-16-8-24-24-24h-56v-8c0-16 12-24 40-24 18 0 34 2 40 8 8 6 16 16 16 32v56c0 16-8 28-16 32-10 8-26 16-64 16z"></path>
    </svg>
  ),
  // --- 追加ロゴ: Django ---
  django: (
    <svg viewBox="0 0 256 256" width={svgSize} height={svgSize} aria-hidden>
      <rect width="256" height="256" rx="24" fill="#092E20"></rect>
      <path fill="#fff" d="M112 56h28v116c0 22-12 34-34 34-7 0-14-1-20-3v-23c5 2 10 3 15 3 7 0 11-3 11-11V56zM156 80h26v88h-26zM169 56c8 0 14 6 14 14s-6 14-14 14-14-6-14-14 6-14 14-14z"></path>
    </svg>
  ),
  // --- 追加ロゴ: Daphne (ASGI) ---
  daphne: (
    <svg viewBox="0 0 256 256" width={svgSize} height={svgSize} aria-hidden>
      <rect width="256" height="256" rx="24" fill="#0b1020"></rect>
      <path d="M64 176c0-40 32-72 72-72s72 32 72 72" stroke="#7aa2ff" strokeWidth="14" fill="none"/>
      <circle cx="136" cy="104" r="18" fill="#7aa2ff"/>
      <rect x="56" y="176" width="144" height="16" rx="8" fill="#7aa2ff"/>
    </svg>
  ),
  postgresql: (
    <svg viewBox="0 0 256 256" width={svgSize} height={svgSize} aria-hidden>
      <rect width="256" height="256" rx="24" fill="#336791"></rect>
      <path fill="#fff" d="M128 56c-44 0-72 16-72 40v64c0 24 28 40 72 40s72-16 72-40V96c0-24-28-40-72-40zm0 16c32 0 56 10 56 24s-24 24-56 24-56-10-56-24 24-24 56-24z"></path>
    </svg>
  ),
  redis: (
    <svg viewBox="0 0 256 256" width={svgSize} height={svgSize} aria-hidden>
      <rect width="256" height="256" rx="24" fill="#A41E11"></rect>
      <polygon points="128,52 48,88 128,124 208,88" fill="#fff" opacity=".95"></polygon>
      <polygon points="128,100 48,136 128,172 208,136" fill="#fff" opacity=".85"></polygon>
    </svg>
  ),
  cytoscape: (
    <svg viewBox="0 0 256 256" width={svgSize} height={svgSize} aria-hidden>
      <rect width="256" height="256" rx="24" fill="#1b1f2a"></rect>
      <circle cx="64" cy="128" r="10" fill="#9ae6b4"></circle>
      <circle cx="192" cy="80" r="10" fill="#90cdf4"></circle>
      <circle cx="192" cy="176" r="10" fill="#f6ad55"></circle>
      <line x1="64" y1="128" x2="192" y2="80" stroke="#8ab4f8" strokeWidth="6"></line>
      <line x1="64" y1="128" x2="192" y2="176" stroke="#8ab4f8" strokeWidth="6"></line>
    </svg>
  ),
  // --- 追加ロゴ: Three.js ---
  threejs: (
    <svg viewBox="0 0 256 256" width={svgSize} height={svgSize} aria-hidden>
      <rect width="256" height="256" rx="24" fill="#000"></rect>
      <path fill="#fff" d="M64 176l64-96 64 96H64zm64-32 16 24H112l16-24z"></path>
    </svg>
  ),
  // --- 追加ロゴ: C++ ---
  cplusplus: (
    <svg viewBox="0 0 256 256" width={svgSize} height={svgSize} aria-hidden>
      <rect width="256" height="256" rx="24" fill="#00599C"></rect>
      <path fill="#fff" d="M128 56 64 92v72l64 36 64-36V92z"></path>
      <text x="128" y="146" textAnchor="middle" fontFamily="monospace" fontSize="56" fill="#00599C" fontWeight="700">C++</text>
    </svg>
  ),
  // --- 追加ロゴ: SVG (技術としてのSVG) ---
  svg: (
    <svg viewBox="0 0 256 256" width={svgSize} height={svgSize} aria-hidden>
      <rect width="256" height="256" rx="24" fill="#18181b"></rect>
      <circle cx="88" cy="128" r="36" fill="#ef4444"></circle>
      <rect x="128" y="92" width="56" height="72" rx="12" fill="#22c55e"></rect>
      <path d="M128 92 L184 164" stroke="#eab308" strokeWidth="10" />
    </svg>
  ),
};

function FallbackBadge({ name }: { name: string }) {
  const initials = name
    .split(/\s|-/)
    .map((s) => s[0]?.toUpperCase())
    .join("")
    .slice(0, 3);
  return (
    <div style={{
      width: svgSize, height: svgSize, borderRadius: 8,
      background: "rgba(255,255,255,0.08)", display: "grid",
      placeItems: "center", fontSize: 12, fontWeight: 700, color: "#e6e8ee"
    }} aria-hidden>
      {initials}
    </div>
  );
}

function pretty(s: string) {
  const key = normalize(s);
  const map: Record<string, string> = {
    nextjs: "Next.js",
    node: "Node.js",
    typescript: "TypeScript",
    postgresql: "PostgreSQL",
    threejs: "Three.js",
    cytoscape: "Cytoscape.js",
    cplusplus: "C++",
    django: "Django",
    daphne: "Daphne (ASGI)",
    svg: "SVG",
  };
  return map[key] ?? s.replace(/(^|\s|-)\w/g, (m) => m.toUpperCase());
}

export default function TechStack({
  items,
  title = "Technology",
}: {
  items: Tech[];
  title?: string;
}) {
  return (
    <section aria-labelledby={`${title}-title`} style={sectionStyle}>
      <h2 id={`${title}-title`} style={titleStyle}>{title}</h2>
      <div style={gridStyle}>
        {items.map((t) => {
          const key = normalize(t.name);
          const logo = SVGs[key];
          return (
            <div key={`${key}-${t.label ?? t.name}`} style={cardStyle}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {logo ?? <FallbackBadge name={t.name} />}
                <span style={{ fontSize: 14, color: "#e6e8ee" }}>
                  {t.label ?? pretty(t.name)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ===== styles ===== */
const sectionStyle: React.CSSProperties = { marginTop: 28, padding: "8px 0 0" };
const titleStyle: React.CSSProperties = {
  fontSize: 14, letterSpacing: "0.12em", textTransform: "uppercase",
  color: "rgba(230,232,238,0.6)", margin: "0 0 12px",
};
const gridStyle: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10,
};
const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  padding: "10px 12px",
  background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
};