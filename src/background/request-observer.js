export class RequestObserver {
  constructor({ tabStateManager, getTab }) {
    this.tabStateManager = tabStateManager;
    this.getTab = getTab;
    this.pendingRequests = new Map();
  }

  start(webRequest = chrome.webRequest) {
    const filter = { urls: ["<all_urls>"] };
    webRequest.onBeforeRequest.addListener((details) => {
      const task = this.#observeStart(details);
      this.pendingRequests.set(requestKey(details), task);
    }, filter);
    webRequest.onCompleted.addListener((details) => this.#observeOutcome(details, "completed"), filter);
    webRequest.onErrorOccurred.addListener((details) => this.#observeOutcome(details, "failed"), filter);
  }

  async #observeStart(details) {
    if (!isTabRequest(details)) return;
    try {
      if (details.type === "main_frame") {
        await this.tabStateManager.startNavigation({ tabId: details.tabId, url: details.url, timestamp: details.timeStamp });
      }
      const state = await this.tabStateManager.get(details.tabId);
      const topUrl = state?.topUrl ?? (await this.getTab(details.tabId))?.url;
      await this.tabStateManager.recordRequest({
        tabId: details.tabId,
        url: details.url,
        type: details.type,
        topUrl,
        timestamp: details.timeStamp,
      });
    } catch (error) {
      console.error("Could not observe request", error);
    }
  }

  async #observeOutcome(details, outcome) {
    if (!isTabRequest(details)) return;
    const key = requestKey(details);
    try {
      await this.pendingRequests.get(key);
      await this.tabStateManager.recordOutcome({
        tabId: details.tabId,
        url: details.url,
        outcome,
        timestamp: details.timeStamp,
      });
    } catch (error) {
      console.error("Could not observe request outcome", error);
    } finally {
      this.pendingRequests.delete(key);
    }
  }
}

function requestKey(details) {
  return `${details.tabId}:${details.requestId}`;
}

function isTabRequest(details) {
  return Number.isInteger(details?.tabId) && details.tabId >= 0 && typeof details.url === "string";
}
