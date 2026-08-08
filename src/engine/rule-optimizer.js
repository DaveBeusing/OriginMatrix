export class RuleOptimizer {
  optimize(rules) {
    const seen = new Map();
    const optimized = [];
    for (const rule of rules) {
      const signature = stableStringify({ priority: rule.priority, action: rule.action, condition: rule.condition });
      if (seen.has(signature)) continue;
      seen.set(signature, rule.id);
      optimized.push(rule);
    }
    return { rules: optimized, optimizedAway: rules.length - optimized.length };
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
