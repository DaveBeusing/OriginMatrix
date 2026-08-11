import test from "node:test";
import assert from "node:assert/strict";
import { createExceptionFilter, createNetworkFilter, createCosmeticFilter } from "../src/filters/filter-model.js";
import {
  NetworkFilterCompiler, NETWORK_FILTER_PRIORITY, NETWORK_FILTER_RULE_RANGE,
} from "../src/filters/network-filter-compiler.js";
import { DnrCompiler } from "../src/engine/dnr-compiler.js";
import { createPolicy } from "../src/shared/models.js";
import { RuleBudget } from "../src/network/rule-budget.js";

test("compiles a block rule with resource, party, and domain scope", () => {
  const filter = createNetworkFilter({
    pattern: "*/ads/*", domains: ["news.example"], excludedDomains: ["private.news.example"],
    resourceTypes: ["script", "image"], thirdParty: true,
  });
  const { rules } = new NetworkFilterCompiler().compile([filter]);
  assert.deepEqual(rules[0].action, { type: "block" });
  assert.deepEqual(rules[0].condition, {
    urlFilter: "*/ads/*", initiatorDomains: ["news.example"],
    excludedInitiatorDomains: ["private.news.example"], resourceTypes: ["image", "script"], domainType: "thirdParty",
  });
  assert.equal(rules[0].priority, NETWORK_FILTER_PRIORITY.block);
});

test("compiles exceptions above filter blocks but below Matrix overrides", () => {
  const filters = [
    createNetworkFilter({ pattern: "||ads.example^" }),
    createExceptionFilter({ pattern: "||ads.example^", domains: ["trusted.example"] }),
  ];
  const { rules } = new NetworkFilterCompiler().compile(filters);
  const block = rules.find(({ action }) => action.type === "block");
  const allow = rules.find(({ action }) => action.type === "allow");
  assert.ok(allow.priority > block.priority);

  const [matrixAllow] = new DnrCompiler().compilePolicies([
    createPolicy({ scope: "trusted.example", target: "ads.example", action: "allow" }),
  ]);
  assert.ok(matrixAllow.priority > allow.priority);
});

test("deduplicates filters and safely aggregates compatible host blocks", () => {
  const first = createNetworkFilter({ pattern: "||a.example^", resourceTypes: ["script"] });
  const duplicate = createNetworkFilter({ pattern: "||a.example^", resourceTypes: ["script"] });
  const second = createNetworkFilter({ pattern: "||b.example^", resourceTypes: ["script"] });
  const result = new NetworkFilterCompiler().compile([first, duplicate, second]);
  assert.equal(result.rules.length, 1);
  assert.deepEqual(result.rules[0].condition.requestDomains, ["a.example", "b.example"]);
  assert.equal(result.diagnostics.duplicatesRemoved, 1);
  assert.equal(result.diagnostics.rulesOptimized, 1);
  assert.equal(result.diagnostics.signatureCacheHits, result.rules.length);
});

test("keeps attribution outside Chrome DNR rules", () => {
  const filters = [createNetworkFilter({ pattern: "||ads.example^", sourceList: "EasyList", sourceRule: "||ads.example^" }), createNetworkFilter({ pattern: "||tracker.example^", sourceList: "EasyPrivacy", sourceRule: "||tracker.example^" })];
  const result = new NetworkFilterCompiler().compile(filters);
  assert.equal("attributions" in result.rules[0], false);
  assert.deepEqual(result.attributions[result.rules[0].id], [{ source: "EasyList", rule: "||ads.example^" }, { source: "EasyPrivacy", rule: "||tracker.example^" }]);
});

test("deduplicates semantically identical cross-list rules while retaining attribution", () => {
  const result = new NetworkFilterCompiler().compile([
    createNetworkFilter({ pattern: "*/shared-ad.js", sourceList: "EasyList", sourceRule: "*/shared-ad.js" }),
    createNetworkFilter({ pattern: "*/shared-ad.js", sourceList: "uBlock filters – Ads", sourceRule: "*/shared-ad.js" }),
  ]);
  assert.equal(result.rules.length, 1);
  assert.equal(result.diagnostics.duplicatesRemoved, 1);
  assert.deepEqual(result.attributions[result.rules[0].id], [
    { source: "EasyList", rule: "*/shared-ad.js" },
    { source: "uBlock filters – Ads", rule: "*/shared-ad.js" },
  ]);
});

test("chunks large host aggregations into bounded DNR conditions", () => {
  const filters = Array.from({ length: 1_001 }, (_, index) => createNetworkFilter({ pattern: `||ads-${index}.example^` }));
  const result = new NetworkFilterCompiler().compile(filters);
  assert.equal(result.rules.length, 2);
  assert.ok(result.rules.every(({ condition }) => condition.requestDomains.length <= 1_000));
});

test("does not aggregate rules with different actions or conditions", () => {
  const result = new NetworkFilterCompiler().compile([
    createNetworkFilter({ pattern: "||a.example^", thirdParty: true }),
    createNetworkFilter({ pattern: "||b.example^", thirdParty: false }),
    createExceptionFilter({ pattern: "||c.example^", thirdParty: true }),
  ]);
  assert.equal(result.rules.length, 3);
});

test("compiles reviewed redirect resources with aliases and inferred types", () => {
  const parsed = createNetworkFilter({ pattern: "||tracker.example^", redirectResource: "noop.js" });
  const { rules } = new NetworkFilterCompiler().compile([parsed]);
  assert.deepEqual(rules[0].action, { type: "redirect", redirect: { extensionPath: "/resources/noop.js" } });
  assert.deepEqual(rules[0].condition.resourceTypes, ["script", "xmlhttprequest"]);
  assert.throws(() => new NetworkFilterCompiler().compile([
    createNetworkFilter({ pattern: "||tracker.example^", redirectResource: "noop.js", resourceTypes: ["image"] }),
  ]), /incompatible/);
});

test("compiles advanced target, method, case, and query transformations", () => {
  const filter = createNetworkFilter({
    pattern: "*tracking*", requestDomains: ["cdn.example"], excludedRequestDomains: ["private.cdn.example"],
    requestMethods: ["get"], removeParams: ["utm_source", "gclid"], matchCase: true,
  });
  const { rules } = new NetworkFilterCompiler().compile([filter]);
  assert.deepEqual(rules[0].action, {
    type: "redirect", redirect: { transform: { queryTransform: { removeParams: ["gclid", "utm_source"] } } },
  });
  assert.deepEqual(rules[0].condition, {
    urlFilter: "*tracking*", requestDomains: ["cdn.example"], excludedRequestDomains: ["private.cdn.example"],
    requestMethods: ["get"], isUrlFilterCaseSensitive: true,
  });
});

test("intersects host patterns with narrower target domains", () => {
  const filter = createNetworkFilter({ pattern: "||example.com^", requestDomains: ["media.example.com"] });
  const { rules } = new NetworkFilterCompiler().compile([filter]);
  assert.deepEqual(rules[0].condition.requestDomains, ["media.example.com"]);
  assert.throws(() => new NetworkFilterCompiler().compile([
    createNetworkFilter({ pattern: "||example.com^", requestDomains: ["unrelated.example"] }),
  ]), /do not overlap/);
});

test("assigns stable IDs in a range isolated from Matrix and session rules", () => {
  const filters = [createNetworkFilter({ pattern: "||a.example^" }), createNetworkFilter({ pattern: "*/ads/*" })];
  const compiler = new NetworkFilterCompiler();
  const forward = compiler.compile(filters).rules;
  const reverse = compiler.compile([...filters].reverse()).rules;
  assert.deepEqual(forward, reverse);
  assert.ok(forward.every(({ id }) => id >= NETWORK_FILTER_RULE_RANGE.minimum && id <= NETWORK_FILTER_RULE_RANGE.maximum));
});

test("accounts for shared dynamic budget and skips non-network models", () => {
  const compiler = new NetworkFilterCompiler({ budget: new RuleBudget({ dynamic: 2 }) });
  const filter = createNetworkFilter({ pattern: "||ads.example^" });
  const result = compiler.compile([filter, createCosmeticFilter({ selector: ".ad" })], { reservedDynamicRules: 1 });
  assert.equal(result.diagnostics.nonNetworkFilters, 1);
  assert.equal(result.diagnostics.dynamicRulesRequired, 2);
  assert.throws(() => compiler.compile([filter], { reservedDynamicRules: 2 }), /budget exceeded/);
});
