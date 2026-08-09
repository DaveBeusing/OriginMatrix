import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { analyzeRelevantScriptletCoverage, analyzeScriptletUsage } from "../src/diagnostics/scriptlet-usage.js";

test("calculates deterministic relevant coverage and unsupported primitive ranking", () => {
  const result = analyzeRelevantScriptletCoverage([
    { name: "EasyList", source: `
youtube.com##+js(set-constant, player.ads, undefined)
youtube.com##+js(json-prune, adPlacements)
youtube.com##+js(json-prune, adPlacements)
youtube.com,~m.youtube.com##+js(prevent-fetch, ads)
##+js(remove-attr, data-ad)
example.com##+js(prevent-xhr, ads)` },
    { name: "EasyPrivacy", source: `
www.youtube.com##+js(json-prune, playerResponse)
youtube.com##+js(abort-on-property-read, player.ads)` },
  ], { hostname: "www.youtube.com" });

  assert.deepEqual(result.relevant, { total: 6, supported: 2, unsupported: 4, percent: 33.3 });
  assert.deepEqual(result.overall, { total: 7, supported: 2, unsupported: 5, percent: 28.6 });
  assert.deepEqual(result.unsupportedRanking.map(({ name, relevantUnsupported, score }) => ({ name, relevantUnsupported, score })), [
    { name: "json-prune", relevantUnsupported: 2, score: 2022 },
    { name: "prevent-fetch", relevantUnsupported: 1, score: 1011 },
    { name: "remove-attr", relevantUnsupported: 1, score: 1011 },
    { name: "prevent-xhr", relevantUnsupported: 0, score: 11 },
  ]);
  const supported = result.primitives.find(({ name }) => name === "set-constant");
  assert.deepEqual(supported.executionPhases, ["early"]);
  assert.deepEqual(supported.sourceLists, ["EasyList"]);
  assert.equal(result.occurrences.filter(({ name }) => name === "json-prune").length, 2);
});

test("applies exclusions, generic rules, and subdomain matching without suffix lookalikes", () => {
  const sources = [{ name: "Fixture", source: `
youtube.com,~m.youtube.com##+js(json-prune, ads)
##+js(remove-attr, data-ad)
notyoutube.com##+js(prevent-fetch, ads)` }];
  assert.deepEqual(analyzeRelevantScriptletCoverage(sources, { hostname: "m.youtube.com" }).relevant, { total: 1, supported: 0, unsupported: 1, percent: 0 });
  assert.deepEqual(analyzeRelevantScriptletCoverage(sources, { hostname: "www.youtube.com" }).relevant, { total: 2, supported: 0, unsupported: 2, percent: 0 });
  assert.deepEqual(analyzeRelevantScriptletCoverage([], { hostname: "youtube.com" }).relevant, { total: 0, supported: 0, unsupported: 0, percent: 0 });
});

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

test("measures supported high-value primitives in the enabled snapshots", async () => {
  const sources = await Promise.all(["easylist", "easyprivacy"].map(async (name) => ({ name, source: await readFile(new URL(`../filters/${name}.txt`, import.meta.url), "utf8") })));
  const result = analyzeRelevantScriptletCoverage(sources, { hostname: "youtube.com" });
  assert.deepEqual(result.overall, { total: 27, supported: 11, unsupported: 16, percent: 40.7 });
  assert.deepEqual(result.primitives.filter(({ supported }) => supported > 0).map(({ name, supported }) => ({ name, supported })), [
    { name: "remove-node-text", supported: 4 },
    { name: "set-constant", supported: 4 },
    { name: "set-local-storage-item", supported: 3 },
  ]);
  assert.deepEqual(result.relevant, { total: 0, supported: 0, unsupported: 0, percent: 0 });
});
