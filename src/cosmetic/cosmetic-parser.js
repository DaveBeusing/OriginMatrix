import { FILTER_TYPE, validateFilter } from "../filters/filter-model.js";

const PROCEDURAL_SELECTOR = /:(?:contains|has-text|matches-css|matches-path|remove|style|upward|watch-attr|xpath)\s*\(/i;
const SUPPORTED_PROCEDURAL_SELECTOR = /:has-text\s*\(/i;

export class CosmeticParser {
  parseModels(filters) {
    if (!Array.isArray(filters)) throw new TypeError("Cosmetic filter input must be an array.");
    const supported = [];
    const proceduralFilters = [];
    const genericHideExceptions = [];
    const unsupported = [];
    for (const input of filters) {
      if (input?.type === FILTER_TYPE.COSMETIC_CONTROL) { genericHideExceptions.push(validateFilter(input)); continue; }
      if (input?.type !== FILTER_TYPE.COSMETIC) continue;
      const filter = validateFilter(input);
      if (SUPPORTED_PROCEDURAL_SELECTOR.test(filter.selector)) {
        try { proceduralFilters.push(Object.freeze({ filter, plan: compileHasText(filter.selector) })); }
        catch (error) { unsupported.push(Object.freeze({ filter, reason: error.message })); }
        continue;
      }
      const reason = unsupportedReason(filter.selector);
      if (reason) unsupported.push(Object.freeze({ filter, reason }));
      else supported.push(filter);
    }
    return Object.freeze({ filters: Object.freeze(supported), proceduralFilters: Object.freeze(proceduralFilters), genericHideExceptions: Object.freeze(genericHideExceptions), unsupported: Object.freeze(unsupported) });
  }
}

function compileHasText(selector) {
  if (selector.length > 1_024 || /[{}\u0000-\u001f\u007f]/.test(selector)) throw new TypeError("unsafe-procedural-selector");
  const marker = selector.lastIndexOf(":has-text(");
  if (marker < 1) throw new TypeError("unsupported-procedural-selector");
  const closing = findClosingParenthesis(selector, marker + 10);
  const argument = selector.slice(marker + 10, closing).trim();
  const before = selector.slice(0, marker).trim();
  const after = selector.slice(closing + 1).trim();
  let targetSelector = before;
  let descendantSelector = null;
  const nested = before.lastIndexOf(":has(");
  if (after === ")" && nested > 0) {
    targetSelector = before.slice(0, nested).trim();
    descendantSelector = before.slice(nested + 5).trim();
  } else if (after) throw new TypeError("unsupported-procedural-selector");
  if (!targetSelector || targetSelector.length > 512 || descendantSelector?.length > 256) throw new TypeError("unsafe-procedural-selector");
  return Object.freeze({ targetSelector, descendantSelector, matcher: compileTextMatcher(argument) });
}

function findClosingParenthesis(selector, start) {
  let escaped = false;
  let regexp = selector[start] === "/";
  for (let index = start; index < selector.length; index += 1) {
    const character = selector[index];
    if (escaped) { escaped = false; continue; }
    if (character === "\\") { escaped = true; continue; }
    if (regexp) { if (character === "/" && index > start) regexp = false; continue; }
    if (character === ")") return index;
  }
  throw new TypeError("malformed-procedural-selector");
}

function compileTextMatcher(argument) {
  if (!argument || argument.length > 128) throw new TypeError("unsafe-procedural-text");
  if (argument.startsWith("/")) {
    const end = argument.lastIndexOf("/");
    if (end < 1) throw new TypeError("malformed-procedural-regexp");
    const source = argument.slice(1, end);
    const flags = argument.slice(end + 1);
    if (!/^[imu]*$/.test(flags) || /\\[1-9]|\(\?[=!<]|\((?:[^()\\]|\\.)*(?:\*|\+|\{\d+,?\d*\})[^)]*\)(?:\*|\+|\{)/.test(source)) {
      throw new TypeError("unsafe-procedural-regexp");
    }
    try { new RegExp(source, flags); }
    catch { throw new TypeError("malformed-procedural-regexp"); }
    return Object.freeze({ type: "regexp", value: source, flags });
  }
  return Object.freeze({ type: "text", value: argument });
}

function unsupportedReason(selector) {
  if (selector.length > 1_024) return "selector-too-long";
  if (/[{}\u0000-\u001f\u007f]/.test(selector) || selector.startsWith("@")) return "unsafe-selector-syntax";
  if (PROCEDURAL_SELECTOR.test(selector) || /(?:##|#@#|#\?#|#\$#)/.test(selector)) return "procedural-selector-not-supported";
  return null;
}
