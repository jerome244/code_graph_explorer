import Link from 'next/link';

export const metadata = {
  title: 'Tools',
  description: 'Browse available tools',
};

// Server component (default) to list tools
export default function ToolsPage() {
  const tools = [
    {
      id: 'osint',
      name: 'OSINT Tool',
      href: '/tools/osint',
      description: 'Look up DNS records, HTTP headers, redirects, and more for a domain.',
    },
    // Add more tools here as you create them.
  ] as const;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0 }}>Tools</h1>
      <p style={{ margin: 0, color: '#555' }}>Pick a tool to get started.</p>
      <div
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          alignItems: 'stretch',
        }}
      >
        {tools.map((t) => (
          <Link
            key={t.id}
            href={t.href}
            style={{
              textDecoration: 'none',
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              padding: 16,
              display: 'block',
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{t.name}</div>
            <div style={{ color: '#374151' }}>{t.description}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
