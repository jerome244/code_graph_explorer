"use client";
export const dynamic = "force-static";
export const revalidate = false;

export default function Landing() {
  return (
    <main style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24}}>
      <section style={{maxWidth:800,textAlign:"center"}}>
        <h1>Code Graph Explorer</h1>
        <p>Explore coding projects in realtime. Visualize, search, and share.</p>
        <div style={{marginTop:16}}>
          <a href="/login">Login</a> · <a href="/register">Create account</a>
        </div>
        <p style={{opacity:.6,marginTop:12}}>(Static preview via GitHub Pages)</p>
      </section>
    </main>
  );
}
