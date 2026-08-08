import test from "node:test";
import assert from "node:assert/strict";
import { exportPolicies, importPolicies } from "../src/storage/policy-transfer.js";
import { createPolicy } from "../src/shared/models.js";

test("round-trips persistent policies through the versioned format", () => {
  const policies = [createPolicy({ scope: "example.com", resourceType: "script", action: "block" })];
  const document = exportPolicies(policies, "2026-01-01T00:00:00.000Z");
  assert.equal(document.format, "originmatrix");
  assert.deepEqual(importPolicies(JSON.stringify(document)), policies);
});

test("rejects text and temporary policy imports", () => {
  assert.throws(() => importPolicies("example.com * script block"), /uMatrix text rules are not yet supported/);
  const temporary = createPolicy({ action: "block", temporary: true, tabId: 1 });
  assert.throws(() => importPolicies(exportPolicies([temporary])), /persistent allow\/block/);
});
