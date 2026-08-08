import test from "node:test";
import assert from "node:assert/strict";
import { PolicyStore } from "../src/storage/policy-store.js";
import { createPolicy } from "../src/shared/models.js";

function memoryStorage() {
  const data = {};
  return {
    async get(key) { return { [key]: data[key] }; },
    async set(values) { Object.assign(data, structuredClone(values)); },
  };
}

test("separates persistent and temporary policies", async () => {
  const store = new PolicyStore({ localArea: memoryStorage(), sessionArea: memoryStorage() });
  await store.putPolicy(createPolicy({ scope: "example.com", action: "block" }));
  await store.putPolicy(createPolicy({ scope: "example.com", action: "allow", temporary: true, tabId: 12 }));
  assert.equal((await store.getPersistentPolicies()).length, 1);
  assert.equal((await store.getTemporaryPolicies()).length, 1);
  assert.equal((await store.getAllPolicies()).length, 2);
});

test("inherit removes the explicit policy at the same identity", async () => {
  const store = new PolicyStore({ localArea: memoryStorage(), sessionArea: memoryStorage() });
  await store.putPolicy(createPolicy({ scope: "example.com", resourceType: "script", action: "block" }));
  await store.putPolicy(createPolicy({ scope: "example.com", resourceType: "script", action: "inherit" }));
  assert.deepEqual(await store.getPersistentPolicies(), []);
});

test("bulk replacement validates policy lifetime", async () => {
  const store = new PolicyStore({ localArea: memoryStorage(), sessionArea: memoryStorage() });
  const temporary = createPolicy({ action: "block", temporary: true, tabId: 1 });
  await assert.rejects(() => store.replacePolicies([temporary], { temporary: false }), /invalid persistent policy/);
});

test("temporary inherit markers preview deletion of a persistent policy", async () => {
  const store = new PolicyStore({ localArea: memoryStorage(), sessionArea: memoryStorage() });
  const persistent = createPolicy({ scope: "example.com", target: "cdn.test", resourceType: "script", action: "block" });
  await store.putPolicy(persistent);
  await store.putPolicy(createPolicy({ scope: "example.com", target: "cdn.test", resourceType: "script", action: "inherit", temporary: true, tabId: 3 }));
  assert.equal((await store.getTemporaryPolicies())[0].action, "inherit");
  assert.equal((await store.getAllPolicies()).length, 2);
});
