(() => {
  class DynamicCosmeticFilter {
    constructor({
      documentObject = document,
      Observer = MutationObserver,
      schedule = (callback, delay) => setTimeout(callback, delay),
      cancel = (handle) => clearTimeout(handle),
      now = () => performance.now(),
      debounceMs = 50,
      maxQueuedRoots = 100,
      selectorGroupSize = 40,
      onMetrics = () => {},
    } = {}) {
      this.document = documentObject;
      this.Observer = Observer;
      this.schedule = schedule;
      this.cancel = cancel;
      this.now = now;
      this.debounceMs = debounceMs;
      this.maxQueuedRoots = maxQueuedRoots;
      this.selectorGroupSize = selectorGroupSize;
      this.onMetrics = onMetrics;
      this.selectorCache = new Map();
      this.roots = new Set();
      this.timer = null;
      this.observer = null;
      this.groups = [];
      this.prepared = null;
      this.metrics = emptyMetrics();
    }

    start(selectors) {
      this.stop();
      const prepared = this.prepareSelectors(selectors);
      this.groups = prepared.groups;
      this.prepared = prepared;
      this.metrics = { ...emptyMetrics(), selectors: prepared.selectors, invalidSelectors: prepared.invalidSelectors, fastSelectors: prepared.fastSelectors, complexSelectors: prepared.complexSelectors };
      if (this.groups.length === 0) { this.onMetrics(this.getMetrics()); return this.getMetrics(); }
      this.observer = new this.Observer((mutations) => this.handleMutations(mutations));
      const observerOptions = {
        childList: true,
        subtree: true,
        ...(prepared.attributeFilter.length ? { attributes: true, attributeFilter: prepared.attributeFilter } : {}),
      };
      this.observer.observe(this.document, observerOptions);
      this.enqueue(this.document.documentElement);
      return this.getMetrics();
    }

    stop() {
      this.observer?.disconnect();
      this.observer = null;
      if (this.timer !== null) this.cancel(this.timer);
      this.timer = null;
      this.roots.clear();
    }

    getMetrics() { return Object.freeze({ ...this.metrics }); }

    handleMutations(mutations) {
      this.metrics.mutations += mutations.length;
      for (const mutation of mutations) {
        if (mutation.type === "attributes") this.enqueue(mutation.target);
        for (const node of mutation.addedNodes ?? []) if (node.nodeType === 1) this.enqueue(node);
      }
    }

    enqueue(root) {
      if (!root || root.nodeType !== 1) return;
      if (this.roots.has(this.document.documentElement)) return;
      if (root === this.document.documentElement || this.roots.size >= this.maxQueuedRoots) {
        const escalated = root !== this.document.documentElement || this.roots.size > 0;
        this.roots.clear();
        this.roots.add(this.document.documentElement);
        if (escalated) this.metrics.rootEscalations += 1;
      } else if (!this.hasQueuedAncestor(root)) {
        for (const queued of this.roots) { this.metrics.containmentChecks += 1; if (root.contains(queued)) this.roots.delete(queued); }
        this.roots.add(root);
      }
      if (this.timer === null) this.timer = this.schedule(() => this.flush(), this.debounceMs);
    }

    hasQueuedAncestor(root) {
      for (const queued of this.roots) { this.metrics.containmentChecks += 1; if (queued.contains(root)) return true; }
      return false;
    }

    flush() {
      this.timer = null;
      const roots = [...this.roots];
      this.roots.clear();
      const started = this.now();
      let hidden = 0;
      for (const root of roots) hidden += this.scan(root);
      const duration = Math.max(0, this.now() - started);
      this.metrics.batches += 1;
      this.metrics.rootsScanned += roots.length;
      this.metrics.elementsHidden += hidden;
      this.metrics.scanTimeMs += duration;
      this.metrics.maxScanTimeMs = Math.max(this.metrics.maxScanTimeMs, duration);
      this.onMetrics(this.getMetrics());
    }

    scan(root) {
      let hidden = 0;
      for (const group of this.groups) {
        if (root.matches(group)) hidden += hide(root);
        for (const element of root.querySelectorAll(group)) hidden += hide(element);
      }
      return hidden;
    }

    prepareSelectors(selectors) {
      if (!Array.isArray(selectors) || selectors.some((selector) => typeof selector !== "string")) {
        throw new TypeError("Dynamic cosmetic selectors must be strings.");
      }
      const key = selectors.join("\u0000");
      if (this.selectorCache.has(key)) return this.selectorCache.get(key);
      const valid = [];
      let invalidSelectors = 0;
      for (const selector of [...new Set(selectors)].sort()) {
        try { this.document.documentElement.matches(selector); valid.push(selector); }
        catch { invalidSelectors += 1; }
      }
      const fast = valid.filter(isFastSelector);
      const complex = valid.filter((selector) => !isFastSelector(selector));
      const groups = [...groupSelectors(fast, this.selectorGroupSize), ...groupSelectors(complex, this.selectorGroupSize)];
      const attributeFilter = selectorAttributes(valid);
      const prepared = Object.freeze({ groups: Object.freeze(groups), selectors: valid.length, invalidSelectors, fastSelectors: fast.length, complexSelectors: complex.length, attributeFilter: Object.freeze(attributeFilter) });
      if (this.selectorCache.size >= 8) this.selectorCache.delete(this.selectorCache.keys().next().value);
      this.selectorCache.set(key, prepared);
      return prepared;
    }
  }

  function groupSelectors(selectors, size) { const groups = []; for (let index = 0; index < selectors.length; index += size) groups.push(selectors.slice(index, index + size).join(",")); return groups; }
  function isFastSelector(selector) { return /^(?:#[\w-]+|\.[\w-]+|[a-z][\w-]*|\[[\w-]+(?:=[^\]]+)?\]|[a-z][\w-]*\.[\w-]+)$/i.test(selector); }
  function selectorAttributes(selectors) {
    const values = new Set();
    for (const selector of selectors) {
      if (/(?:^|[^\\])\./.test(selector)) values.add("class");
      if (/(?:^|[^\\])#/.test(selector)) values.add("id");
      for (const match of selector.matchAll(/\[([a-z_][\w-]*)/gi)) values.add(match[1].toLowerCase());
    }
    return [...values].sort().slice(0, 32);
  }

  function hide(element) {
    if (element.hasAttribute("data-originmatrix-cosmetic-hidden")) return 0;
    element.setAttribute("data-originmatrix-cosmetic-hidden", "");
    return 1;
  }

  function emptyMetrics() {
    return { selectors: 0, fastSelectors: 0, complexSelectors: 0, invalidSelectors: 0, mutations: 0, batches: 0, rootsScanned: 0, rootEscalations: 0, containmentChecks: 0, elementsHidden: 0, scanTimeMs: 0, maxScanTimeMs: 0 };
  }

  globalThis.OriginMatrixDynamicCosmeticFilter = DynamicCosmeticFilter;
})();
