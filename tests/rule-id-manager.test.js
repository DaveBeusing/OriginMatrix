import test from "node:test";
import assert from "node:assert/strict";
import { RuleIdManager } from "../src/engine/rule-id-manager.js";
import { createPolicy } from "../src/shared/models.js";

test("assigns deterministic IDs independent of input order", () => {
  const a = createPolicy({ target: "a.example", action: "block" });
  const b = createPolicy({ target: "b.example", action: "allow" });
  const manager = new RuleIdManager();
  const forward = manager.assign([a, b]);
  const reverse = manager.assign([b, a]);
  assert.equal(forward.get(a.id), reverse.get(a.id));
  assert.equal(forward.get(b.id), reverse.get(b.id));
  assert.notEqual(forward.get(a.id), forward.get(b.id));
});
