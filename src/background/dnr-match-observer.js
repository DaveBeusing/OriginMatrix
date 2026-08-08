export class DnrMatchObserver {
  constructor({ tabStateManager, registry }) {
    this.tabStateManager = tabStateManager;
    this.registry = registry;
    this.available = false;
  }

  start(api = globalThis.chrome?.declarativeNetRequest) {
    const event = api?.onRuleMatchedDebug;
    if (!event || typeof event.addListener !== "function") return false;
    event.addListener((info) => this.#record(info));
    this.available = true;
    return true;
  }

  async #record(info, attempt = 0) {
    const request = info?.request;
    const rule = info?.rule;
    if (!Number.isInteger(request?.tabId) || request.tabId < 0 || typeof request.requestId !== "string" || !Number.isInteger(rule?.ruleId)) return;
    try {
      const attribution = this.registry.resolve({ rulesetId: rule.rulesetId, ruleId: rule.ruleId });
      const matched = await this.tabStateManager.recordRuleMatch({
        tabId: request.tabId,
        requestId: request.requestId,
        ruleId: rule.ruleId,
        rulesetId: rule.rulesetId,
        ...attribution,
      });
      if (!matched && attempt < 2) setTimeout(() => this.#record(info, attempt + 1), 25 * (attempt + 1));
    } catch (error) {
      console.error("Could not record DNR rule match", error);
    }
  }
}
