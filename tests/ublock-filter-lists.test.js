import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DEFAULT_FILTER_LISTS, UBLOCK_FILTER_LISTS } from "../src/filters/filter-list-catalog.js";
import { FILTER_TEXT_LIMITS, parseFilterText } from "../src/filters/filter-parser.js";
import { NetworkFilterCompiler } from "../src/filters/network-filter-compiler.js";
import { DEFAULT_RULE_LIMITS } from "../src/network/rule-budget.js";

test("all bundled lists fit source and dynamic-rule budgets with attribution", async () => {
  const sources = await Promise.all(DEFAULT_FILTER_LISTS.map(async (list) => ({ list, source: await readFile(new URL(`../${list.path}`, import.meta.url), "utf8") })));
  const combined = sources.map(({ list, source }) => `! OriginMatrix source: ${list.title}\n${source}`).join("\n");
  assert.ok(new TextEncoder().encode(combined).length <= FILTER_TEXT_LIMITS.sourceBytes);
  const parsed = parseFilterText(combined);
  const compiled = new NetworkFilterCompiler().compile(parsed.filters);
  assert.ok(compiled.rules.length <= DEFAULT_RULE_LIMITS.dynamic);
  assert.ok(compiled.diagnostics.duplicatesRemoved > 0);
  assert.ok(Object.values(compiled.attributions).flat().some(({ source }) => source.startsWith("uBlock")));
  assert.ok(parsed.diagnostics.rulesUnsupported > 0);
});

test("uAssets catalog entries retain update and license metadata", () => {
  for (const list of UBLOCK_FILTER_LISTS) {
    assert.match(list.sourceUrl, /^https:\/\/ublockorigin\.github\.io\/uAssets\/filters\//);
    assert.match(list.licenseUrl, /uBlockOrigin\/uAssets\/blob\/master\/LICENSE$/);
    assert.match(list.snapshotVersion, /^\d{14}$/);
    assert.ok(Number.isFinite(Date.parse(list.snapshotUpdatedAt)));
    assert.match(list.sha256, /^[a-f0-9]{64}$/);
  }
});
