(() => {
  class CosmeticInjector {
    constructor(documentObject = document) {
      this.document = documentObject;
      this.style = null;
    }

    apply(selectors) {
      if (!Array.isArray(selectors) || selectors.some((selector) => typeof selector !== "string")) {
        throw new TypeError("Cosmetic selectors must be strings.");
      }
      if (!this.style) {
        this.style = this.document.createElement("style");
        this.style.id = "originmatrix-cosmetic-rules";
        (this.document.head ?? this.document.documentElement).append(this.style);
      }
      this.style.textContent = [
        "[data-originmatrix-cosmetic-hidden] { display: none !important; }",
        ...selectors.map((selector) => `${selector} { display: none !important; }`),
      ].join("\n");
      this.style.dataset.rules = String(selectors.length);
    }
  }

  globalThis.OriginMatrixCosmeticInjector = CosmeticInjector;
})();
