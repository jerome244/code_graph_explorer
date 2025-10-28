// app/page.tsx — Hero + Logos 3x3 + Footer (final version)
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-static";

export default async function Home() {
  const access = cookies().get("access")?.value;
  if (access) redirect("/dashboard");

  return (
    <div className="landing">
      {/* Background */}
      <div className="bg-wrap" aria-hidden>
        <div className="bg-landing" />
        <div className="bg-fade" />
      </div>

      {/* Hero */}
      <section className="hero">
        <p className="kicker">Welcome to</p>
        <h1
          className="title title-appear title-landing-anim"
          aria-label="Code Graph Explorer"
        >
          <span className="line-appear gradient-accent">Code</span>
          <span className="line-appear" style={{ animationDelay: "0.15s" }}>
            Graph
          </span>
          <span
            className="line-appear shimmer-text"
            style={{ animationDelay: "0.3s" }}
            data-text="Explorer"
          >
            Explorer
          </span>
        </h1>

        <p className="sub measure-narrow">
          we propose a solution for exploring coding projects for teams in realtime
        </p>

        <div className="cta">
          <Link href="/login" className="btn btn--primary">Sign in</Link>
          <Link href="/register" className="btn btn--ghost">Create account</Link>
          <Link href="/graph" className="btn btn--link">Try the demo →</Link>
        </div>
      </section>

      {/* Logos section (3×3) */}
      <section className="section">
        <div className="container logo-section">
          <h2 className="section-title center">Built with a modern, battle-tested stack</h2>
          <p className="logo-subtitle center">
            These tools power real-time code exploration and team collaboration.
          </p>

          <ul className="logo-row" aria-label="Technology logos">
            <Logo src="/logos/nextjs.svg" />
            <Logo src="/logos/react.svg" />
            <Logo src="/logos/typescript.svg" />
            <Logo src="/logos/threejs.svg" />
            <Logo src="/logos/tensorflow.svg" />
            <Logo src="/logos/django.svg" />
            <Logo src="/logos/postgresql.svg" />
            <Logo src="/logos/docker.svg" />
            <Logo src="/logos/caddy.svg" />
          </ul>
        </div>
      </section>

      {/* Divider */}
      <div className="section">
        <div className="divider" aria-hidden />
      </div>

      {/* Footer */}
      <footer className="footer section">
        <div className="footer-inner container">
          <div className="footer-left">
            <h2 className="footer-title">Authors</h2>
            <ul className="chip-list" aria-label="Authors">
              <li className="chip">Pierre Lionnel Obiang</li>
              <li className="chip">Ryota Higa</li>
              <li className="chip">Jérôme Tran</li>
            </ul>
          </div>

          <div className="footer-right">
            <p className="muted">Repository</p>
            <a
              className="repo-link btn btn--ghost"
              href="https://github.com/jerome244/code_graph_explorer"
              target="_blank"
              rel="noopener noreferrer"
            >
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" className="icon">
                <path fill="currentColor" d="M12 0C5.37 0 0 5.37 0 12a12 12 0 0 0 8.21 11.43c.6.11.82-.26.82-.57v-2.17c-3.34.73-4.04-1.41-4.04-1.41-.55-1.39-1.34-1.76-1.34-1.76-1.1-.75.08-.74.08-.74 1.22.09 1.86 1.25 1.86 1.25 1.08 1.85 2.83 1.31 3.52 1 .11-.79.42-1.31.76-1.61-2.66-.3-5.46-1.33-5.46-5.93 0-1.31.47-2.39 1.24-3.24-.12-.3-.54-1.51.12-3.14 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.63.24 2.84.12 3.14.77.85 1.23 1.93 1.23 3.24 0 4.61-2.8 5.62-5.47 5.92.43.38.81 1.12.81 2.26v3.35c0 .32.21.69.83.57A12 12 0 0 0 24 12c0-6.63-5.37-12-12-12Z"/>
              </svg>
              <span>jerome244/code_graph_explorer</span>
            </a>
          </div>
        </div>

        <p className="tiny muted center">© {new Date().getFullYear()} Code Graph Explorer</p>
      </footer>
    </div>
  );
}

function Logo({ src }: { src: string }) {
  return (
    <li className="logo-item">
      <img className="logo-img" src={src} alt="" aria-hidden="true" loading="lazy" />
    </li>
  );
}
