import { CosmeticParser } from "./cosmetic-parser.js";
import { SelectorStore } from "./selector-store.js";

export class CosmeticEngine {
  constructor({ parser = new CosmeticParser(), store = new SelectorStore() } = {}) {
    this.parser = parser;
    this.store = store;
    this.diagnostics = Object.freeze({ cosmeticRules: 0, cosmeticUnsupported: 0, globalCosmeticRules: 0, indexedDomains: 0 });
  }

  prepare(filters) { return this.parser.parseModels(filters); }

  activate(generation) {
    if (!generation || !Array.isArray(generation.filters) || !Array.isArray(generation.unsupported)) {
      throw new TypeError("Invalid cosmetic generation.");
    }
    this.store.replace(generation.filters);
    const store = this.store.getDiagnostics();
    this.diagnostics = Object.freeze({
      cosmeticRules: generation.filters.length,
      cosmeticUnsupported: generation.unsupported.length,
      globalCosmeticRules: store.globalCosmeticFilters,
      indexedDomains: store.indexedDomains,
    });
    return this.diagnostics;
  }

  clear() { return this.activate({ filters: [], unsupported: [] }); }
  getSelectors(hostname) { return this.store.getForHostname(hostname); }
  getSelectorPlan(hostname) { return this.store.getPlanForHostname(hostname); }
  getDiagnostics() { return this.diagnostics; }
}
