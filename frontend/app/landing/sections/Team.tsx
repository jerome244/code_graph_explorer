// app/landing/sections/Team.tsx
type Member = { name: string; role?: string; github: string };

const MEMBERS: Member[] = [
  { name: "Ryota Higa", role: "Front-end / Design", github: "hayama0024" },
  { name: "Pierre Lionnel Obiang", role: "Back-end", github: "PIERRE_GH_USERNAME" },
  { name: "Jerome Tran", role: "PM / Full-stack", github: "jerome244" },
];

export default function Team() {
  return (
    <section id="team" className="py-12">
      <h2 className="section-title text-slate-100">Team</h2>
      <p className="mt-2 text-sm text-slate-400">GitHub profiles of the people who built this.</p>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MEMBERS.map((m) => (
          <li key={m.github} className="card card-hover p-4">
            <div className="flex items-center gap-3">
              {/* アイコン級（24px） */}
              <img
                src={`https://github.com/${m.github}.png`}
                alt={`${m.name} avatar`}
                width={24}
                height={24}
                className="h-6 w-6 rounded-full border border-slate-700"
                loading="lazy"
                decoding="async"
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-100">{m.name}</div>
                {m.role && <div className="truncate text-[11px] text-slate-400">{m.role}</div>}
                <a
                  href={`https://github.com/${m.github}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-[11px] text-indigo-300 hover:text-indigo-200 underline underline-offset-4"
                >
                  @{m.github}
                </a>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}


  