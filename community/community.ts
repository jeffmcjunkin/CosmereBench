import releaseKeys from "../data/pool-keys.json";

const edition = "2.0";
const keys: Record<string, number> = releaseKeys;
const keysJson = JSON.stringify(keys);
const allowedOrigins = new Set([
  "https://jeffmcjunkin.com",
  "https://www.jeffmcjunkin.com",
  "https://jeffmcjunkin.github.io",
]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const minForAverage = 10;
const maxBodyBytes = 16 * 1024;
const validChoice = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 4;
const keysReady = Object.keys(keys).length > 0 && Object.values(keys).every(validChoice);

// One JSON parameter keeps boards of 100 or more questions below D1's SQL
// parameter limit. Regrade retained choices against the current edition's keys.
const aggregateSql = `
  WITH active AS (
    SELECT reader, question, choice = CAST(json_extract(?1, '$.' || question) AS TEXT) AS is_correct
    FROM answers WHERE question IN (SELECT key FROM json_each(?1))
  ), by_reader AS (
    SELECT COUNT(*) AS answered, AVG(is_correct) AS accuracy
    FROM active GROUP BY reader
  )
  SELECT question, COUNT(*) AS answered, SUM(is_correct) AS correct,
         NULL AS qualifiedReaders, NULL AS readerAverage
  FROM active GROUP BY question
  UNION ALL
  SELECT NULL, COUNT(*), 0, COUNT(*) FILTER (WHERE answered >= ?2),
         AVG(accuracy) FILTER (WHERE answered >= ?2)
  FROM by_reader
`;

type Choice = { id: string; choice: number };
type Counts = { answered: number; correct: number };

function validAnswer(value: unknown): value is Choice {
  if (value === null || typeof value !== "object") return false;
  const { id, choice } = value as Partial<Choice>;
  return typeof id === "string" && Object.hasOwn(keys, id) && validChoice(choice);
}

async function readBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get("Content-Length")) > maxBodyBytes) throw new RangeError();
  const stream = request.body?.getReader();
  if (!stream) throw new SyntaxError();
  const bytes = new Uint8Array(maxBodyBytes);
  let size = 0;
  while (true) {
    const { value, done } = await stream.read();
    if (done) break;
    if (size + value.length > bytes.length) {
      await stream.cancel();
      throw new RangeError();
    }
    bytes.set(value, size);
    size += value.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes.subarray(0, size)));
}

export async function handleCommunity(request: Request, db?: D1Database): Promise<Response> {
  const origin = request.headers.get("Origin");
  const headers = new Headers({ "Cache-Control": "no-store", "Vary": "Origin" });
  const fail = (error: string, status: number) => Response.json({ error }, { status, headers });
  if (origin !== null) {
    if (!allowedOrigins.has(origin)) return fail("Origin not allowed", 403);
    headers.set("Access-Control-Allow-Origin", origin);
  }
  if (request.method === "OPTIONS") {
    headers.set("Access-Control-Allow-Methods", "POST");
    headers.set("Access-Control-Allow-Headers", "Content-Type");
    headers.set("Access-Control-Max-Age", "600");
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "POST") {
    headers.set("Allow", "POST, OPTIONS");
    return fail("Use POST", 405);
  }
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json")
    return fail("Expected application/json", 415);
  if (!db || !keysReady) return fail("Community totals are unavailable", 503);

  let input: unknown;
  try {
    input = await readBody(request);
  } catch (error) {
    return error instanceof RangeError ? fail("Request body is too large", 413) : fail("Invalid JSON", 400);
  }
  if (input === null || typeof input !== "object") return fail("Expected a submission object", 400);
  const { edition: incomingEdition, reader, answers } = input as Record<string, unknown>;
  if (incomingEdition !== edition) return fail("Unsupported benchmark edition", 409);
  if (typeof reader !== "string" || !uuid.test(reader)) return fail("Invalid reader ID", 400);
  if (!Array.isArray(answers) || answers.length > 20 || !answers.every(validAnswer))
    return fail("Expected up to 20 valid answers", 400);

  try {
    const statements: D1PreparedStatement[] = [];
    if (answers.length) {
      const slots = answers.map(() => "(?, ?, ?, ?)").join(", ");
      const values = answers.flatMap(({ id, choice }) =>
        [reader.toLowerCase(), id, String(choice), Number(choice === keys[id])]
      );
      statements.push(db.prepare(
        `INSERT INTO answers (reader, question, choice, correct) VALUES ${slots}
         ON CONFLICT(reader, question) DO NOTHING`
      ).bind(...values));
    }
    statements.push(db.prepare(aggregateSql).bind(keysJson, minForAverage));
    const results = await db.batch<Counts & { question: string | null; qualifiedReaders: number | null; readerAverage: number | null }>(statements);
    const aggregate = results.at(-1);
    if (!aggregate?.success) return fail("Community totals are unavailable", 503);
    const summary = aggregate.results.find(row => row.question === null);
    if (!summary || summary.qualifiedReaders === null) return fail("Community totals are unavailable", 503);
    const human: Record<string, Counts> = {};
    for (const { question, answered, correct } of aggregate.results) {
      if (question !== null) human[question] = { answered, correct };
    }
    return Response.json({ human, readers: summary.answered, qualifiedReaders: summary.qualifiedReaders, readerAverage: summary.readerAverage, minForAverage }, { headers });
  } catch {
    return fail("Community totals are unavailable", 503);
  }
}
