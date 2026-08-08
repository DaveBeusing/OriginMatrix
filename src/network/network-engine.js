import { DynamicRuleManager } from "./dynamic-rule-manager.js";
import { RuleBudget } from "./rule-budget.js";
import { DYNAMIC_RULE_RANGES } from "./rule-ranges.js";
import { SessionRuleManager } from "./session-rule-manager.js";
import { StaticRuleManager } from "./static-rule-manager.js";

export class NetworkEngine {
  constructor({ api = chrome.declarativeNetRequest, budget = new RuleBudget() } = {}) {
    this.api = api;
    this.budget = budget;
    this.dynamic = new DynamicRuleManager({ api, budget });
    this.session = new SessionRuleManager({ api, budget });
    this.static = new StaticRuleManager({ api, budget });
  }

  replaceRules({ temporary, rules }) {
    return temporary ? this.session.replace(rules) : this.dynamic.replaceInRange(rules, DYNAMIC_RULE_RANGES.matrix);
  }

  replaceFilterRules(rules) {
    return this.dynamic.replaceInRange(rules, DYNAMIC_RULE_RANGES.filters);
  }

  getDynamicRules() { return this.dynamic.getRules(); }
  getSessionRules() { return this.session.getRules(); }

  async getProtectionStatus(rulesetId = "base-network") {
    const enabledRulesets = await this.static.getEnabledRulesets();
    return { enabled: enabledRulesets.includes(rulesetId), rulesetId };
  }

  async getDiagnostics() {
    const [dynamicRules, sessionRules, enabledStaticRulesets, availableStaticRules] = await Promise.all([
      this.dynamic.getRules(),
      this.session.getRules(),
      this.static.getEnabledRulesets(),
      this.static.getAvailableRuleCount(),
    ]);
    return {
      dynamicRules,
      sessionRules,
      enabledStaticRulesets,
      availableStaticRules,
      budget: this.budget.account({ dynamic: dynamicRules.length, session: sessionRules.length }),
    };
  }
}
