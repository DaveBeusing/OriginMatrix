const TAB_STATE_KEY = "tabStateDocument";
const TAB_STATE_SCHEMA_VERSION = 1;

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

  recordRequest({ tabId, url, type, topUrl, timestamp = Date.now() }) {
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
      state.updatedAt = timestamp;
    });
  }

  recordOutcome({ tabId, url, outcome, timestamp = Date.now() }) {
    if (outcome !== "completed" && outcome !== "failed") throw new TypeError(`Unsupported request outcome: ${outcome}`);
    return this.#mutate((document) => {
      const state = document.tabs[String(tabId)];
      if (!state) return;
      const targetDomain = hostnameFromUrl(url);
      const domain = state.domains[targetDomain];
      if (!domain) return;
      domain[outcome] += 1;
      state[`${outcome}Requests`] += 1;
      state.updatedAt = timestamp;
    });
  }

  remove(tabId) {
    return this.#mutate((document) => { delete document.tabs[String(tabId)]; });
  }

  #mutate(change) {
    const operation = this.queue.then(async () => {
      const document = await this.#read();
      change(document);
      await this.storageArea.set({ [TAB_STATE_KEY]: document });
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
    return structuredClone(value);
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
