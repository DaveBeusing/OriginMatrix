import test from "node:test";
import assert from "node:assert/strict";

await import("../src/cosmetic/dynamic-cosmetic-filter.js");
const DynamicCosmeticFilter = globalThis.OriginMatrixDynamicCosmeticFilter;

class FakeElement {
  constructor(selectors = [], children = []) {
    this.nodeType = 1;
    this.selectors = new Set(selectors);
    this.children = children;
    this.attributes = new Set();
  }

  matches(group) {
    if (group.includes("[invalid")) throw new SyntaxError("invalid selector");
    return group.split(",").some((selector) => this.selectors.has(selector));
  }

  querySelectorAll(group) {
    return this.children.flatMap((child) => [
      ...(child.matches(group) ? [child] : []),
      ...child.querySelectorAll(group),
    ]);
  }

  contains(candidate) { return this === candidate || this.children.some((child) => child.contains(candidate)); }
  hasAttribute(name) { return this.attributes.has(name); }
  setAttribute(name) { this.attributes.add(name); }
}

class FakeObserver {
  constructor(callback) { this.callback = callback; FakeObserver.instance = this; }
  observe(target, options) { this.target = target; this.options = options; }
  disconnect() { this.disconnected = true; }
}

test("batches mutations, removes nested roots, and records scan metrics", () => {
  const existing = new FakeElement([".ad"]);
  const documentElement = new FakeElement([], [existing]);
  const documentObject = { documentElement };
  const scheduled = [];
  let clock = 0;
  const filter = new DynamicCosmeticFilter({
    documentObject,
    Observer: FakeObserver,
    schedule: (callback) => { scheduled.push(callback); return scheduled.length; },
    cancel: () => {},
    now: () => { clock += 2; return clock; },
  });

  filter.start([".ad", "#sponsor", ".ad"]);
  assert.equal(scheduled.length, 1);
  scheduled.shift()();
  assert.equal(existing.hasAttribute("data-originmatrix-cosmetic-hidden"), true);

  const child = new FakeElement(["#sponsor"]);
  const parent = new FakeElement([], [child]);
  FakeObserver.instance.callback([
    { type: "childList", addedNodes: [child] },
    { type: "childList", addedNodes: [parent] },
    { type: "attributes", target: parent, addedNodes: [] },
  ]);
  assert.equal(scheduled.length, 1);
  scheduled.shift()();

  assert.equal(child.hasAttribute("data-originmatrix-cosmetic-hidden"), true);
  assert.deepEqual(filter.getMetrics(), {
    selectors: 2, fastSelectors: 2, complexSelectors: 0,
    invalidSelectors: 0,
    mutations: 3,
    batches: 2,
    rootsScanned: 2,
    rootEscalations: 0,
    containmentChecks: 3,
    elementsHidden: 2,
    scanTimeMs: 4,
    maxScanTimeMs: 2,
  });
  assert.deepEqual(FakeObserver.instance.options.attributeFilter, ["class", "id"]);
});

test("prepares selector fast paths and observes only required attributes", () => {
  const callbacks = [];
  const filter = new DynamicCosmeticFilter({ documentObject: { documentElement: new FakeElement() }, Observer: FakeObserver, schedule(callback) { callbacks.push(callback); return callbacks.length; }, cancel() {} });
  let metrics = filter.start(["article", ".ad", "main > .sponsor", "[data-ad-slot]"]);
  assert.equal(metrics.fastSelectors, 3);
  assert.equal(metrics.complexSelectors, 1);
  assert.deepEqual(FakeObserver.instance.options.attributeFilter, ["class", "data-ad-slot"]);
  filter.start(["article", "aside"]);
  assert.equal("attributes" in FakeObserver.instance.options, false);
});

test("deduplicates nested roots and escalates a large burst to one document scan", () => {
  const callbacks = [];
  const documentElement = new FakeElement();
  const filter = new DynamicCosmeticFilter({ documentObject: { documentElement }, Observer: FakeObserver, schedule(callback) { callbacks.push(callback); return callbacks.length; }, cancel() {}, maxQueuedRoots: 2 });
  filter.start([".ad"]); callbacks.shift()();
  const first = new FakeElement(); const second = new FakeElement(); const third = new FakeElement();
  documentElement.children.push(first, second, third);
  filter.enqueue(first); filter.enqueue(first); filter.enqueue(second); filter.enqueue(third);
  callbacks.shift()();
  const metrics = filter.getMetrics();
  assert.equal(metrics.rootEscalations, 1);
  assert.equal(metrics.rootsScanned, 2);
  assert.ok(metrics.containmentChecks > 0);
});

test("caches valid selector groups and excludes invalid selectors", () => {
  const documentElement = new FakeElement();
  const scheduled = [];
  const filter = new DynamicCosmeticFilter({
    documentObject: { documentElement },
    Observer: FakeObserver,
    schedule: (callback) => { scheduled.push(callback); return 1; },
    cancel: () => {},
    selectorGroupSize: 1,
  });
  const metrics = filter.start([".ad", "[invalid"]);
  assert.equal(metrics.selectors, 1);
  assert.equal(metrics.invalidSelectors, 1);
  assert.equal(filter.selectorCache.size, 1);
  filter.start([".ad", "[invalid"]);
  assert.equal(filter.selectorCache.size, 1);
});

test("reports batched cumulative cosmetic metrics", () => {
  const existing = new FakeElement([".ad"]);
  const scheduled = [];
  const reported = [];
  const filter = new DynamicCosmeticFilter({
    documentObject: { documentElement: new FakeElement([], [existing]) }, Observer: FakeObserver,
    schedule: (callback) => { scheduled.push(callback); return 1; }, cancel: () => {}, onMetrics: (metrics) => reported.push(metrics.elementsHidden),
  });
  filter.start([".ad"]);
  scheduled.shift()();
  assert.deepEqual(reported, [1]);
});
