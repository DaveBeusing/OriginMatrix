const TAB_STATE_KEY = "tabStateDocument";
const TAB_STATE_SCHEMA_VERSION = 1;
const MAX_LOG_ENTRIES = 250;

export class TabStateManager {
  constructor(storageArea = chrome.storage.session) {
    this.storageArea = storageArea;
    this.queue = Promise.resolve();
  }

  async get(tabId) {
    await this.queue;
    const document = await this.#read();
    return document.tabs[String(tabId)] ?? null;
  }

  startNavigation({ tabId, url, timestamp = Date.now() }) {
    return this.#mutate((document) => {
      const topDomain = hostnameFromUrl(url);
      document.tabs[String(tabId)] = createTabState(tabId, url, topDomain, timestamp);
    });
  }

  recordRequest({ tabId, requestId, url, type, topUrl, timestamp = Date.now() }) {
    return this.#mutate((document) => {
      const key = String(tabId);
      const targetDomain = hostnameFromUrl(url);
      const resourceType = normalizeResourceType(type);
      let state = document.tabs[key];
      if (!state) {
        if (!topUrl) return;
        state = createTabState(tabId, topUrl, hostnameFromUrl(topUrl), timestamp);
        document.tabs[key] = state;
      }
      const domain = state.domains[targetDomain] ?? createDomainState();
      domain.total += 1;
      domain.types[resourceType] = (domain.types[resourceType] ?? 0) + 1;
      state.domains[targetDomain] = domain;
      state.totalRequests += 1;
      state.requestLog.push({
        id: requestId ?? `${timestamp}:${state.totalRequests}`,
        timestamp,
        domain: targetDomain,
        resourceType,
        url,
        outcome: "pending",
        sourceSite: state.topDomain,
        decision: "unknown",
        engine: null,
        reason: "No attributable OriginMatrix DNR match.",
        ruleId: null,
        rulesetId: null,
      });
      if (state.requestLog.length > MAX_LOG_ENTRIES) state.requestLog.splice(0, state.requestLog.length - MAX_LOG_ENTRIES);
      state.updatedAt = timestamp;
    });
  }

  recordOutcome({ tabId, requestId, url, outcome, timestamp = Date.now() }) {
    if (outcome !== "completed" && outcome !== "failed") throw new TypeError(`Unsupported request outcome: ${outcome}`);
    return this.#mutate((document) => {
      const state = document.tabs[String(tabId)];
      if (!state) return;
      const targetDomain = hostnameFromUrl(url);
      const domain = state.domains[targetDomain];
      if (!domain) return;
      domain[outcome] += 1;
      state[`${outcome}Requests`] += 1;
      const entry = [...state.requestLog].reverse().find((item) => item.id === requestId);
      if (entry) entry.outcome = outcome;
      state.updatedAt = timestamp;
    });
  }

  recordRuleMatch({ tabId, requestId, ruleId, rulesetId, decision, engine, source }) {
    if (!["allowed", "blocked", "modified", "unknown"].includes(decision)) throw new TypeError(`Unsupported request decision: ${decision}`);
    return this.#mutate((document) => {
      const state = document.tabs[String(tabId)];
      const entry = state && [...state.requestLog].reverse().find((item) => item.id === requestId);
      if (!entry) return false;
      const rank = { unknown: 0, modified: 1, allowed: 2, blocked: 3 };
      if (rank[decision] < rank[entry.decision ?? "unknown"]) return true;
      entry.decision = decision;
      entry.engine = engine;
      entry.reason = `${source} matched ${rulesetId}:${ruleId}.`;
      entry.ruleId = ruleId;
      entry.rulesetId = rulesetId;
      return true;
    });
  }

  remove(tabId) {
    return this.#mutate((document) => { delete document.tabs[String(tabId)]; });
  }

  setReloadRequired({ tabId, required, topUrl }) {
    return this.#mutate((document) => {
      const key = String(tabId);
      let state = document.tabs[key];
      if (!state && topUrl) {
        state = createTabState(tabId, topUrl, hostnameFromUrl(topUrl), Date.now());
        document.tabs[key] = state;
      }
      if (state) state.reloadRequired = Boolean(required);
    });
  }

  async getDiagnostics() {
    await this.queue;
    const document = await this.#read();
    const tabs = Object.values(document.tabs);
    return {
      trackedTabs: tabs.length,
      observedDomains: tabs.reduce((sum, tab) => sum + Object.keys(tab.domains).length, 0),
      observedRequests: tabs.reduce((sum, tab) => sum + tab.totalRequests, 0),
      retainedLogEntries: tabs.reduce((sum, tab) => sum + tab.requestLog.length, 0),
    };
  }

  #mutate(change) {
    const operation = this.queue.then(async () => {
      const document = await this.#read();
      const result = change(document);
      await this.storageArea.set({ [TAB_STATE_KEY]: document });
      return result;
    });
    this.queue = operation.catch(() => {});
    return operation;
  }

  async #read() {
    const result = await this.storageArea.get(TAB_STATE_KEY);
    const value = result[TAB_STATE_KEY];
    if (value === undefined) return { schemaVersion: TAB_STATE_SCHEMA_VERSION, tabs: {} };
    if (!value || value.schemaVersion !== TAB_STATE_SCHEMA_VERSION || !value.tabs || typeof value.tabs !== "object") {
      throw new TypeError("Unsupported or invalid tab-state document.");
    }
    const document = structuredClone(value);
    for (const state of Object.values(document.tabs)) {
      if (!Array.isArray(state.requestLog)) state.requestLog = [];
      for (const entry of state.requestLog) {
        if (typeof entry.sourceSite !== "string") entry.sourceSite = state.topDomain;
        if (typeof entry.decision !== "string") entry.decision = "unknown";
        if (!("engine" in entry)) entry.engine = null;
        if (typeof entry.reason !== "string") entry.reason = "No attributable OriginMatrix DNR match.";
        if (!("ruleId" in entry)) entry.ruleId = null;
        if (!("rulesetId" in entry)) entry.rulesetId = null;
      }
      if (typeof state.reloadRequired !== "boolean") state.reloadRequired = false;
    }
    return document;
  }
}

export function normalizeResourceType(type) {
  const supported = new Set(["stylesheet", "image", "media", "script", "xmlhttprequest", "sub_frame", "font", "websocket", "ping"]);
  return supported.has(type) ? type : "other";
}

function createTabState(tabId, topUrl, topDomain, timestamp) {
  return {
    tabId,
    topUrl,
    topDomain,
    totalRequests: 0,
    completedRequests: 0,
    failedRequests: 0,
    reloadRequired: false,
    requestLog: [],
    domains: {},
    startedAt: timestamp,
    updatedAt: timestamp,
  };
}

function createDomainState() {
  return { total: 0, completed: 0, failed: 0, types: {} };
}

function hostnameFromUrl(value) {
  const hostname = new URL(value).hostname.toLowerCase();
  if (!hostname) throw new TypeError(`URL has no observable hostname: ${value}`);
  return hostname;
}
