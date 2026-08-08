import test from "node:test";
import assert from "node:assert/strict";
import { parseFilterRule, parseFilterText } from "../src/filters/filter-parser.js";

test("parses the deliberately small domain-blocking syntax", () => {
  const result = parseFilterRule("||Ads.Example^");
  assert.equal(result.status, "supported");
  assert.deepEqual(result.filter, {
    type: "network", pattern: "||ads.example^", domains: [], excludedDomains: [],
    resourceTypes: [], thirdParty: null, action: "block",
  });
});

test("parses network exceptions and simple cosmetic selectors", () => {
  assert.equal(parseFilterRule("@@||cdn.example^").filter.type, "exception");
  assert.deepEqual(parseFilterRule("example.com##.advertisement").filter, {
    type: "cosmetic", selector: ".advertisement", domains: ["example.com"], excludedDomains: [],
  });
});

test("ignores metadata and reports unsupported syntax without guessing", () => {
  const parsed = parseFilterText(`! title\n[Adblock Plus 2.0]\n||ads.example^$script\nexample.com##+js(set-constant, foo, true)`);
  assert.equal(parsed.filters.length, 0);
  assert.equal(parsed.ignored.length, 2);
  assert.equal(parsed.unsupported.length, 2);
  assert.ok(parsed.unsupported.every(({ reason }) => reason === "syntax-not-supported"));
  assert.equal(parseFilterRule("||bad..example^").status, "unsupported");
});
