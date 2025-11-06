// app/page.tsx  (SERVER COMPONENT — no "use client")
import TechStack from "./_components/TechStack";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function Page() {
  const access = cookies().get("access")?.value;
  if (access) {
    redirect("/dashboard");
  }

  return (
    <main style={mainStyle}>
      {/* === HERO SECTION === */}
      <section style={cardStyle} aria-labelledby="cge-title">
        <h1 id="cge-title" style={headingStyle}>Code Graph Explorer</h1>

        <p style={subStyle}>
          we propose a solution for exploring coding projects for teams in realtime
        </p>

        <div style={btnRowStyle}>
          <a href="/login" className="btn">Login</a>
          <a href="/register" className="btn btn--outline">Register</a>
        </div>
      </section>

      {/* === TECH STACK SECTION === */}
      <footer style={footerStyle}>
        <div style={techGridWrapStyle}>
          <TechStack
            title="Frontend"
            items={[
              { name: "react" },
              { name: "next" },
              { name: "typescript" },
              { name: "three.js" },
              { name: "svg" },
              { name: "cityscape" },
            ]}
          />
          <TechStack
            title="Backend"
            items={[
              { name: "python" },
              { name: "django" },
              { name: "daphne" },
              { name: "postgre" },
              { name: "redis" },
              { name: "docker" },
              { name: "c++" },
            ]}
          />
        </div>

        {/* === CREATED BY SECTION (上に移動) === */}
        <div style={authorRowStyle}>
          <span>Created by</span>
          <div style={authorListStyle}>
            <a href="https://github.com/hayama0024" target="_blank" rel="noopener noreferrer" style={authorLinkStyle}>
              Ryota Higa
            </a>
            <span>•</span>
            <a href="https://github.com/PIERRE_GH_USERNAME" target="_blank" rel="noopener noreferrer" style={authorLinkStyle}>
              Pierre Lionnel Obiang
            </a>
            <span>•</span>
            <a href="https://github.com/jerome244" target="_blank" rel="noopener noreferrer" style={authorLinkStyle}>
              Jerome Tran
            </a>
          </div>
        </div>

        {/* === COPYRIGHT & GITHUB (下に移動) === */}
        <div style={copyRowStyle}>
          <span>© 2025 Code Graph Explorer</span>
          <a
            href="https://github.com/jerome244/code_graph_explorer.git"
            target="_blank"
            rel="noopener noreferrer"
            style={ghLinkStyle}
          >
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              width="18"
              height="18"
              style={{ marginRight: "6px" }}
              aria-hidden
            >
              <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.1-1.3-1.5-1.3-1.5-1-.7.1-.7.1-.7 1.1.1 1.7 1.2 1.7 1.2 1 .1.9 1.7.9 1.7.9 1.4 2.4 1 3 .8.1-.7.4-1 .8-1.3-2.6-.3-5.3-1.3-5.3-5.9 0-1.3.5-2.3 1.2-3.2-.1-.3-.5-1.4.1-2.9 0 0 1-.3 3.3 1.2a11.3 11.3 0 0 1 6 0C18 6 19 6.3 19 6.3c.6 1.5.2 2.6.1 2.9.8.9 1.2 2 1.2 3.2 0 4.6-2.7 5.6-5.3 5.9.4.3.8.9.8 1.8v2.7c0 .3.2.7.8.6A10.9 10.9 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z"/>
            </svg>
            GitHub
          </a>
        </div>
      </footer>

      {/* === BUTTON HOVER STYLES === */}
      <style>{`
        .btn {
          display: inline-block;
          padding: 12px 18px;
          font-size: 15px;
          border-radius: 12px;
          text-decoration: none;
          user-select: none;
          transition: transform 120ms ease, background-color 160ms ease, border-color 160ms ease;
          background-color: rgba(255,255,255,0.10);
          color: #ffffff;
          border: 1px solid rgba(255,255,255,0.18);
        }
        .btn:hover {
          background-color: rgba(255,255,255,0.16);
          transform: translateY(-1px);
        }
        .btn.btn--outline {
          background-color: transparent;
          color: #e6e8ee;
        }
        .btn.btn--outline:hover {
          background-color: rgba(255,255,255,0.06);
          border-color: rgba(255,255,255,0.35);
          transform: translateY(-1px);
        }
      `}</style>
    </main>
  );
}

/* ===== Layout styles ===== */
const mainStyle: React.CSSProperties = {
  minHeight: "calc(100vh - 56px)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: "#0b1020",
  color: "#e6e8ee",
  padding: "24px",
  gap: "40px",
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 720,
  textAlign: "center",
  padding: "40px 28px",
  background:
    "radial-gradient(1200px 400px at 50% -10%, rgba(124,143,255,0.12), rgba(11,16,32,0))",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 16,
  boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
};

const headingStyle: React.CSSProperties = {
  fontSize: "40px",
  lineHeight: 1.1,
  letterSpacing: "-0.02em",
  fontWeight: 700,
  margin: 0,
  backgroundImage: "linear-gradient(180deg, #fff, rgba(255,255,255,0.7))",
  WebkitBackgroundClip: "text",
  color: "transparent",
};

const subStyle: React.CSSProperties = {
  marginTop: 14,
  marginBottom: 24,
  fontSize: 16,
  lineHeight: 1.6,
  color: "rgba(230,232,238,0.8)",
};

const btnRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  justifyContent: "center",
  alignItems: "center",
  flexWrap: "wrap",
};

/* === Footer === */
const footerStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 900,
  textAlign: "center",
  opacity: 0.85,
  transform: "scale(0.85)",
  marginTop: "12px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "10px",
};

const techGridWrapStyle: React.CSSProperties = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  columnGap: 16,
  rowGap: 10,
  alignItems: "start",
};

/* === Created By Section（上に移動） === */
const authorRowStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  fontSize: "13px",
  color: "rgba(230,232,238,0.7)",
  gap: "4px",
  marginTop: "4px",
};

const authorListStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  flexWrap: "wrap",
  justifyContent: "center",
};

const authorLinkStyle: React.CSSProperties = {
  color: "#9bb8ff",
  textDecoration: "none",
  transition: "color 0.2s ease",
};

/* === Copyright & GitHub（下に移動） === */
const copyRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "12px",
  fontSize: "13px",
  color: "rgba(230,232,238,0.7)",
  marginTop: "4px",
};

const ghLinkStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  color: "#7aa2ff",
  textDecoration: "none",
  transition: "opacity 0.2s ease",
  opacity: 0.9,
};