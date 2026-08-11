import { FILTER_LIST_MAX_SOURCE_BYTES } from "../storage/filter-list-generation-store.js";

export class FilterListUpdater {
  constructor({ generationStore, fetcher = globalThis.fetch, now = () => new Date().toISOString(), minimumRules = 100 } = {}) {
    if (!generationStore || typeof generationStore.set !== "function") throw new TypeError("Filter list generation store is required.");
    if (typeof fetcher !== "function") throw new TypeError("Filter list fetcher is required.");
    if (!Number.isInteger(minimumRules) || minimumRules < 1) throw new TypeError("Minimum filter rule count must be positive.");
    this.generationStore = generationStore;
    this.fetcher = fetcher;
    this.now = now;
    this.minimumRules = minimumRules;
  }

  async downloadAndPrepare(service) {
    const url = new URL(service?.list?.sourceUrl);
    if (url.protocol !== "https:") throw new TypeError("Filter list updates require HTTPS.");
    const response = await this.fetcher(url.href, { cache: "no-store", credentials: "omit", redirect: "error" });
    if (!response?.ok) throw new Error(`Filter list download failed: HTTP ${response?.status ?? "unknown"}`);
    const declaredSize = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(declaredSize) && declaredSize > FILTER_LIST_MAX_SOURCE_BYTES) throw new Error("Filter list download is too large.");
    const source = await response.text();
    const size = new TextEncoder().encode(source).length;
    if (size === 0 || size > FILTER_LIST_MAX_SOURCE_BYTES) throw new Error("Filter list download has an invalid size.");
    if (!/^\[Adblock Plus[^\]]*\]/.test(source) && !/^!\s*Title:\s*\S+/mi.test(source)) throw new Error("Filter list header is invalid.");
    const ruleCount = source.split(/\r?\n/).filter((line) => line.trim() && !line.startsWith("!") && !/^\[.*\]$/.test(line)).length;
    if (ruleCount < this.minimumRules) throw new Error("Filter list does not contain enough rules.");
    const version = source.match(/^!\s*Version:\s*(\S+)/mi)?.[1] ?? versionFromLastModified(source.match(/^!\s*Last modified:\s*(.+)$/mi)?.[1]);
    if (!version) throw new Error("Filter list version is missing.");
    const checksum = await sha256(source);
    const lastUpdated = this.now();
    if (typeof lastUpdated !== "string" || !Number.isFinite(Date.parse(lastUpdated))) throw new Error("Filter list update timestamp is invalid.");
    const metadata = Object.freeze({ version, lastUpdated, checksum });
    const prepared = await service.prepareSource(source, metadata);
    return Object.freeze({ source, metadata, prepared });
  }

  async persist(id, staged) {
    await this.generationStore.set(id, { source: staged.source, ...staged.metadata });
  }

  async prepareStored(service, stored) {
    if (!stored) return null;
    if (await sha256(stored.source) !== stored.checksum) throw new Error("Stored filter list checksum does not match.");
    const metadata = Object.freeze({ version: stored.version, lastUpdated: stored.lastUpdated, checksum: stored.checksum });
    return Object.freeze({ source: stored.source, metadata, prepared: await service.prepareSource(stored.source, metadata) });
  }
}

function versionFromLastModified(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
}

async function sha256(source) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
