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
    network: { supported: 3, unsupported: 0, total: 3, percent: 100 },
    cosmetic: { supported: 2, unsupported: 0, total: 2, percent: 100 },
    scriptlet: { supported: 2, unsupported: 0, total: 2, percent: 100 },
    total: { supported: 7, unsupported: 0, total: 7, percent: 100 },
  });
  assert.equal(result.relevantRules.length, 7);
  assert.deepEqual(result.unsupportedRelevantRules, []);
});

test("rejects invalid hostnames and does not include suffix lookalikes", () => {
  assert.throws(() => analyzeSiteFilterCoverage("||example.com^", { hostname: "not a host" }), /valid hostname/);
  const result = analyzeSiteFilterCoverage("||notyoutube.com^\n||video.youtube.com^", { hostname: "youtube.com" });
  assert.equal(result.coverage.total.total, 1);
});
