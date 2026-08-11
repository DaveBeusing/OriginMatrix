import { DYNAMIC_RULE_RANGES } from "../network/rule-ranges.js";
import { parseFilterText } from "./filter-parser.js";
import { NetworkFilterCompiler } from "./network-filter-compiler.js";
import { AutomaticFilterResolver } from "./automatic-filter-resolver.js";
import { createPreparedCacheIdentity } from "../storage/prepared-generation-cache-store.js";
import { preprocessFilterText } from "./filter-preprocessor.js";

export class FilterListService {
  constructor({ list, networkEngine, compiler = new NetworkFilterCompiler(), cosmeticEngine = null, scriptletEngine = null, automaticResolver = new AutomaticFilterResolver(), preparedGenerationStore = null, loadText, include = null, now = () => performance.now() }) {
    if (!list?.id || !list?.path) throw new TypeError("Filter list metadata is required.");
    if (!networkEngine || typeof networkEngine.replaceFilterRules !== "function") throw new TypeError("Network Engine is required.");
    if (typeof loadText !== "function") throw new TypeError("Filter list text loader is required.");
    this.list = list;
    this.networkEngine = networkEngine;
    this.compiler = compiler;
    this.cosmeticEngine = cosmeticEngine;
    this.scriptletEngine = scriptletEngine;
    this.automaticResolver = automaticResolver;
    this.preparedGenerationStore = preparedGenerationStore;
    this.loadText = loadText;
    this.include = include;
    this.now = now;
    this.features = Object.freeze({ network: true, cosmetic: true, scriptlets: true });
    this.staticNetworkSources = new Set();
    this.enabled = list.enabled;
    this.sourceOverride = null;
    this.sourceMetadata = null;
    this.activeGeneration = null;
    this.preparedCache = null;
    this.performance = { parsingTimeMs: 0, compilationTimeMs: 0, preparationTimeMs: 0, cacheHits: 0, signatureCacheHits: 0, persistentCacheHit: false, persistentCacheMiss: false, persistentCacheInvalid: false, cacheReadTimeMs: 0, cacheWriteTimeMs: 0, cachedGenerationSize: 0 };
    this.state = statusFrom(list, { state: this.enabled ? "loading" : "disabled" }, this.enabled);
  }

  async activate() {
    if (!this.enabled) {
      await this.networkEngine.replaceFilterRules([]);
      this.cosmeticEngine?.clear();
      this.scriptletEngine?.clear();
      this.automaticResolver.clear();
      this.state = statusFrom(this.list, { state: "disabled", rulesLoaded: 0, rulesSupported: 0, rulesUnsupported: 0, rulesCompiled: 0, cosmeticRules: 0, scriptletRules: 0 }, this.enabled, this.sourceMetadata);
      return this.state;
    }
    this.state = statusFrom(this.list, { state: "loading" }, this.enabled, this.sourceMetadata);
    try {
      const source = this.sourceOverride ?? await this.loadText(this.list.path);
      const metadata = this.sourceMetadata ?? { version: this.list.snapshotVersion, lastUpdated: this.list.snapshotUpdatedAt ?? null };
      return this.activatePrepared(await this.prepareSource(source, metadata));
    } catch (error) {
      this.state = statusFrom(this.list, { state: "error", error: error.message }, this.enabled, this.sourceMetadata);
      throw error;
    }
  }

  async prepareSource(source, metadata = {}) {
    if (typeof source !== "string" || source.length === 0) throw new TypeError("Filter list source must be non-empty text.");
    const dynamicRules = await this.networkEngine.getDynamicRules();
    const reservedDynamicRules = dynamicRules.filter(({ id }) => (
      id < DYNAMIC_RULE_RANGES.filters.minimum || id > DYNAMIC_RULE_RANGES.filters.maximum
    )).length;
    const featureKey = JSON.stringify({ ...this.features, staticNetworkSources: [...this.staticNetworkSources].sort() });
    if (this.preparedCache?.source === source
      && this.preparedCache.featureKey === featureKey
      && this.preparedCache.reservedDynamicRules === reservedDynamicRules) {
      this.performance.cacheHits += 1;
      return generationWithMetadata(this.preparedCache.generation, metadata, this.list);
    }
    const preparationStarted = this.now();
    const parsingStarted = this.now();
    const preprocessed = await preprocessFilterText(source, { include: this.include, sourceName: this.list.path });
    const parsed = parseFilterText(preprocessed.source);
    this.performance.parsingTimeMs = elapsed(this.now(), parsingStarted);
    const allNetworkFilters = this.features.network ? parsed.filters : [];
    const networkFilters = allNetworkFilters.filter(({ sourceList }) => !this.staticNetworkSources.has(sourceList));
    const cosmeticGeneration = this.features.cosmetic && this.cosmeticEngine ? this.cosmeticEngine.prepare(parsed.filters) : { filters: [], unsupported: [] };
    const scriptletGeneration = this.features.scriptlets && this.scriptletEngine ? this.scriptletEngine.prepareGeneration(parsed.filters) : { filters: [], unsupported: [] };
    const automaticGeneration = this.automaticResolver.prepare(allNetworkFilters, { source: this.list.title });
    const identity = this.preparedGenerationStore
      ? createPreparedCacheIdentity({ sourceChecksum: await sha256(source), featureKey, reservedDynamicRules })
      : null;
    let compiled = null;
    if (this.preparedGenerationStore) {
      const readStarted = this.now();
      const cached = await this.preparedGenerationStore.get(identity);
      this.performance.cacheReadTimeMs = elapsed(this.now(), readStarted);
      this.performance.cachedGenerationSize = cached.size;
      this.performance.persistentCacheHit = cached.state === "hit";
      this.performance.persistentCacheMiss = cached.state === "miss";
      this.performance.persistentCacheInvalid = cached.state === "invalid";
      if (cached.state === "hit") compiled = cached.compilation;
    }
    if (!compiled) {
      const compilationStarted = this.now();
      compiled = this.compiler.compile(networkFilters, { reservedDynamicRules });
      this.performance.compilationTimeMs = elapsed(this.now(), compilationStarted);
      if (this.preparedGenerationStore) {
        const writeStarted = this.now();
        try { const written = await this.preparedGenerationStore.set(identity, compiled); this.performance.cachedGenerationSize = written.size; }
        catch { this.performance.persistentCacheInvalid = true; }
        this.performance.cacheWriteTimeMs = elapsed(this.now(), writeStarted);
      }
    } else this.performance.compilationTimeMs = 0;
    this.performance.signatureCacheHits = compiled.diagnostics.signatureCacheHits ?? 0;
    this.performance.preparationTimeMs = elapsed(this.now(), preparationStarted);
    const generation = Object.freeze({
      networkRules: compiled.rules,
      networkAttributions: compiled.attributions,
      cosmeticGeneration,
      scriptletGeneration,
      automaticGeneration,
      metadata: Object.freeze({ version: this.list.snapshotVersion, lastUpdated: null, checksum: null }),
      diagnostics: Object.freeze({
        rulesLoaded: parsed.diagnostics.rulesParsed,
        rulesSupported: compiled.diagnostics.networkFilters,
        rulesUnsupported: parsed.diagnostics.rulesUnsupported,
        rulesCompiled: compiled.diagnostics.rulesCompiled,
        rulesOptimized: compiled.diagnostics.rulesOptimized,
        preprocessorDirectives: preprocessed.diagnostics.directives,
        preprocessorBranchesExcluded: preprocessed.diagnostics.branchesExcluded,
        includesResolved: preprocessed.diagnostics.includesResolved,
        includesSkipped: preprocessed.diagnostics.includesSkipped,
        badfilterDirectives: compiled.diagnostics.badfilterDirectives,
        filtersDisabled: compiled.diagnostics.filtersDisabled,
      }),
    });
    this.preparedCache = { source, featureKey, reservedDynamicRules, generation };
    return generationWithMetadata(generation, metadata, this.list);
  }

  async activatePrepared(generation) {
    if (!generation || !Array.isArray(generation.networkRules) || !generation.cosmeticGeneration || !generation.scriptletGeneration || !generation.automaticGeneration) {
      throw new TypeError("Invalid prepared filter list generation.");
    }
    try {
      await this.networkEngine.replaceFilterRules(generation.networkRules);
      const cosmetic = this.cosmeticEngine?.activate(generation.cosmeticGeneration) ?? { cosmeticRules: 0, cosmeticUnsupported: 0 };
      const scriptlets = this.scriptletEngine?.activate(generation.scriptletGeneration) ?? { scriptletRules: 0, scriptletUnsupported: 0 };
      const automatic = this.automaticResolver.activate(generation.automaticGeneration);
      this.state = statusFrom(this.list, {
        state: "active",
        ...generation.diagnostics,
        rulesUnsupported: generation.diagnostics.rulesUnsupported + cosmetic.cosmeticUnsupported + scriptlets.scriptletUnsupported,
        cosmeticRules: cosmetic.cosmeticRules,
        scriptletRules: scriptlets.scriptletRules,
        automaticFiltersIndexed: automatic.automaticFiltersIndexed,
        features: this.features,
        checksum: generation.metadata.checksum,
      }, this.enabled, generation.metadata);
      this.activeGeneration = generation;
      return this.state;
    } catch (error) {
      this.state = statusFrom(this.list, { state: "error", error: error.message }, this.enabled, generation.metadata);
      throw error;
    }
  }

  getStatus() { return this.state; }
  getPerformanceDiagnostics() { return Object.freeze({ ...this.performance, preparedGenerationCached: this.preparedCache !== null }); }
  setEnabled(enabled) {
    if (typeof enabled !== "boolean") throw new TypeError("Filter list enabled state must be boolean.");
    this.enabled = enabled;
  }
  setSource(source, metadata) {
    if (source !== null && (typeof source !== "string" || source.length === 0)) throw new TypeError("Filter list source must be text or null.");
    this.sourceOverride = source;
    this.sourceMetadata = metadata ? Object.freeze({ ...metadata }) : null;
  }
  getSourceState() { return Object.freeze({ source: this.sourceOverride, metadata: this.sourceMetadata, generation: this.activeGeneration }); }
  resolveAutomatic(context) { return this.automaticResolver.resolve(context); }

  configure(features) {
    const names = ["network", "cosmetic", "scriptlets"];
    if (!features || names.some((name) => typeof features[name] !== "boolean")) {
      throw new TypeError("Protection features must be explicit booleans.");
    }
    this.features = Object.freeze(Object.fromEntries(names.map((name) => [name, features[name]])));
    return this.features;
  }

  configureStaticNetworkSources(sourceNames) {
    if (!Array.isArray(sourceNames) || sourceNames.some((name) => typeof name !== "string" || !name)) throw new TypeError("Static network source names must be non-empty strings.");
    this.staticNetworkSources = new Set(sourceNames);
    return Object.freeze([...this.staticNetworkSources].sort());
  }
}

function generationWithMetadata(generation, metadata, list) {
  return Object.freeze({
    ...generation,
    metadata: Object.freeze({ version: metadata.version ?? list.snapshotVersion, lastUpdated: metadata.lastUpdated ?? null, checksum: metadata.checksum ?? null }),
  });
}

function elapsed(ended, started) { return Math.max(0, ended - started); }
async function sha256(source) { const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(source)); return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join(""); }

function statusFrom(list, state, enabled, metadata = null) {
  return Object.freeze({
    id: list.id,
    title: list.title,
    enabled,
    version: metadata?.version ?? list.snapshotVersion,
    lastUpdated: metadata?.lastUpdated ?? list.snapshotUpdatedAt ?? null,
    ...state,
  });
}
