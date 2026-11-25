import type { Stats, Total as Counts } from "./types";
type Totals = Omit<Stats, "mine" | "poolReady">;
type Queued = { id: string; choice: number };
const endpoint = "https://cosmerebench.meshedmoon3.chatgpt.site/api/community";
const publicHosts = new Set(["jeffmcjunkin.com", "www.jeffmcjunkin.com", "jeffmcjunkin.github.io"]);
const storagePrefix = "cosmerebench:community:";
const buffer = new Map<string, string>();
let edition = "";
let reader = "";
let notify: (totals: Totals | null) => void = () => {};
let current: Totals = { human: {}, readers: 0 };
let flight: Promise<boolean> | null = null;

function read(key: string) {
  try { return localStorage.getItem(key) ?? buffer.get(key); }
  catch { return buffer.get(key); }
}
function put(key: string, value: string) {
  buffer.set(key, value);
  try { localStorage.setItem(key, value); } catch { /* Retain in this tab. */ }
}
function remove(key: string) {
  buffer.delete(key);
  try { localStorage.removeItem(key); } catch { /* In-memory fallback. */ }
}
function prefix() { return storagePrefix + encodeURIComponent(edition) + ":answer:"; }
function pending(): Queued[] {
  const keys = new Set(buffer.keys());
  try { Object.keys(localStorage).forEach(k => keys.add(k)); } catch { /* In-memory fallback. */ }
  const p = prefix();
  return [...keys].filter(k => k.startsWith(p)).slice(0, 20).map(k => ({id: k.slice(p.length), choice: Number(read(k))}));
}
async function send(): Promise<boolean> {
  if (!reader || !publicHosts.has(location.hostname) || !navigator.onLine) return false;
  let batch: Queued[];
  do {
    batch = pending();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    try {
      const response = await fetch(endpoint, {
        method: "POST", mode: "cors", credentials: "omit", referrerPolicy: "no-referrer",
        headers: {"Content-Type": "application/json"}, signal: controller.signal,
        body: JSON.stringify({edition, reader, answers: batch}),
      });
      if (!response.ok) return false;
      const payload = await response.json() as Totals;
      if (!Number.isInteger(payload.readers) || !payload.human || typeof payload.human !== "object") return false;
      batch.forEach(answer => remove(prefix()+answer.id));
      current = payload;
      notify(current);
    } catch { return false; }
    finally { clearTimeout(timeout); }
  } while (pending().length);
  return true;
}
function sync() {
  if (!flight) flight = send().then(ok => {
    if (!ok) notify(null);
    return ok;
  }).finally(() => { flight = null; });
  return flight;
}
export function connectPool(version: string, onTotals: (totals: Totals | null) => void) {
  edition = version;
  notify = onTotals;
  if (!publicHosts.has(location.hostname)) return;
  reader = read(storagePrefix+"reader") || crypto.randomUUID();
  put(storagePrefix+"reader", reader);
  void sync();
  window.addEventListener("online", () => { void sync(); });
  window.addEventListener("focus", () => { void sync(); });
}
export async function queuePoolAnswer(id: string, choice: number): Promise<Counts | null> {
  if (!reader) return null;
  put(prefix()+id, String(choice));
  const ok = await sync();
  return ok ? current.human[id] ?? null : null;
}
