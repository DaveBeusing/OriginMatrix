import test from "node:test";
import assert from "node:assert/strict";
import { FILTER_COMPILER_SCHEMA_VERSION, PreparedGenerationCacheStore, PREPARED_CACHE_MAX_BYTES, createPreparedCacheIdentity } from "../src/storage/prepared-generation-cache-store.js";

function memoryStorage(initial) { const data = initial ? { preparedFilterGenerationCache: structuredClone(initial) } : {}; return { data, async get(key) { return { [key]: structuredClone(data[key]) }; }, async set(values) { Object.assign(data, structuredClone(values)); } }; }
const identity = createPreparedCacheIdentity({ sourceChecksum: "a".repeat(64), featureKey: '{"network":true}', reservedDynamicRules: 2 });
const compilation = { rules: [{ id: 500_001, priority: 1, action: { type: "block" }, condition: { urlFilter: "*ads*" } }], attributions: { 500001: [] }, diagnostics: { rulesCompiled: 1 } };

test("reports a cold miss and a warm cache hit", async () => {
  assert.equal(identity.compilerSchemaVersion, FILTER_COMPILER_SCHEMA_VERSION);
  const store = new PreparedGenerationCacheStore(memoryStorage());
  assert.equal((await store.get(identity)).state, "miss");
  const written = await store.set(identity, compilation);
  assert.equal(written.stored, true);
  assert.equal((await store.get(identity)).state, "hit");
});

test("invalidates changed source, feature, capacity, and compiler identities", async () => {
  const store = new PreparedGenerationCacheStore(memoryStorage());
  await store.set(identity, compilation);
  for (const changed of [
    { ...identity, sourceChecksum: "b".repeat(64) }, { ...identity, featureKey: "other" }, { ...identity, reservedDynamicRules: 3 }, { ...identity, compilerSchemaVersion: 999 },
  ]) assert.equal((await store.get(changed)).state, "miss");
});

test("rejects corrupted cache documents and skips oversized generations", async () => {
  const corrupted = new PreparedGenerationCacheStore(memoryStorage({ schemaVersion: 1, identity, compilation: { rules: "bad", attributions: {}, diagnostics: {} } }));
  assert.equal((await corrupted.get(identity)).state, "invalid");
  const store = new PreparedGenerationCacheStore(memoryStorage());
  const oversized = { ...compilation, attributions: { huge: "x".repeat(PREPARED_CACHE_MAX_BYTES) } };
  const result = await store.set(identity, oversized);
  assert.equal(result.stored, false);
  assert.equal(result.reason, "size-limit");
  assert.ok(result.size > PREPARED_CACHE_MAX_BYTES);
});

test("reports storage read failures as invalid", async () => {
  const store = new PreparedGenerationCacheStore({ async get() { throw new Error("storage unavailable"); } });
  assert.deepEqual(await store.get(identity), { state: "invalid", error: "storage unavailable", size: 0 });
});
