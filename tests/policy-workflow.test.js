import test from "node:test";
import assert from "node:assert/strict";
import { PolicyWorkflow } from "../src/engine/policy-workflow.js";
import { PolicyStore } from "../src/storage/policy-store.js";
import { createPolicy } from "../src/shared/models.js";

function memoryStorage() {
  const data = {};
  return {
    async get(key) { return { [key]: data[key] }; },
    async set(values) { Object.assign(data, structuredClone(values)); },
  };
}

function harness() {
  const store = new PolicyStore({ localArea: memoryStorage(), sessionArea: memoryStorage() });
  const recompiles = [];
  const engine = {
    compiler: {
      compilePolicies(policies, { temporary }) {
        assert.equal(policies.every((policy) => policy.temporary === temporary), true);
        return [];
      },
    },
    async recompile(options) { recompiles.push(options.temporary); },
  };
  return { store, workflow: new PolicyWorkflow({ store, engine }), recompiles };
}

test("commit promotes only the current tab and scope", async () => {
  const { store, workflow, recompiles } = harness();
  await store.putPolicy(createPolicy({ scope: "example.com", target: "cdn.test", resourceType: "script", action: "block", temporary: true, tabId: 4 }));
  await store.putPolicy(createPolicy({ scope: "other.test", target: "cdn.test", resourceType: "image", action: "allow", temporary: true, tabId: 4 }));

  const result = await workflow.commit({ tabId: 4, scope: "example.com" });
  const persistent = await store.getPersistentPolicies();
  const temporary = await store.getTemporaryPolicies();
  assert.equal(result.changed, 1);
  assert.equal(persistent.length, 1);
  assert.equal(persistent[0].temporary, false);
  assert.equal(persistent[0].action, "block");
  assert.equal(temporary.length, 1);
  assert.equal(temporary[0].scope, "other.test");
  assert.deepEqual(recompiles, [false, true]);
});

test("commit replaces a persistent policy at the same coordinates", async () => {
  const { store, workflow } = harness();
  await store.putPolicy(createPolicy({ scope: "example.com", target: "cdn.test", resourceType: "script", action: "allow" }));
  await store.putPolicy(createPolicy({ scope: "example.com", target: "cdn.test", resourceType: "script", action: "block", temporary: true, tabId: 4 }));
  await workflow.commit({ tabId: 4, scope: "example.com" });
  const persistent = await store.getPersistentPolicies();
  assert.equal(persistent.length, 1);
  assert.equal(persistent[0].action, "block");
});

test("revert removes only matching temporary policies", async () => {
  const { store, workflow, recompiles } = harness();
  await store.putPolicy(createPolicy({ scope: "example.com", target: "a.test", action: "block", temporary: true, tabId: 4 }));
  await store.putPolicy(createPolicy({ scope: "example.com", target: "b.test", action: "allow", temporary: true, tabId: 5 }));
  const result = await workflow.revert({ tabId: 4, scope: "example.com" });
  assert.equal(result.changed, 1);
  assert.equal((await store.getTemporaryPolicies())[0].tabId, 5);
  assert.deepEqual(recompiles, [true]);
});
