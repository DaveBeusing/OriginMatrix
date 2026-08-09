(() => {
  const SAFE_CLASS = /^[a-z_-][a-z0-9_-]{0,63}$/i;
  function generate(element, documentObject = document) {
    if (!element || element.nodeType !== 1) throw new TypeError("Element picker requires an element.");
    const escape = globalThis.CSS?.escape ?? ((value) => String(value).replace(/[^a-z0-9_-]/gi, (character) => `\\${character}`));
    if (element.id) {
      const candidate = `#${escape(element.id)}`;
      if (unique(candidate, documentObject)) return candidate;
    }
    const tag = element.localName;
    for (const name of ["data-testid", "data-test", "data-ad-slot"]) {
      const value = element.getAttribute(name);
      if (value && value.length <= 100) {
        const candidate = `${tag}[${name}=${quote(value)}]`;
        if (unique(candidate, documentObject)) return candidate;
      }
    }
    const classes = [...element.classList].filter((name) => SAFE_CLASS.test(name)).slice(0, 3);
    if (classes.length) {
      const candidate = `${tag}${classes.map((name) => `.${escape(name)}`).join("")}`;
      if (unique(candidate, documentObject)) return candidate;
    }
    const parts = [];
    let current = element;
    for (let depth = 0; current && current.nodeType === 1 && depth < 5; depth += 1) {
      let part = current.localName;
      const siblings = current.parentElement ? [...current.parentElement.children].filter((item) => item.localName === current.localName) : [];
      if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
      parts.unshift(part);
      const candidate = parts.join(" > ");
      if (unique(candidate, documentObject)) return candidate;
      current = current.parentElement;
    }
    throw new Error("Could not create a unique bounded selector for this element.");
  }
  function unique(selector, documentObject) { try { return documentObject.querySelectorAll(selector).length === 1; } catch { return false; } }
  function quote(value) { return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`; }
  globalThis.OriginMatrixSelectorGenerator = Object.freeze({ generate });
})();
