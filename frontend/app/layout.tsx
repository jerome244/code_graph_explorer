// app/layout.tsx
import type { Metadata } from "next";
import Nav from "./_components/Nav";

export const metadata: Metadata = {
  title: {
    default: "Code Graph Explorer",
    template: "%s · Code Graph Explorer",
  },
  description:
    "we propose a solution for exploring coding projects for teams in realtime",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={bodyStyle}>
        <Nav />
        <div style={{ minHeight: "calc(100vh - 56px)" }}>{children}</div>
      </body>
    </html>
  );
}

const bodyStyle: React.CSSProperties = {
  margin: 0,
  minHeight: "100vh",
  fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
  backgroundColor: "#0b1020",
  color: "#e6e8ee",
};