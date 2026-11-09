import { readFile, writeFile } from "node:fs/promises";
import { renderHtml } from "./html";
import type { EvalReport } from "./types";

const source = process.argv[2] || "results/latest.json";
const target = source.replace(/\.json$/, "") + ".html";

const report = JSON.parse(await readFile(source, "utf8")) as EvalReport;
await writeFile(target, renderHtml(report));
console.log(`Wrote ${target}`);
