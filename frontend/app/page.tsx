// app/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Image from "next/image";

export default async function Home() {
  const access = cookies().get("access")?.value;
  if (access) redirect("/dashboard");

  return (
    <main className="landing">
      {/* 背景：黒幕なし／常に全画面フィット */}
      <div className="bg-wrap" aria-hidden>
        <Image
          src="/images/galaxy.jpg"  // public/images/galaxy.jpg
          alt=""
          fill
          priority
          sizes="100vw"
          style={{ objectFit: "cover", objectPosition: "center" }}
        />
      </div>

      {/* 中央ヒーロー */}
      <section className="hero">
        <p className="kicker">Welcome to</p>

        <h1 className="title title-appear" aria-label="Code Graph Explorer">
          <span className="line-appear" style={{ animationDelay: "0s"  }}>Code</span>
          <span className="line-appear" style={{ animationDelay: ".25s" }}>Graph</span>
          <span className="line-appear" style={{ animationDelay: ".5s"  }}>Explorer</span>
        </h1>

        <p className="sub measure-narrow">
          Visualize complex repositories as clear, interactive maps.
        </p>

        <div className="cta">
          <a href="/login" className="btn btn--primary">Sign In</a>
          <a href="/register" className="btn btn--ghost">Create Account</a>
        </div>
      </section>
    </main>
  );
}




