import test from "node:test";
import assert from "node:assert/strict";
import { RuleBudget } from "../src/network/rule-budget.js";

test("accounts for static, dynamic, and session capacity", () => {
  const budget = new RuleBudget({ static: 100, dynamic: 20, session: 10 });
  assert.deepEqual(budget.account({ static: 25, dynamic: 7, session: 3 }), {
    static: { used: 25, limit: 100, available: 75 },
    dynamic: { used: 7, limit: 20, available: 13 },
    session: { used: 3, limit: 10, available: 7 },
  });
});

test("rejects rule generations over budget", () => {
  const budget = new RuleBudget({ dynamic: 1 });
  assert.throws(() => budget.assertWithin("dynamic", 2), /budget exceeded/);
  assert.throws(() => budget.assertWithin("unknown", 0), /Unknown rule budget/);
});
