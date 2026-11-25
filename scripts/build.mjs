import { build } from "esbuild";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const base = fileURLToPath(new URL("../", import.meta.url));
const dist = path.join(base, "dist");
const hash = (text) =>
  createHash("sha256").update(text).digest("hex").slice(0, 16);
await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, "assets"), { recursive: true });
await cp(path.join(base, "public"), dist, { recursive: true });
const load = async (name) =>
  JSON.parse(await readFile(path.join(base, "data", name + ".json"), "utf8"));
const [questions, runs, protocol, analysis] = await Promise.all(
  ["questions", "runs", "protocol", "analysis"].map(load),
);
if (!protocol.version || !questions.length || !runs.length)
  throw Error("Missing edition, questions or model runs");
const ids = new Set(questions.map((q) => q.id));
if (
  ids.size !== questions.length ||
  questions.some((q) => !Number.isInteger(q.key) || !q.options[q.key])
)
  throw Error("Invalid question bank");
async function asset(name, data) {
  const json = JSON.stringify(data),
    url = "assets/" + name + "-" + hash(json) + ".json";
  await writeFile(path.join(dist, url), json);
  return "./" + url;
}
const archive = await asset("benchmark", {
  edition: String(protocol.version),
  protocol,
  questions,
  runs,
});
const report = await asset("comparisons", analysis);
const result = await build({
  absWorkingDir: base,
  entryPoints: ["src/main.tsx"],
  entryNames: "assets/[name]-[hash]",
  outdir: dist,
  bundle: true,
  format: "esm",
  target: ["es2022"],
  jsx: "automatic",
  minify: true,
  metafile: true,
  legalComments: "eof",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    __ARCHIVE_URL__: JSON.stringify(archive),
    __ANALYSIS_URL__: JSON.stringify(report),
  },
});
const entries = Object.entries(result.metafile.outputs);
const src = entries.find(([, v]) => v.entryPoint)?.[0];
if (!src) throw Error("Missing browser entry");
const css = entries.find(([file]) => file.endsWith(".css"))?.[0];
const rel = (file) =>
  "./" +
  path.relative(dist, path.resolve(base, file)).split(path.sep).join("/");
const template = await readFile(path.join(base, "index.html"), "utf8");
await writeFile(
  path.join(dist, "index.html"),
  template.replace("{{SCRIPT}}", rel(src)).replace("{{STYLE}}", rel(css)),
);
await writeFile(path.join(dist, ".nojekyll"), "");
const paths = (await readdir(dist, { recursive: true, withFileTypes: true }))
  .filter((d) => d.isFile() && d.name !== ".nojekyll")
  .map((d) =>
    path
      .relative(dist, path.join(d.parentPath, d.name))
      .split(path.sep)
      .join("/"),
  )
  .sort();
const sums = await Promise.all(
  paths.map(async (p) => hash(await readFile(path.join(dist, p)))),
);
const version = hash(sums.join(""));
const worker = await readFile(
  path.join(base, "scripts/offline-worker.js"),
  "utf8",
);
await writeFile(
  path.join(dist, "sw.js"),
  worker
    .replace("__BUILD_HASH__", version)
    .replace("/* PRECACHE */ []", JSON.stringify(paths.map((p) => "./" + p))),
);
console.log(
  "Built edition " +
    protocol.version +
    " with " +
    questions.length +
    " questions and " +
    runs.length +
    " model runs.",
);
