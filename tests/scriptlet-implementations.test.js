import test from "node:test";
import assert from "node:assert/strict";
import { abortOnPropertyWrite, jsonPrune, removeAttribute, setConstant, setLocalStorageItem } from "../src/scriptlets/scriptlet-implementations.js";

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

test("abortOnPropertyWrite rejects unsafe paths and blocks assignment", () => {
  globalThis.originMatrixWriteFixture = { value: 1 };
  try {
    assert.equal(abortOnPropertyWrite("originMatrixWriteFixture.value"), true);
    assert.equal(globalThis.originMatrixWriteFixture.value, 1);
    assert.throws(() => { globalThis.originMatrixWriteFixture.value = 2; }, /aborted write/);
    assert.equal(abortOnPropertyWrite("originMatrixWriteFixture.__proto__.x"), false);
  } finally { delete globalThis.originMatrixWriteFixture; }
});

test("jsonPrune installs a scoped JSON.parse hook for validated paths", () => {
  const original = JSON.parse;
  try {
    assert.equal(jsonPrune("player.ads player.slots", "player"), true);
    assert.deepEqual(JSON.parse('{"player":{"ads":[1],"slots":[2],"title":"ok"}}'), { player: { title: "ok" } });
    assert.equal(jsonPrune("__proto__.polluted"), false);
  } finally { JSON.parse = original; }
});

test("jsonPrune traverses arrays and removes matching array entries", () => {
  const original = JSON.parse;
  try {
    assert.equal(jsonPrune("items.[].ad entries.[-].command.adClientParams.isAd"), true);
    assert.deepEqual(JSON.parse('{"items":[{"ad":true,"title":"keep"},{"title":"plain"}],"entries":[{"command":{"adClientParams":{"isAd":true}}},{"command":{"videoId":"ok"}}]}'), {
      items: [{ title: "keep" }, { title: "plain" }], entries: [{ command: { videoId: "ok" } }],
    });
    assert.equal(jsonPrune("entries.[-].__proto__.polluted"), false);
  } finally { JSON.parse = original; }
});

test("removeAttribute alters only matching elements", () => {
  const calls = [];
  const element = { removeAttribute(value) { calls.push(["attribute", value]); } };
  const previousDocument = globalThis.document;
  globalThis.document = { querySelectorAll: () => [element], documentElement: null };
  try {
    assert.equal(removeAttribute("data-ad", "[data-ad]"), true);
    assert.deepEqual(calls, [["attribute", "data-ad"]]);
    assert.equal(removeAttribute("onclick]", "*"), false);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
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
