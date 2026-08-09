import test from "node:test";
import assert from "node:assert/strict";
import { DynamicRuleManager, diffRules } from "../src/network/dynamic-rule-manager.js";
import { RuleBudget } from "../src/network/rule-budget.js";

function rule(id, priority = 1) { return { id, priority, action: { type: "block" }, condition: { urlFilter: `*${id}*` } }; }
function apiWith(initial) {
  let rules = structuredClone(initial); const calls = [];
  return { calls, async getDynamicRules() { return structuredClone(rules); }, async updateDynamicRules(update) { calls.push(structuredClone(update)); const removed = new Set(update.removeRuleIds); rules = [...rules.filter(({ id }) => !removed.has(id)), ...structuredClone(update.addRules)]; } };
}

test("skips Chrome updates for an identical generation regardless of object key order", async () => {
  const api = apiWith([rule(500_001)]);
  const manager = new DynamicRuleManager({ api, budget: new RuleBudget() });
  const same = { condition: { urlFilter: "*500001*" }, action: { type: "block" }, priority: 1, id: 500_001 };
  const metrics = await manager.replaceInRange([same], { minimum: 500_000, maximum: 899_999 });
  assert.deepEqual(metrics, { rulesPrevious: 1, rulesNext: 1, rulesAdded: 0, rulesRemoved: 0, rulesChanged: 0, rulesUnchanged: 1 });
  assert.equal(api.calls.length, 0);
  assert.equal(manager.getDiagnostics().skippedUpdates, 1);
});

test("adds, removes, and replaces only changed managed rules", async () => {
  const persistentMatrix = rule(100_001);
  const api = apiWith([persistentMatrix, rule(500_001), rule(500_002)]);
  const manager = new DynamicRuleManager({ api, budget: new RuleBudget() });
  const changed = rule(500_001, 2);
  const metrics = await manager.replaceInRange([changed, rule(500_003)], { minimum: 500_000, maximum: 899_999 });
  assert.deepEqual(metrics, { rulesPrevious: 2, rulesNext: 2, rulesAdded: 1, rulesRemoved: 1, rulesChanged: 1, rulesUnchanged: 0 });
  assert.deepEqual(api.calls[0], { removeRuleIds: [500_001, 500_002], addRules: [changed, rule(500_003)] });
  assert.deepEqual(await api.getDynamicRules(), [persistentMatrix, changed, rule(500_003)]);
});

test("keeps a large mostly-unchanged generation out of the update payload", () => {
  const previous = Array.from({ length: 1_000 }, (_, index) => rule(500_000 + index));
  const next = [...previous.slice(0, 999), rule(500_999, 2), rule(501_000)];
  const diff = diffRules(previous, next);
  assert.deepEqual(diff.metrics, { rulesPrevious: 1_000, rulesNext: 1_001, rulesAdded: 1, rulesRemoved: 0, rulesChanged: 1, rulesUnchanged: 999 });
  assert.deepEqual(diff.removeRuleIds, [500_999]);
  assert.deepEqual(diff.addRules, [rule(500_999, 2), rule(501_000)]);
});

test("rejects duplicate IDs before diffing", () => {
  assert.throws(() => diffRules([], [rule(1), rule(1)]), /unique/);
});
