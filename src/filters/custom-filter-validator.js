import { parseFilterText } from "./filter-parser.js";
import { CosmeticParser } from "../cosmetic/cosmetic-parser.js";
import { ScriptletEngine } from "../scriptlets/scriptlet-engine.js";

export const CUSTOM_FILTER_SOURCE_LIMIT = 200_000;

export function validateCustomFilters(source) {
  if (typeof source !== "string") throw new TypeError("My Filters must be text.");
  if (source.length > CUSTOM_FILTER_SOURCE_LIMIT) throw new RangeError("My Filters exceeds the 200,000 character limit.");
  const parsed = parseFilterText(source);
  const errors = parsed.unsupported.map(({ line, source: rule, reason, details }) => Object.freeze({ line, rule, reason, details: details ?? null }));
  const lineByRule = new Map(source.split(/\r?\n/).map((rule, index) => [rule.trim(), index + 1]));
  const cosmetic = new CosmeticParser().parseModels(parsed.filters);
  const scriptlets = new ScriptletEngine({ api: null }).prepareGeneration(parsed.filters);
  for (const { filter, reason } of [...cosmetic.unsupported, ...scriptlets.unsupported]) {
    errors.push(Object.freeze({ line: lineByRule.get(filter.sourceRule) ?? 0, rule: filter.sourceRule ?? filter.selector ?? filter.name, reason, details: null }));
  }
  return Object.freeze({
    valid: errors.length === 0,
    source,
    errors: Object.freeze(errors),
    supported: parsed.filters.length - cosmetic.unsupported.length - scriptlets.unsupported.length,
    ignored: parsed.ignored.length,
  });
}
