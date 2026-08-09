import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSiteFilterCoverage } from "../src/diagnostics/site-filter-coverage.js";

test("reports relevant site coverage by rule type and source list", () => {
  const result = analyzeSiteFilterCoverage(`
||youtube.com^
@@||cdn.example^$domain=youtube.com
youtube.com##.promoted
youtube.com##+js(set-constant, player.ads, undefined)
||youtube.com^$redirect=noopjs
youtube.com#?#div:has-text(Sponsored)
youtube.com##+js(json-prune, adPlacements)
||unrelated.example^
`, { hostname: "www.youtube.com", filterList: "EasyList", listVersion: "fixture" });

  assert.equal(result.hostname, "www.youtube.com");
  assert.equal(result.filterList, "EasyList");
  assert.deepEqual(result.coverage, {
    network: { supported: 2, unsupported: 1, total: 3, percent: 66.7 },
    cosmetic: { supported: 1, unsupported: 1, total: 2, percent: 50 },
    scriptlet: { supported: 1, unsupported: 1, total: 2, percent: 50 },
    total: { supported: 4, unsupported: 3, total: 7, percent: 57.1 },
  });
  assert.equal(result.relevantRules.length, 7);
  assert.deepEqual(result.unsupportedRelevantRules.map(({ line, type, reason, sourceFilterList }) => ({ line, type, reason, sourceFilterList })), [
    { line: 6, type: "network", reason: "unsupported-option", sourceFilterList: "EasyList" },
    { line: 7, type: "cosmetic", reason: "pattern-not-supported", sourceFilterList: "EasyList" },
    { line: 8, type: "scriptlet", reason: "Unknown scriptlet: json-prune", sourceFilterList: "EasyList" },
  ]);
});

test("rejects invalid hostnames and does not include suffix lookalikes", () => {
  assert.throws(() => analyzeSiteFilterCoverage("||example.com^", { hostname: "not a host" }), /valid hostname/);
  const result = analyzeSiteFilterCoverage("||notyoutube.com^\n||video.youtube.com^", { hostname: "youtube.com" });
  assert.equal(result.coverage.total.total, 1);
});
