import test from "node:test";
import assert from "node:assert/strict";

await import(`../src/picker/selector-generator.js?test=${Date.now()}`);

test("prefers a unique ID for picked elements", () => {
  const element = { nodeType: 1, id: "featured-ad", localName: "div", getAttribute: () => null, classList: [], parentElement: null };
  const selector = globalThis.OriginMatrixSelectorGenerator.generate(element, { querySelectorAll: (value) => value === "#featured-ad" ? [element] : [] });
  assert.equal(selector, "#featured-ad");
});

test("uses stable data attributes before bounded structural fallback", () => {
  const element = { nodeType: 1, id: "", localName: "article", getAttribute: (name) => name === "data-testid" ? "promoted-item" : null, classList: [], parentElement: null };
  const selector = globalThis.OriginMatrixSelectorGenerator.generate(element, { querySelectorAll: (value) => value.includes("data-testid") ? [element] : [] });
  assert.equal(selector, 'article[data-testid="promoted-item"]');
});
