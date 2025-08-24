import Link from 'next/link';

type Game = {
  slug: string;
  title: string;
  blurb: string;
  emoji?: string;
  comingSoon?: boolean;
};

const GAMES: Game[] = [
  {
    slug: 'minecraft',
    title: 'Minecraft-like Voxel World',
    blurb: 'Procedural terrain, day/night, NPCs, water & multiplayer (party rooms).',
    emoji: '🟩',
  },
  // Add more here as you build them:
  // { slug: 'racer', title: 'Tiny Racer', blurb: 'Arcade racing prototype.', emoji: '🏎️', comingSoon: true },
];

export default function GamesIndex() {
  return (
    <div>
      <h1>Games</h1>
      <p style={{ color: '#666', marginTop: 4, marginBottom: 16 }}>
        Pick a demo below. More coming soon!
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 16,
        }}
      >
        {GAMES.map((g) => (
          <article
            key={g.slug}
            style={{
              border: '1px solid #eee',
              borderRadius: 10,
              padding: 16,
              background: '#fff',
            }}
          >
            <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 24 }}>{g.emoji ?? '🎮'}</span>
              <h2 style={{ margin: 0, fontSize: 18 }}>{g.title}</h2>
            </header>

            <p style={{ color: '#555', marginTop: 10 }}>{g.blurb}</p>

            {g.comingSoon ? (
              <span
                style={{
                  display: 'inline-block',
                  padding: '6px 10px',
                  background: '#f5f5f5',
                  borderRadius: 8,
                  color: '#888',
                  fontSize: 13,
                }}
              >
                Coming soon
              </span>
            ) : (
              <Link
                href={`/games/${g.slug}`}
                style={{
                  display: 'inline-block',
                  padding: '8px 12px',
                  border: '1px solid #ddd',
                  borderRadius: 8,
                  textDecoration: 'none',
                }}
              >
                Play
              </Link>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
