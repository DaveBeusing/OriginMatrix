const DEFAULT_DEBOUNCE_MS = 75;

export class SpaNavigationLifecycle {
  constructor({
    sendMessage,
    onNavigation = async () => {},
    onTopFrameNavigation = async () => {},
    schedule = (callback, delay) => setTimeout(callback, delay),
    cancel = (handle) => clearTimeout(handle),
    debounceMs = DEFAULT_DEBOUNCE_MS,
    onError = (error) => console.warn("OriginMatrix SPA navigation update failed", error),
  } = {}) {
    if (typeof sendMessage !== "function") throw new TypeError("SPA lifecycle requires a message sender.");
    this.sendMessage = sendMessage;
    this.onNavigation = onNavigation;
    this.onTopFrameNavigation = onTopFrameNavigation;
    this.schedule = schedule;
    this.cancel = cancel;
    this.debounceMs = debounceMs;
    this.onError = onError;
    this.pending = new Map();
    this.sequence = 0;
  }

  start(webNavigation = chrome.webNavigation) {
    const listener = (details) => this.handle(details);
    webNavigation.onHistoryStateUpdated.addListener(listener);
    webNavigation.onReferenceFragmentUpdated.addListener(listener);
  }

  handle(details) {
    if (!isSupportedNavigation(details)) return false;
    const key = `${details.tabId}:${details.frameId}`;
    const previous = this.pending.get(key);
    if (previous) this.cancel(previous.handle);
    const navigationId = `${Math.round(details.timeStamp)}:${++this.sequence}`;
    const pending = {
      ...details,
      navigationId,
      handle: this.schedule(() => this.#dispatch(key), this.debounceMs),
    };
    this.pending.set(key, pending);
    return true;
  }

  async #dispatch(key) {
    const navigation = this.pending.get(key);
    if (!navigation) return;
    this.pending.delete(key);
    try {
      await this.onNavigation(navigation);
      if (navigation.frameId === 0) await this.onTopFrameNavigation(navigation);
      await this.sendMessage(navigation.tabId, {
        type: "ORIGINMATRIX_SPA_NAVIGATION",
        url: navigation.url,
        navigationId: navigation.navigationId,
      }, { frameId: navigation.frameId });
    } catch (error) {
      this.onError(error, navigation);
    }
  }
}

function isSupportedNavigation(details) {
  if (!Number.isInteger(details?.tabId) || details.tabId < 0 || !Number.isInteger(details.frameId) || details.frameId < 0
    || typeof details.url !== "string" || !Number.isFinite(details.timeStamp)) return false;
  try { return ["http:", "https:"].includes(new URL(details.url).protocol); }
  catch { return false; }
}
