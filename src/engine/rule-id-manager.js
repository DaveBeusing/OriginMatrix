import { DYNAMIC_RULE_RANGES, SESSION_RULE_RANGE } from "../network/rule-ranges.js";

const PERSISTENT_MIN = DYNAMIC_RULE_RANGES.matrix.minimum;
const PERSISTENT_SIZE = DYNAMIC_RULE_RANGES.matrix.maximum - PERSISTENT_MIN + 1;
const SESSION_MIN = SESSION_RULE_RANGE.minimum;
const SESSION_SIZE = SESSION_RULE_RANGE.maximum - SESSION_MIN + 1;

export class RuleIdManager {
  assign(policies) {
    const persistentCount = policies.filter((policy) => !policy.temporary).length;
    const sessionCount = policies.length - persistentCount;
    if (persistentCount > PERSISTENT_SIZE || sessionCount > SESSION_SIZE) {
      throw new RangeError("Policy count exceeds the reserved DNR rule-ID range.");
    }
    const used = new Map();
    return new Map([...policies]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((policy) => {
        const [minimum, size] = policy.temporary
          ? [SESSION_MIN, SESSION_SIZE]
          : [PERSISTENT_MIN, PERSISTENT_SIZE];
        let id = minimum + (stableHash(policy.id) % size);
        while (used.has(id) && used.get(id) !== policy.id) id = minimum + ((id - minimum + 1) % size);
        used.set(id, policy.id);
        return [policy.id, id];
      }));
  }
}

export function stableHash(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
