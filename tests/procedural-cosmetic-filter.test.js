import test from "node:test";
import assert from "node:assert/strict";

await import("../src/cosmetic/procedural-cosmetic-filter.js");
const ProceduralCosmeticFilter = globalThis.OriginMatrixProceduralCosmeticFilter;

test("hides literal and nested has-text matches in a bounded batch", () => {
  const callbacks = [];
  const sponsored = element("Sponsored offer");
  const organic = element("Article");
  const label = element("AD");
  const nested = element("Product", { ".label": [label] });
  const root = element("", { ".card": [sponsored, organic, nested] });
  const documentObject = { documentElement: root };
  const filter = new ProceduralCosmeticFilter({
    documentObject,
    Observer: class { observe() {} disconnect() {} },
    schedule(callback) { callbacks.push(callback); return callbacks.length; },
  });
  filter.start([
    { targetSelector: ".card", descendantSelector: null, matcher: { type: "text", value: "Sponsored" } },
    { targetSelector: ".card", descendantSelector: ".label", matcher: { type: "regexp", value: "^AD$", flags: "" } },
  ]);
  callbacks[0]();
  assert.equal(sponsored.hidden, true);
  assert.equal(organic.hidden, false);
  assert.equal(nested.hidden, true);
  assert.deepEqual(filter.getMetrics(), { rules: 2, rejectedRules: 0, mutations: 0, batches: 1, nodesEvaluated: 6, elementsHidden: 2 });
});

test("caps each procedural evaluation batch at 2000 candidate nodes", () => {
  const callbacks = [];
  const candidates = Array.from({ length: 2_100 }, () => element("Sponsored"));
  const root = element("", { ".card": candidates });
  const filter = new ProceduralCosmeticFilter({
    documentObject: { documentElement: root }, Observer: class { observe() {} disconnect() {} },
    schedule(callback) { callbacks.push(callback); return callbacks.length; },
  });
  filter.start([{ targetSelector: ".card", descendantSelector: null, matcher: { type: "text", value: "Sponsored" } }]);
  callbacks[0]();
  assert.equal(filter.getMetrics().nodesEvaluated, 2_000);
  assert.equal(filter.getMetrics().elementsHidden, 2_000);
});

function element(textContent, selectors = {}) {
  const attributes = new Set();
  return {
    nodeType: 1, textContent, hidden: false,
    matches: () => false,
    querySelectorAll: (selector) => selectors[selector] ?? [],
    hasAttribute: (name) => attributes.has(name),
    setAttribute(name) { attributes.add(name); this.hidden = true; },
  };
}
