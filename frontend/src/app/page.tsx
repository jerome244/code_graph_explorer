// File: src/app/page.tsx
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="mx-auto max-w-4xl px-6 py-20">
        <header className="mb-12">
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">Code Graph Explorer</h1>
          <p className="mt-3 text-slate-600">
            Analyze your codebase and explore the relationships between files, functions, and styles.
          </p>
        </header>

        <section className="grid gap-6 sm:grid-cols-2">
          <Card title="Login" desc="Access your projects and analyses.">
            <PrimaryLink href="/login">Go to Login</PrimaryLink>
          </Card>

          <Card title="Register" desc="Create an account to start exploring.">
            <PrimaryLink href="/register">Create Account</PrimaryLink>
          </Card>

          <Card title="Upload" desc="Upload a project archive (ZIP) for analysis">
            <PrimaryLink href="/upload">Upload Project</PrimaryLink>
          </Card>

          <Card title="Graph" desc="Jump straight to the graph view">
            <PrimaryLink href="/graph">Open Graph</PrimaryLink>
          </Card>
        </section>

        <footer className="mt-16 text-sm text-slate-500">
          <p>
            Tip: Backend API is Django/DRF. The Next.js app can proxy requests via route handlers in{" "}
            <code>src/app/api</code>.
          </p>
        </footer>
      </div>
    </main>
  );
}

function Card({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md">
      <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 mb-6 text-slate-600">{desc}</p>
      <div>{children}</div>
    </div>
  );
}

function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-slate-400"
    >
      {children}
    </Link>
  );
}
