import test from "node:test";
import assert from "node:assert/strict";
import { NetworkEngine } from "../src/network/network-engine.js";
import { RuleBudget } from "../src/network/rule-budget.js";

function fakeDnrApi() {
  let dynamic = [{ id: 1 }];
  let session = [{ id: 10 }];
  let enabled = ["base"];
  const calls = [];
  const update = (kind, options) => {
    const current = kind === "dynamic" ? dynamic : session;
    const removed = new Set(options.removeRuleIds ?? []);
    const next = [...current.filter((rule) => !removed.has(rule.id)), ...(options.addRules ?? [])];
    if (kind === "dynamic") dynamic = next; else session = next;
    calls.push([kind, structuredClone(options)]);
  };
  return {
    calls,
    async getDynamicRules() { return structuredClone(dynamic); },
    async getSessionRules() { return structuredClone(session); },
    async updateDynamicRules(options) { update("dynamic", options); },
    async updateSessionRules(options) { update("session", options); },
    async getEnabledRulesets() { return [...enabled]; },
    async updateEnabledRulesets(options) {
      const disabled = new Set(options.disableRulesetIds);
      enabled = [...enabled.filter((id) => !disabled.has(id)), ...options.enableRulesetIds];
      calls.push(["static", structuredClone(options)]);
    },
    async getAvailableStaticRuleCount() { return 29_500; },
  };
}

test("replaces dynamic and session generations atomically through their managers", async () => {
  const api = fakeDnrApi();
  const engine = new NetworkEngine({ api });
  await engine.replaceRules({ temporary: false, rules: [{ id: 2 }, { id: 3 }] });
  await engine.replaceRules({ temporary: true, rules: [{ id: 11 }] });
  assert.deepEqual(await engine.getDynamicRules(), [{ id: 2 }, { id: 3 }]);
  assert.deepEqual(await engine.getSessionRules(), [{ id: 11 }]);
  assert.deepEqual(api.calls[0], ["dynamic", { removeRuleIds: [1], addRules: [{ id: 2 }, { id: 3 }] }]);
  assert.deepEqual(api.calls[1], ["session", { removeRuleIds: [10], addRules: [{ id: 11 }] }]);
});

test("installs and removes individual dynamic and session rules", async () => {
  const api = fakeDnrApi();
  const engine = new NetworkEngine({ api });
  await engine.dynamic.install([{ id: 2 }]);
  await engine.dynamic.remove([1]);
  await engine.session.install([{ id: 11 }]);
  await engine.session.remove([10]);
  assert.deepEqual(await engine.getDynamicRules(), [{ id: 2 }]);
  assert.deepEqual(await engine.getSessionRules(), [{ id: 11 }]);
});

test("prepares static ruleset activation behind the same engine", async () => {
  const api = fakeDnrApi();
  const engine = new NetworkEngine({ api });
  await engine.static.setEnabledRulesets(["privacy"]);
  assert.deepEqual(await engine.static.getEnabledRulesets(), ["privacy"]);
  assert.equal(await engine.static.getAvailableRuleCount(), 29_500);
  assert.deepEqual(api.calls.at(-1), ["static", { disableRulesetIds: ["base"], enableRulesetIds: ["privacy"] }]);
});

test("reports whether bundled network protection is active", async () => {
  const engine = new NetworkEngine({ api: fakeDnrApi() });
  assert.deepEqual(await engine.getProtectionStatus("base"), { enabled: true, rulesetId: "base" });
  assert.deepEqual(await engine.getProtectionStatus(), { enabled: false, rulesetId: "base-network" });
});

test("refuses replacement before calling Chrome when the budget is exceeded", async () => {
  const api = fakeDnrApi();
  const engine = new NetworkEngine({ api, budget: new RuleBudget({ dynamic: 1 }) });
  await assert.rejects(() => engine.dynamic.replace([{ id: 2 }, { id: 3 }]), /budget exceeded/);
  assert.equal(api.calls.length, 0);
});

test("reports unified rule counts and budgets", async () => {
  const engine = new NetworkEngine({ api: fakeDnrApi(), budget: new RuleBudget({ dynamic: 5, session: 4 }) });
  const diagnostics = await engine.getDiagnostics();
  assert.equal(diagnostics.dynamicRules.length, 1);
  assert.equal(diagnostics.sessionRules.length, 1);
  assert.deepEqual(diagnostics.enabledStaticRulesets, ["base"]);
  assert.equal(diagnostics.budget.dynamic.available, 4);
  assert.equal(diagnostics.budget.session.available, 3);
});
