import Nav from "./_components/Nav";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", fontFamily: "Inter, system-ui, sans-serif" }}>
        <Nav />
        <div style={{ minHeight: "calc(100vh - 56px)" }}>{children}</div>
      </body>
    </html>
  );
}
