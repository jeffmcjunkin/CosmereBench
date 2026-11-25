import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Layers,
  ChartNoAxesCombined,
  ChartColumnIncreasing,
  Grid2X2,
  Orbit,
  Link2,
  Compass,
  LibraryBig,
  ScrollText,
  X,
  Search,
  Check,
  ChevronRight,
  Feather,
} from "lucide-react";
import type { Analysis, Card, Model, Source, Protocol } from "./types";
import Performance from "./performance";
import Similarity from "./similarity";
import Quiz from "./quiz";
import {
  getStats,
  subscribeReader,
  pendingRound,
  rememberRound,
} from "./reader";

const tabs = [
  { id: "frontier", name: "Pareto frontier", Icon: ChartNoAxesCombined },
  { id: "scores", name: "Model scores", Icon: ChartColumnIncreasing },
  { id: "categories", name: "Categories", Icon: Layers },
  { id: "similarity", name: "Shared mistakes", Icon: Grid2X2 },
] as const;
type Tab = (typeof tabs)[number]["id"];
type Panel = "sources" | "method" | "";
function shuffle<T>(a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function Star({ small = false }: { small?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 64"
      width={small ? 21 : 40}
      height={small ? 21 : 40}
      fill="none"
      className="compassmark"
    >
      <circle cx="32" cy="32" r="18" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="m12 12 20 12 20-12-12 20 12 20-20-12-20 12 12-20z"
        stroke="currentColor"
      />
      <path d="m32 2 5 24 23 6-23 5-5 25-6-25-24-5 24-6z" fill="currentColor" />
      <path d="m32 18 3 12 12 2-12 3-3 12-3-12-12-3 12-2z" fill="#f6efe3" />
    </svg>
  );
}
export default function Bench({
  cards,
  models,
  sources,
  analysis,
  archiveUrl,
  protocol,
}: {
  cards: Card[];
  models: Model[];
  sources: Source[];
  analysis: Analysis;
  archiveUrl: string;
  protocol: Protocol;
}) {
  const [stats, setStats] = useState(getStats);
  const [resumeIds, setResumeIds] = useState(pendingRound);
  const [round, setRound] = useState<Card[] | null>(null);
  const [tab, setTab] = useState<Tab>("frontier");
  const [panel, setPanel] = useState<Panel>("");
  const [copied, setCopied] = useState("");
  const [restored, setRestored] = useState(false);
  const results = useRef<HTMLElement>(null);
  const count = Object.keys(stats.mine).length;
  const remaining = cards.length - count;
  useEffect(() => {
    const sync = () => {
      setStats(getStats());
      setResumeIds(pendingRound());
    };
    sync();
    return subscribeReader(sync);
  }, []);
  useEffect(() => {
    const applyHash = () => {
      const hash = location.hash.slice(1);
      const t = tabs.find((v) => v.id === hash);
      const shared = ["wording-section", "shared-wrong"].includes(hash);
      if (t || shared) {
        setPanel("");
        setTab(t?.id ?? "similarity");
        window.setTimeout(() => {
          (document.getElementById(hash) || results.current)?.scrollIntoView({
            block: "start",
          });
        }, 80);
      } else if (hash === "sources" || hash === "methodology")
        setPanel(hash === "sources" ? "sources" : "method");
      else setPanel("");
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);
  function go(t: Tab, scroll = false) {
    setPanel("");
    setTab(t);
    history.replaceState(null, "", "#" + t);
    if (scroll)
      results.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function show(p: Panel) {
    setPanel(p);
    if (p)
      history.replaceState(
        null,
        "",
        p === "sources" ? "#sources" : "#methodology",
      );
    else history.replaceState(null, "", location.pathname + location.search);
  }
  function start(n: number) {
    const left = shuffle(cards.filter((q) => !(q.id in stats.mine)));
    if (!left.length) {
      go("frontier", true);
      return;
    }
    const next = left.slice(0, n);
    rememberRound(next.map((q) => q.id));
    setResumeIds(next.map((q) => q.id));
    setRound(next);
    setRestored(false);
  }
  function resume() {
    const byId = new Map(cards.map((q) => [q.id, q]));
    const rest = pendingRound().flatMap((id) => byId.get(id) || []);
    if (rest.length) {
      setRound(rest);
      setRestored(false);
    }
  }
  async function copy() {
    const u = new URL(location.href);
    u.hash = tab;
    history.replaceState(null, "", u);
    try {
      await navigator.clipboard.writeText(u.href);
      setCopied("Link copied");
    } catch {
      setCopied("Link in address bar");
    }
    window.setTimeout(() => setCopied(""), 2200);
  }
  function finish() {
    setRound(null);
    setRestored(true);
    go("frontier", true);
    setStats(getStats());
    setResumeIds(pendingRound());
  }
  return (
    <>
      <header className="mast">
        <div className="shell mastin">
          <a
            className="wordmark"
            href="#"
            aria-label="CosmereBench home"
            onClick={(e) => {
              e.preventDefault();
              show("");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <Star />
            Cosmere<span>Bench</span>
          </a>
          <nav className="topnav" aria-label="Site navigation">
            <button
              className={!panel ? "current" : ""}
              onClick={() => go("frontier", true)}
            >
              Benchmark
            </button>
            <button
              className={panel === "sources" ? "current" : ""}
              onClick={() => show("sources")}
            >
              Source library
            </button>
            <button
              className={panel === "method" ? "current" : ""}
              onClick={() => show("method")}
            >
              Methodology
            </button>
          </nav>
        </div>
      </header>
      <main>
        <section className="hero">
          <div className="shell hero-inner">
            <div className="intro">
              <div className="overline">
                <span className="little-rule" />A COSMERE KNOWLEDGE BENCHMARK
              </div>
              <h1>
                How well do you
                <br />
                know the <em>Cosmere?</em>
              </h1>
              <p>
                From the mists of Scadrial to the storms of Roshar, test your
                knowledge against AI. Can you spot the questions with a false
                premise?
              </p>
              <div className="quizbuttons">
                <button
                  className="action primary"
                  disabled={remaining === 0}
                  onClick={() => start(15)}
                >
                  <Feather size={18} />
                  Quick quiz
                  <span>{Math.min(15, remaining || cards.length)} Q</span>
                </button>
                <button
                  className="action secondary"
                  disabled={remaining === 0}
                  onClick={() => start(cards.length)}
                >
                  <BookOpen size={18} />
                  Full quiz<span>{cards.length} Q</span>
                </button>
              </div>
              <div className="spoiler-note">
                {count ? (
                  <>
                    <Check size={14} /> {count} of {cards.length} answered ·{" "}
                    {count === cards.length
                      ? "Benchmark complete"
                      : "New rounds skip these questions"}
                  </>
                ) : (
                  <>Includes spoilers across the published Cosmere.</>
                )}
              </div>
              {resumeIds.length > 0 && !round && (
                <button className="resume-control" onClick={resume}>
                  Resume previous round · {resumeIds.length} left
                </button>
              )}
            </div>
            <figure className="landscape">
              <img
                src="./shattered-plains.webp"
                alt="An engraved view across the chasms of Roshar, with a traveler beneath a celestial chart."
              />
              <figcaption>
                <span />
                Roshar · The Shattered Plains
              </figcaption>
            </figure>
          </div>
        </section>
        <div className="factbar">
          <div className="shell facts">
            <div>
              <BookOpen />
              <strong>{cards.length}</strong> questions
            </div>
            <i />
            <div>
              <Orbit />
              <strong>{models.length}</strong> AI models
            </div>
            <i />
            <div>
              <Compass />
              <strong>{new Set(sources.map((s) => s.world)).size}</strong>{" "}
              worlds
            </div>
            <button onClick={() => show("method")}>
              How scoring works <ChevronRight size={14} />
            </button>
          </div>
        </div>
        <section
          className="results shell"
          ref={results}
          aria-label="Benchmark results"
        >
          <div className="tabrow">
            <nav className="benchtabs" aria-label="Benchmark views">
              {tabs.map(({ id, name, Icon }) => (
                <button
                  key={id}
                  aria-current={tab === id ? "page" : undefined}
                  className={tab === id ? "active" : ""}
                  onClick={() => go(id)}
                >
                  <Icon size={17} />
                  <span className="tab-full">{name}</span>
                  <span className="tab-short">
                    {
                      {
                        frontier: "Frontier",
                        scores: "Scores",
                        categories: "Categories",
                        similarity: "Shared mistakes",
                      }[id]
                    }
                  </span>
                </button>
              ))}
            </nav>
            <button
              className="share"
              title="Copy link to this view"
              onClick={copy}
              aria-label={copied || "Copy link to this view"}
            >
              {copied ? <Check size={15} /> : <Link2 size={15} />}
              <span>{copied || "Copy link"}</span>
            </button>
          </div>
          {restored && count > 0 && (
            <div className="returnstrip">
              <span>
                Your score{" "}
                <b>
                  {Object.values(stats.mine).filter(Boolean).length}/{count}
                </b>
              </span>
              {count < cards.length && (
                <>
                  <button onClick={() => start(15)}>Another quick quiz</button>
                  <button onClick={() => start(cards.length)}>
                    Finish all {cards.length}
                  </button>
                </>
              )}
            </div>
          )}
          {tab === "similarity" ? (
            <Similarity models={models} cards={cards} analysis={analysis} />
          ) : (
            <div id={tab}>
              <Performance
                tab={tab}
                models={models}
                sources={sources}
                stats={stats}
              />
            </div>
          )}
        </section>
      </main>
      <footer className="shell footer">
        <div className="footbrand">
          <Star small />
          CosmereBench
        </div>
        <p>
          An independent fan benchmark inspired by{" "}
          <a
            href="https://skbench.doesthispersonexist.com/"
            target="_blank"
            rel="noreferrer"
          >
            mjr’s SK Bench
          </a>
          .
        </p>
        <button onClick={() => show("method")}>Methodology</button>
      </footer>
      {round && (
        <Quiz
          round={round}
          stats={stats}
          onClose={finish}
          onAnswer={(id, correct) =>
            setStats((prev) => ({
              ...prev,
              mine: { ...prev.mine, [id]: correct },
            }))
          }
        />
      )}
      {panel && (
        <Info
          panel={panel}
          sources={sources}
          models={models}
          archiveUrl={archiveUrl}
          protocol={protocol}
          close={() => show("")}
        />
      )}
    </>
  );
}
function Info({
  panel,
  sources,
  models,
  close,
  archiveUrl,
  protocol,
}: {
  panel: Panel;
  sources: Source[];
  models: Model[];
  close: () => void;
  archiveUrl: string;
  protocol: Protocol;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [world, setWorld] = useState("");
  useEffect(() => {
    const d = dialog.current;
    const active = document.activeElement as HTMLElement;
    d?.showModal();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      d?.close();
      document.body.style.overflow = prev;
      active?.focus({ preventScroll: true });
    };
  }, []);
  const books = [...new Set(sources.map((s) => s.world))].sort();
  const distinct = new Set(sources.map((s) => s.sourceUrl)).size;
  const coverage = new Map<string, { correct: number; recorded: number }>();
  for (const model of models) {
    for (const [id, answer] of Object.entries(model.byQuestion)) {
      const total = coverage.get(id) ?? { correct: 0, recorded: 0 };
      total.recorded++;
      if (answer.right) total.correct++;
      coverage.set(id, total);
    }
  }
  const filtered = sources.filter(
    (s) =>
      (!world || s.world === world) &&
      [s.id, s.book, s.world, s.prompt, s.sourceTitle]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <dialog
      ref={dialog}
      className="info"
      aria-labelledby="info-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === dialog.current && e.clientX !== 0) {
          const r = dialog.current!.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            close();
        }
      }}
    >
      <div className="info-head">
        <div className="overline">
          {panel === "sources" ? (
            <LibraryBig size={16} />
          ) : (
            <ScrollText size={16} />
          )}{" "}
          COSMEREBENCH
        </div>
        <button aria-label="Close dialog" className="iconbtn" onClick={close}>
          <X size={20} />
        </button>
      </div>
      <h2 id="info-title">
        {panel === "sources" ? "Source library" : "Methodology"}
      </h2>
      {panel === "sources" ? (
        <>
          <p className="infodesc">
            Follow the evidence for each of the {sources.length} questions. The{" "}
            {distinct} linked sources include book excerpts, author annotations,
            and signing transcripts. Source titles can contain spoilers.
          </p>
          <div className="filters">
            <label className="search">
              <Search size={17} />
              <input
                aria-label="Search sources"
                placeholder="Search questions, books, or sources"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              aria-label="Filter by world"
              value={world}
              onChange={(e) => setWorld(e.target.value)}
            >
              <option value="">All worlds</option>
              {books.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </div>
          <p className="sourcecount">
            {filtered.length} question{filtered.length === 1 ? "" : "s"}
          </p>
          <div className="sourcelist">
            {filtered.map((s) => {
              const result = coverage.get(s.id);
              return (
                <div className="sourcerow" key={s.id}>
                  <span>{s.id}</span>
                  <div>
                    <small>
                      {s.world} · {s.book}
                    </small>
                    <p className="source-prompt">{s.prompt}</p>
                    <a href={s.sourceUrl} target="_blank" rel="noreferrer">
                      {s.sourceTitle}
                    </a>
                    <small className="source-model-score">
                      {result
                        ? `${result.correct}/${result.recorded} models correct`
                        : "No model responses recorded"}
                      {result &&
                        result.recorded < models.length &&
                        ` · ${result.recorded} of ${models.length} evaluated`}
                    </small>
                    {s.witness && (
                      <details className="source-witness">
                        <summary>
                          Show one correct model answer (spoiler)
                        </summary>
                        <p>
                          <strong>{s.witness.name}</strong>
                        </p>
                        <blockquote>{s.witness.text}</blockquote>
                      </details>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {!filtered.length && <p>No sources matched your search.</p>}
        </>
      ) : (
        <div className="methods">
          <p className="infodesc">
            Edition {protocol.version} compares readers and {models.length}{" "}
            language models on {sources.length} Cosmere questions.
          </p>
          <h3>The question bank</h3>
          <p>
            This edition covers {books.length} worlds across{" "}
            {new Set(sources.map((s) => s.book)).size} books and collections.{" "}
            {sources.filter((s) => s.category === "False premises").length}{" "}
            questions contain a false premise. Every answer includes an
            explanation and a source.
          </p>
          {Number.parseInt(protocol.version) >= 2 && (
            <p>
              {typeof protocol.candidateQuestions === "number" && (
                <>
                  We tested {protocol.candidateQuestions} candidate questions
                  and retained {sources.length}.{" "}
                </>
              )}
              The same models used to select the questions are ranked here. We
              excluded questions for which the audit found no verified correct
              model answer. This selection changes the difficulty, so compare
              scores within the same edition.{" "}
              <a
                href="https://github.com/jeffmcjunkin/CosmereBench/blob/main/data/excluded.json"
                target="_blank"
                rel="noreferrer"
              >
                Review the excluded questions and audit notes
              </a>
              .
            </p>
          )}
          <details className="coverage">
            <summary>Question coverage by world</summary>
            <table>
              <thead>
                <tr>
                  <th scope="col">World</th>
                  <th scope="col">Questions</th>
                  <th scope="col">Works</th>
                </tr>
              </thead>
              <tbody>
                {books.map((w) => {
                  const items = sources.filter((s) => s.world === w);
                  return (
                    <tr key={w}>
                      <th scope="row">{w}</th>
                      <td>{items.length}</td>
                      <td>{new Set(items.map((s) => s.book)).size}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </details>
          <h3>How the models answered</h3>
          <p>
            Each model received one question per OpenRouter request, without
            answer choices, sources, tools, or conversation history. The prompt
            asked for one or two sentences and an explicit correction where
            needed. Runs used low reasoning effort and temperature zero where
            supported.
            {protocol.firstPassTokens && (
              <>
                The initial completion limit was{" "}
                {protocol.firstPassTokens.toLocaleString()} tokens.{" "}
              </>
            )}
            {protocol.truncationRetryTokens && (
              <>
                Empty or truncated responses were eligible for a{" "}
                {protocol.truncationRetryTokens.toLocaleString()}-token
                retry.{" "}
              </>
            )}
            {protocol.finalTruncationRetryTokens && (
              <>
                The final retry limit was{" "}
                {protocol.finalTruncationRetryTokens.toLocaleString()} tokens.
              </>
            )}
          </p>
          <h3>How answers were graded</h3>
          <p>
            {protocol.primaryJudge && protocol.secondaryJudge ? (
              <>
                <code>{protocol.primaryJudge}</code> and{" "}
                <code>{protocol.secondaryJudge}</code> independently scored
                anonymized responses against the cited answer and
                explanation.{" "}
              </>
            ) : (
              "Responses were scored against the cited answer and explanation. "
            )}
            {protocol.scoring} Equivalent wording and minor spelling differences
            count. Incorrect claims, missed parts and empty answers score zero.{" "}
            {models.reduce(
              (n, m) =>
                n + Object.values(m.byQuestion).filter((a) => a.blank).length,
              0,
            )}{" "}
            final responses contained no answer text. Each question is worth one
            point. The downloadable results include the text and verdict for
            every response.{" "}
            {models
              .reduce((n, m) => n + Object.keys(m.byQuestion).length, 0)
              .toLocaleString()}{" "}
            model–question records are available out of{" "}
            {(models.length * sources.length).toLocaleString()} possible.
            Full-bank rankings include models with a recorded verdict on every
            question.
          </p>
          <h3>Reading the Pareto frontier</h3>
          <p>
            A model is on the frontier when no other model costs less or the
            same and scores as well or better, with at least one strict
            improvement. The horizontal axis shows the cost of answering 100
            questions in US dollars on a logarithmic scale. Costs include billed
            reasoning tokens and all attempts for retried questions. Grading
            costs are excluded. With a personal question subset, costs are
            normalized to 100 questions.
          </p>
          <h3>Reader scores</h3>
          <p>
            Readers choose from multiple-choice options. The first submitted
            answer counts. Progress is saved in this browser for this edition,
            and new rounds draw from unanswered questions. Anonymous first
            answers are pooled across readers when the service is reachable. The
            frontier averages individual reader accuracies after at least ten
            first answers on questions in this edition. Each qualifying reader
            has equal weight. Category and per-question totals include every
            first answer. Personal scoring also works offline. Models answer in
            free text, so the two formats differ in difficulty.
          </p>
          <h3>Shared mistakes</h3>
          <p>
            The matrix compares each pair’s pattern of correct and incorrect
            answers using the phi coefficient. Select a pair to inspect the
            questions they both missed. Wording and punctuation summaries
            describe their responses in this run.
          </p>
          <details>
            <summary>Download the dataset · contains spoilers</summary>
            <p>
              Includes questions, choices, the complete answer key, evidence
              links, individual model responses, scores and recorded costs.
            </p>
            <a
              download={"cosmerebench-v" + protocol.version + ".json"}
              href={archiveUrl}
            >
              Download benchmark JSON
            </a>
          </details>
          <p>
            Browse the benchmark data and evaluation code in the{" "}
            <a
              href="https://github.com/jeffmcjunkin/CosmereBench"
              target="_blank"
              rel="noreferrer"
            >
              public GitHub repository
            </a>
            .
          </p>
          <p className="credit">
            CosmereBench is an independent fan project. Source material belongs
            to Brandon Sanderson and the respective publishers. Benchmark design
            inspired by{" "}
            <a
              href="https://skbench.doesthispersonexist.com/"
              target="_blank"
              rel="noreferrer"
            >
              mjr’s SK Bench
            </a>
            .
          </p>
        </div>
      )}
    </dialog>
  );
}
