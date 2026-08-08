import { abortOnPropertyRead, removeNodeText, setConstant } from "./scriptlet-implementations.js";

const SAFE_PROPERTY = /^(?!.*(?:^|\.)(?:__proto__|prototype|constructor)(?:\.|$))[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*){0,7}$/;
const CONSTANTS = new Set(["true", "false", "null", "undefined", "0", "1", ""]);

const BUNDLED_DEFINITIONS = Object.freeze([
  definition("remove-node-text", removeNodeText, (args) => args.length === 2 && safeSelector(args[0]) && bounded(args[1], 256)),
  definition("set-constant", setConstant, (args) => args.length === 2 && SAFE_PROPERTY.test(args[0]) && CONSTANTS.has(args[1])),
  definition("abort-on-property-read", abortOnPropertyRead, (args) => args.length === 1 && SAFE_PROPERTY.test(args[0])),
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

  createInvocation(name, args) {
    const item = this.definitions.get(name);
    if (!item) throw new TypeError(`Unknown scriptlet: ${name}`);
    if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string") || !item.validateArgs(args)) {
      throw new TypeError(`Invalid arguments for scriptlet: ${name}`);
    }
    const invocation = Object.freeze({ name, args: Object.freeze([...args]), implementation: item.implementation });
    this.invocations.add(invocation);
    return invocation;
  }

  isInvocation(value) { return Boolean(value && this.invocations.has(value)); }
}

function definition(name, implementation, validateArgs) {
  return Object.freeze({ name, implementation, validateArgs });
}

function validateDefinition(item) {
  if (!item || !/^[a-z][a-z0-9-]*$/.test(item.name) || typeof item.implementation !== "function" || typeof item.validateArgs !== "function") {
    throw new TypeError("Invalid bundled scriptlet definition.");
  }
}

function safeSelector(value) {
  return bounded(value, 512) && !/[{}\u0000-\u001f\u007f]/.test(value) && !/:has\s*\(/i.test(value);
}

function bounded(value, maximum) { return typeof value === "string" && value.length > 0 && value.length <= maximum; }
