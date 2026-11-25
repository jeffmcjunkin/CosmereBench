import { Fragment, useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import type { Analysis, Card, Model, Pair } from "./types";
import "./similarity.css";

type Props = { models: Model[]; cards: Card[]; analysis: Analysis };
const pairKey = (a: string, b: string) =>
  JSON.stringify(a < b ? [a, b] : [b, a]);
const phiText = (n: number | null) =>
  n === null ? "n/a" : n.toFixed(2).replace("-", "−");

function SectionLink({ id, label }: { id: string; label: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timeout);
  }, [copied]);
  return (
    <a
      className="csim-link"
      href={`#${id}`}
      title={`Copy link to ${label}`}
      aria-label={copied ? "Link copied" : `Copy link to ${label}`}
      onClick={async () => {
        try {
          const url = new URL(window.location.href);
          url.hash = id;
          await navigator.clipboard.writeText(url.toString());
          setCopied(true);
        } catch {
          /* The native anchor still provides the section URL. */
        }
      }}
    >
      <Link2 size={16} aria-hidden="true" />
      {copied && <span role="status">Copied</span>}
    </a>
  );
}

function markedWords(text: string, words: string[]) {
  const vocabulary = new Set(words);
  return text
    .split(/([\p{L}\p{N}]+)/u)
    .map((part, i) =>
      vocabulary.has(part.toLowerCase()) ? (
        <mark key={i}>{part}</mark>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      ),
    );
}

function colorFor(phi: number | null) {
  if (phi === null)
    return "repeating-linear-gradient(135deg,#f4f1e9 0 3px,#e0dfda 3px 5px)";
  const strength = Math.sqrt(Math.abs(phi));
  const light = [240, 238, 228];
  const dark = phi < 0 ? [165, 79, 44] : [35, 66, 86];
  return `rgb(${light.map((c, i) => Math.round(c + (dark[i] - c) * strength)).join(",")})`;
}

export default function Similarity({ models, cards, analysis }: Props) {
  const names = new Map(models.map((m) => [m.id, m.name]));
  const modelName = (id: string) => names.get(id) ?? id;
  const cardById = new Map(cards.map((q) => [q.id, q]));
  const modelsById = new Map(models.map((m) => [m.id, m]));
  const misses = (id: string) =>
    Object.values(modelsById.get(id)?.byQuestion ?? {}).filter((q) => !q.right)
      .length;
  const pairs = [...analysis.pairs].sort(
    (l, r) =>
      (r.phi ?? -2) - (l.phi ?? -2) || r.missed.length - l.missed.length,
  );
  const byPair = new Map(pairs.map((p) => [pairKey(p.a, p.b), p]));
  const [view, setView] = useState<"chart" | "table">("chart");
  const [selection, setSelection] = useState("");
  const [focusedCell, setFocusedCell] = useState("");
  const [showSpoilers, setShowSpoilers] = useState(false);
  const selected = byPair.get(selection) ?? pairs[0];
  const groupByQ = new Map<string, Analysis["shared"]>();
  for (const entry of analysis.shared)
    groupByQ.set(entry.id, [...(groupByQ.get(entry.id) ?? []), entry]);
  useEffect(() => {
    const readHash = () => {
      if (window.location.hash === "#shared-wrong") setShowSpoilers(true);
    };
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);
  const namePair = (p: Pair) => `${modelName(p.a)} × ${modelName(p.b)}`;
  const pick = (p: Pair) => setSelection(pairKey(p.a, p.b));
  const chosen = (p: Pair) => p === selected;
  const order = analysis.order;
  const tabStop =
    focusedCell || (selected ? JSON.stringify([selected.a, selected.b]) : "");
  const quoteRows = [...analysis.quotes].sort(
    (a, b) =>
      (b.total ? b.curly / b.total : -1) - (a.total ? a.curly / a.total : -1) ||
      modelName(a.id).localeCompare(modelName(b.id)),
  );
  return (
    <section id="similarity" className="csim">
      <div className="csim-heading">
        <h2>Shared mistakes</h2>
        <SectionLink id="similarity" label="shared mistakes" />
      </div>
      <p className="csim-intro">
        Which models stumble on the same questions? Compare their right and
        wrong answers across the benchmark.
      </p>
      {pairs.length === 0 ? (
        <p className="csim-empty">
          Shared mistakes appear once two models have completed the benchmark.
        </p>
      ) : (
        <>
          <div className="csim-tools">
            <span className="csim-caption">
              Agreement on shared questions · {cards.length} in this edition
            </span>
            <div
              className="csim-switch"
              role="group"
              aria-label="Model agreement view"
            >
              <button
                type="button"
                aria-pressed={view === "chart"}
                onClick={() => setView("chart")}
              >
                Chart
              </button>
              <button
                type="button"
                aria-pressed={view === "table"}
                onClick={() => setView("table")}
              >
                Table
              </button>
            </div>
          </div>
          {view === "chart" ? (
            <div>
              <div
                className="csim-scroll csim-heat-region"
                role="region"
                tabIndex={0}
                aria-label="Pairwise model correlation chart"
              >
                <table className="csim-matrix" data-dense={order.length > 16}>
                  <caption className="csim-sr">
                    Rows and columns use the same model numbers. Use arrow keys
                    to move between squares and Enter to select a pair.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" className="csim-name">
                        Model
                      </th>
                      {order.map((id, i) => (
                        <th scope="col" key={id} title={modelName(id)}>
                          <span aria-hidden="true">{i + 1}</span>
                          <span className="csim-sr">{modelName(id)}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {order.map((a, i) => (
                      <tr key={a}>
                        <th scope="row" className="csim-name">
                          <span className="csim-number">{i + 1}</span>
                          {modelName(a)}
                        </th>
                        {order.map((b, j) => {
                          const p = byPair.get(pairKey(a, b));
                          if (!p)
                            return (
                              <td key={b}>
                                <span
                                  className="csim-diag"
                                  aria-label="Same model"
                                >
                                  ·
                                </span>
                              </td>
                            );
                          const label = `${namePair(p)}, correlation ${phiText(p.phi)}, ${p.missed.length} shared misses`;
                          const cellId = JSON.stringify([a, b]);
                          return (
                            <td key={b}>
                              <button
                                className="csim-cell"
                                type="button"
                                title={label}
                                aria-label={label}
                                id={`csim-cell-${i}-${j}`}
                                tabIndex={cellId === tabStop ? 0 : -1}
                                onFocus={() => setFocusedCell(cellId)}
                                onKeyDown={(e) => {
                                  const moves: Record<
                                    string,
                                    [number, number]
                                  > = {
                                    ArrowRight: [0, 1],
                                    ArrowLeft: [0, -1],
                                    ArrowDown: [1, 0],
                                    ArrowUp: [-1, 0],
                                  };
                                  const move = moves[e.key];
                                  if (!move) return;
                                  e.preventDefault();
                                  let row = i + move[0],
                                    col = j + move[1];
                                  if (row === col) {
                                    row += move[0];
                                    col += move[1];
                                  }
                                  document
                                    .getElementById(`csim-cell-${row}-${col}`)
                                    ?.focus();
                                }}
                                aria-pressed={chosen(p)}
                                style={{ background: colorFor(p.phi) }}
                                onClick={() => pick(p)}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div
                className="csim-scale"
                aria-label="Copper indicates negative correlation, ivory zero, navy positive"
              >
                <span>−1</span>
                <i />
                <span>+1</span>
                <span className="csim-scale-caption">φ correlation</span>
              </div>
              <p className="csim-note">
                Nearby rows have similar records. A positive φ means the pair
                tends to get the same questions right and wrong. Hatched squares
                have no defined φ because one model’s grades never vary.
              </p>
            </div>
          ) : (
            <div
              className="csim-scroll csim-pair-table"
              role="region"
              tabIndex={0}
              aria-label="All model pairs"
            >
              <table className="csim-data">
                <thead>
                  <tr>
                    <th>Model pair</th>
                    <th>φ</th>
                    <th>Both missed</th>
                    <th>Each missed</th>
                  </tr>
                </thead>
                <tbody>
                  {pairs.map((p) => (
                    <tr key={pairKey(p.a, p.b)} data-chosen={chosen(p)}>
                      <td>
                        <button
                          className="csim-pick"
                          aria-pressed={chosen(p)}
                          type="button"
                          onClick={() => pick(p)}
                        >
                          {namePair(p)}
                        </button>
                      </td>
                      <td>{phiText(p.phi)}</td>
                      <td>{p.missed.length}</td>
                      <td>
                        {misses(p.a)} / {misses(p.b)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {selected && (
            <div
              className="csim-selected"
              aria-live="polite"
              aria-atomic="false"
            >
              <div className="csim-selected-head">
                <strong>{namePair(selected)}</strong>
                <span>φ {phiText(selected.phi)}</span>
              </div>
              <p>
                {
                  Object.keys(
                    modelsById.get(selected.a)?.byQuestion ?? {},
                  ).filter((id) => modelsById.get(selected.b)?.byQuestion[id])
                    .length
                }{" "}
                questions in common. {modelName(selected.a)} missed{" "}
                {misses(selected.a)} overall. {modelName(selected.b)} missed{" "}
                {misses(selected.b)}.
              </p>
              {selected.missed.length ? (
                <details key={pairKey(selected.a, selected.b)}>
                  <summary>
                    View {selected.missed.length} shared{" "}
                    {selected.missed.length === 1 ? "miss" : "misses"}
                  </summary>
                  <ul>
                    {selected.missed.map((id) => (
                      <li key={id}>
                        <span>{cardById.get(id)?.prompt ?? id}</span>
                        <small>{cardById.get(id)?.book}</small>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : (
                <p>They have no shared misses.</p>
              )}
            </div>
          )}
        </>
      )}
      <div id="wording-section" className="csim-subhead">
        <h3>Wording and punctuation</h3>
        <SectionLink id="wording-section" label="wording and punctuation" />
      </div>
      <div className="csim-columns">
        <div>
          <h4>Similar wording</h4>
          <p className="csim-note">
            Extra word overlap compared with other pairs on the same question
            with the same grading pattern. Common words and words in the prompt
            are excluded.
          </p>
          {analysis.wording.length ? (
            <div
              className="csim-scroll csim-mini"
              role="region"
              tabIndex={0}
              aria-label="Model pairs ranked by wording overlap"
            >
              <table className="csim-data">
                <thead>
                  <tr>
                    <th>Model pair</th>
                    <th>Extra overlap</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.wording.map((p) => (
                    <tr key={pairKey(p.a, p.b)}>
                      <td>{namePair(p)}</td>
                      <td>
                        {p.excess > 0 ? "+" : ""}
                        {p.excess.toFixed(1)} pp
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="csim-empty">No comparable wording pairs.</p>
          )}
        </div>
        <div>
          <h4>Curly quotation marks</h4>
          <p className="csim-note">
            Share of quotation marks and apostrophes printed with a curl. The
            count includes every mark in the model’s answers.
          </p>
          {quoteRows.length ? (
            <div
              className="csim-scroll csim-mini"
              role="region"
              tabIndex={0}
              aria-label="Curly quotation mark frequencies"
            >
              <table className="csim-data">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Curly</th>
                    <th>All marks</th>
                  </tr>
                </thead>
                <tbody>
                  {quoteRows.map((q) => (
                    <tr key={q.id}>
                      <td>{modelName(q.id)}</td>
                      <td>
                        {q.total
                          ? Math.round((100 * q.curly) / q.total) + "%"
                          : "—"}
                      </td>
                      <td>{q.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="csim-empty">No model answers available.</p>
          )}
        </div>
      </div>
      <div id="shared-wrong" className="csim-subhead">
        <h3>Shared wrong answers</h3>
        <SectionLink id="shared-wrong" label="shared wrong answers" />
      </div>
      <p className="csim-note">
        Two wrong answers qualify when they share at least four distinctive
        words absent from the prompt, the reference answer and every correct
        model response.
      </p>
      {groupByQ.size ? (
        <details
          className="csim-spoilers"
          open={showSpoilers}
          onToggle={(e) => setShowSpoilers(e.currentTarget.open)}
        >
          <summary>
            Reveal model answers for {groupByQ.size}{" "}
            {groupByQ.size === 1 ? "question" : "questions"}{" "}
            <span>· spoilers</span>
          </summary>
          {Array.from(groupByQ).map(([id, entries]) => (
            <details className="csim-example" key={id}>
              <summary>{cardById.get(id)?.prompt ?? id}</summary>
              {entries.map((e) => (
                <div key={pairKey(e.a, e.b)} className="csim-quotes">
                  {[
                    [e.a, e.ta],
                    [e.b, e.tb],
                  ].map(([model, response]) => (
                    <figure key={model}>
                      <figcaption>{modelName(model)}</figcaption>
                      <blockquote>{markedWords(response, e.words)}</blockquote>
                    </figure>
                  ))}
                </div>
              ))}
            </details>
          ))}
        </details>
      ) : (
        <p className="csim-empty">No pair met the four-word threshold.</p>
      )}
    </section>
  );
}
