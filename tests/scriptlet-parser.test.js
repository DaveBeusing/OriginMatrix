import test from "node:test";
import assert from "node:assert/strict";
import { parseFilterRule, parseFilterText } from "../src/filters/filter-parser.js";
import { parseScriptletRule } from "../src/scriptlets/scriptlet-parser.js";

test("parses selected domain-scoped scriptlet syntax", () => {
  const result = parseScriptletRule("example.com,video.example.com,~account.example.com##+js(set-constant.js, player.ads, undefined)");
  assert.equal(result.status, "supported");
  assert.deepEqual(result.filter, {
    type: "scriptlet",
    name: "set-constant",
    args: ["player.ads", "undefined"],
    domains: ["example.com", "video.example.com"],
    excludedDomains: ["account.example.com"],
  });
});

test("parses quoted and escaped arguments without evaluating them", () => {
  const quoted = parseScriptletRule("example.com##+js(remove-node-text, '.advert', 'sponsored, offer')");
  assert.deepEqual(quoted.filter.args, [".advert", "sponsored, offer"]);
  const escaped = parseScriptletRule("example.com##+js(remove-node-text, .advert, sponsored\\, offer)");
  assert.deepEqual(escaped.filter.args, [".advert", "sponsored, offer"]);
  assert.equal(parseScriptletRule("example.com##+js(aopr, ads.value)").filter.name, "abort-on-property-read");
});

test("reports malformed, global, exception, and oversized calls", () => {
  assert.equal(parseScriptletRule("##+js(set-constant, value, true)").reason, "global-scriptlet-not-supported");
  assert.equal(parseScriptletRule("example.com#@#+js(set-constant, value, true)").reason, "scriptlet-exception-not-supported");
  assert.equal(parseScriptletRule("example.com##+js(set-constant, 'value, true)").reason, "unterminated-scriptlet-argument");
  assert.equal(parseScriptletRule("example.com##+js(set-constant, value, \\n)").reason, "invalid-scriptlet-escape");
  assert.equal(parseScriptletRule("example.com##+js(x,a,b,c,d,e,f,g,h,i)").reason, "too-many-scriptlet-arguments");
});

test("integrates scriptlet models and diagnostics into filter-list parsing", () => {
  const parsed = parseFilterText("example.com##+js(set-constant, player.ads, undefined)\nexample.com#@#+js(set-constant, player.ads, undefined)");
  assert.equal(parsed.filters[0].type, "scriptlet");
  assert.equal(parsed.diagnostics.rulesSupported, 1);
  assert.equal(parsed.diagnostics.rulesUnsupported, 1);
  assert.equal(parseFilterRule("example.com##+js(unknown-name, value)").filter.name, "unknown-name");
});
