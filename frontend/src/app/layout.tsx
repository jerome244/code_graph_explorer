export const metadata = {
  title: 'code_graph_explorer',
  description: 'Voxel demo + more',
};

import Link from 'next/link';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>
        <header style={{ padding: '12px 16px', borderBottom: '1px solid #eee' }}>
          <nav style={{ display: 'flex', gap: 12 }}>
            <Link href="/">Home</Link>
            <Link href="/games">Games</Link>
            <Link href="/tools/osint">Tools</Link>
          </nav>
        </header>
        <main style={{ padding: 24 }}>{children}</main>
      </body>
    </html>
  );
}
