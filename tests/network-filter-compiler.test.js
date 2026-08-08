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
});

test("does not aggregate rules with different actions or conditions", () => {
  const result = new NetworkFilterCompiler().compile([
    createNetworkFilter({ pattern: "||a.example^", thirdParty: true }),
    createNetworkFilter({ pattern: "||b.example^", thirdParty: false }),
    createExceptionFilter({ pattern: "||c.example^", thirdParty: true }),
  ]);
  assert.equal(result.rules.length, 3);
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
