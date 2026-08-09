import test from "node:test";
import assert from "node:assert/strict";
import { validateCustomFilters, CUSTOM_FILTER_SOURCE_LIMIT } from "../src/filters/custom-filter-validator.js";

test("accepts supported custom filter types", () => {
  const result = validateCustomFilters("||ads.example^\n@@||cdn.example^$domain=example.com\nexample.com##.ad\nexample.com#@#.content\nexample.com##+js(set-constant, adFlag, false)");
  assert.equal(result.valid, true);
  assert.equal(result.supported, 5);
});

test("returns line-aware errors without silently ignoring unsupported rules", () => {
  const result = validateCustomFilters("! comment\n/^unsafe$/\nexample.com##:upward(2)");
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors.map(({ line }) => line), [2, 3]);
  assert.throws(() => validateCustomFilters("x".repeat(CUSTOM_FILTER_SOURCE_LIMIT + 1)), /limit/);
});
