export class SessionRuleManager {
  constructor({ api, budget }) {
    this.api = api;
    this.budget = budget;
  }

  getRules() { return this.api.getSessionRules(); }

  async install(rules) {
    validateRules(rules);
    const existing = await this.getRules();
    const incomingIds = new Set(rules.map((rule) => rule.id));
    const retained = existing.filter((rule) => !incomingIds.has(rule.id));
    this.budget.assertWithin("session", retained.length + rules.length);
    await this.api.updateSessionRules({ removeRuleIds: [...incomingIds], addRules: rules });
  }

  async remove(ruleIds) {
    validateRuleIds(ruleIds);
    if (ruleIds.length > 0) await this.api.updateSessionRules({ removeRuleIds: ruleIds });
  }

  async replace(rules) {
    validateRules(rules);
    this.budget.assertWithin("session", rules.length);
    const existing = await this.getRules();
    await this.api.updateSessionRules({ removeRuleIds: existing.map((rule) => rule.id), addRules: rules });
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
