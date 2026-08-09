import { readFile } from "node:fs/promises";
import { analyzeRelevantScriptletCoverage } from "../src/diagnostics/scriptlet-usage.js";
import { DEFAULT_FILTER_LISTS } from "../src/filters/filter-list-catalog.js";

const hostname = process.argv[2] ?? "youtube.com";
const sources = await Promise.all(DEFAULT_FILTER_LISTS.map(async (list) => ({
  name: list.title,
  version: list.snapshotVersion,
  source: await readFile(new URL(`../${list.path}`, import.meta.url), "utf8"),
})));
const analysis = analyzeRelevantScriptletCoverage(sources, { hostname });
console.log(JSON.stringify({ filterLists: sources.map(({ name, version }) => ({ name, version })), ...analysis }, null, 2));
