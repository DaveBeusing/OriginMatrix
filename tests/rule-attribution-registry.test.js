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
  assert.deepEqual(registry.resolve({ rulesetId: "base-network", ruleId: 1 }), { decision: "blocked", engine: "network", source: "Base network rules" });
  assert.deepEqual(registry.resolve({ rulesetId: "_dynamic", ruleId: 500_001 }), { decision: "blocked", engine: "network", source: "EasyList" });
  assert.deepEqual(registry.resolve({ rulesetId: "_dynamic", ruleId: 100_001 }), { decision: "allowed", engine: "matrix", source: "Persistent Matrix" });
  assert.deepEqual(registry.resolve({ rulesetId: "_session", ruleId: 900_001 }), { decision: "modified", engine: "matrix", source: "Temporary Matrix" });
});

test("keeps attribution unknown when Chrome reports a rule absent from the current index", () => {
  const registry = new RuleAttributionRegistry();
  assert.deepEqual(registry.resolve({ rulesetId: "_dynamic", ruleId: 500_010 }), { decision: "unknown", engine: "network", source: "Filter list" });
});
