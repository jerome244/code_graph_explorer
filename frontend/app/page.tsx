// app/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function Home() {
  const access = cookies().get("access")?.value;
  if (access) redirect("/dashboard");

  return (
    <section className="card" style={{ margin: "24px auto 0", maxWidth: 680 }}>
      <h1>Navigate Your Code with Confidence</h1>
      <p style={{ marginBottom: 12, color: "var(--muted)" }}>
        Code Graph Explorer transforms complex repositories into clear, interactive maps.<br />
        Sign in to continue or create a new account to begin your journey.
      </p>

      <div className="hstack">
        <a href="/login" className="btn btn--primary">Sign In</a>
        <a href="/register" className="btn btn--ghost">Create Account</a>
      </div>
    </section>
  );
}



