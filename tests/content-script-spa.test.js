import test from "node:test";
import assert from "node:assert/strict";

test("re-evaluates cosmetic filters and scriptlet phases after an SPA route change", async () => {
  const messages = [];
  let navigationListener;
  const applied = [];
  const dynamic = [];
  globalThis.location = { hostname: "video.example.com" };
  globalThis.document = { readyState: "complete" };
  globalThis.chrome = { runtime: {
    onMessage: { addListener(listener) { navigationListener = listener; } },
    async sendMessage(message) {
      messages.push(message);
      if (message.type === "GET_COSMETIC_SELECTORS") return { ok: true, selectors: [".ad"], dynamicSelectors: [".site-ad"] };
      return { ok: true, executed: 0 };
    },
  } };
  globalThis.OriginMatrixCosmeticInjector = class { apply(selectors) { applied.push(selectors); } };
  globalThis.OriginMatrixDynamicCosmeticFilter = class {
    start(selectors) { dynamic.push(selectors); }
    getMetrics() { return {}; }
  };
  globalThis.OriginMatrixProceduralCosmeticFilter = class {
    start() {}
    getMetrics() { return {}; }
  };

  await import(`../src/cosmetic/content-script.js?spa=${Date.now()}`);
  await new Promise((resolve) => setTimeout(resolve, 0));
  navigationListener({ type: "ORIGINMATRIX_SPA_NAVIGATION", url: "https://video.example.com/watch?v=B", navigationId: "20:2" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  navigationListener({ type: "ORIGINMATRIX_SPA_NAVIGATION", url: "https://video.example.com/watch?v=B", navigationId: "20:2" });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(applied, [[".ad"], [".ad"]]);
  assert.deepEqual(dynamic, [[".site-ad"], [".site-ad"]]);
  assert.deepEqual(messages.filter(({ type }) => type === "RUN_SCRIPTLETS").map(({ phase, navigationId }) => [phase, navigationId]), [
    ["early", "initial"], ["normal", "initial"], ["early", "20:2"], ["normal", "20:2"],
  ]);
});
