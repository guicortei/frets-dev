"use client";

import { useAppLanguage } from "../i18n-provider";
import FloatingBackButton from "../components/floating-back-button";

const TOOLS = [
  {
    titleKey: "read-and-locate",
    href: "/read-and-locate",
    tagKey: "memory",
  },
  {
    titleKey: "name-the-note",
    href: "/name-the-note",
    tagKey: "memory",
  },
];

export default function ToolsPage() {
  const { tr } = useAppLanguage();
  const toolText = {
    "read-and-locate": {
      title: tr("Read and Locate", "Leia e localize"),
      description: tr(
        "Random note practice with voice, metronome sync, and waveform feedback to memorize note names across the fretboard.",
        "Pratica aleatoria de notas com voz, sincronia de metronomo e feedback visual de onda para memorizar notas no braco.",
      ),
    },
    "name-the-note": {
      title: tr("Name the Note", "Nomeie a Nota"),
      description: tr(
        "Random string and fret memory challenge with per-position stats, accuracy tracking, and response-time map data.",
        "Desafio de memoria por corda e casa com estatisticas por posicao, acompanhamento de precisao e mapa de tempo de resposta.",
      ),
    },
    memory: tr("Memory", "Memoria"),
  };

  return (
    <div className="soundstage min-h-screen bg-slate-950 px-4 py-8 md:px-6">
      <FloatingBackButton href="/" />
      <main className="mx-auto max-w-5xl rounded-3xl border border-cyan-400/20 bg-slate-950/85 p-6 shadow-2xl shadow-black/50 backdrop-blur-xl md:p-10">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-100 md:text-4xl">{tr("Tools", "Ferramentas")}</h1>
          <p className="mt-2 text-sm text-slate-300 md:text-base">
            {tr("Pick a training tool and start practicing.", "Escolha uma ferramenta de estudo e começe a praticar.")}
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
                  {toolText[tool.tagKey]}
                </span>
              </div>
              <h2 className="text-lg font-semibold text-slate-100">{toolText[tool.titleKey].title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">{toolText[tool.titleKey].description}</p>
              <div className="mt-4">
                <a
                  href={tool.href}
                  className="inline-flex rounded-lg border border-cyan-300/60 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/20"
                >
                  {tr("Open tool", "Abrir ferramenta")}
                </a>
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
