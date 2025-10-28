// frontend/app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import Nav from "./_components/Nav";
import { cookies } from "next/headers";

export const metadata: Metadata = {
  title: "Code Graph Explorer",
  description: "Visualize and explore your codebase",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const themeCookie = cookies().get("theme")?.value;
  const initialTheme = themeCookie === "light" ? "light" : "dark"; // ← 初期は dark

  return (
    <html lang="ja" data-theme={initialTheme}>
      <body>
        <div className="container">
          <Nav />
        </div>
        <main className="container" style={{ paddingBlock: "20px", minHeight: "calc(100vh - 56px)" }}>
          {children}
        </main>
      </body>
    </html>
  );
}


