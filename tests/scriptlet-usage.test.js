import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { analyzeScriptletUsage } from "../src/diagnostics/scriptlet-usage.js";

test("ranks real scriptlet references by site relevance and engine support", () => {
  const result = analyzeScriptletUsage(`
youtube.com##+js(set-constant, player.ads, undefined)
youtube.com##+js(json-prune, adPlacements)
example.com##+js(prevent-fetch, ads)
youtube.com#%#//scriptlet('prevent-xhr', 'ads')
`, { relevantDomains: ["youtube.com"] });
  assert.equal(result.totalReferences, 4);
  assert.equal(result.relevantReferences, 3);
  assert.deepEqual(result.names.map(({ name, total, relevant, supported, unsupported }) => ({ name, total, relevant, supported, unsupported })), [
    { name: "json-prune", total: 1, relevant: 1, supported: 0, unsupported: 1 },
    { name: "prevent-xhr", total: 1, relevant: 1, supported: 0, unsupported: 1 },
    { name: "set-constant", total: 1, relevant: 1, supported: 1, unsupported: 0 },
    { name: "prevent-fetch", total: 1, relevant: 0, supported: 0, unsupported: 1 },
  ]);
});

test("records that the pinned EasyList snapshot contains no scriptlet demand", async () => {
  const source = await readFile(new URL("../filters/easylist.txt", import.meta.url), "utf8");
  const result = analyzeScriptletUsage(source, { relevantDomains: ["youtube.com"] });
  assert.equal(result.totalReferences, 0);
  assert.equal(result.relevantReferences, 0);
  assert.deepEqual(result.names, []);
});
