import test from "node:test";
import assert from "node:assert/strict";
import { analyzeUboCompatibility } from "../src/diagnostics/ubo-compatibility.js";

const fixture = [{ name: "Fixture", version: "1", source: `
||ads.example^$script,third-party
@@||ads.example^
youtube.com##.ad
youtube.com#?#div:has-text(Sponsored)
youtube.com##+js(set, player.ads, false)
||youtube.com^$redirect=noop.js
||youtube.com^$removeparam=utm_source
!#if env_chromium
youtube.com##^script
||ads.example^$script,third-party
` }];

test("measures uBO compatibility by filter area and requested site", () => {
  const result = analyzeUboCompatibility(fixture, { hostname: "youtube.com" });
  assert.deepEqual(result.overall, { total: 9, supported: 5, unsupported: 4, percent: 55.6 });
  assert.deepEqual(result.categories.network, { total: 2, supported: 1, unsupported: 1, percent: 50 });
  assert.deepEqual(result.categories.modifiers, { total: 4, supported: 2, unsupported: 2, percent: 50 });
  assert.deepEqual(result.categories.exceptions, { total: 1, supported: 1, unsupported: 0, percent: 100 });
  assert.deepEqual(result.categories.cosmetic, { total: 2, supported: 1, unsupported: 1, percent: 50 });
  assert.deepEqual(result.categories.procedural, { total: 1, supported: 1, unsupported: 0, percent: 100 });
  assert.deepEqual(result.categories.scriptlets, { total: 1, supported: 1, unsupported: 0, percent: 100 });
  assert.deepEqual(result.categories.redirects, { total: 1, supported: 0, unsupported: 1, percent: 0 });
  assert.deepEqual(result.categories.preprocessors, { total: 1, supported: 0, unsupported: 1, percent: 0 });
  assert.deepEqual(result.siteRelevant.overall, { total: 6, supported: 3, unsupported: 3, percent: 50 });
});

test("ranks actual unsupported primitives with sources, domains, and site relevance", () => {
  const result = analyzeUboCompatibility(fixture, { hostname: "www.youtube.com" });
  assert.deepEqual(result.unsupportedRanking.map(({ primitive, occurrences, youtubeRelevant, sourceLists }) => ({ primitive, occurrences, youtubeRelevant, sourceLists })), [
    { primitive: "html-filtering", occurrences: 1, youtubeRelevant: 1, sourceLists: ["Fixture"] },
    { primitive: "redirect", occurrences: 1, youtubeRelevant: 1, sourceLists: ["Fixture"] },
    { primitive: "removeparam", occurrences: 1, youtubeRelevant: 1, sourceLists: ["Fixture"] },
    { primitive: "!#if", occurrences: 1, youtubeRelevant: 0, sourceLists: ["Fixture"] },
  ]);
  assert.ok(result.unsupportedRanking.find(({ primitive }) => primitive === "redirect").affectedDomains.includes("youtube.com"));
});

test("is deterministic, deduplicates within a source, and retains cross-list demand", () => {
  assert.deepEqual(analyzeUboCompatibility(fixture), analyzeUboCompatibility(fixture));
  const sources = [fixture[0], { name: "Second", source: "||ads.example^$removeparam=utm_source" }];
  const result = analyzeUboCompatibility(sources, { hostname: "ads.example" });
  assert.equal(result.unsupportedRanking.find(({ primitive }) => primitive === "removeparam").occurrences, 2);
  assert.deepEqual(result.unsupportedRanking.find(({ primitive }) => primitive === "removeparam").sourceLists, ["Fixture", "Second"]);
  assert.equal(analyzeUboCompatibility([{ name: "Generic", source: "##.generic-ad" }], { hostname: "youtube.com" }).siteRelevant.overall.total, 0);
  assert.throws(() => analyzeUboCompatibility([], { hostname: "not a host" }), /valid compatibility hostname/);
});
