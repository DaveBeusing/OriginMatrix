import test from "node:test";
import assert from "node:assert/strict";
import { AdvancedPolicyManager } from "../src/engine/advanced-policy-manager.js";
import { PolicyStore } from "../src/storage/policy-store.js";
import { exportPolicies } from "../src/storage/policy-transfer.js";
import { createPolicy } from "../src/shared/models.js";

function memoryStorage() {
  const data = {};
  return { async get(key) { return { [key]: data[key] }; }, async set(values) { Object.assign(data, structuredClone(values)); } };
}

function harness() {
  const store = new PolicyStore({ localArea: memoryStorage(), sessionArea: memoryStorage() });
  const engine = {
    compiler: { compilePolicies() { return []; } },
    async recompile() {},
  };
  return { store, manager: new AdvancedPolicyManager({ store, engine }) };
}

test("merge import replaces matching coordinates and preserves other rules", async () => {
  const { store, manager } = harness();
  await store.putPolicy(createPolicy({ scope: "example.com", resourceType: "script", action: "allow" }));
  await store.putPolicy(createPolicy({ scope: "other.test", resourceType: "image", action: "block" }));
  const imported = createPolicy({ scope: "example.com", resourceType: "script", action: "block" });
  await manager.import(exportPolicies([imported]), { mode: "merge" });
  const policies = await store.getPersistentPolicies();
  assert.equal(policies.length, 2);
  assert.equal(policies.find((policy) => policy.scope === "example.com").action, "block");
});

test("profiles preserve site rules while replacing global defaults", async () => {
  const { store, manager } = harness();
  await store.putPolicy(createPolicy({ resourceType: "image", action: "block" }));
  await store.putPolicy(createPolicy({ scope: "example.com", target: "cdn.test", action: "allow" }));
  await manager.applyProfile("strict");
  const policies = await store.getPersistentPolicies();
  assert.equal(policies.some((policy) => policy.scope === "example.com"), true);
  assert.equal(policies.some((policy) => policy.party === "thirdParty" && policy.resourceType === "script" && policy.action === "block"), true);
  assert.equal(policies.some((policy) => policy.scope === "*" && policy.resourceType === "image"), false);
});

test("profile application coordinates policy, protection, and persisted profile state", async () => {
  const store = new PolicyStore({ localArea: memoryStorage(), sessionArea: memoryStorage() });
  let activeProfile = "balanced";
  const applied = [];
  const manager = new AdvancedPolicyManager({
    store,
    engine: { compiler: { compilePolicies() { return []; } }, async recompile() {} },
    profileStore: { async get() { return activeProfile; }, async set(name) { activeProfile = name; } },
    protectionService: { async apply(features) { applied.push(features); } },
  });
  const result = await manager.applyProfile("relaxed");
  assert.equal(activeProfile, "relaxed");
  assert.deepEqual(result.features, { network: true, cosmetic: true, scriptlets: false });
  assert.deepEqual(applied, [{ network: true, cosmetic: true, scriptlets: false }]);
});

test("failed protection activation restores the previous profile and policies", async () => {
  const store = new PolicyStore({ localArea: memoryStorage(), sessionArea: memoryStorage() });
  const previous = createPolicy({ resourceType: "image", action: "block" });
  await store.putPolicy(previous);
  let activeProfile = "balanced";
  let attempts = 0;
  const manager = new AdvancedPolicyManager({
    store,
    engine: { compiler: { compilePolicies() { return []; } }, async recompile() {} },
    profileStore: { async get() { return activeProfile; }, async set(name) { activeProfile = name; } },
    protectionService: { async apply() { attempts += 1; if (attempts === 1) throw new Error("activation failed"); } },
  });
  await assert.rejects(() => manager.applyProfile("relaxed"), /activation failed/);
  assert.equal(activeProfile, "balanced");
  assert.deepEqual(await store.getPersistentPolicies(), [previous]);
  assert.equal(attempts, 2);
});
