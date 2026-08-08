import test from "node:test";
import assert from "node:assert/strict";
import { ProfileStore } from "../src/storage/profile-store.js";

function memoryStorage(initial = {}) {
  const data = structuredClone(initial);
  return { async get(key) { return { [key]: data[key] }; }, async set(values) { Object.assign(data, structuredClone(values)); } };
}

test("defaults to balanced and persists validated profiles", async () => {
  const store = new ProfileStore({ localArea: memoryStorage() });
  assert.equal(await store.get(), "balanced");
  assert.equal(await store.set("strict"), "strict");
  assert.equal(await store.get(), "strict");
  await assert.rejects(() => store.set("custom"), /Unknown profile/);
});

test("rejects corrupted persisted profile state", async () => {
  const store = new ProfileStore({ localArea: memoryStorage({ protectionProfile: "unknown" }) });
  await assert.rejects(() => store.get(), /Unknown profile/);
});
