export class ChromeDnrAdapter {
  async replaceRules({ temporary, rules }) {
    const api = chrome.declarativeNetRequest;
    const existing = temporary ? await api.getSessionRules() : await api.getDynamicRules();
    const options = { removeRuleIds: existing.map((rule) => rule.id), addRules: rules };
    if (temporary) await api.updateSessionRules(options);
    else await api.updateDynamicRules(options);
  }
}
