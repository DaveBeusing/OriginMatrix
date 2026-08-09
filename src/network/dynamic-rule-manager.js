export class DynamicRuleManager {
  constructor({ api, budget }) {
    this.api = api;
    this.budget = budget;
    this.lastDiff = emptyDiff();
    this.updateCalls = 0;
    this.skippedUpdates = 0;
  }

  getRules() { return this.api.getDynamicRules(); }

  async install(rules) {
    validateRules(rules);
    const existing = await this.getRules();
    const incomingIds = new Set(rules.map((rule) => rule.id));
    const retained = existing.filter((rule) => !incomingIds.has(rule.id));
    this.budget.assertWithin("dynamic", retained.length + rules.length);
    await this.api.updateDynamicRules({ removeRuleIds: [...incomingIds], addRules: rules });
  }

  async remove(ruleIds) {
    validateRuleIds(ruleIds);
    if (ruleIds.length > 0) await this.api.updateDynamicRules({ removeRuleIds: ruleIds });
  }

  async replace(rules) {
    validateRules(rules);
    this.budget.assertWithin("dynamic", rules.length);
    const existing = await this.getRules();
    return this.#applyDiff(existing, rules);
  }

  async replaceInRange(rules, range) {
    validateRules(rules);
    validateRange(range);
    if (rules.some(({ id }) => id < range.minimum || id > range.maximum)) {
      throw new RangeError(`Rule ID is outside managed range ${range.minimum}-${range.maximum}.`);
    }
    const existing = await this.getRules();
    const managed = existing.filter(({ id }) => id >= range.minimum && id <= range.maximum);
    this.budget.assertWithin("dynamic", existing.length - managed.length + rules.length);
    return this.#applyDiff(managed, rules);
  }

  getDiagnostics() { return Object.freeze({ ...this.lastDiff, updateCalls: this.updateCalls, skippedUpdates: this.skippedUpdates }); }

  async #applyDiff(previous, next) {
    const diff = diffRules(previous, next);
    this.lastDiff = diff.metrics;
    if (diff.removeRuleIds.length === 0 && diff.addRules.length === 0) { this.skippedUpdates += 1; return diff.metrics; }
    await this.api.updateDynamicRules({ removeRuleIds: diff.removeRuleIds, addRules: diff.addRules });
    this.updateCalls += 1;
    return diff.metrics;
  }
}

export function diffRules(previous, next) {
  validateRules(previous);
  validateRules(next);
  const current = new Map(previous.map((rule) => [rule.id, { rule, signature: stableStringify(rule) }]));
  const incoming = new Map(next.map((rule) => [rule.id, { rule, signature: stableStringify(rule) }]));
  const removeRuleIds = [];
  const addRules = [];
  let rulesRemoved = 0;
  let rulesChanged = 0;
  let rulesUnchanged = 0;
  for (const rule of previous) {
    const replacement = incoming.get(rule.id);
    if (!replacement) { removeRuleIds.push(rule.id); rulesRemoved += 1; }
    else if (current.get(rule.id).signature === replacement.signature) rulesUnchanged += 1;
    else { removeRuleIds.push(rule.id); rulesChanged += 1; }
  }
  let rulesAdded = 0;
  for (const rule of next) {
    const existing = current.get(rule.id);
    if (!existing) { addRules.push(rule); rulesAdded += 1; }
    else if (existing.signature !== incoming.get(rule.id).signature) addRules.push(rule);
  }
  removeRuleIds.sort((left, right) => left - right);
  const metrics = Object.freeze({ rulesPrevious: previous.length, rulesNext: next.length, rulesAdded, rulesRemoved, rulesChanged, rulesUnchanged });
  return Object.freeze({ removeRuleIds: Object.freeze(removeRuleIds), addRules: Object.freeze(addRules), metrics });
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function emptyDiff() { return Object.freeze({ rulesPrevious: 0, rulesNext: 0, rulesAdded: 0, rulesRemoved: 0, rulesChanged: 0, rulesUnchanged: 0 }); }

function validateRules(rules) {
  if (!Array.isArray(rules)) throw new TypeError("Rules must be an array.");
  validateRuleIds(rules.map((rule) => rule?.id));
}

function validateRuleIds(ids) {
  if (!Array.isArray(ids) || ids.some((id) => !Number.isInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
    throw new TypeError("Rule IDs must be unique positive integers.");
  }
}

function validateRange(range) {
  if (!range || !Number.isInteger(range.minimum) || !Number.isInteger(range.maximum) || range.minimum <= 0 || range.maximum < range.minimum) {
    throw new TypeError("Rule range must contain positive integer minimum and maximum values.");
  }
}
