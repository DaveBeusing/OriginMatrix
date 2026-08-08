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
    selectors: 2,
    invalidSelectors: 0,
    mutations: 3,
    batches: 2,
    rootsScanned: 2,
    elementsHidden: 2,
    scanTimeMs: 4,
    maxScanTimeMs: 2,
  });
  assert.deepEqual(FakeObserver.instance.options.attributeFilter, ["class", "id"]);
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
