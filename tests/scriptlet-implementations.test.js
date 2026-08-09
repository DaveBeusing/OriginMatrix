import test from "node:test";
import assert from "node:assert/strict";
import { setConstant, setLocalStorageItem } from "../src/scriptlets/scriptlet-implementations.js";

test("setConstant exposes only bounded inert values", () => {
  globalThis.originMatrixScriptletFixture = {};
  try {
    assert.equal(setConstant("originMatrixScriptletFixture.noop", "noopFunc"), true);
    assert.equal(typeof globalThis.originMatrixScriptletFixture.noop, "function");
    assert.equal(globalThis.originMatrixScriptletFixture.noop(), undefined);
    assert.equal(setConstant("originMatrixScriptletFixture.object", "{}"), true);
    assert.deepEqual(globalThis.originMatrixScriptletFixture.object, {});
    assert.equal(Object.isFrozen(globalThis.originMatrixScriptletFixture.object), true);
    assert.equal(setConstant("originMatrixScriptletFixture.value", "alert(1)"), false);
    assert.equal(setConstant("originMatrixScriptletFixture.__proto__.value", "true"), false);
  } finally { delete globalThis.originMatrixScriptletFixture; }
});

test("setLocalStorageItem permits bounded constants and removal only", () => {
  const values = new Map([["remove-me", "value"]]);
  const previous = globalThis.localStorage;
  globalThis.localStorage = { setItem(key, value) { values.set(key, value); }, removeItem(key) { values.delete(key); } };
  try {
    assert.equal(setLocalStorageItem("enabled", "true"), true);
    assert.equal(values.get("enabled"), "true");
    assert.equal(setLocalStorageItem("remove-me", "$remove$"), true);
    assert.equal(values.has("remove-me"), false);
    assert.equal(setLocalStorageItem("unsafe", "javascript:alert(1)"), false);
    assert.equal(setLocalStorageItem("x".repeat(129), "true"), false);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});
