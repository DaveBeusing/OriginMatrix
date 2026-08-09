import test from "node:test";
import assert from "node:assert/strict";
import { FilterListSettingsStore } from "../src/storage/filter-list-settings-store.js";

function memoryStorage(initial = {}) {
  const data = structuredClone(initial);
  return { async get(key) { return { [key]: data[key] }; }, async set(values) { Object.assign(data, structuredClone(values)); } };
}

const lists = [{ id: "easylist", enabled: true }, { id: "easyprivacy", enabled: true }];

test("uses catalog defaults and persists enabled state", async () => {
  const store = new FilterListSettingsStore({ lists, localArea: memoryStorage() });
  assert.deepEqual(await store.getAll(), { easylist: { enabled: true }, easyprivacy: { enabled: true } });
  await store.setEnabled("easylist", false);
  assert.deepEqual(await store.getAll(), { easylist: { enabled: false }, easyprivacy: { enabled: true } });
  await assert.rejects(() => store.setEnabled("unknown", true), /Unknown filter list/);
});

test("rejects malformed or unknown persisted settings", async () => {
  const localArea = memoryStorage({ filterListSettings: { schemaVersion: 1, lists: { unknown: { enabled: true } } } });
  await assert.rejects(() => new FilterListSettingsStore({ lists, localArea }).getAll(), /Invalid filter list setting/);
});
