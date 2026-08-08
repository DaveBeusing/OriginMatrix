import test from "node:test";
import assert from "node:assert/strict";
import { FilterListGenerationStore } from "../src/storage/filter-list-generation-store.js";

function memoryStorage(initial = {}) {
  const data = structuredClone(initial);
  return { async get(key) { return { [key]: data[key] }; }, async set(values) { Object.assign(data, structuredClone(values)); } };
}

const valid = { source: "[Adblock Plus 2.0]\n! Version: 1\n||ads.example^", version: "1", lastUpdated: "2026-08-08T12:00:00.000Z", checksum: "a".repeat(64) };

test("persists validated filter list generations", async () => {
  const store = new FilterListGenerationStore({ listIds: ["easylist"], localArea: memoryStorage() });
  assert.equal(await store.get("easylist"), null);
  await store.set("easylist", valid);
  assert.deepEqual(await store.get("easylist"), valid);
  await assert.rejects(() => store.set("unknown", valid), /Unknown filter list/);
});

test("rejects malformed generation metadata", async () => {
  const store = new FilterListGenerationStore({ listIds: ["easylist"], localArea: memoryStorage() });
  await assert.rejects(() => store.set("easylist", { ...valid, checksum: "bad" }), /Invalid stored/);
  await assert.rejects(() => store.set("easylist", { ...valid, lastUpdated: "never" }), /Invalid stored/);
});
