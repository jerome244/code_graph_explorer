// app/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function Home() {
  const access = cookies().get("access")?.value;
  if (access) redirect("/dashboard");

  return (
    <main className="landing galaxy-photo">
      <section className="hero">
        <p className="kicker">Welcome to</p>

        <h1 className="title title-appear" aria-label="Code Graph Explorer">
          <span className="line-appear" style={{ animationDelay: "0s" }}>Code</span>
          <span className="line-appear" style={{ animationDelay: ".25s" }}>Graph</span>
          <span className="line-appear" style={{ animationDelay: ".5s" }}>Explorer</span>
        </h1>

        <p className="sub measure-narrow">
          Visualize complex repositories as clear, interactive maps.
        </p>

        <div className="cta">
          <a href="/login" className="btn btn--primary">Sign In</a>
          <a href="/register" className="btn btn--ghost">Create Account</a>
        </div>
      </section>

      <div className="vignette" aria-hidden />
      <small className="credit" aria-hidden>Photo by Jeremy Thomas on Unsplash</small>
    </main>
  );
}


