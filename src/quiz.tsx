import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Card, Reveal, Stats, Total } from "./types";
import "./quiz.css";
import { recordAnswer, rememberRound } from "./reader";

type Props = {
  round: Card[];
  stats: Stats;
  onClose: () => void;
  onAnswer: (id: string, correct: boolean) => void;
};

function AnswerText({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
        .map((part, i) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <strong key={i}>{part.slice(2, -2)}</strong>
          ) : part.startsWith("*") && part.endsWith("*") ? (
            <em key={i}>{part.slice(1, -1)}</em>
          ) : (
            part
          ),
        )}
    </>
  );
}

function Feedback({
  result,
  pooled,
}: {
  result: Reveal;
  pooled: Total | null;
}) {
  const modelCount = result.models.length;
  const right = result.models.filter((model) => model.correct).length;
  const humans = pooled?.answered ?? 0;
  return (
    <>
      <div className="cq-verdict">
        <div className="cq-verdict-label">
          <span className={result.correct ? "cq-right" : "cq-wrong"}>
            {result.correct ? "Correct" : "Incorrect"}
          </span>
          <span>{result.category}</span>
        </div>
        <h3>{result.answer}</h3>
        <p>{result.explanation}</p>
        <a href={result.sourceUrl} target="_blank" rel="noreferrer">
          {result.sourceTitle}
        </a>
      </div>
      <div className="cq-comparison" aria-label="Results on this question">
        <div>
          <strong>
            {right} / {modelCount}
          </strong>
          <span>models correct</span>
        </div>
        <div>
          <strong>
            {humans ? Math.round((100 * pooled!.correct) / humans) + "%" : "—"}
          </strong>
          <span>
            {humans
              ? "of " +
                humans +
                " " +
                (humans === 1 ? "reader" : "readers") +
                " correct"
              : pooled
                ? "no pooled answers yet"
                : "pooled reader data unavailable"}
          </span>
        </div>
      </div>
      {modelCount > 0 && (
        <details className="cq-models">
          <summary>
            Read the model answers <span>({modelCount})</span>
          </summary>
          <ul>
            {result.models.map((model) => (
              <li key={model.name}>
                <div>
                  <strong>{model.name}</strong>
                  <span className={model.correct ? "cq-right" : "cq-wrong"}>
                    {model.correct ? "Correct" : "Incorrect"}
                  </span>
                </div>
                <p>
                  <AnswerText text={model.text || "No answer returned."} />
                </p>
                {model.reviewNote && (
                  <p className="cq-review">
                    <b>Grade review</b> {model.reviewNote}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

export default function Quiz({ round, stats, onClose, onAnswer }: Props) {
  // A parent leaderboard update must not reorder a round already in progress.
  const [cards] = useState(() => [...round]);
  const [index, setIndex] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [finished, setFinished] = useState(cards.length === 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);
  const valid = useRef(false);
  const card = cards[index];
  const count = Object.keys(saved).length;
  const correct = Object.values(saved).filter(Boolean).length;

  useEffect(() => {
    valid.current = true;
    const node = dialog.current!;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!node.open) node.showModal();
    return () => {
      valid.current = false;
      request.current?.abort();
      request.current = null;
      node.close();
      document.body.style.overflow = oldOverflow;
    };
  }, []);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    dialog.current?.scrollTo(0, 0);
  }, [index, finished]);

  useEffect(() => {
    if (!reveal) return;
    feedback.current?.focus({ preventScroll: true });
    feedback.current?.scrollIntoView({ block: "nearest" });
  }, [reveal]);

  function pick(value: number) {
    if (request.current || reveal || finished) return;
    setError("");
    setChoice(value);
  }

  async function submit() {
    if (choice === null || request.current || reveal || finished || !card)
      return;
    const abort = new AbortController();
    request.current = abort;
    setBusy(true);
    setError("");
    try {
      const result = await recordAnswer(card.id, choice);
      if (!valid.current || request.current !== abort) return;
      setChoice(result.choice);
      setReveal(result);
      setSaved((previous) => ({ ...previous, [card.id]: result.correct }));
      onAnswer(card.id, result.correct);
    } catch {
      if (valid.current && request.current === abort) {
        setError(
          "This answer could not be recorded. Select an option and try again.",
        );
      }
    } finally {
      if (request.current === abort) {
        request.current = null;
        if (valid.current) setBusy(false);
      }
    }
  }

  function next() {
    if (request.current || !reveal) return;
    if (index + 1 === cards.length) {
      setFinished(true);
      return;
    }
    setIndex(index + 1);
    setChoice(null);
    setReveal(null);
    setError("");
  }

  function endRound() {
    rememberRound([]);
    if (finished || !count) onClose();
    else setFinished(true);
  }

  function handleKeys(event: KeyboardEvent<HTMLDialogElement>) {
    if (
      event.altKey ||
      event.metaKey ||
      event.ctrlKey ||
      event.repeat ||
      finished ||
      busy
    )
      return;
    const target = event.target as HTMLElement;
    if (target.closest("details") || target.closest("a")) return;
    if (event.key === "Enter") {
      if (target.closest("button")) return;
      if (!reveal && choice === null) return;
      event.preventDefault();
      if (reveal) next();
      else void submit();
      return;
    }
    if (reveal || !card) return;
    const key = event.key.toUpperCase();
    const value = /^[A-Z]$/.test(key)
      ? key.charCodeAt(0) - 65
      : /^[1-9]$/.test(key)
        ? Number(key) - 1
        : -1;
    if (value < 0 || value >= card.options.length) return;
    event.preventDefault();
    pick(value);
    dialog.current
      ?.querySelector<HTMLInputElement>('[data-choice="' + value + '"]')
      ?.focus();
  }

  const percent = count ? Math.round((100 * correct) / count) : 0;
  return (
    <dialog
      ref={dialog}
      className="cq-dialog"
      aria-labelledby="cq-heading"
      onKeyDown={handleKeys}
      onCancel={(event) => {
        event.preventDefault();
        if (!request.current) onClose();
      }}
    >
      <div className="cq-shell">
        <div className="cq-top">
          <span className="cq-brand">
            Cosmere<span>Bench</span>
          </span>
          <button
            className="cq-dismiss"
            type="button"
            aria-label="Close quiz and return to the frontier"
            title="Close quiz"
            disabled={busy}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {finished ? (
          <div className="cq-summary">
            <p className="cq-kicker">Round results</p>
            <h2 ref={heading} tabIndex={-1} id="cq-heading">
              {count ? "Your score" : "All caught up"}
            </h2>
            {count ? (
              <>
                <div className="cq-big-score">
                  {percent}
                  <span>%</span>
                </div>
                <p>
                  You answered{" "}
                  <strong>
                    {correct} of {count}
                  </strong>{" "}
                  {count === 1 ? "question" : "questions"} correctly.
                </p>
                {count < cards.length && (
                  <p className="cq-secondary">
                    Your {count} recorded{" "}
                    {count === 1 ? "answer counts" : "answers count"} toward
                    your place on the frontier.
                  </p>
                )}
              </>
            ) : (
              <p>You’ve answered every question available in this round.</p>
            )}
            <button className="cq-primary" type="button" onClick={onClose}>
              See my frontier
            </button>
          </div>
        ) : (
          <>
            <div className="cq-progress-meta">
              <span>
                Question <b>{index + 1}</b> of {cards.length}
              </span>
              <span>
                {correct} of {count} correct
              </span>
            </div>
            <progress
              className="cq-progress"
              aria-label="Questions answered in this round"
              value={count}
              max={cards.length}
            />
            <div className="cq-context">
              <span>{card.world}</span>
              <span>{card.book}</span>
            </div>
            <h2
              ref={heading}
              tabIndex={-1}
              id="cq-heading"
              className="cq-question"
            >
              {card.prompt}
            </h2>
            <fieldset className="cq-options" disabled={busy || !!reveal}>
              <legend className="cq-sr">Choose your answer</legend>
              {card.options.map((option, i) => {
                const isKey = reveal?.key === i;
                const isPicked = choice === i;
                const state = isKey
                  ? "correct"
                  : reveal && isPicked
                    ? "wrong"
                    : isPicked
                      ? "picked"
                      : "";
                const tag =
                  reveal && (isKey || isPicked)
                    ? isKey && isPicked
                      ? "Your answer · correct"
                      : isKey
                        ? "Correct answer"
                        : "Your answer"
                    : "";
                return (
                  <label className="cq-option" data-state={state} key={i}>
                    <input
                      type="radio"
                      name={"cq-" + card.id}
                      data-choice={i}
                      checked={isPicked}
                      onChange={() => pick(i)}
                    />
                    <span className="cq-letter" aria-hidden="true">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="cq-wording">
                      {option}
                      {tag && <small>{tag}</small>}
                    </span>
                  </label>
                );
              })}
            </fieldset>
            {reveal ? (
              <div className="cq-feedback" ref={feedback} tabIndex={-1}>
                <Feedback
                  result={reveal}
                  pooled={
                    stats.poolReady
                      ? (stats.human[card.id] ?? { answered: 0, correct: 0 })
                      : null
                  }
                />
              </div>
            ) : (
              <p className="cq-shortcuts">
                Choose A–{String.fromCharCode(64 + card.options.length)} or 1–
                {card.options.length}. Press Enter to lock in.
              </p>
            )}
            {error && (
              <p className="cq-error" role="alert">
                {error}
              </p>
            )}
            <div className="cq-actions">
              {reveal ? (
                <button className="cq-primary" type="button" onClick={next}>
                  {index + 1 === cards.length
                    ? "View round score"
                    : "Next question"}
                </button>
              ) : (
                <button
                  className="cq-primary"
                  type="button"
                  disabled={choice === null || busy}
                  onClick={() => void submit()}
                >
                  {busy
                    ? "Checking answer…"
                    : error
                      ? "Retry answer"
                      : "Lock in answer"}
                </button>
              )}
              {(!reveal || index + 1 < cards.length) && (
                <button
                  className="cq-end"
                  type="button"
                  disabled={busy}
                  onClick={endRound}
                >
                  Finish early
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
