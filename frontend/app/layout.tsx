// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import Nav from "./_components/Nav";

export const metadata: Metadata = {
  title: "Code Graph Explorer",
  description: "Visualize and explore your codebase",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="container" style={{ paddingBlock: "12px" }}>
          <Nav />
        </div>
        <main className="container" style={{ paddingBlock: "20px", minHeight: "calc(100vh - 56px)" }}>
          {children}
        </main>
      </body>
    </html>
  );
}

