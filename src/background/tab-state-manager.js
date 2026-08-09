const TAB_STATE_KEY = "tabStateDocument";
const TAB_STATE_SCHEMA_VERSION = 1;
const MAX_LOG_ENTRIES = 250;
const MAX_DIAGNOSTIC_ENTRIES = 50;

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

  startNavigation({ tabId, url, timestamp = Date.now(), preserveDiagnostics = false }) {
    return this.#mutate((document) => {
      const topDomain = hostnameFromUrl(url);
      const previous = document.tabs[String(tabId)];
      const state = createTabState(tabId, url, topDomain, timestamp);
      if (preserveDiagnostics && previous) {
        state.breakageSignals = previous.breakageSignals ?? [];
        state.protectionActions = previous.protectionActions ?? [];
      }
      document.tabs[String(tabId)] = state;
    });
  }

  recordBreakageSignal({ tabId, frameId, type, details = "", timestamp = Date.now() }) {
    const supported = new Set(["media-not-playable", "media-error", "spa-navigation", "spa-delivery-failed"]);
    if (!supported.has(type) || !Number.isInteger(frameId) || frameId < 0) throw new TypeError("Invalid breakage diagnostic signal.");
    return this.#appendDiagnostic(tabId, "breakageSignals", { type, frameId, details: boundedText(details), timestamp });
  }

  recordProtectionAction({ tabId, frameId, type, source, details = "", timestamp = Date.now() }) {
    if (!["cosmetic", "scriptlet"].includes(type) || !Number.isInteger(frameId) || frameId < 0 || typeof source !== "string") throw new TypeError("Invalid protection diagnostic action.");
    return this.#appendDiagnostic(tabId, "protectionActions", { type, frameId, source: boundedText(source), details: boundedText(details), timestamp });
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
        attributionSource: null,
        filterRule: null,
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

  recordRuleMatch({ tabId, requestId, ruleId, rulesetId, decision, engine, source, rule = null, category = null }) {
    if (!["allowed", "blocked", "modified", "unknown"].includes(decision)) throw new TypeError(`Unsupported request decision: ${decision}`);
    if (![null, "ads", "trackers"].includes(category)) throw new TypeError(`Unsupported blocking category: ${category}`);
    return this.#mutate((document) => {
      const state = document.tabs[String(tabId)];
      const entry = state && [...state.requestLog].reverse().find((item) => item.id === requestId);
      if (!entry) return false;
      const rank = { unknown: 0, modified: 1, allowed: 2, blocked: 3 };
      if (rank[decision] < rank[entry.decision ?? "unknown"]) return true;
      const newlyBlocked = decision === "blocked" && entry.decision !== "blocked";
      entry.decision = decision;
      entry.engine = engine;
      entry.reason = `${source} matched ${rulesetId}:${ruleId}.`;
      entry.attributionSource = source;
      entry.ruleId = ruleId;
      entry.rulesetId = rulesetId;
      entry.filterRule = rule;
      entry.category = category;
      if (newlyBlocked) {
        state.blockedRequests += 1;
        if (category === "ads") state.blockedAds += 1;
        if (category === "trackers") state.blockedTrackers += 1;
        const domain = state.domains[entry.domain];
        if (domain) domain.blocked = true;
      }
      return true;
    });
  }

  recordCosmeticMetrics({ tabId, frameId, elementsHidden, mutations = 0, batches = 0, rootsScanned = 0, scanTimeMs = 0, maxScanTimeMs = 0, contentScriptSetupMs = 0 }) {
    const counters = { elementsHidden, mutations, batches, rootsScanned };
    const timings = { scanTimeMs, maxScanTimeMs, contentScriptSetupMs };
    if (!Number.isInteger(frameId) || frameId < 0
      || Object.values(counters).some((value) => !Number.isInteger(value) || value < 0)
      || Object.values(timings).some((value) => !Number.isFinite(value) || value < 0)) {
      throw new TypeError("Cosmetic metrics require a frame and non-negative counters and timings.");
    }
    return this.#mutate((document) => {
      const state = document.tabs[String(tabId)];
      if (!state) return false;
      const key = String(frameId);
      const previous = normalizeCosmeticFrame(state.cosmeticFrames[key]);
      state.cosmeticElementsHidden += cumulativeDelta(elementsHidden, previous.elementsHidden);
      state.cosmeticFrames[key] = { ...counters, ...timings };
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

  async getStatistics() {
    await this.queue;
    const document = await this.#read();
    const tabs = Object.values(document.tabs);
    const contacted = new Set(tabs.flatMap((tab) => Object.keys(tab.domains)));
    const blocked = new Set(tabs.flatMap((tab) => Object.entries(tab.domains).filter(([, value]) => value.blocked).map(([domain]) => domain)));
    return Object.freeze({
      requests: tabs.reduce((sum, tab) => sum + tab.totalRequests, 0),
      blockedRequests: tabs.reduce((sum, tab) => sum + tab.blockedRequests, 0),
      blockedAds: tabs.reduce((sum, tab) => sum + tab.blockedAds, 0),
      blockedTrackers: tabs.reduce((sum, tab) => sum + tab.blockedTrackers, 0),
      cosmeticElementsHidden: tabs.reduce((sum, tab) => sum + tab.cosmeticElementsHidden, 0),
      domainsContacted: contacted.size,
      domainsBlocked: blocked.size,
    });
  }

  async getPerformanceDiagnostics() {
    await this.queue;
    const document = await this.#read();
    const frames = Object.values(document.tabs).flatMap((tab) => Object.values(tab.cosmeticFrames).map(normalizeCosmeticFrame));
    return Object.freeze({
      contentFramesMeasured: frames.length,
      contentScriptSetupTimeMs: round(frames.reduce((sum, frame) => sum + frame.contentScriptSetupMs, 0)),
      mutationRecordsProcessed: frames.reduce((sum, frame) => sum + frame.mutations, 0),
      mutationBatchesProcessed: frames.reduce((sum, frame) => sum + frame.batches, 0),
      mutationRootsScanned: frames.reduce((sum, frame) => sum + frame.rootsScanned, 0),
      cosmeticScanTimeMs: round(frames.reduce((sum, frame) => sum + frame.scanTimeMs, 0)),
      maximumCosmeticBatchTimeMs: round(Math.max(0, ...frames.map((frame) => frame.maxScanTimeMs))),
    });
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
        if (!("category" in entry)) entry.category = null;
        if (!("filterRule" in entry)) entry.filterRule = null;
        if (!("attributionSource" in entry)) entry.attributionSource = null;
      }
      if (typeof state.reloadRequired !== "boolean") state.reloadRequired = false;
      if (!Number.isInteger(state.blockedRequests)) state.blockedRequests = 0;
      if (!Number.isInteger(state.blockedAds)) state.blockedAds = 0;
      if (!Number.isInteger(state.blockedTrackers)) state.blockedTrackers = 0;
      if (!Number.isInteger(state.cosmeticElementsHidden)) state.cosmeticElementsHidden = 0;
      if (!state.cosmeticFrames || typeof state.cosmeticFrames !== "object") state.cosmeticFrames = {};
      if (!Array.isArray(state.breakageSignals)) state.breakageSignals = [];
      if (!Array.isArray(state.protectionActions)) state.protectionActions = [];
    }
    return document;
  }

  #appendDiagnostic(tabId, property, entry) {
    return this.#mutate((document) => {
      const state = document.tabs[String(tabId)];
      if (!state) return false;
      state[property].push(entry);
      if (state[property].length > MAX_DIAGNOSTIC_ENTRIES) state[property].splice(0, state[property].length - MAX_DIAGNOSTIC_ENTRIES);
      state.updatedAt = entry.timestamp;
      return true;
    });
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
    blockedRequests: 0,
    blockedAds: 0,
    blockedTrackers: 0,
    cosmeticElementsHidden: 0,
    cosmeticFrames: {},
    reloadRequired: false,
    requestLog: [],
    breakageSignals: [],
    protectionActions: [],
    domains: {},
    startedAt: timestamp,
    updatedAt: timestamp,
  };
}

function boundedText(value) { return String(value).slice(0, 300); }

function createDomainState() {
  return { total: 0, completed: 0, failed: 0, blocked: false, types: {} };
}

function normalizeCosmeticFrame(value) {
  if (Number.isInteger(value)) return { elementsHidden: value, mutations: 0, batches: 0, rootsScanned: 0, scanTimeMs: 0, maxScanTimeMs: 0, contentScriptSetupMs: 0 };
  return { elementsHidden: 0, mutations: 0, batches: 0, rootsScanned: 0, scanTimeMs: 0, maxScanTimeMs: 0, contentScriptSetupMs: 0, ...(value ?? {}) };
}

function cumulativeDelta(value, previous) { return value >= previous ? value - previous : value; }
function round(value) { return Math.round(value * 100) / 100; }

function hostnameFromUrl(value) {
  const hostname = new URL(value).hostname.toLowerCase();
  if (!hostname) throw new TypeError(`URL has no observable hostname: ${value}`);
  return hostname;
}
