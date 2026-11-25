import { useEffect, useRef, useState } from "react";
import type { Model, Source, Stats, Total } from "./types";
import "./performance.css";

type Tab = "frontier" | "scores" | "categories";
type Props = { tab: Tab; models: Model[]; stats: Stats; sources: Source[] };
type Result = {
  model: Model;
  right: number;
  total: number;
  blanks: number;
  score: number;
  price: number;
  estimated: boolean;
};
type ReaderLine = {
  name: string;
  key: string;
  score: number;
  counts?: Total;
  color: string;
  dash: string;
};
const PERCENT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const pct = (n: number) => PERCENT.format(n) + "%";
const money = (n: number, estimate = false) =>
  (estimate ? "≈" : "") +
  "$" +
  (n === 0
    ? "0"
    : new Intl.NumberFormat("en-US", { maximumSignificantDigits: 3 }).format(
        n,
      ));
const byPrice = (a: Result, b: Result) =>
  a.price - b.price ||
  b.score - a.score ||
  a.model.name.localeCompare(b.model.name);
const byScore = (a: Result, b: Result) => b.score - a.score || byPrice(a, b);

function resultsFor(models: Model[], ids: string[]) {
  const results: Result[] = [];
  if (!ids.length) return results;
  for (const model of models) {
    const answers = ids.map((id) => model.byQuestion[id]);
    if (answers.some((answer) => !answer)) continue;
    const right = answers.filter((answer) => answer.right).length;
    const price =
      (answers.reduce((sum, answer) => sum + answer.cost, 0) * 100) /
      ids.length;
    if (!Number.isFinite(price) || price < 0) continue;
    results.push({
      model,
      right,
      total: ids.length,
      blanks: answers.filter((a) => a.blank).length,
      score: (100 * right) / ids.length,
      price: Number(price.toPrecision(12)),
      estimated: answers.some((answer) => answer.estimated),
    });
  }
  return results.sort(byScore);
}

function pareto(rows: Result[]) {
  return rows
    .filter(
      (point) =>
        !rows.some(
          (other) =>
            other.price <= point.price &&
            other.score >= point.score &&
            (other.price < point.price || other.score > point.score),
        ),
    )
    .sort(byPrice);
}

function humanTotals(ids: string[], stats: Stats, mine: boolean): Total {
  const sum = { answered: 0, correct: 0 };
  for (const id of ids) {
    if (mine) {
      if (typeof stats.mine[id] !== "boolean") continue;
      sum.answered++;
      if (stats.mine[id]) sum.correct++;
    } else if (stats.human[id]) {
      sum.answered += stats.human[id].answered;
      sum.correct += stats.human[id].correct;
    }
  }
  return sum;
}

function ViewIcon({ chart }: { chart: boolean }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      {chart ? (
        <>
          <path d="M2.5 2.5v11h11" />
          <path d="m4.5 10 3-4 2.2 1.8L13 3.7" />
        </>
      ) : (
        <>
          <rect x="2" y="3" width="12" height="10" rx="1" />
          <path d="M2 6.5h12M6.4 3v10" />
        </>
      )}
    </svg>
  );
}

function performanceTable(
  rows: Result[],
  frontier: Result[],
  showRank: boolean,
  readerLines: ReaderLine[],
) {
  const efficient = new Set(frontier.map((row) => row.model.id));
  const ordered = showRank ? rows : [...rows].sort(byPrice);
  let rank = 0;
  return (
    <div
      className="cbp-scroll"
      role="region"
      tabIndex={0}
      aria-label={showRank ? "Model scores" : "Frontier data"}
    >
      <table className="cbp-table">
        <thead>
          <tr>
            {showRank && <th scope="col">Rank</th>}
            <th scope="col">{showRank ? "Model" : "Participant"}</th>
            <th scope="col">Accuracy</th>
            <th scope="col">Correct</th>
            {showRank && <th scope="col">No answer</th>}
            <th scope="col">Cost / 100</th>
            <th scope="col">Frontier</th>
          </tr>
        </thead>
        <tbody>
          {!showRank &&
            readerLines.map((line) => (
              <tr key={line.key} className="cbp-reader-row">
                <th scope="row">{line.name}</th>
                <td>{pct(line.score)}</td>
                <td>
                  {line.counts
                    ? `${line.counts.correct}/${line.counts.answered}`
                    : "—"}
                </td>
                <td>—</td>
                <td>—</td>
              </tr>
            ))}
          {ordered.map((r, i) => {
            if (i === 0 || r.score !== ordered[i - 1].score) rank = i + 1;
            return (
              <tr key={r.model.id}>
                {showRank && <td className="cbp-numeric">{rank}</td>}
                <th scope="row">{r.model.name}</th>
                <td>
                  <div className="cbp-scorecell">
                    <span className="cbp-meter" aria-hidden="true">
                      <i style={{ width: pct(r.score) }} />
                    </span>
                    <span className="cbp-numeric">{pct(r.score)}</span>
                  </div>
                </td>
                <td className="cbp-numeric">
                  {r.right}/{r.total}
                </td>
                {showRank && <td className="cbp-numeric">{r.blanks}</td>}
                <td className="cbp-numeric">{money(r.price, r.estimated)}</td>
                <td>
                  {efficient.has(r.model.id) ? (
                    <span className="cbp-flag">On frontier</span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Categories({
  rows,
  ids,
  stats,
  sources,
  group,
}: {
  rows: Result[];
  ids: string[];
  stats: Stats;
  sources: Source[];
  group: "world" | "category";
}) {
  const permitted = new Set(ids);
  const groups = new Map<string, string[]>();
  for (const s of sources) {
    if (permitted.has(s.id))
      groups.set(s[group], [...(groups.get(s[group]) || []), s.id]);
  }
  const cats = [
    "Foundations",
    "Close reading",
    "Connections",
    "False premises",
  ];
  const entries = [...groups].sort(([a], [b]) =>
    group === "category"
      ? cats.indexOf(a) - cats.indexOf(b)
      : a.localeCompare(b),
  );
  const columns: [string, string[]][] = [["Overall", ids], ...entries];
  function row(
    key: string,
    label: string,
    counts: (keys: string[]) => Total,
    reader = false,
  ) {
    return (
      <tr key={key} className={reader ? "cbp-reader-row" : undefined}>
        <th scope="row">{label}</th>
        {columns.map(([name, keys]) => {
          const value = counts(keys);
          return (
            <td
              key={name}
              className="cbp-numeric"
              title={
                value.answered
                  ? value.correct + " correct of " + value.answered
                  : "No answers yet"
              }
            >
              {value.answered
                ? pct((100 * value.correct) / value.answered)
                : "—"}
            </td>
          );
        })}
      </tr>
    );
  }
  return (
    <div
      className="cbp-scroll"
      tabIndex={0}
      role="region"
      aria-label="Model and reader results"
    >
      <table className="cbp-table cbp-breakdown">
        <thead>
          <tr>
            <th scope="col">Participant</th>
            {columns.map(([name]) => (
              <th scope="col" key={name}>
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.keys(stats.mine).length > 0 &&
            row("own", "You", (keys) => humanTotals(keys, stats, true), true)}
          {row(
            "people",
            "All readers",
            (keys) => humanTotals(keys, stats, false),
            true,
          )}
          {rows.map((r) =>
            row(r.model.id, r.model.name, (keys) => ({
              answered: keys.length,
              correct: keys.filter((k) => r.model.byQuestion[k].right).length,
            })),
          )}
        </tbody>
      </table>
    </div>
  );
}

function FrontierChart({
  rows,
  frontier,
  overlays,
}: {
  rows: Result[];
  frontier: Result[];
  overlays: ReaderLine[];
}) {
  const el = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(740);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  useEffect(() => {
    const target = el.current;
    if (!target || !window.ResizeObserver) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0)
        setWidth(Math.max(160, Math.round(entry.contentRect.width)));
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  const height = width < 420 ? 256 : 292;
  const left = width < 420 ? 39 : 49;
  const right = width - (width < 420 ? 18 : 26);
  const top = 19;
  const bottom = height - 44;
  const hasFree = rows.some((r) => r.price === 0);
  const positives = rows.map((r) => r.price).filter((n) => n > 0);
  const flagged = new Set(frontier.map((r) => r.model.id));
  const positiveLeft =
    hasFree && positives.length
      ? left + Math.min(55, (right - left) * 0.18)
      : left;
  let logMin = 0,
    logMax = 1;
  if (positives.length) {
    const min = Math.log10(Math.min(...positives)),
      max = Math.log10(Math.max(...positives));
    const pad = Math.max(0.07, (max - min) * 0.055);
    logMin = min - pad;
    logMax = Math.max(max + pad, logMin + 0.3);
  }
  const X = (price: number) =>
    price === 0
      ? left
      : positiveLeft +
        ((Math.log10(price) - logMin) / (logMax - logMin)) *
          (right - positiveLeft);
  const scores = [...rows.map((r) => r.score), ...overlays.map((r) => r.score)];
  const low = Math.min(...scores),
    high = Math.max(...scores);
  const step = high - low <= 24 ? 5 : high - low <= 55 ? 10 : 20;
  let ymin = Math.max(0, Math.floor((low - 1) / step) * step),
    ymax = Math.min(100, Math.ceil((high + 1) / step) * step);
  if (ymax - ymin < step * 3) {
    ymin = Math.max(0, ymax - 3 * step);
    ymax = Math.min(100, Math.max(ymax, ymin + step * 3));
  }
  const Y = (score: number) =>
    bottom - ((score - ymin) / (ymax - ymin)) * (bottom - top);
  const yticks: number[] = [];
  for (let y = ymin; y <= ymax + 0.01; y += step) yticks.push(y);
  const xticks: number[] = [];
  if (hasFree) xticks.push(0);
  if (positives.length) {
    const candidates = [];
    for (
      let exponent = Math.floor(logMin);
      exponent <= Math.ceil(logMax);
      exponent++
    ) {
      for (const factor of [1, 2, 5]) {
        const v = Number((factor * 10 ** exponent).toPrecision(8));
        if (X(v) >= positiveLeft - 1 && X(v) <= right + 1) candidates.push(v);
      }
    }
    if (!candidates.length) candidates.push(Math.min(...positives));
    for (const v of candidates) {
      if (
        !xticks.length ||
        X(v) - X(xticks[xticks.length - 1]) > (width < 420 ? 51 : 62)
      )
        xticks.push(v);
    }
  }
  const path = frontier
    .map((r, i) =>
      i
        ? "H" + X(r.price) + "V" + Y(r.score)
        : "M" + X(r.price) + " " + Y(r.score),
    )
    .join(" ");
  const active = rows.find((r) => r.model.id === (hovered || selected));
  const activeX = active ? X(active.price) : 0;
  const activeY = active ? Y(active.score) : 0;
  function select(id: string) {
    setSelected(id);
    setHovered(null);
  }
  return (
    <div className="cbp-visual">
      <div className="cbp-chartcolumn">
        <div className="cbp-axislabel">Accuracy (%)</div>
        <div className="cbp-plot" ref={el}>
          <svg
            width="100%"
            height={height}
            viewBox={"0 0 " + width + " " + height}
            aria-label="Scatter plot of accuracy against model cost. Focus or select a point to inspect it."
            role="group"
          >
            {yticks.map((y) => (
              <g key={y}>
                <line
                  className="cbp-grid"
                  x1={left}
                  y1={Y(y)}
                  x2={right}
                  y2={Y(y)}
                />
                <text
                  className="cbp-tick"
                  x={left - 9}
                  y={Y(y) + 4}
                  textAnchor="end"
                >
                  {y}%
                </text>
              </g>
            ))}
            {xticks.map((x) => (
              <g key={x}>
                <line
                  className="cbp-vgrid"
                  x1={X(x)}
                  y1={top}
                  x2={X(x)}
                  y2={bottom}
                />
                <text
                  className="cbp-tick"
                  x={X(x)}
                  y={bottom + 21}
                  textAnchor="middle"
                >
                  {money(x)}
                </text>
              </g>
            ))}
            <path
              className="cbp-axes"
              d={"M" + left + " " + top + "V" + bottom + "H" + right}
            />
            {overlays.map((l) => (
              <line
                key={l.key}
                x1={left}
                x2={right}
                y1={Y(l.score)}
                y2={Y(l.score)}
                stroke={l.color}
                strokeDasharray={l.dash}
                strokeWidth="1.6"
              >
                <title>{l.name + " · " + pct(l.score)}</title>
              </line>
            ))}
            <path className="cbp-step" d={path} />
            {[...rows]
              .sort(
                (a, b) =>
                  Number(flagged.has(a.model.id)) -
                  Number(flagged.has(b.model.id)),
              )
              .map((r) => {
                const efficient = flagged.has(r.model.id);
                const isActive = r.model.id === active?.model.id;
                return (
                  <g
                    key={r.model.id}
                    className="cbp-dot"
                    role="button"
                    tabIndex={0}
                    aria-label={
                      r.model.name +
                      ", " +
                      pct(r.score) +
                      ", " +
                      money(r.price, r.estimated) +
                      " per hundred questions" +
                      (efficient ? ", on the frontier" : "")
                    }
                    aria-pressed={selected === r.model.id}
                    onMouseEnter={() => setHovered(r.model.id)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(r.model.id)}
                    onBlur={() => setHovered(null)}
                    onClick={() => select(r.model.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        select(r.model.id);
                      }
                      if (e.key === "Escape") {
                        setHovered(null);
                        setSelected(null);
                      }
                    }}
                  >
                    <circle
                      cx={X(r.price)}
                      cy={Y(r.score)}
                      r={12}
                      fill="transparent"
                    />
                    {isActive && (
                      <circle
                        cx={X(r.price)}
                        cy={Y(r.score)}
                        r={9}
                        fill="none"
                        stroke="currentColor"
                        opacity=".5"
                      />
                    )}
                    <circle
                      cx={X(r.price)}
                      cy={Y(r.score)}
                      r={efficient ? 4.8 : 4.3}
                      fill={efficient ? "#ad6138" : "#334d68"}
                      stroke="#fff"
                      strokeWidth="1.5"
                    />
                  </g>
                );
              })}
          </svg>
          {active && (
            <div
              role="status"
              className="cbp-tip"
              style={{
                left: Math.max(2, Math.min(width - 176, activeX - 85)),
                top: activeY > 75 ? activeY - 69 : activeY + 12,
              }}
            >
              <b>{active.model.name}</b>
              <span>
                {pct(active.score)} · {money(active.price, active.estimated)} /
                100
              </span>
            </div>
          )}
          <div className="cbp-xcaption">
            Cost per 100 questions (USD{positives.length ? ", log scale" : ""})
          </div>
        </div>
        <div className="cbp-key">
          <span>
            <i className="cbp-keydot" />
            Model
          </span>
          <span>
            <i className="cbp-keyline" />
            Pareto frontier
          </span>
          {overlays.map((o) => (
            <span key={o.key}>
              <i className={"cbp-keyhuman " + o.key} />
              {o.name} · {pct(o.score)}
            </span>
          ))}
        </div>
      </div>
      <aside className="cbp-rail" aria-label="Frontier models">
        <div className="cbp-railhead">
          <span>On the frontier</span>
          <span className="cbp-count">{frontier.length}</span>
        </div>
        <div className="cbp-raillist">
          {frontier.map((r) => (
            <button
              type="button"
              key={r.model.id}
              aria-pressed={active?.model.id === r.model.id}
              onClick={() => select(r.model.id)}
            >
              <strong>{r.model.name}</strong>
              <span>
                {pct(r.score)} <em>·</em> {money(r.price, r.estimated)} / 100
              </span>
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}

export default function Performance({ tab, models, stats, sources }: Props) {
  const [mineOnly, setMineOnly] = useState(false);
  const [table, setTable] = useState(false);
  const [group, setGroup] = useState<"category" | "world">("category");
  const allIds = sources.map((s) => s.id);
  const ownIds = allIds.filter((id) => typeof stats.mine[id] === "boolean");
  const matched = mineOnly && ownIds.length > 0;
  const ids = matched ? ownIds : allIds;
  const rows = resultsFor(models, ids);
  const frontier = pareto(rows);
  const personal = humanTotals(allIds, stats, true),
    humans = humanTotals(ids, stats, false);
  const myScore = personal.answered
    ? (100 * personal.correct) / personal.answered
    : 0;
  const readerLines: ReaderLine[] = [];
  if (personal.answered)
    readerLines.push({
      name: "You",
      key: "own",
      counts: personal,
      score: myScore,
      color: "#65619b",
      dash: "6 3",
    });
  if (
    stats.poolReady &&
    stats.qualifiedReaders &&
    typeof stats.readerAverage === "number"
  ) {
    readerLines.push({
      name: "Reader average",
      key: "human",
      score: 100 * stats.readerAverage,
      color: "#57796e",
      dash: "2 4",
    });
  }
  const rank = 1 + rows.filter((r) => r.score > myScore).length;
  const ties = rows.filter((r) => r.score === myScore).length;
  const frontierTab = tab === "frontier",
    scoreTab = tab === "scores";
  const estimates = rows.some((r) => r.estimated);
  return (
    <section
      className="cbp"
      aria-label={
        frontierTab
          ? "Pareto frontier"
          : scoreTab
            ? "Model scores"
            : "Category results"
      }
    >
      <div className="cbp-head">
        <div>
          <h2>
            {frontierTab
              ? "Pareto frontier"
              : scoreTab
                ? "Model scores"
                : "Results by category"}
          </h2>
          <p>
            {frontierTab
              ? "How much does Cosmere knowledge cost? Compare each model’s accuracy with its cost to answer 100 questions."
              : scoreTab
                ? "Ranked by accuracy on free-response questions. Readers answer the same prompts with multiple-choice options."
                : "Compare model and reader accuracy by question type or by world. The reader average uses pooled answers when available."}
          </p>
        </div>
        {frontierTab ? (
          <div className="cbp-switch" role="group" aria-label="Frontier view">
            <button
              type="button"
              aria-pressed={!table}
              onClick={() => setTable(false)}
            >
              <ViewIcon chart />
              Chart
            </button>
            <button
              type="button"
              aria-pressed={table}
              onClick={() => setTable(true)}
            >
              <ViewIcon chart={false} />
              Table
            </button>
          </div>
        ) : !scoreTab ? (
          <div className="cbp-switch" role="group" aria-label="Break down by">
            <button
              type="button"
              aria-pressed={group === "category"}
              onClick={() => setGroup("category")}
            >
              Question type
            </button>
            <button
              type="button"
              aria-pressed={group === "world"}
              onClick={() => setGroup("world")}
            >
              World
            </button>
          </div>
        ) : null}
      </div>
      {personal.answered > 0 && (
        <div className="cbp-comparison">
          <label>
            Compare on{" "}
            <select
              value={matched ? "mine" : "all"}
              onChange={(e) => setMineOnly(e.target.value === "mine")}
            >
              <option value="all">All {allIds.length} questions</option>
              <option value="mine">My {ownIds.length} answered</option>
            </select>
          </label>
          <p>
            <strong>
              You scored {personal.correct}/{personal.answered} ({pct(myScore)}
              ).
            </strong>
            {rows.length > 0 &&
              " Rank " +
                rank +
                " of " +
                (rows.length + 1) +
                (ties
                  ? ", tied with " + ties + " model" + (ties === 1 ? "" : "s")
                  : "") +
                " against " +
                (matched
                  ? "models on your questions."
                  : "models on the full benchmark.")}
          </p>
        </div>
      )}
      {rows.length !== models.length && (
        <p className="cbp-coverage">
          Complete scores available for {rows.length} of {models.length} models
          on this selection.
        </p>
      )}
      {!frontierTab && !scoreTab ? (
        <Categories
          rows={rows}
          ids={ids}
          sources={sources}
          stats={stats}
          group={group}
        />
      ) : rows.length === 0 ? (
        <p className="cbp-empty">
          No complete model runs are available for these questions yet.
        </p>
      ) : frontierTab && !table ? (
        <FrontierChart rows={rows} frontier={frontier} overlays={readerLines} />
      ) : (
        performanceTable(rows, frontier, scoreTab, readerLines)
      )}
      <p className="cbp-pool-status">
        {stats.poolReady
          ? `${humans.answered.toLocaleString()} pooled first ${humans.answered === 1 ? "answer" : "answers"} on these questions · ${stats.readers.toLocaleString()} ${stats.readers === 1 ? "reader" : "readers"} across this edition`
          : "Pooled reader scores unavailable."}
      </p>
      {frontierTab && stats.poolReady && (
        <p className="cbp-reader-average">
          {stats.qualifiedReaders === undefined
            ? "The qualified reader average is unavailable."
            : stats.qualifiedReaders === 0
              ? `The reader average appears after someone answers ${stats.minForAverage ?? 10} questions in this edition.`
              : `The reader average gives equal weight to ${stats.qualifiedReaders.toLocaleString()} ${stats.qualifiedReaders === 1 ? "reader" : "readers"} with at least ${stats.minForAverage ?? 10} answers across this edition.`}
        </p>
      )}
      <div className="cbp-note">
        {frontierTab
          ? "Frontier models offer the highest accuracy available at their price. Costs are normalized to 100 questions."
          : scoreTab
            ? "Tied scores share a rank. Within each tie, the cheaper run appears first."
            : "An em dash means there are no recorded answers for that group."}
        {matched &&
          (frontierTab || scoreTab) &&
          " Costs use the selected questions’ average, scaled to 100."}
        {estimates &&
          (frontierTab || scoreTab) &&
          " ≈ indicates a run with estimated cost."}
      </div>
    </section>
  );
}
