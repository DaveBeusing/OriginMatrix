(() => {
  const contentScriptStarted = performance.now();
  const earlyScriptlets = runScriptlets("early");
  const injector = new globalThis.OriginMatrixCosmeticInjector(document);
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
  chrome.runtime.sendMessage({ type: "GET_COSMETIC_SELECTORS", hostname: location.hostname })
    .then((response) => {
      if (!response?.ok) throw new Error(response?.error ?? "Cosmetic Engine did not respond.");
      injector.apply(response.selectors);
      dynamicFilter.start(response.selectors);
      globalThis.OriginMatrixCosmeticMetrics = () => dynamicFilter.getMetrics();
    })
    .catch((error) => console.warn("OriginMatrix cosmetic filtering unavailable", error));
  const runNormalScriptlets = () => earlyScriptlets.then(() => runScriptlets("normal"));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", runNormalScriptlets, { once: true });
  else runNormalScriptlets();

  function runScriptlets(phase) {
    return chrome.runtime.sendMessage({ type: "RUN_SCRIPTLETS", phase })
      .then((response) => { if (!response?.ok) throw new Error(response?.error ?? "Scriptlet Engine did not respond."); return response; })
      .catch((error) => { console.warn(`OriginMatrix ${phase} scriptlets unavailable`, error); return { ok: false, executed: 0 }; });
  }
})();
