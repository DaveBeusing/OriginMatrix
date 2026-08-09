import { parseFilterText } from "./filter-parser.js";
import { FilterListService } from "./filter-list-service.js";
import { FILTER_TYPE } from "./filter-model.js";

const UNIFIED_LIST = Object.freeze({
  id: "originmatrix-default-lists",
  title: "OriginMatrix default lists",
  enabled: true,
  path: "filters/easylist.txt",
  snapshotVersion: "combined",
});

export class UnifiedFilterListManager {
  constructor({ lists, networkEngine, compiler, cosmeticEngine, scriptletEngine, loadText, settingsStore, generationStore = null, preparedGenerationStore = null, updater = null }) {
    if (!Array.isArray(lists) || lists.length === 0 || new Set(lists.map(({ id }) => id)).size !== lists.length) {
      throw new TypeError("Unique filter lists are required.");
    }
    this.loadText = loadText;
    this.settingsStore = settingsStore;
    this.generationStore = generationStore;
    this.updater = updater;
    this.entries = new Map(lists.map((list) => [list.id, {
      list, enabled: list.enabled, source: null, metadata: null, status: statusFrom(list, list.enabled, "loading"),
    }]));
    this.service = new FilterListService({ list: UNIFIED_LIST, networkEngine, compiler, cosmeticEngine, scriptletEngine, preparedGenerationStore, loadText });
    this.customSource = "";
  }

  async initialize() {
    const settings = await this.settingsStore.getAll();
    for (const entry of this.entries.values()) {
      entry.enabled = settings[entry.list.id]?.enabled ?? entry.list.enabled;
      if (this.generationStore && this.updater) {
        const stored = await this.updater.prepareStored(this.#adapter(entry.list.id), await this.generationStore.get(entry.list.id));
        if (stored) { entry.source = stored.source; entry.metadata = stored.metadata; }
      }
    }
    return this.activateAll();
  }

  async activateAll() { await this.#rebuild(); return this.getStatuses(); }
  getStatuses() { return [...this.entries.values()].map(({ status }) => status); }
  configure(features) { return this.service.configure(features); }
  resolveAutomatic(context) { return this.service.resolveAutomatic(context); }
  getPerformanceDiagnostics() { return this.service.getPerformanceDiagnostics(); }
  configureCustomSource(source) { this.customSource = String(source ?? ""); }
  async setCustomSource(source) {
    const previous = this.customSource;
    this.customSource = source;
    try { await this.#rebuild(); }
    catch (error) { this.customSource = previous; await this.#rebuild(); throw error; }
  }

  getSourceState(id) {
    const entry = this.#entry(id);
    return Object.freeze({ source: entry.source, metadata: entry.metadata, generation: this.service.getSourceState().generation });
  }

  async setEnabled(id, enabled) {
    if (typeof enabled !== "boolean") throw new TypeError("Filter list enabled state must be boolean.");
    const entry = this.#entry(id);
    const previous = entry.enabled;
    entry.enabled = enabled;
    try {
      await this.#rebuild();
      await this.settingsStore.setEnabled(id, enabled);
      return entry.status;
    } catch (error) {
      entry.enabled = previous;
      await this.#rebuild();
      throw error;
    }
  }

  async update(id) {
    if (!this.updater) throw new Error("Filter list updates are unavailable.");
    const entry = this.#entry(id);
    const previous = { source: entry.source, metadata: entry.metadata };
    const staged = await this.updater.downloadAndPrepare(this.#adapter(id));
    entry.source = staged.source;
    entry.metadata = staged.metadata;
    try {
      await this.service.activatePrepared(staged.prepared);
      await this.#refreshStatuses();
      await this.updater.persist(id, staged);
      return entry.status;
    } catch (error) {
      entry.source = previous.source;
      entry.metadata = previous.metadata;
      await this.#rebuild();
      throw error;
    }
  }

  async #rebuild() {
    const sources = await this.#sources();
    if (sources.length === 0 && !this.customSource.trim()) {
      this.service.setEnabled(false);
      await this.service.activate();
    } else {
      this.service.setEnabled(true);
      const source = this.#combinedSource(sources);
      this.service.setSource(source, { version: sources.map(({ entry }) => entry.metadata?.version ?? entry.list.snapshotVersion).join("+") });
      await this.service.activate();
    }
    await this.#refreshStatuses();
  }

  async #prepareCandidate(id, source, metadata) {
    const sources = await this.#sources({ id, source });
    const combined = this.#combinedSource(sources);
    return this.service.prepareSource(combined, metadata);
  }

  #combinedSource(sources) {
    const bundled = sources.map(({ entry, source: text }) => `! OriginMatrix source: ${entry.list.title}\n${text}`);
    if (this.customSource.trim()) bundled.push(`! OriginMatrix source: My Filters\n${this.customSource}`);
    return bundled.join("\n");
  }

  async #sources(override = null) {
    const sources = [];
    for (const entry of this.entries.values()) {
      if (!entry.enabled) continue;
      const source = override?.id === entry.list.id ? override.source : entry.source ?? await this.loadText(entry.list.path);
      sources.push({ entry, source });
    }
    return sources;
  }

  async #refreshStatuses() {
    for (const entry of this.entries.values()) {
      if (!entry.enabled) { entry.status = statusFrom(entry.list, false, "disabled"); continue; }
      const source = entry.source ?? await this.loadText(entry.list.path);
      const parsed = parseFilterText(source);
      entry.status = statusFrom(entry.list, true, "active", entry.metadata, parsed);
    }
  }

  #adapter(id) {
    const entry = this.#entry(id);
    return { list: entry.list, prepareSource: (source, metadata) => this.#prepareCandidate(id, source, metadata) };
  }

  #entry(id) {
    const entry = this.entries.get(id);
    if (!entry) throw new TypeError(`Unknown filter list: ${id}`);
    return entry;
  }
}

function statusFrom(list, enabled, state, metadata = null, parsed = null) {
  const filters = parsed?.filters ?? [];
  const diagnostics = parsed?.diagnostics;
  return Object.freeze({
    id: list.id, title: list.title, enabled, state,
    version: metadata?.version ?? list.snapshotVersion,
    lastUpdated: metadata?.lastUpdated ?? list.snapshotUpdatedAt ?? null,
    rulesLoaded: diagnostics?.rulesParsed ?? 0,
    rulesSupported: diagnostics?.rulesSupported ?? 0,
    rulesUnsupported: diagnostics?.rulesUnsupported ?? 0,
    rulesCompiled: filters.filter(({ type }) => [FILTER_TYPE.NETWORK, FILTER_TYPE.EXCEPTION].includes(type)).length,
    cosmeticRules: filters.filter(({ type }) => [FILTER_TYPE.COSMETIC, FILTER_TYPE.COSMETIC_CONTROL].includes(type)).length,
    scriptletRules: filters.filter(({ type }) => type === FILTER_TYPE.SCRIPTLET).length,
    checksum: metadata?.checksum ?? null,
  });
}
