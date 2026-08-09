(() => {
  const MAX_RULES = 500;
  const MAX_ROOTS = 50;
  const MAX_NODES_PER_BATCH = 2_000;
  const MAX_TEXT_CHARACTERS = 10_000;
  const MAX_ANCESTOR_DEPTH = 8;

  class ProceduralCosmeticFilter {
    constructor({ documentObject = document, Observer = MutationObserver, schedule = (callback, delay) => setTimeout(callback, delay), cancel = (handle) => clearTimeout(handle), debounceMs = 100 } = {}) {
      this.document = documentObject;
      this.Observer = Observer;
      this.schedule = schedule;
      this.cancel = cancel;
      this.debounceMs = debounceMs;
      this.rules = [];
      this.roots = new Set();
      this.timer = null;
      this.observer = null;
      this.metrics = emptyMetrics();
    }

    start(plans) {
      this.stop();
      if (!Array.isArray(plans)) throw new TypeError("Procedural filters must be an array.");
      let rejectedRules = Math.max(0, plans.length - MAX_RULES);
      this.rules = [];
      for (const plan of plans.slice(0, MAX_RULES)) {
        try { this.rules.push(preparePlan(plan, this.document)); }
        catch { rejectedRules += 1; }
      }
      this.metrics = { ...emptyMetrics(), rules: this.rules.length, rejectedRules };
      if (this.rules.length === 0) return this.getMetrics();
      this.observer = new this.Observer((mutations) => this.handleMutations(mutations));
      this.observer.observe(this.document, { childList: true, subtree: true, characterData: true });
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

    handleMutations(mutations) {
      this.metrics.mutations += mutations.length;
      for (const mutation of mutations) {
        if (mutation.type === "characterData") this.enqueueWithAncestors(mutation.target.parentElement);
        for (const node of mutation.addedNodes ?? []) if (node.nodeType === 1) this.enqueueWithAncestors(node);
      }
    }

    enqueueWithAncestors(node) {
      let current = node;
      for (let depth = 0; current && depth <= MAX_ANCESTOR_DEPTH; depth += 1) {
        this.enqueue(current);
        current = current.parentElement;
      }
    }

    enqueue(root) {
      if (!root || root.nodeType !== 1) return;
      if (this.roots.size >= MAX_ROOTS) { this.roots.clear(); this.roots.add(this.document.documentElement); }
      else this.roots.add(root);
      if (this.timer === null) this.timer = this.schedule(() => this.flush(), this.debounceMs);
    }

    flush() {
      this.timer = null;
      let remaining = MAX_NODES_PER_BATCH;
      let hidden = 0;
      for (const root of this.roots) {
        for (const rule of this.rules) {
          if (remaining <= 0) break;
          const candidates = candidatesWithin(root, rule.targetSelector, remaining);
          remaining -= candidates.length;
          for (const candidate of candidates) if (matchesText(candidate, rule)) hidden += hide(candidate);
        }
        if (remaining <= 0) break;
      }
      this.roots.clear();
      this.metrics.batches += 1;
      this.metrics.nodesEvaluated += MAX_NODES_PER_BATCH - remaining;
      this.metrics.elementsHidden += hidden;
    }

    getMetrics() { return Object.freeze({ ...this.metrics }); }
  }

  function preparePlan(plan, documentObject) {
    if (!plan || typeof plan.targetSelector !== "string" || !plan.matcher || (plan.descendantSelector != null && typeof plan.descendantSelector !== "string")) throw new TypeError("Invalid procedural filter plan.");
    if (!["text", "regexp"].includes(plan.matcher.type) || typeof plan.matcher.value !== "string" || plan.matcher.value.length > 128
      || (plan.matcher.type === "regexp" && (typeof plan.matcher.flags !== "string" || !/^[imu]*$/.test(plan.matcher.flags)))) {
      throw new TypeError("Invalid procedural text matcher.");
    }
    documentObject.documentElement.matches(plan.targetSelector);
    if (plan.descendantSelector) documentObject.documentElement.matches(plan.descendantSelector);
    const matcher = plan.matcher.type === "regexp" ? new RegExp(plan.matcher.value, plan.matcher.flags) : plan.matcher.value;
    return { targetSelector: plan.targetSelector, descendantSelector: plan.descendantSelector ?? null, matcher, regexp: plan.matcher.type === "regexp" };
  }

  function candidatesWithin(root, selector, limit) {
    const candidates = [];
    if (root.matches(selector)) candidates.push(root);
    for (const element of root.querySelectorAll(selector)) { if (candidates.length >= limit) break; candidates.push(element); }
    return candidates;
  }

  function matchesText(candidate, rule) {
    const sources = rule.descendantSelector ? candidate.querySelectorAll(rule.descendantSelector) : [candidate];
    for (const source of sources) {
      const value = String(source.textContent ?? "").slice(0, MAX_TEXT_CHARACTERS);
      const matched = rule.regexp ? rule.matcher.test(value) : value.includes(rule.matcher);
      if (rule.regexp) rule.matcher.lastIndex = 0;
      if (matched) return true;
    }
    return false;
  }

  function hide(element) {
    if (element.hasAttribute("data-originmatrix-cosmetic-hidden")) return 0;
    element.setAttribute("data-originmatrix-cosmetic-hidden", "");
    return 1;
  }

  function emptyMetrics() { return { rules: 0, rejectedRules: 0, mutations: 0, batches: 0, nodesEvaluated: 0, elementsHidden: 0 }; }
  globalThis.OriginMatrixProceduralCosmeticFilter = ProceduralCosmeticFilter;
})();
