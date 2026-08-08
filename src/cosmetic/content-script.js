(() => {
  const injector = new globalThis.OriginMatrixCosmeticInjector(document);
  chrome.runtime.sendMessage({ type: "GET_COSMETIC_SELECTORS", hostname: location.hostname })
    .then((response) => {
      if (!response?.ok) throw new Error(response?.error ?? "Cosmetic Engine did not respond.");
      injector.apply(response.selectors);
    })
    .catch((error) => console.warn("OriginMatrix cosmetic filtering unavailable", error));
})();
