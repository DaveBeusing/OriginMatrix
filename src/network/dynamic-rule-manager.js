export class DynamicRuleManager {
  constructor({ api, budget }) {
    this.api = api;
    this.budget = budget;
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
    await this.api.updateDynamicRules({ removeRuleIds: existing.map((rule) => rule.id), addRules: rules });
  }
}

function validateRules(rules) {
  if (!Array.isArray(rules)) throw new TypeError("Rules must be an array.");
  validateRuleIds(rules.map((rule) => rule?.id));
}

function validateRuleIds(ids) {
  if (!Array.isArray(ids) || ids.some((id) => !Number.isInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
    throw new TypeError("Rule IDs must be unique positive integers.");
  }
}
