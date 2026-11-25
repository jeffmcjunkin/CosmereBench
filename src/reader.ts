import type { Question, Run, Stats, Reveal } from "./types";

import { connectPool, queuePoolAnswer } from "./pool";

let editionKey = "";
const unavailable = { human: {}, readers: 0, poolReady: false };
let pooled: Omit<Stats, "mine"> = unavailable;
let bank = new Map<string, Question>();
let modelRuns: Run[] = [];
const volatile = new Map<string, string>();
const listeners = new Set<() => void>();

export function initializeReader(
  edition: string,
  questions: Question[],
  runs: Run[],
) {
  const next = "cosmerebench:" + encodeURIComponent(edition) + ":";
  const changed = editionKey !== next;
  editionKey = next;
  bank = new Map(questions.map((q) => [q.id, q]));
  modelRuns = runs;
  if (changed) {
    pooled = unavailable;
    connectPool(edition, (totals) => {
      if (editionKey !== next) return;
      pooled = totals ? { ...totals, poolReady: true } : unavailable;
      listeners.forEach((cb) => cb());
    });
  }
}
function read(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? volatile.get(key) ?? null;
  } catch {
    return volatile.get(key) ?? null;
  }
}
function write(key: string, value: string) {
  volatile.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Session memory remains usable. */
  }
}
function choiceFor(q: Question) {
  const v = read(editionKey + "answer:" + q.id);
  if (v === null || !/^\d+$/.test(v)) return null;
  const n = Number(v);
  return Number.isInteger(n) && n < q.options.length ? n : null;
}
export function getStats(): Stats {
  const mine: Record<string, boolean> = {};
  for (const q of bank.values()) {
    const choice = choiceFor(q);
    if (choice !== null) mine[q.id] = choice === q.key;
  }
  return { mine, ...(navigator.onLine ? pooled : unavailable) };
}
export function subscribeReader(cb: () => void) {
  listeners.add(cb);
  const sync = (ev: StorageEvent) => {
    if (!ev.key || ev.key.startsWith(editionKey + "answer:")) cb();
  };
  window.addEventListener("storage", sync);
  window.addEventListener("offline", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", sync);
    window.removeEventListener("offline", cb);
  };
}
export function pendingRound(): string[] {
  try {
    const ids: unknown = JSON.parse(read(editionKey + "round") || "[]");
    if (!Array.isArray(ids)) return [];
    return [...new Set(ids)].filter(
      (id): id is string =>
        typeof id === "string" &&
        bank.has(id) &&
        choiceFor(bank.get(id)!) === null,
    );
  } catch {
    return [];
  }
}
export function rememberRound(ids: string[]) {
  write(editionKey + "round", JSON.stringify(ids));
}
export async function recordAnswer(
  id: string,
  choice: number,
): Promise<Reveal> {
  const q = bank.get(id);
  if (
    !q ||
    !Number.isInteger(choice) ||
    choice < 0 ||
    choice >= q.options.length
  )
    throw Error("Invalid answer");
  const key = editionKey + "answer:" + q.id;
  function commit() {
    const previous = choiceFor(q!);
    if (previous !== null) return { first: previous, isNew: false };
    write(key, String(choice));
    return { first: choice, isNew: true };
  }
  const { first, isNew } = navigator.locks
    ? await navigator.locks.request(key, commit)
    : commit();
  if (isNew) void queuePoolAnswer(id, first).catch(() => null);
  const reveal: Reveal = {
    key: q.key,
    choice: first,
    correct: first === q.key,
    category: q.category,
    answer: q.answer,
    explanation: q.explanation,
    sourceTitle: q.sourceTitle,
    sourceUrl: q.sourceUrl,
    models: modelRuns.flatMap((model) => {
      const answer = model.answers[id];
      return answer
        ? [
            {
              name: model.name,
              text: answer.text,
              correct: answer.correct,
              reviewNote: answer.reviewNote,
            },
          ]
        : [];
    }),
  };
  listeners.forEach((cb) => cb());
  return reveal;
}
