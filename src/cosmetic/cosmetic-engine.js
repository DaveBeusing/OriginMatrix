import { CosmeticParser } from "./cosmetic-parser.js";
import { SelectorStore } from "./selector-store.js";

export class CosmeticEngine {
  constructor({ parser = new CosmeticParser(), store = new SelectorStore() } = {}) {
    this.parser = parser;
    this.store = store;
    this.proceduralFilters = Object.freeze([]);
    this.diagnostics = Object.freeze({ cosmeticRules: 0, cosmeticUnsupported: 0, globalCosmeticRules: 0, proceduralCosmeticRules: 0, indexedDomains: 0 });
  }

  prepare(filters) { return this.parser.parseModels(filters); }

  activate(generation) {
    if (!generation || !Array.isArray(generation.filters) || !Array.isArray(generation.unsupported)) {
      throw new TypeError("Invalid cosmetic generation.");
    }
    this.store.replace(generation.filters);
    this.proceduralFilters = Object.freeze([...(generation.proceduralFilters ?? [])]);
    const store = this.store.getDiagnostics();
    this.diagnostics = Object.freeze({
      cosmeticRules: generation.filters.length + this.proceduralFilters.length,
      cosmeticUnsupported: generation.unsupported.length,
      globalCosmeticRules: store.globalCosmeticFilters,
      proceduralCosmeticRules: this.proceduralFilters.length,
      indexedDomains: store.indexedDomains,
    });
    return this.diagnostics;
  }

  clear() { return this.activate({ filters: [], proceduralFilters: [], unsupported: [] }); }
  getSelectors(hostname) { return this.store.getForHostname(hostname); }
  getSelectorPlan(hostname) { return this.store.getPlanForHostname(hostname); }
  getProceduralFilters(hostname) {
    const site = normalizeHostname(hostname);
    const applicable = this.proceduralFilters.filter(({ filter }) => appliesTo(filter, site));
    const exceptions = new Set(applicable.filter(({ filter }) => filter.exception === true).map(({ filter }) => filter.selector));
    return Object.freeze(applicable.filter(({ filter }) => filter.exception !== true && !exceptions.has(filter.selector)).slice(0, 500).map(({ plan }) => plan));
  }
  getDiagnostics() { return this.diagnostics; }
}

function appliesTo(filter, hostname) {
  if (filter.excludedDomains.some((domain) => domainMatches(hostname, domain))) return false;
  return filter.domains.length === 0 || filter.domains.some((domain) => domainMatches(hostname, domain));
}
function domainMatches(hostname, domain) { return hostname === domain || hostname.endsWith(`.${domain}`); }
function normalizeHostname(value) {
  if (typeof value !== "string") throw new TypeError("Cosmetic hostname is required.");
  const hostname = value.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  if (!hostname || hostname.includes(":") || hostname.includes("/")) throw new TypeError("Invalid cosmetic hostname.");
  return hostname;
}
