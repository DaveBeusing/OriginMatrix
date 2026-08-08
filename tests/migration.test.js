import test from "node:test";
import assert from "node:assert/strict";
import { createEmptyPolicyDocument, migratePolicyDocument } from "../src/storage/migration.js";

test("creates a versioned empty document", () => {
  assert.deepEqual(createEmptyPolicyDocument(), { schemaVersion: 1, policies: [], ruleIds: {} });
});

test("rejects unknown future schemas", () => {
  assert.throws(() => migratePolicyDocument({ schemaVersion: 2, policies: [] }), /Unsupported policy schema/);
});

test("normalizes legacy single rule IDs to arrays", () => {
  const document = migratePolicyDocument({ schemaVersion: 1, policies: [], ruleIds: { policy: 123 } });
  assert.deepEqual(document.ruleIds, { policy: [123] });
});
