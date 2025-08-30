export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ maxWidth: 560, margin: "3rem auto", fontFamily: "Inter, system-ui, sans-serif" }}>{children}</body>
    </html>
  );
}