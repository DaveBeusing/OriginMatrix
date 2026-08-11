import { readFile } from "node:fs/promises";
import { analyzeUboCompatibility } from "../../src/diagnostics/ubo-compatibility.js";
import { DEFAULT_FILTER_LISTS } from "../../src/filters/filter-list-catalog.js";

const json = process.argv.includes("--json");
const includeDisabled = process.argv.includes("--all");
const hostname = process.argv.slice(2).find((value) => !value.startsWith("--")) ?? "youtube.com";
const sources = await Promise.all(DEFAULT_FILTER_LISTS.filter((list) => includeDisabled || list.enabled).map(async (list) => ({
  name: list.title,
  version: list.snapshotVersion,
  source: await readFile(new URL(`../../${list.path}`, import.meta.url), "utf8"),
})));
const result = analyzeUboCompatibility(sources, { hostname });
if (json) console.log(JSON.stringify(result, null, 2));
else console.log(formatReport(result));

function formatReport(result) {
  const names = { network: "Network", modifiers: "Modifiers", exceptions: "Exceptions", cosmetic: "Cosmetic", procedural: "Procedural", scriptlets: "Scriptlets", redirects: "Redirects", preprocessors: "Preprocessors", unsupportedSyntax: "Unsupported syntax" };
  const rows = ["OriginMatrix uBO Compatibility", "", `Overall: ${coverage(result.overall)}`];
  for (const [key, label] of Object.entries(names)) rows.push(`${label}: ${coverage(result.categories[key])}`);
  rows.push("", `${result.hostname} relevant coverage: ${coverage(result.siteRelevant.overall)}`);
  for (const key of ["network", "modifiers", "exceptions", "cosmetic", "procedural", "scriptlets", "redirects"]) rows.push(`${names[key]}: ${coverage(result.siteRelevant.categories[key])}`);
  rows.push("", "Unsupported ranking:");
  for (const item of result.unsupportedRanking.slice(0, 25)) rows.push(`${item.primitive}: ${item.occurrences} occurrence(s), ${item.youtubeRelevant} ${result.hostname}-relevant, ${item.sourceLists.join(" + ")}`);
  return rows.join("\n");
}

function coverage(value) { return `${value.supported}/${value.total} (${value.percent}%)`; }
