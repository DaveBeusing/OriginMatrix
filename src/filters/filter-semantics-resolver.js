import { FILTER_TYPE, validateFilter } from "./filter-model.js";

export const FILTER_SEMANTIC_PRECEDENCE = Object.freeze({
  block: 1,
  exception: 2,
  importantBlock: 3,
  importantException: 4,
});

export function resolveFilterSemantics(filters) {
  if (!Array.isArray(filters)) throw new TypeError("Filters must be an array.");
  const normalized = filters.map(validateFilter);
  const disabled = new Set(normalized.filter(({ badfilter }) => badfilter).map(semanticTarget));
  const effective = normalized.filter((filter) => !filter.badfilter && !disabled.has(semanticTarget(filter)));
  return Object.freeze({
    filters: Object.freeze(effective),
    diagnostics: Object.freeze({ filtersReceived: normalized.length, badfilterDirectives: normalized.filter(({ badfilter }) => badfilter).length, filtersDisabled: normalized.length - effective.length }),
  });
}

export function filterSemanticPrecedence(filter) {
  const validated = validateFilter(filter);
  if (validated.type === FILTER_TYPE.EXCEPTION) return validated.important ? FILTER_SEMANTIC_PRECEDENCE.importantException : FILTER_SEMANTIC_PRECEDENCE.exception;
  return validated.important ? FILTER_SEMANTIC_PRECEDENCE.importantBlock : FILTER_SEMANTIC_PRECEDENCE.block;
}

function semanticTarget(filter) {
  const { sourceList, sourceRule, badfilter, ...target } = filter;
  return stableStringify(target);
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
