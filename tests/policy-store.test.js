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
