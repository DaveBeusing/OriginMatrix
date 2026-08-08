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
    this.state = statusFrom(list, { state: list.enabled ? "loading" : "disabled" });
  }

  async activate() {
    if (!this.list.enabled) {
      await this.networkEngine.replaceFilterRules([]);
      this.cosmeticEngine?.clear();
      this.scriptletEngine?.clear();
      this.automaticResolver.clear();
      this.state = statusFrom(this.list, { state: "disabled" });
      return this.state;
    }
    this.state = statusFrom(this.list, { state: "loading" });
    try {
      const parsed = parseFilterText(await this.loadText(this.list.path));
      const cosmeticGeneration = this.cosmeticEngine?.prepare(parsed.filters) ?? { filters: [], unsupported: [] };
      const scriptletGeneration = this.scriptletEngine?.prepareGeneration(parsed.filters) ?? { filters: [], unsupported: [] };
      const automaticGeneration = this.automaticResolver.prepare(parsed.filters, { source: this.list.title });
      const dynamicRules = await this.networkEngine.getDynamicRules();
      const reservedDynamicRules = dynamicRules.filter(({ id }) => (
        id < DYNAMIC_RULE_RANGES.filters.minimum || id > DYNAMIC_RULE_RANGES.filters.maximum
      )).length;
      const compiled = this.compiler.compile(parsed.filters, { reservedDynamicRules });
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
      });
      return this.state;
    } catch (error) {
      this.state = statusFrom(this.list, { state: "error", error: error.message });
      throw error;
    }
  }

  getStatus() { return this.state; }
  resolveAutomatic(context) { return this.automaticResolver.resolve(context); }
}

function statusFrom(list, state) {
  return Object.freeze({
    id: list.id,
    title: list.title,
    enabled: list.enabled,
    version: list.snapshotVersion,
    ...state,
  });
}
