import { FILTER_TYPE, validateFilter } from "../filters/filter-model.js";

const PROCEDURAL_SELECTOR = /:(?:contains|has-text|matches-css|matches-path|remove|style|upward|watch-attr|xpath)\s*\(/i;

export class CosmeticParser {
  parseModels(filters) {
    if (!Array.isArray(filters)) throw new TypeError("Cosmetic filter input must be an array.");
    const supported = [];
    const unsupported = [];
    for (const input of filters) {
      if (input?.type !== FILTER_TYPE.COSMETIC) continue;
      const filter = validateFilter(input);
      const reason = unsupportedReason(filter.selector);
      if (reason) unsupported.push(Object.freeze({ filter, reason }));
      else supported.push(filter);
    }
    return Object.freeze({ filters: Object.freeze(supported), unsupported: Object.freeze(unsupported) });
  }
}

function unsupportedReason(selector) {
  if (selector.length > 1_024) return "selector-too-long";
  if (/[{}\u0000-\u001f\u007f]/.test(selector) || selector.startsWith("@")) return "unsafe-selector-syntax";
  if (PROCEDURAL_SELECTOR.test(selector) || /(?:##|#@#|#\?#|#\$#)/.test(selector)) return "procedural-selector-not-supported";
  return null;
}
