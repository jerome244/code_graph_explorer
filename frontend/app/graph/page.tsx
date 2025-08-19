// app/graph/page.tsx
import Link from "next/link";

export default function GraphPage() {
  return (
    <main style={{ padding: 24, maxWidth: 960, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>Graph</h1>
        <Link
          href="/"
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            textDecoration: "none",
            fontWeight: 600,
          }}
        >
          ← Back home
        </Link>
      </header>

      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Your graph goes here</h2>
        <p>
          This is a placeholder for your graph view. We can wire this up to fetch any data you like,
          or render a client component that draws the graph.
        </p>
      </section>
    </main>
  );
}
