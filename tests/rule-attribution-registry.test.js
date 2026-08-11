import test from "node:test";
import assert from "node:assert/strict";
import { RuleAttributionRegistry } from "../src/background/rule-attribution-registry.js";

test("attributes static, filter, persistent Matrix, and temporary Matrix rules", () => {
  const registry = new RuleAttributionRegistry();
  registry.replace({
    dynamicRules: [
      { id: 500_001, action: { type: "block" } },
      { id: 100_001, action: { type: "allow" } },
    ],
    sessionRules: [{ id: 900_001, action: { type: "modifyHeaders" } }],
  });
  assert.deepEqual(registry.resolve({ rulesetId: "base-network", ruleId: 1 }), { decision: "blocked", engine: "network", source: "Base network rules", rule: "base-network:1", category: "ads" });
  assert.deepEqual(registry.resolve({ rulesetId: "core_easyprivacy", ruleId: 42 }), { decision: "unknown", engine: "network", source: "EasyPrivacy", rule: "core_easyprivacy:42", category: "trackers" });
  assert.deepEqual(registry.resolve({ rulesetId: "_dynamic", ruleId: 500_001 }), { decision: "blocked", engine: "network", source: "Filter list", rule: null, category: null });
  assert.deepEqual(registry.resolve({ rulesetId: "_dynamic", ruleId: 100_001 }), { decision: "allowed", engine: "matrix", source: "User Matrix Policy", rule: "allow * → * (any, all)", category: null });
  assert.deepEqual(registry.resolve({ rulesetId: "_session", ruleId: 900_001 }), { decision: "modified", engine: "matrix", source: "Session Override", rule: "modifyHeaders * → * (any, all)", category: null });
});

test("keeps attribution unknown when Chrome reports a rule absent from the current index", () => {
  const registry = new RuleAttributionRegistry();
  assert.deepEqual(registry.resolve({ rulesetId: "_dynamic", ruleId: 500_010 }), { decision: "unknown", engine: "network", source: "Filter list", rule: null, category: null });
});

test("selects the matching original rule and source list for aggregated DNR rules", () => {
  const registry = new RuleAttributionRegistry();
  registry.replace({ dynamicRules: [{ id: 500_020, action: { type: "block" } }], filterAttributions: { 500020: [{ source: "EasyList", rule: "||ads.example^" }, { source: "EasyPrivacy", rule: "||tracker.example^" }] } });
  assert.deepEqual(registry.resolve({ rulesetId: "_dynamic", ruleId: 500_020, url: "https://tracker.example/pixel" }), { decision: "blocked", engine: "network", source: "EasyPrivacy", rule: "||tracker.example^", category: "trackers" });
});
