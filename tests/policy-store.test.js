import test from "node:test";
import assert from "node:assert/strict";
import { PolicyStore } from "../src/storage/policy-store.js";

function memoryStorage() {
  const data = {};
  return {
    async get(key) { return { [key]: data[key] }; },
    async set(values) { Object.assign(data, values); },
  };
}

test("stores and removes temporary policies by tab", async () => {
  const store = new PolicyStore(memoryStorage());
  const policy = { id: "p1", tabId: 12 };
  await store.setTemporaryPolicy(policy);
  assert.deepEqual(await store.getTemporaryPolicy(12), policy);
  await store.removeTemporaryPolicy(12);
  assert.equal(await store.getTemporaryPolicy(12), null);
});
