import Link from "next/link";

export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "2rem auto", padding: "0 16px" }}>
      <h1>Welcome</h1>
      <p>This is a public homepage. Use the header to Login / Register / Logout.</p>
      <p><Link href="/graph">Graph my project</Link></p>
    </main>
  );
}
