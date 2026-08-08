import test from "node:test";
import assert from "node:assert/strict";
import { RuleOptimizer } from "../src/engine/rule-optimizer.js";

test("removes only semantically identical rules", () => {
  const base = { priority: 10, action: { type: "block" }, condition: { requestDomains: ["example.com"] } };
  const result = new RuleOptimizer().optimize([{ id: 1, ...base }, { id: 2, ...structuredClone(base) }, { id: 3, ...base, priority: 11 }]);
  assert.deepEqual(result.rules.map((rule) => rule.id), [1, 3]);
  assert.equal(result.optimizedAway, 1);
});

test("does not merge rules with different conditions", () => {
  const result = new RuleOptimizer().optimize([
    { id: 1, priority: 1, action: { type: "block" }, condition: { requestDomains: ["a.test"] } },
    { id: 2, priority: 1, action: { type: "block" }, condition: { requestDomains: ["b.test"] } },
  ]);
  assert.equal(result.optimizedAway, 0);
});
