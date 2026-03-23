"use client";

const TOOLS = [
  {
    title: "Fret Notes Trainer",
    description:
      "Random note practice with voice, metronome sync, and waveform feedback to memorize note names across the fretboard.",
    href: "/fret-notes",
    tag: "Memory",
  },
  {
    title: "Heat Map Memory",
    description:
      "Random string/fret memory challenge with per-position stats, accuracy tracking, and response-time heat map data.",
    href: "/heat-map-memory",
    tag: "Memory",
  },
];

export default function ToolsPage() {
  return (
    <div className="soundstage min-h-screen bg-slate-950 px-4 py-8 md:px-6">
      <main className="mx-auto max-w-5xl rounded-3xl border border-cyan-400/20 bg-slate-950/85 p-6 shadow-2xl shadow-black/50 backdrop-blur-xl md:p-10">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-100 md:text-4xl">Tools</h1>
          <p className="mt-2 text-sm text-slate-300 md:text-base">
            Pick a training tool and start practicing.
          </p>
        </header>

        <section className="grid gap-4 md:grid-cols-2">
          {TOOLS.map((tool) => (
            <article
              key={tool.href}
              className="rounded-2xl border border-cyan-300/20 bg-slate-900/70 p-4 shadow-lg shadow-black/20"
            >
              <div className="mb-3">
                <span className="rounded-md border border-cyan-300/30 bg-cyan-400/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-cyan-100">
                  {tool.tag}
                </span>
              </div>
              <h2 className="text-lg font-semibold text-slate-100">{tool.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">{tool.description}</p>
              <div className="mt-4">
                <a
                  href={tool.href}
                  className="inline-flex rounded-lg border border-cyan-300/60 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/20"
                >
                  Open tool
                </a>
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
