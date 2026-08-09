import { FILTER_TYPE, validateFilter } from "../filters/filter-model.js";
import { SCRIPTLET_PHASE, ScriptletRegistry } from "./scriptlet-registry.js";

export class ScriptletEngine {
  constructor({ registry = new ScriptletRegistry(), api = globalThis.chrome?.scripting } = {}) {
    this.registry = registry;
    this.api = api;
    this.filters = Object.freeze([]);
    this.diagnostics = Object.freeze({ scriptletRules: 0, scriptletUnsupported: 0 });
  }

  prepareGeneration(filters) {
    if (!Array.isArray(filters)) throw new TypeError("Scriptlet filters must be an array.");
    const supported = [];
    const unsupported = [];
    for (const input of filters) {
      if (input?.type !== FILTER_TYPE.SCRIPTLET) continue;
      const filter = validateFilter(input);
      try {
        this.registry.createInvocation(filter.name, filter.args);
        supported.push(filter);
      } catch (error) {
        unsupported.push(Object.freeze({ filter, reason: error.message }));
      }
    }
    return Object.freeze({ filters: Object.freeze(supported), unsupported: Object.freeze(unsupported) });
  }

  activate(generation) {
    if (!generation || !Array.isArray(generation.filters) || !Array.isArray(generation.unsupported)) {
      throw new TypeError("Invalid scriptlet generation.");
    }
    this.filters = Object.freeze([...generation.filters]);
    this.diagnostics = Object.freeze({ scriptletRules: this.filters.length, scriptletUnsupported: generation.unsupported.length });
    return this.diagnostics;
  }

  clear() {
    this.filters = Object.freeze([]);
    this.diagnostics = Object.freeze({ scriptletRules: 0, scriptletUnsupported: 0 });
  }

  prepareForHostname(hostname, { phase = null } = {}) { return this.prepare(this.filters, { hostname, phase }); }

  prepare(filters, { hostname, phase = null } = {}) {
    if (!Array.isArray(filters)) throw new TypeError("Scriptlet filters must be an array.");
    if (phase !== null && !Object.values(SCRIPTLET_PHASE).includes(phase)) throw new TypeError("Invalid scriptlet execution phase.");
    const site = normalizeHostname(hostname);
    const invocations = [];
    const unsupported = [];
    let skipped = 0;
    const seen = new Set();
    for (const input of filters) {
      if (input?.type !== FILTER_TYPE.SCRIPTLET) continue;
      const filter = validateFilter(input);
      if (!appliesTo(filter, site)) { skipped += 1; continue; }
      try {
        if (phase !== null && this.registry.getPhase(filter.name) !== phase) { skipped += 1; continue; }
        const key = `${filter.name}\u0000${filter.args.join("\u0000")}`;
        if (seen.has(key)) continue;
        seen.add(key);
        invocations.push(this.registry.createInvocation(filter.name, filter.args, filter));
      } catch (error) {
        unsupported.push(Object.freeze({ filter, reason: error.message }));
      }
    }
    return Object.freeze({ phase, invocations: Object.freeze(invocations), unsupported: Object.freeze(unsupported), skipped });
  }

  async execute(generation, { tabId, frameIds = [0] } = {}) {
    if (!generation || !Array.isArray(generation.invocations) || generation.invocations.some((item) => !this.registry.isInvocation(item))) {
      throw new TypeError("Scriptlet generation was not created by this registry.");
    }
    if (!Number.isInteger(tabId) || tabId < 0 || !Array.isArray(frameIds) || frameIds.length === 0
      || frameIds.some((frameId) => !Number.isInteger(frameId) || frameId < 0) || new Set(frameIds).size !== frameIds.length) {
      throw new TypeError("Scriptlet execution requires a tab and unique non-negative frame IDs.");
    }
    if (!this.api || typeof this.api.executeScript !== "function") throw new Error("Scripting API is unavailable.");
    const results = [];
    for (const invocation of generation.invocations) {
      results.push(await this.api.executeScript({
        target: { tabId, frameIds: [...frameIds] },
        world: "MAIN",
        func: invocation.implementation,
        args: [...invocation.args],
      }));
    }
    return Object.freeze({ executed: generation.invocations.length, results: Object.freeze(results) });
  }

  getDiagnostics() { return Object.freeze({ bundledScriptlets: this.registry.list().length, ...this.diagnostics }); }
}

function appliesTo(filter, hostname) {
  if (filter.excludedDomains.some((domain) => domainMatches(hostname, domain))) return false;
  return filter.domains.length === 0 || filter.domains.some((domain) => domainMatches(hostname, domain));
}

function domainMatches(hostname, domain) { return hostname === domain || hostname.endsWith(`.${domain}`); }

function normalizeHostname(value) {
  if (typeof value !== "string") throw new TypeError("Scriptlet hostname is required.");
  const hostname = value.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  if (!hostname || hostname.includes(":") || hostname.includes("/")) throw new TypeError("Invalid scriptlet hostname.");
  return hostname;
}
