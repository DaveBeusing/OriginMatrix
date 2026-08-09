import test from "node:test";
import assert from "node:assert/strict";

await import("../src/cosmetic/cosmetic-injector.js");
const CosmeticInjector = globalThis.OriginMatrixCosmeticInjector;

test("injects global and site selectors through one reusable native CSS batch", () => {
  const appended = [];
  const documentObject = {
    head: { append: (element) => appended.push(element) },
    documentElement: null,
    createElement: () => ({ id: "", textContent: "", dataset: {} }),
  };
  const injector = new CosmeticInjector(documentObject);
  injector.apply([".global-ad", "#site-sponsor"]);
  assert.equal(appended.length, 1);
  assert.match(appended[0].textContent, /\.global-ad \{ display: none !important; \}/);
  assert.equal(appended[0].dataset.rules, "2");
  injector.apply([".replacement"]);
  assert.equal(appended.length, 1);
  assert.doesNotMatch(appended[0].textContent, /global-ad/);
});
