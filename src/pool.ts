import type { Stats, Total as Counts } from "./types";
type Totals = Omit<Stats, "mine" | "poolReady">;
type Queued = { id: string; choice: number };
const endpoint = "https://cosmerebench.meshedmoon3.chatgpt.site/api/community";
const publicHosts = new Set([
  "jeffmcjunkin.com",
  "www.jeffmcjunkin.com",
  "jeffmcjunkin.github.io",
]);
const storagePrefix = "cosmerebench:community:";
const buffer = new Map<string, string>();
let edition = "";
let previousEdition: string | null = null;
let retained = new Set<string>();
let reader = "";
let notify: (totals: Totals | null) => void = () => {};
let current: Totals = { human: {}, readers: 0 };
let flight: Promise<boolean> | null = null;

function read(key: string) {
  try {
    return localStorage.getItem(key) ?? buffer.get(key);
  } catch {
    return buffer.get(key);
  }
}
function put(key: string, value: string) {
  buffer.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Retain in this tab. */
  }
}
function remove(key: string) {
  buffer.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    /* In-memory fallback. */
  }
}
function prefix(version: string) {
  return storagePrefix + encodeURIComponent(version) + ":answer:";
}
function pending(): Queued[] {
  const batch: Queued[] = [];
  for (const id of retained) {
    const activeKey = prefix(edition) + id;
    const older = previousEdition
      ? read(prefix(previousEdition) + id)
      : undefined;
    const value = older ?? read(activeKey);
    if (value === undefined || value === null || !/^[0-4]$/.test(value))
      continue;
    // Keep the 2.0 queue entry until a valid service response acknowledges it.
    if (older && read(activeKey) !== older) put(activeKey, older);
    batch.push({ id, choice: Number(value) });
    if (batch.length === 20) break;
  }
  return batch;
}
async function send(): Promise<boolean> {
  if (!reader || !publicHosts.has(location.hostname) || !navigator.onLine)
    return false;
  let batch: Queued[];
  do {
    batch = pending();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ edition, reader, answers: batch }),
      });
      if (!response.ok) return false;
      const payload = (await response.json()) as Totals;
      if (
        !Number.isInteger(payload.readers) ||
        !payload.human ||
        typeof payload.human !== "object"
      )
        return false;
      for (const answer of batch) {
        remove(prefix(edition) + answer.id);
        if (previousEdition) remove(prefix(previousEdition) + answer.id);
      }
      current = payload;
      notify(current);
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  } while (pending().length);
  return true;
}
function sync() {
  if (!flight)
    flight = send()
      .then((ok) => {
        if (!ok) notify(null);
        return ok;
      })
      .finally(() => {
        flight = null;
      });
  return flight;
}
export function connectPool(
  version: string,
  previous: string | null,
  questionIds: Set<string>,
  onTotals: (totals: Totals | null) => void,
) {
  edition = version;
  previousEdition = previous;
  retained = questionIds;
  notify = onTotals;
  if (!publicHosts.has(location.hostname)) return;
  reader = read(storagePrefix + "reader") || crypto.randomUUID();
  put(storagePrefix + "reader", reader);
  void sync();
  window.addEventListener("online", () => {
    void sync();
  });
  window.addEventListener("focus", () => {
    void sync();
  });
}
export async function queuePoolAnswer(
  id: string,
  choice: number,
): Promise<Counts | null> {
  if (!reader || !retained.has(id)) return null;
  const slot = prefix(edition) + id;
  if (read(slot) == null) put(slot, String(choice));
  const ok = await sync();
  return ok ? (current.human[id] ?? null) : null;
}
