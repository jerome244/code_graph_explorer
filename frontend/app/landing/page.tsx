// frontend/app/landing/page.tsx
"use client";
export const dynamic = "force-static";
export const revalidate = false;

export default function Landing() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <section style={{ maxWidth: 800, textAlign: "center" }}>
        <h1>Code Graph Explorer</h1>
        <p>Explore coding projects in realtime. Visualize, search, and share.</p>
        <p style={{ opacity: 0.6, marginTop: 12 }}>
          (This page is a static preview published via GitHub Pages.)
        </p>
      </section>
    </main>
  );
}
