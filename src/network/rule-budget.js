export const DEFAULT_RULE_LIMITS = Object.freeze({
  static: 30_000,
  dynamic: 30_000,
  session: 5_000,
});

export class RuleBudget {
  constructor(limits = DEFAULT_RULE_LIMITS) {
    this.limits = Object.freeze({ ...DEFAULT_RULE_LIMITS, ...limits });
  }

  assertWithin(kind, count) {
    const limit = this.#limit(kind);
    if (!Number.isInteger(count) || count < 0) throw new TypeError(`Rule count for ${kind} must be a non-negative integer.`);
    if (count > limit) throw new RangeError(`${kind} rule budget exceeded: ${count}/${limit}.`);
  }

  account(counts = {}) {
    return Object.fromEntries(Object.keys(this.limits).map((kind) => {
      const used = counts[kind] ?? 0;
      this.assertWithin(kind, used);
      return [kind, { used, limit: this.limits[kind], available: this.limits[kind] - used }];
    }));
  }

  #limit(kind) {
    const limit = this.limits[kind];
    if (!Number.isInteger(limit) || limit < 0) throw new TypeError(`Unknown rule budget: ${kind}.`);
    return limit;
  }
}
