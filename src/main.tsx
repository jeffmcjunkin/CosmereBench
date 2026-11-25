import { createRoot } from "react-dom/client";
import Bench from "./bench";
import { initializeReader } from "./reader";
import type { Archive, Analysis, Model } from "./types";
import "./globals.css";

declare const __ARCHIVE_URL__: string;
declare const __ANALYSIS_URL__: string;
const root = createRoot(document.getElementById("app")!);

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw Error("Could not load benchmark data");
  return response.json();
}
async function launch() {
  try {
    const [archive, analysis] = await Promise.all([
      getJson<Archive>(__ARCHIVE_URL__),
      getJson<Analysis>(__ANALYSIS_URL__),
    ]);
    const { questions, runs, protocol, edition } = archive;
    initializeReader(edition, questions, runs);
    const ids = new Set(questions.map((q) => q.id));
    const models: Model[] = runs.map((run) => {
      const entries = Object.entries(run.answers).filter(([id]) => ids.has(id));
      return {
        id: run.id,
        name: run.name,
        correct: entries.filter(([, a]) => a.correct).length,
        cost: entries.reduce((sum, [, a]) => sum + a.cost, 0),
        estimated: entries.some(([, a]) => a.estimated),
        byQuestion: Object.fromEntries(
          entries.map(([id, a]) => [
            id,
            {
              right: a.correct,
              cost: a.cost,
              estimated: a.estimated,
              blank: !a.text,
            },
          ]),
        ),
      };
    });
    const cards = questions.map(({ id, prompt, book, world, options }) => ({
      id,
      prompt,
      book,
      world,
      options,
    }));
    const runById = new Map(runs.map((run) => [run.id, run]));
    const sources = questions.map(
      ({
        id,
        book,
        world,
        prompt,
        sourceTitle,
        sourceUrl,
        category,
        witnessModel,
      }) => {
        const run = witnessModel ? runById.get(witnessModel) : undefined;
        const record = run?.answers[id];
        const witness =
          run && record?.correct && record.text
            ? { name: run.name, text: record.text }
            : undefined;
        return {
          id,
          book,
          world,
          prompt,
          sourceTitle,
          sourceUrl,
          category,
          witness,
        };
      },
    );
    const archiveUrl = URL.createObjectURL(
      new Blob([JSON.stringify(archive)], { type: "application/json" }),
    );
    root.render(
      <Bench
        cards={cards}
        sources={sources}
        models={models}
        analysis={analysis}
        archiveUrl={archiveUrl}
        protocol={protocol}
      />,
    );
  } catch {
    root.render(
      <main className="boot">
        <h1>CosmereBench</h1>
        <p>The benchmark data could not be loaded.</p>
        <button onClick={() => void launch()}>Try again</button>
      </main>,
    );
  }
}
void launch();
if ("serviceWorker" in navigator)
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
