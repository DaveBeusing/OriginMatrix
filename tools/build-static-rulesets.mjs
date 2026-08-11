import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DEFAULT_FILTER_LISTS } from "../src/filters/filter-list-catalog.js";
import { preprocessFilterText } from "../src/filters/filter-preprocessor.js";
import { parseFilterText } from "../src/filters/filter-parser.js";
import { NetworkFilterCompiler } from "../src/filters/network-filter-compiler.js";
import { RuleBudget } from "../src/network/rule-budget.js";
import { FILTER_COMPILER_SCHEMA_VERSION } from "../src/storage/prepared-generation-cache-store.js";

const root = resolve(import.meta.dirname, "..");
const outputDirectory = resolve(root, "rules/generated");
const staticLists = DEFAULT_FILTER_LISTS.filter(({ staticRulesetId }) => staticRulesetId);
const compiler = new NetworkFilterCompiler({ budget: new RuleBudget({ dynamic: 300_000 }) });
const metadata = { compilerVersion: FILTER_COMPILER_SCHEMA_VERSION, totalRuleCount: 0, rulesets: [] };

await mkdir(outputDirectory, { recursive: true });
for (const list of staticLists) {
  const source = await readFile(resolve(root, list.path), "utf8");
  const preprocessed = await preprocessFilterText(source, {
    sourceName: list.path,
    include: async (name) => {
      if (name.includes("..") || name.includes(":")) return null;
      try { return await readFile(resolve(root, "filters", name), "utf8"); } catch { return null; }
    },
  });
  const parsed = parseFilterText(`! OriginMatrix source: ${list.title}\n${preprocessed.source}`);
  const compiled = compiler.compile(parsed.filters);
  const filename = `${list.id}.json`;
  const serialized = `${JSON.stringify(compiled.rules, null, 2)}\n`;
  await writeFile(resolve(outputDirectory, filename), serialized);
  metadata.totalRuleCount += compiled.rules.length;
  metadata.rulesets.push({
    id: list.staticRulesetId,
    listId: list.id,
    sourceVersion: list.snapshotVersion,
    sourceChecksum: createHash("sha256").update(source).digest("hex"),
    compilerVersion: FILTER_COMPILER_SCHEMA_VERSION,
    generatedRuleCount: compiled.rules.length,
    unsupportedCount: parsed.diagnostics.rulesUnsupported,
    outputChecksum: createHash("sha256").update(serialized).digest("hex"),
    path: `rules/generated/${filename}`,
  });
}
if (metadata.totalRuleCount > 300_000) throw new RangeError(`Static rule budget exceeded: ${metadata.totalRuleCount}/300000.`);
await writeFile(resolve(outputDirectory, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`);
console.log(`Generated ${metadata.totalRuleCount} static DNR rules across ${metadata.rulesets.length} rulesets.`);
