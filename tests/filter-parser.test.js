import test from "node:test";
import assert from "node:assert/strict";
import { parseFilterRule, parseFilterText } from "../src/filters/filter-parser.js";

test("parses domain blocks and URL patterns", () => {
  assert.deepEqual(parseFilterRule("||Ads.Example^").filter, {
    type: "network", pattern: "||ads.example^", domains: [], excludedDomains: [],
    resourceTypes: [], thirdParty: null, action: "block",
  });
  assert.equal(parseFilterRule("|https://cdn.example/ads/*|").filter.pattern, "|https://cdn.example/ads/*|");
  assert.equal(parseFilterRule("*/advertising/*.js").filter.pattern, "*/advertising/*.js");
  assert.equal(parseFilterRule("/ads/").filter.pattern, "/ads/");
  assert.equal(parseFilterRule("||CDN.Example/assets/*").filter.pattern, "||cdn.example/assets/*");
});

test("parses network exceptions, resource types, and party constraints", () => {
  assert.deepEqual(parseFilterRule("@@||www.youtube.com^$generichide").filter, {
    type: "cosmetic-control", mode: "generichide", domains: ["www.youtube.com"], excludedDomains: [],
  });
  const result = parseFilterRule("@@||cdn.example^$script,xhr,third-party");
  assert.equal(result.status, "supported");
  assert.deepEqual(result.filter, {
    type: "exception", pattern: "||cdn.example^", domains: [], excludedDomains: [],
    resourceTypes: ["script", "xmlhttprequest"], thirdParty: true, action: "allow",
  });
  assert.equal(parseFilterRule("||static.example^$~third-party").filter.thirdParty, false);
});

test("parses inclusive and excluded domain restrictions", () => {
  const filter = parseFilterRule("||ads.example^$image,domain=news.example|shop.example|~private.example").filter;
  assert.deepEqual(filter.domains, ["news.example", "shop.example"]);
  assert.deepEqual(filter.excludedDomains, ["private.example"]);
  assert.deepEqual(filter.resourceTypes, ["image"]);
});

test("parses simple cosmetic and selected scriptlet rules", () => {
  assert.deepEqual(parseFilterRule("example.com#?#.card:has-text(Sponsored)").filter, {
    type: "cosmetic", selector: ".card:has-text(Sponsored)", domains: ["example.com"], excludedDomains: [],
  });
  assert.deepEqual(parseFilterRule("##.ad-container").filter, {
    type: "cosmetic", selector: ".ad-container", domains: [], excludedDomains: [],
  });
  assert.deepEqual(parseFilterRule("#@#[data-ad-slot]").filter, {
    type: "cosmetic", selector: "[data-ad-slot]", domains: [], excludedDomains: [], exception: true,
  });
  assert.deepEqual(parseFilterRule("example.com##.advertisement").filter, {
    type: "cosmetic", selector: ".advertisement", domains: ["example.com"], excludedDomains: [],
  });
  assert.deepEqual(parseFilterRule("example.com##+js(set-constant, foo, true)").filter, {
    type: "scriptlet", name: "set-constant", args: ["foo", "true"], domains: ["example.com"], excludedDomains: [],
  });
  assert.deepEqual(parseFilterRule("example.com,video.example.com,~account.example.com#@#.advertisement").filter, {
    type: "cosmetic", selector: ".advertisement", domains: ["example.com", "video.example.com"],
    excludedDomains: ["account.example.com"], exception: true,
  });
  assert.equal(parseFilterRule("example.*##.advertisement").reason, "invalid-cosmetic-domain");
});

test("reports unsupported and conflicting syntax without guessing", () => {
  assert.deepEqual(
    { ...parseFilterRule("||ads.example^$redirect=noopjs") },
    { status: "unsupported", source: "||ads.example^$redirect=noopjs", reason: "unsupported-option", details: "redirect=noopjs" },
  );
  assert.equal(parseFilterRule("||ads.example^$third-party,~third-party").reason, "conflicting-options");
  assert.equal(parseFilterRule("/ads-[0-9]+/").reason, "pattern-not-supported");
  assert.equal(parseFilterRule("||bad..example^").status, "unsupported");
});

test("returns line-aware parser diagnostics", () => {
  const parsed = parseFilterText(`! title\n[Adblock Plus 2.0]\n||ads.example^\n@@||cdn.example^$script\n||bad.example^$redirect=x`);
  assert.equal(parsed.filters.length, 2);
  assert.equal(parsed.unsupported[0].line, 5);
  assert.deepEqual(parsed.diagnostics, {
    totalLines: 5,
    rulesParsed: 3,
    rulesSupported: 2,
    rulesUnsupported: 1,
    rulesIgnored: 2,
    rulesCompiled: 0,
    rulesOptimized: 0,
  });
});

test("bounds filter source, line count, and individual rule work", () => {
  assert.equal(parseFilterRule(`||example.com/${"x".repeat(8_192)}`).reason, "rule-too-long");
  assert.throws(() => parseFilterText("\n".repeat(250_000)), /line count limit/);
  assert.throws(() => parseFilterText("x".repeat(5_000_001)), /source size limit/);
});
