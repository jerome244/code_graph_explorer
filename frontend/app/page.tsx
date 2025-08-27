import Link from "next/link";

export default function Home() {
  return (
    <>
      <section className="card" style={{ display: "grid", gap: "0.5rem" }}>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 800 }}>Welcome</h1>
        <p style={{ color: "var(--muted)" }}>
          Use the <Link href="/graph" className="underline">Graph Explorer</Link> to upload a project ZIP and visualize its structure.
        </p>
        <div style={{ marginTop: ".5rem" }}>
          <Link href="/graph" className="btn primary">Try the Graph Explorer</Link>
        </div>
        <p className="dz-sub">Sign in or register from the top-right to save your projects.</p>
      </section>
    </>
  );
}
