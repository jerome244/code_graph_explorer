// app/page.tsx  (SERVER COMPONENT — no "use client")
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import React from "react";

export default async function Home() {
  const access = cookies().get("access")?.value;
  if (access) {
    redirect("/dashboard");
  }

  return (
    <main style={rootStyle}>
      {/* 背景：ビューポート固定で常に全画面カバー */}
      <div style={bgFixed} aria-hidden>
        <Image
          src="/images/galaxy2.jpg" /* /public/images/galaxy2.jpg */
          alt=""
          fill
          priority
          sizes="100vw"
          style={{
            objectFit: "cover",       // 常に全面カバー
            objectPosition: "center", // 構図は必要に応じて調整
          }}
        />
        {/* コントラスト用の暗幕（任意） */}
        <div style={bgOverlay} />
      </div>

      {/* 中央カード（前面） */}
      <section style={cardStyle}>
        <h1 style={headingStyle}>Welcome</h1>
        <p style={leadStyle}>Use the buttons below to Login or Register.</p>

        <div style={buttonRowStyle}>
          <Link href="/login" style={buttonStyle}>Login</Link>
          <Link href="/register" style={buttonSecondaryStyle}>Register</Link>
        </div>
      </section>
    </main>
  );
}

/** ==== Styles (inline, SSR-safe) ==== */
const rootStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  minHeight: "100dvh", // 新しいビューポート単位
  display: "grid",
  placeItems: "center",
  overflow: "hidden",
  isolation: "isolate",
  // ここに背景色は入れない（背景画像が下で敷かれるため）
};

/* 背景用の固定レイヤ（親の高さに依存しない） */
const bgFixed: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: -2,
  pointerEvents: "none", // 背景がクリックを邪魔しない
};

const bgOverlay: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  background:
    "radial-gradient(120% 120% at 30% 20%, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.7) 70%), linear-gradient(rgba(0,0,0,0.25), rgba(0,0,0,0.4))",
};

const cardStyle: React.CSSProperties = {
  width: "min(92vw, 560px)",
  padding: "2.25rem 1.75rem",
  borderRadius: "12px",
  background: "rgba(255,255,255,0.08)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  boxShadow: "0 8px 28px rgba(0,0,0,0.28)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#f2f4f8",
  textAlign: "center",
  zIndex: 0, // 背景(-2)より前面
};

const headingStyle: React.CSSProperties = {
  fontSize: "36px",
  lineHeight: 1.1,
  fontWeight: 800,
  letterSpacing: "-0.02em",
  margin: "0 0 12px",
};

const leadStyle: React.CSSProperties = {
  margin: "0 0 20px",
  fontSize: "16px",
  color: "rgba(255,255,255,0.88)",
};

const buttonRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "14px",
  justifyContent: "center",
  alignItems: "center",
  flexWrap: "wrap",
};

const baseButton: React.CSSProperties = {
  display: "inline-block",
  padding: "12px 16px",
  fontSize: "16px",
  lineHeight: 1,
  borderRadius: "10px",
  textDecoration: "none",
  border: "1px solid transparent",
  cursor: "pointer",
  transition: "transform 120ms ease, filter 160ms ease, background-color 160ms ease",
};

const buttonStyle: React.CSSProperties = {
  ...baseButton,
  backgroundColor: "#2563eb",
  color: "#fff",
  borderColor: "rgba(255,255,255,0.12)",
};

const buttonSecondaryStyle: React.CSSProperties = {
  ...baseButton,
  backgroundColor: "rgba(255,255,255,0.08)",
  color: "#f2f4f8",
  borderColor: "rgba(255,255,255,0.22)",
};