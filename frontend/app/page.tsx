import Link from "next/link";

export default function Home() {
  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "#0b1020" }}>
      <div style={{ maxWidth: 640, width: "100%", background: "white", borderRadius: 16, padding: 24, boxShadow: "0 10px 30px rgba(0,0,0,0.15)" }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Code Graph Explorer</h1>
        <p style={{ marginTop: 8, color: "#374151" }}>
          Kick off a new graph analysis by uploading a project archive.
        </p>
        <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
          <Link href="/graph/upload" style={{ background: "#111827", color: "white", padding: "10px 16px", borderRadius: 10, textDecoration: "none", fontWeight: 600 }}>
            Start Graph
          </Link>
        </div>
      </div>
    </main>
  );
}
