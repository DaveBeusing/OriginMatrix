(() => {
  const contentScriptStarted = performance.now();
  const injector = new globalThis.OriginMatrixCosmeticInjector(document);
  let evaluationGeneration = 0;
  let activeNavigationId = "initial";
  let playabilityTimer = typeof document.querySelectorAll === "function" ? schedulePlayabilityCheck() : null;
  if (typeof document.addEventListener === "function") document.addEventListener("error", (event) => {
    const tag = event.target?.tagName?.toLowerCase();
    if (tag === "video" || tag === "audio") reportBreakage("media-error", `media error code ${event.target.error?.code ?? "unknown"}`);
  }, true);
  let proceduralFilter;
  const dynamicFilter = new globalThis.OriginMatrixDynamicCosmeticFilter({
    documentObject: document,
    onMetrics: reportCosmeticMetrics,
  });
  proceduralFilter = new globalThis.OriginMatrixProceduralCosmeticFilter({ documentObject: document, onMetrics: reportCosmeticMetrics });

  function reportCosmeticMetrics() {
    const metrics = dynamicFilter.getMetrics();
    const procedural = proceduralFilter?.getMetrics() ?? {};
    chrome.runtime.sendMessage({
      type: "REPORT_COSMETIC_METRICS",
      elementsHidden: metrics.elementsHidden + (procedural.elementsHidden ?? 0),
      mutations: metrics.mutations,
      batches: metrics.batches,
      rootsScanned: metrics.rootsScanned,
      scanTimeMs: metrics.scanTimeMs,
      maxScanTimeMs: metrics.maxScanTimeMs,
      rootEscalations: metrics.rootEscalations,
      containmentChecks: metrics.containmentChecks,
      fastSelectors: metrics.fastSelectors,
      complexSelectors: metrics.complexSelectors,
      proceduralBatches: procedural.batches ?? 0,
      proceduralMutations: procedural.mutations ?? 0,
      proceduralRootsScanned: procedural.rootsScanned ?? 0,
      proceduralNodesEvaluated: procedural.nodesEvaluated ?? 0,
      contentScriptSetupMs: Math.max(0, performance.now() - contentScriptStarted),
    })
      .catch((error) => console.warn("OriginMatrix cosmetic metrics unavailable", error));
  }
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
    clearTimeout(playabilityTimer);
    playabilityTimer = typeof document.querySelectorAll === "function" ? schedulePlayabilityCheck() : null;
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

  function schedulePlayabilityCheck() {
    return setTimeout(() => {
      const media = [...document.querySelectorAll("video, audio")].slice(0, 8);
      if (media.length && media.every((element) => element.readyState === 0)) reportBreakage("media-not-playable", `${media.length} media element(s) have no playable data`);
    }, 15_000);
  }

  function reportBreakage(type, details) {
    chrome.runtime.sendMessage({ type: "REPORT_BREAKAGE_SIGNAL", signalType: type, details })
      .catch((error) => console.warn("OriginMatrix page-health signal unavailable", error));
  }
})();
