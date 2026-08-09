(() => {
  const contentScriptStarted = performance.now();
  const injector = new globalThis.OriginMatrixCosmeticInjector(document);
  let evaluationGeneration = 0;
  let activeNavigationId = "initial";
  const dynamicFilter = new globalThis.OriginMatrixDynamicCosmeticFilter({
    documentObject: document,
    onMetrics: (metrics) => chrome.runtime.sendMessage({
      type: "REPORT_COSMETIC_METRICS",
      elementsHidden: metrics.elementsHidden,
      mutations: metrics.mutations,
      batches: metrics.batches,
      rootsScanned: metrics.rootsScanned,
      scanTimeMs: metrics.scanTimeMs,
      maxScanTimeMs: metrics.maxScanTimeMs,
      contentScriptSetupMs: Math.max(0, performance.now() - contentScriptStarted),
    })
      .catch((error) => console.warn("OriginMatrix cosmetic metrics unavailable", error)),
  });
  const proceduralFilter = new globalThis.OriginMatrixProceduralCosmeticFilter({ documentObject: document });
  const earlyScriptlets = evaluate("initial", { cosmetics: true, scriptletPhase: "early" });
  const runNormalScriptlets = () => earlyScriptlets.then(() => {
    if (activeNavigationId === "initial") return runScriptlets("normal", "initial");
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", runNormalScriptlets, { once: true });
  else runNormalScriptlets();

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "ORIGINMATRIX_SPA_NAVIGATION" || typeof message.navigationId !== "string") return;
    if (message.navigationId === activeNavigationId) return;
    activeNavigationId = message.navigationId;
    evaluate(message.navigationId, { cosmetics: true, scriptletPhase: "early" })
      .then(() => {
        if (activeNavigationId === message.navigationId) return runScriptlets("normal", message.navigationId);
      });
  });

  async function evaluate(navigationId, { cosmetics, scriptletPhase }) {
    const generation = ++evaluationGeneration;
    const tasks = [runScriptlets(scriptletPhase, navigationId)];
    if (cosmetics) tasks.push(chrome.runtime.sendMessage({ type: "GET_COSMETIC_SELECTORS", hostname: location.hostname })
      .then((response) => {
        if (!response?.ok) throw new Error(response?.error ?? "Cosmetic Engine did not respond.");
        if (generation !== evaluationGeneration) return;
        injector.apply(response.selectors);
        dynamicFilter.start(response.dynamicSelectors ?? response.selectors);
        proceduralFilter.start(response.proceduralFilters ?? []);
        globalThis.OriginMatrixCosmeticMetrics = () => dynamicFilter.getMetrics();
        globalThis.OriginMatrixProceduralMetrics = () => proceduralFilter.getMetrics();
      })
      .catch((error) => console.warn("OriginMatrix cosmetic filtering unavailable", error)));
    await Promise.all(tasks);
  }

  function runScriptlets(phase, navigationId) {
    return chrome.runtime.sendMessage({ type: "RUN_SCRIPTLETS", phase, navigationId })
      .then((response) => { if (!response?.ok) throw new Error(response?.error ?? "Scriptlet Engine did not respond."); return response; })
      .catch((error) => { console.warn(`OriginMatrix ${phase} scriptlets unavailable`, error); return { ok: false, executed: 0 }; });
  }
})();
