import Link from 'next/link';

export const metadata = {
  title: 'Tools',
  description: 'Browse available tools',
};

type Category = 'OSINT' | 'Machine Learning' | 'Blockchain' | 'Cybersecurity' | 'DevOps & SecOps' | 'Collaboration' | 'IoT & Domotics';

type Tool = {
  id: string;
  name: string;
  href: string;
  description: string;
  category: Category;
};

// Server component (default) to list tools
export default function ToolsPage() {
  const tools: readonly Tool[] = [
    // OSINT
    {
      id: 'osint',
      name: 'OSINT Tool',
      href: '/tools/osint',
      description: 'Look up DNS records, HTTP headers, redirects, and more for a domain.',
      category: 'OSINT',
    },

    // ML
    {
      id: 'ml',
      name: 'ML Playground',
      href: '/tools/ml',
      description: 'Interactive k-means clustering demo. Add points, step iterations, and explore.',
      category: 'Machine Learning',
    },

    // Blockchain
    {
      id: 'blockchain',
      name: 'Blockchain 101',
      href: '/tools/blockchain',
      description: 'See how blocks link with hashes. Mine a valid block and validate the chain.',
      category: 'Blockchain',
    },
    {
      id: 'mempool',
      name: 'Mempool & Fees',
      href: '/tools/mempool',
      description: 'Simulate miner selection by fee rate and block size.',
      category: 'Blockchain',
    },

    // Cybersecurity
    {
      id: 'phishing',
      name: 'Phishing Analyzer',
      href: '/tools/sec/phishing',
      description: 'Check URLs, headers, and attachments for common phishing signs.',
      category: 'Cybersecurity',
    },
    {
      id: 'jwt',
      name: 'JWT Inspector',
      href: '/tools/sec/jwt',
      description: 'Parse tokens, check exp/nbf, and verify HS256/RS256 signatures client-side.',
      category: 'Cybersecurity',
    },
    {
      id: 'passwords',
      name: 'Password Strength Lab',
      href: '/tools/sec/passwords',
      description: 'Entropy, common pitfalls, crack-time estimates, and secure generators.',
      category: 'Cybersecurity',
    },
    {
      id: 'file-sig',
      name: 'File Signature Detector',
      href: '/tools/sec/file-sig',
      description: 'Detect real file types by magic bytes and flag risky mismatches.',
      category: 'Cybersecurity',
    },
    {
      id: 'csp',
      name: 'CSP & Clickjacking Checker',
      href: '/tools/sec/csp',
      description: 'Grade your security headers and catch clickjacking risks.',
      category: 'Cybersecurity',
    },
    {
      id: 'cors',
      name: 'CORS Preflight Explainer',
      href: '/tools/sec/cors',
      description: 'Will this cross-origin request pass? Get clear preflight/response answers and fixes.',
      category: 'Cybersecurity',
    },
    {
      id: 'open-redirect',
      name: 'Open Redirect Detector',
      href: '/tools/sec/open-redirect',
      description: 'Test redirect params for open-redirect bugs and get safe validation code.',
      category: 'Cybersecurity',
    },
    {
      id: 'scan-detect',
      name: 'Port-Scan & Brute-Force Detector',
      href: '/tools/sec/scan-detect',
      description: 'Paste firewall logs (CSV) to spot vertical/horizontal scans and brute-force bursts.',
      category: 'Cybersecurity',
    },
    {
      id: 'endpoint-hardening',
      name: 'Local Machine Hardening Checker',
      href: '/tools/sec/endpoint-hardening',
      description: 'Paste OS command outputs to grade Secure Boot/TPM/encryption and risky open ports.',
      category: 'Cybersecurity',
    },

    // DevOps & SecOps
    {
      id: 'secrets',
      name: 'Secrets & Keys Scanner',
      href: '/tools/devops/secrets',
      description: 'Find leaked API keys, tokens, DB URIs, and private keys in text/files — locally.',
      category: 'DevOps & SecOps',
    },
    {
      id: 'dockerfile-lint',
      name: 'Dockerfile Linter',
      href: '/tools/devops/dockerfile-lint',
      description: 'Find risky patterns and bloat in Dockerfiles with clear fix suggestions.',
      category: 'DevOps & SecOps',
    },

    {
      id: 'rag-lite',
      name: 'RAG-Lite (Vector Search)',
      href: '/tools/ai/rag-lite',
      description: 'Paste docs → build a local TF-IDF index → ask questions with extractive answers.',
      category: 'Machine Learning',
    },

    {
      id: 'web-audit',
      name: 'Web App Security Auditor',
      href: '/tools/sec/web-audit',
      description: 'Paste headers, HTML/JS, or server code — get security findings with fixes.',
      category: 'Cybersecurity',
    },
    {
      id: 'meeting-hub',
      name: 'Team Video Meeting Hub',
      href: '/tools/team/meeting',
      description: 'Plan video calls: agenda + timer, attendance, notes, actions, export minutes & .ics.',
      category: 'Collaboration',
    },
    {
      id: 'video-chat',
      name: 'Team Video Chat (P2P)',
      href: '/tools/team/video',
      description: 'Small-room WebRTC video + chat (Socket.IO signaling).',
      category: 'Collaboration',
    },

    {
      id: 'watch-party',
      name: 'Watch Party',
      href: '/tools/team/watch',
      description: 'Synchronized video watching (MP4/YouTube) with chat and host control.',
      category: 'Collaboration',
    },
    {
      id: 'domotic',
      name: 'Domotics Control (Pico)',
      href: '/tools/iot/domotic',
      description: 'Web Serial dashboard: lights/relay, PWM, servo, ADC — with demo mode.',
      category: 'IoT & Domotics',
    },
    {
      id: 'house',
      name: 'Smart Home Builder',
      href: '/tools/iot/house',
      description: 'Draw your home, drop devices, bind to Pico or simulate, control & track consumption.',
      category: 'IoT & Domotics',
    }


  ] as const;

  const order: readonly Category[] = [
    'OSINT',
    'Machine Learning',
    'Blockchain',
    'Cybersecurity',
    'DevOps & SecOps',
    'Collaboration',
    'IoT & Domotics',
  ];

  const grouped = order
    .map((cat) => ({ cat, items: tools.filter((t) => t.category === cat) }))
    .filter((g) => g.items.length > 0);

  const summaryStyle: React.CSSProperties = {
    listStyle: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    userSelect: 'none',
    background: '#f8fafc',
  };

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0 }}>Tools</h1>
      <p style={{ margin: 0, color: '#555' }}>Pick a category and open a tool.</p>

      <div style={{ display: 'grid', gap: 12 }}>
        {grouped.map((g) => (
          <details key={g.cat}>
            <summary style={summaryStyle}>
              <span style={{ fontWeight: 700 }}>{g.cat}</span>
              <span style={{ color: '#6b7280' }}>· {g.items.length}</span>
            </summary>

            <div
              style={{
                display: 'grid',
                gap: 12,
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                alignItems: 'stretch',
                marginTop: 12,
              }}
            >
              {g.items.map((t) => (
                <Link
                  key={t.id}
                  href={t.href}
                  style={{
                    textDecoration: 'none',
                    border: '1px solid #e5e7eb',
                    borderRadius: 12,
                    padding: 16,
                    display: 'block',
                    background: '#fff',
                  }}
                >
                  <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>{t.name}</div>
                  <div style={{ color: '#374151' }}>{t.description}</div>
                </Link>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
