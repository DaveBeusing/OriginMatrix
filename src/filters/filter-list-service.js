import { DYNAMIC_RULE_RANGES } from "../network/rule-ranges.js";
import { parseFilterText } from "./filter-parser.js";
import { NetworkFilterCompiler } from "./network-filter-compiler.js";
import { AutomaticFilterResolver } from "./automatic-filter-resolver.js";

export class FilterListService {
  constructor({ list, networkEngine, compiler = new NetworkFilterCompiler(), cosmeticEngine = null, scriptletEngine = null, automaticResolver = new AutomaticFilterResolver(), loadText }) {
    if (!list?.id || !list?.path) throw new TypeError("Filter list metadata is required.");
    if (!networkEngine || typeof networkEngine.replaceFilterRules !== "function") throw new TypeError("Network Engine is required.");
    if (typeof loadText !== "function") throw new TypeError("Filter list text loader is required.");
    this.list = list;
    this.networkEngine = networkEngine;
    this.compiler = compiler;
    this.cosmeticEngine = cosmeticEngine;
    this.scriptletEngine = scriptletEngine;
    this.automaticResolver = automaticResolver;
    this.loadText = loadText;
    this.features = Object.freeze({ network: true, cosmetic: true, scriptlets: true });
    this.enabled = list.enabled;
    this.state = statusFrom(list, { state: this.enabled ? "loading" : "disabled" }, this.enabled);
  }

  async activate() {
    if (!this.enabled) {
      await this.networkEngine.replaceFilterRules([]);
      this.cosmeticEngine?.clear();
      this.scriptletEngine?.clear();
      this.automaticResolver.clear();
      this.state = statusFrom(this.list, { state: "disabled", rulesLoaded: 0, rulesSupported: 0, rulesUnsupported: 0, rulesCompiled: 0, cosmeticRules: 0, scriptletRules: 0 }, this.enabled);
      return this.state;
    }
    this.state = statusFrom(this.list, { state: "loading" }, this.enabled);
    try {
      const parsed = parseFilterText(await this.loadText(this.list.path));
      const networkFilters = this.features.network ? parsed.filters : [];
      const cosmeticGeneration = this.features.cosmetic && this.cosmeticEngine ? this.cosmeticEngine.prepare(parsed.filters) : { filters: [], unsupported: [] };
      const scriptletGeneration = this.features.scriptlets && this.scriptletEngine ? this.scriptletEngine.prepareGeneration(parsed.filters) : { filters: [], unsupported: [] };
      const automaticGeneration = this.automaticResolver.prepare(networkFilters, { source: this.list.title });
      const dynamicRules = await this.networkEngine.getDynamicRules();
      const reservedDynamicRules = dynamicRules.filter(({ id }) => (
        id < DYNAMIC_RULE_RANGES.filters.minimum || id > DYNAMIC_RULE_RANGES.filters.maximum
      )).length;
      const compiled = this.compiler.compile(networkFilters, { reservedDynamicRules });
      await this.networkEngine.replaceFilterRules(compiled.rules);
      const cosmetic = this.cosmeticEngine?.activate(cosmeticGeneration) ?? { cosmeticRules: 0, cosmeticUnsupported: 0 };
      const scriptlets = this.scriptletEngine?.activate(scriptletGeneration) ?? { scriptletRules: 0, scriptletUnsupported: 0 };
      const automatic = this.automaticResolver.activate(automaticGeneration);
      this.state = statusFrom(this.list, {
        state: "active",
        rulesLoaded: parsed.diagnostics.rulesParsed,
        rulesSupported: compiled.diagnostics.networkFilters,
        rulesUnsupported: parsed.diagnostics.rulesUnsupported + cosmetic.cosmeticUnsupported + scriptlets.scriptletUnsupported,
        rulesCompiled: compiled.diagnostics.rulesCompiled,
        rulesOptimized: compiled.diagnostics.rulesOptimized,
        cosmeticRules: cosmetic.cosmeticRules,
        scriptletRules: scriptlets.scriptletRules,
        automaticFiltersIndexed: automatic.automaticFiltersIndexed,
        features: this.features,
      }, this.enabled);
      return this.state;
    } catch (error) {
      this.state = statusFrom(this.list, { state: "error", error: error.message }, this.enabled);
      throw error;
    }
  }

  getStatus() { return this.state; }
  setEnabled(enabled) {
    if (typeof enabled !== "boolean") throw new TypeError("Filter list enabled state must be boolean.");
    this.enabled = enabled;
  }
  resolveAutomatic(context) { return this.automaticResolver.resolve(context); }

  configure(features) {
    const names = ["network", "cosmetic", "scriptlets"];
    if (!features || names.some((name) => typeof features[name] !== "boolean")) {
      throw new TypeError("Protection features must be explicit booleans.");
    }
    this.features = Object.freeze(Object.fromEntries(names.map((name) => [name, features[name]])));
    return this.features;
  }
}

function statusFrom(list, state, enabled) {
  return Object.freeze({
    id: list.id,
    title: list.title,
    enabled,
    version: list.snapshotVersion,
    lastUpdated: list.snapshotUpdatedAt ?? null,
    ...state,
  });
}
