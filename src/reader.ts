import type { Question, Run, Stats, Reveal } from "./types";

import { connectPool, queuePoolAnswer } from "./pool";

let editionKey = "";
let previousKey = "";
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
  const previousEdition = edition === "2.1" ? "2.0" : null;
  const changed = editionKey !== next;
  editionKey = next;
  bank = new Map(questions.map((q) => [q.id, q]));
  modelRuns = runs;
  if (changed) {
    previousKey = previousEdition
      ? "cosmerebench:" + previousEdition + ":"
      : "";
    if (previousKey) {
      for (const q of questions) {
        const retained = choiceFor(q);
        if (retained === null) continue;
        const choice = String(retained);
        write(previousKey + "answer:" + q.id, choice);
        write(editionKey + "answer:" + q.id, choice);
      }
      if (read(editionKey + "round") === null) {
        rememberRound(roundFrom(previousKey));
      }
    }
    pooled = unavailable;
    connectPool(edition, previousEdition, new Set(bank.keys()), (totals) => {
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
  // The original slot is shared with already-open 2.0 tabs. The option order
  // on retained questions is identical across these two editions.
  const slot = "answer:" + q.id;
  for (const prefix of previousKey ? [previousKey, editionKey] : [editionKey]) {
    const v = read(prefix + slot);
    if (v !== null && /^\d+$/.test(v) && Number(v) < q.options.length)
      return Number(v);
  }
  return null;
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
    if (previousKey && ev.key?.startsWith(previousKey + "answer:")) {
      const q = bank.get(ev.key.slice((previousKey + "answer:").length));
      if (!q) return;
      const first = choiceFor(q);
      if (
        first !== null &&
        read(editionKey + "answer:" + q.id) !== String(first)
      ) {
        write(editionKey + "answer:" + q.id, String(first));
      }
      cb();
    } else if (
      !ev.key ||
      ev.key === editionKey + "round" ||
      ev.key.startsWith(editionKey + "answer:")
    )
      cb();
  };
  window.addEventListener("storage", sync);
  window.addEventListener("offline", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", sync);
    window.removeEventListener("offline", cb);
  };
}
function roundFrom(prefix: string): string[] {
  try {
    const ids: unknown = JSON.parse(read(prefix + "round") || "[]");
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
export function pendingRound(): string[] {
  return roundFrom(editionKey);
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
  const sharedKey = previousKey ? previousKey + "answer:" + q.id : key;
  function commit() {
    const previous = choiceFor(q!);
    if (previous !== null) {
      if (sharedKey !== key && read(key) !== String(previous))
        write(key, String(previous));
      return { first: previous, isNew: false };
    }
    write(sharedKey, String(choice));
    if (sharedKey !== key) write(key, String(choice));
    return { first: choice, isNew: true };
  }
  const { first, isNew } = navigator.locks
    ? await navigator.locks.request(sharedKey, commit)
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
