import test from "node:test";
import assert from "node:assert/strict";
import {
  createCosmeticFilter, createExceptionFilter, createNetworkFilter, createScriptletFilter, validateFilter,
} from "../src/filters/filter-model.js";

test("normalizes a network filter without leaking DNR representation", () => {
  const filter = createNetworkFilter({
    pattern: "||ads.example^", domains: ["News.Example", "news.example"],
    excludedDomains: ["shop.example"], resourceTypes: ["script", "image"], thirdParty: true,
  });
  assert.deepEqual(filter, {
    type: "network", pattern: "||ads.example^", domains: ["news.example"],
    excludedDomains: ["shop.example"], resourceTypes: ["image", "script"], thirdParty: true, action: "block",
  });
  assert.equal("condition" in filter, false);
  assert.ok(Object.isFrozen(filter));
});

test("provides distinct exception, cosmetic, and scriptlet models", () => {
  assert.equal(createExceptionFilter({ pattern: "||cdn.example^" }).action, "allow");
  assert.deepEqual(createCosmeticFilter({ domains: ["example.com"], selector: ".advert" }), {
    type: "cosmetic", selector: ".advert", domains: ["example.com"], excludedDomains: [],
  });
  assert.equal(createCosmeticFilter({ domains: ["example.com"], selector: ".advert", exception: true }).exception, true);
  assert.deepEqual(createScriptletFilter({ domains: ["example.com"], name: "set-constant", args: ["foo", "true"] }), {
    type: "scriptlet", name: "set-constant", args: ["foo", "true"], domains: ["example.com"], excludedDomains: [],
  });
});

test("rejects invalid normalized filter data", () => {
  assert.throws(() => createNetworkFilter({ pattern: "x", thirdParty: "yes" }), /thirdParty/);
  assert.throws(() => createNetworkFilter({ pattern: "x", resourceTypes: ["document"] }), /resource type/);
  assert.throws(() => validateFilter({ type: "unknown" }), /Unsupported filter type/);
  assert.throws(() => createCosmeticFilter({ selector: ".ad", exception: "yes" }), /boolean/);
});
