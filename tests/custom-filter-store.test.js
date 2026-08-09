import test from "node:test";
import assert from "node:assert/strict";
import { CustomFilterStore } from "../src/storage/custom-filter-store.js";

function memoryStorage(initial) { const data = initial ? { customFilterDocument: initial } : {}; return { async get(key) { return { [key]: data[key] }; }, async set(values) { Object.assign(data, structuredClone(values)); } }; }

test("stores a versioned validated My Filters document", async () => {
  const store = new CustomFilterStore(memoryStorage());
  assert.equal((await store.get()).source, "");
  await store.set("||ads.example^\nexample.com##.sponsor");
  assert.equal((await store.get()).source, "||ads.example^\nexample.com##.sponsor");
});

test("rejects unsupported editor input and corrupted persisted rules", async () => {
  const store = new CustomFilterStore(memoryStorage());
  await assert.rejects(store.set("/^unsafe-regexp$/"), /unsupported/);
  const corrupted = new CustomFilterStore(memoryStorage({ schemaVersion: 1, source: "/^unsafe-regexp$/" }));
  await assert.rejects(corrupted.get(), /unsupported/);
});
