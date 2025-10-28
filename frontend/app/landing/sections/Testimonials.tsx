// app/landing/sections/Testimonials.tsx

const QUOTES = [
    {
      body: "Our team finally sees the architecture. Reviews are 30% faster.",
      author: "Lead Engineer, Acme Corp",
    },
    {
      body: "Onboarding time halved. The graph changed how we plan features.",
      author: "CTO, Initech",
    },
    {
      body: "We found two dead modules and a nasty cycle in an hour.",
      author: "Staff Dev, Wayne Enterprises",
    },
  ];
  
  export default function Testimonials() {
    return (
      <section className="mx-auto max-w-5xl py-12">
        <h2 className="section-title text-slate-100">What users say</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {QUOTES.map((q, i) => (
            <figure
              key={i}
              className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5"
            >
              <blockquote className="text-sm text-slate-200">“{q.body}”</blockquote>
              <figcaption className="mt-3 text-xs text-slate-400">— {q.author}</figcaption>
            </figure>
          ))}
        </div>
      </section>
    );
  }
  