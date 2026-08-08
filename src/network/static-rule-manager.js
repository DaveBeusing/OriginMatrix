export class StaticRuleManager {
  constructor({ api, budget }) {
    this.api = api;
    this.budget = budget;
  }

  async getEnabledRulesets() {
    return typeof this.api.getEnabledRulesets === "function" ? this.api.getEnabledRulesets() : [];
  }

  async setEnabledRulesets(rulesetIds) {
    validateRulesetIds(rulesetIds);
    const current = await this.getEnabledRulesets();
    const desired = new Set(rulesetIds);
    await this.api.updateEnabledRulesets({
      disableRulesetIds: current.filter((id) => !desired.has(id)),
      enableRulesetIds: rulesetIds.filter((id) => !current.includes(id)),
    });
  }

  async getAvailableRuleCount() {
    if (typeof this.api.getAvailableStaticRuleCount === "function") return this.api.getAvailableStaticRuleCount();
    return this.budget.limits.static;
  }
}

function validateRulesetIds(ids) {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || id.length === 0) || new Set(ids).size !== ids.length) {
    throw new TypeError("Static ruleset IDs must be unique non-empty strings.");
  }
}
