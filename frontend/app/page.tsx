// frontend/app/page.tsx
import Link from "next/link";
import { cookies } from "next/headers";
import LoginForm from "@/components/LoginForm";
import RegisterForm from "@/components/RegisterForm";

export default function Home() {
  const hasAccess = Boolean(cookies().get("access"));

  return (
    <>
      {/* Hero / intro */}
      <section className="card" style={{ display: "grid", gap: "0.5rem" }}>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 800 }}>Welcome</h1>
        <p style={{ color: "var(--muted)" }}>
          Sign in or create an account — or jump straight to the{" "}
          <Link href="/graph" className="underline">
            Graph Explorer
          </Link>{" "}
          to visualize a project ZIP.
        </p>
        <div style={{ marginTop: ".5rem" }}>
          <Link href="/graph" className="btn primary">
            Try the Graph Explorer
          </Link>
        </div>
      </section>

      {/* Auth area */}
      {hasAccess ? (
        <section className="card" style={{ display: "grid", gap: ".75rem" }}>
          <p>You are logged in.</p>
          <form action="/api/auth/logout" method="post">
            <button className="btn" type="submit">Logout</button>
          </form>
        </section>
      ) : (
        <section
          style={{
            display: "grid",
            gap: "1rem",
            gridTemplateColumns: "1fr",
          }}
        >
          <div className="card">
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: ".5rem" }}>
              Login
            </h2>
            <LoginForm />
          </div>
          <div className="card">
            <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: ".5rem" }}>
              Register
            </h2>
            <RegisterForm />
          </div>
        </section>
      )}

      {/* Small note */}
      <p style={{ color: "var(--muted)", fontSize: ".9rem", marginTop: "1rem" }}>
        After login/register you’ll be redirected back here.
      </p>
    </>
  );
}
