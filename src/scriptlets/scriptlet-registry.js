import { abortOnPropertyRead, removeNodeText, setConstant } from "./scriptlet-implementations.js";

const SAFE_PROPERTY = /^(?!.*(?:^|\.)(?:__proto__|prototype|constructor)(?:\.|$))[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*){0,7}$/;
const CONSTANTS = new Set(["true", "false", "null", "undefined", "0", "1", ""]);
export const SCRIPTLET_PHASE = Object.freeze({ EARLY: "early", NORMAL: "normal" });

const BUNDLED_DEFINITIONS = Object.freeze([
  definition("remove-node-text", SCRIPTLET_PHASE.NORMAL, removeNodeText, (args) => args.length === 2 && safeSelector(args[0]) && bounded(args[1], 256)),
  definition("set-constant", SCRIPTLET_PHASE.EARLY, setConstant, (args) => args.length === 2 && SAFE_PROPERTY.test(args[0]) && CONSTANTS.has(args[1])),
  definition("abort-on-property-read", SCRIPTLET_PHASE.EARLY, abortOnPropertyRead, (args) => args.length === 1 && SAFE_PROPERTY.test(args[0])),
]);

export class ScriptletRegistry {
  constructor() {
    this.definitions = new Map();
    this.invocations = new WeakSet();
    for (const item of BUNDLED_DEFINITIONS) {
      validateDefinition(item);
      if (this.definitions.has(item.name)) throw new TypeError(`Duplicate scriptlet: ${item.name}`);
      this.definitions.set(item.name, item);
    }
  }

  list() { return Object.freeze([...this.definitions.keys()].sort()); }
  has(name) { return this.definitions.has(name); }
  getPhase(name) {
    const item = this.definitions.get(name);
    if (!item) throw new TypeError(`Unknown scriptlet: ${name}`);
    return item.phase;
  }

  createInvocation(name, args, attribution = {}) {
    const item = this.definitions.get(name);
    if (!item) throw new TypeError(`Unknown scriptlet: ${name}`);
    if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string") || !item.validateArgs(args)) {
      throw new TypeError(`Invalid arguments for scriptlet: ${name}`);
    }
    const invocation = Object.freeze({ name, phase: item.phase, args: Object.freeze([...args]), implementation: item.implementation, source: attribution.sourceList ?? "Scriptlet", rule: attribution.sourceRule ?? `##+js(${name})` });
    this.invocations.add(invocation);
    return invocation;
  }

  isInvocation(value) { return Boolean(value && this.invocations.has(value)); }
}

function definition(name, phase, implementation, validateArgs) {
  return Object.freeze({ name, phase, implementation, validateArgs });
}

function validateDefinition(item) {
  if (!item || !/^[a-z][a-z0-9-]*$/.test(item.name) || !Object.values(SCRIPTLET_PHASE).includes(item.phase)
    || typeof item.implementation !== "function" || typeof item.validateArgs !== "function") {
    throw new TypeError("Invalid bundled scriptlet definition.");
  }
}

function safeSelector(value) {
  return bounded(value, 512) && !/[{}\u0000-\u001f\u007f]/.test(value) && !/:has\s*\(/i.test(value);
}

function bounded(value, maximum) { return typeof value === "string" && value.length > 0 && value.length <= maximum; }
