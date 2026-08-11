import { abortOnPropertyRead, abortOnPropertyWrite, jsonPrune, removeAttribute, removeNodeText, setConstant, setLocalStorageItem } from "./scriptlet-implementations.js";

const SAFE_PROPERTY = /^(?!.*(?:^|\.)(?:__proto__|prototype|constructor)(?:\.|$))[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*){0,7}$/;
const CONSTANTS = new Set(["true", "false", "null", "undefined", "0", "1", "", "noopFunc", "{}"]);
const STORAGE_VALUES = new Set(["$remove$", "true", "false", "0", "1", "null", "undefined", ""]);
const JSON_SEGMENT = String.raw`(?:[A-Za-z_$][\w$]*|\[\]|\[-\])`;
const JSON_PATHS = new RegExp(`^${JSON_SEGMENT}(?:\\.${JSON_SEGMENT}){0,7}(?:\\s+${JSON_SEGMENT}(?:\\.${JSON_SEGMENT}){0,7}){0,15}$`);
const ATTRIBUTE = /^[a-z_:][a-z0-9_:.-]{0,63}$/i;
const BEHAVIOR = /^(?:asap|stay)(?:\s+(?:asap|stay))?$/;
export const SCRIPTLET_PHASE = Object.freeze({ EARLY: "early", NORMAL: "normal" });

const BUNDLED_DEFINITIONS = Object.freeze([
  definition("remove-node-text", ["rmnt", "remove-node-text.js"], SCRIPTLET_PHASE.NORMAL, removeNodeText, (args) => args.length === 2 && safeSelector(args[0]) && bounded(args[1], 256)),
  definition("set-constant", ["set", "set-constant.js"], SCRIPTLET_PHASE.EARLY, setConstant, (args) => args.length === 2 && SAFE_PROPERTY.test(args[0]) && CONSTANTS.has(args[1])),
  definition("set-local-storage-item", ["set-local-storage-item.js"], SCRIPTLET_PHASE.EARLY, setLocalStorageItem, (args) => args.length === 2 && safeStorageKey(args[0]) && STORAGE_VALUES.has(args[1])),
  definition("abort-on-property-read", ["aopr", "abort-on-property-read.js"], SCRIPTLET_PHASE.EARLY, abortOnPropertyRead, (args) => args.length === 1 && SAFE_PROPERTY.test(args[0])),
  definition("abort-on-property-write", ["aopw", "abort-on-property-write.js"], SCRIPTLET_PHASE.EARLY, abortOnPropertyWrite, (args) => args.length === 1 && SAFE_PROPERTY.test(args[0])),
  definition("json-prune", ["json-prune.js"], SCRIPTLET_PHASE.EARLY, jsonPrune, (args) => args.length >= 1 && args.length <= 2 && JSON_PATHS.test(args[0]) && (!args[1] || JSON_PATHS.test(args[1]))),
  definition("remove-attr", ["ra", "remove-attr.js"], SCRIPTLET_PHASE.NORMAL, removeAttribute, domMutationArgs(ATTRIBUTE)),
]);

export class ScriptletRegistry {
  constructor() {
    this.definitions = new Map();
    this.aliases = new Map();
    this.invocations = new WeakSet();
    for (const item of BUNDLED_DEFINITIONS) {
      validateDefinition(item);
      if (this.definitions.has(item.name) || this.aliases.has(item.name)) throw new TypeError(`Duplicate scriptlet: ${item.name}`);
      this.definitions.set(item.name, item);
      for (const alias of item.aliases) {
        if (this.definitions.has(alias) || this.aliases.has(alias)) throw new TypeError(`Duplicate scriptlet alias: ${alias}`);
        this.aliases.set(alias, item.name);
      }
    }
  }

  list() { return Object.freeze([...this.definitions.keys()].sort()); }
  has(name) { return this.definitions.has(this.resolveName(name)); }
  resolveName(name) { return this.aliases.get(name) ?? name; }
  getPhase(name) {
    const item = this.definitions.get(this.resolveName(name));
    if (!item) throw new TypeError(`Unknown scriptlet: ${name}`);
    return item.phase;
  }

  createInvocation(name, args, attribution = {}) {
    const canonicalName = this.resolveName(name);
    const item = this.definitions.get(canonicalName);
    if (!item) throw new TypeError(`Unknown scriptlet: ${name}`);
    if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string") || !item.validateArgs(args)) {
      throw new TypeError(`Invalid arguments for scriptlet: ${name}`);
    }
    const invocation = Object.freeze({ name: canonicalName, phase: item.phase, args: Object.freeze([...args]), implementation: item.implementation, source: attribution.sourceList ?? "Scriptlet", rule: attribution.sourceRule ?? `##+js(${name})` });
    this.invocations.add(invocation);
    return invocation;
  }

  isInvocation(value) { return Boolean(value && this.invocations.has(value)); }
}

function definition(name, aliases, phase, implementation, validateArgs) {
  return Object.freeze({ name, aliases: Object.freeze(aliases), phase, implementation, validateArgs });
}

function validateDefinition(item) {
  if (!item || !/^[a-z][a-z0-9-]*$/.test(item.name) || !Object.values(SCRIPTLET_PHASE).includes(item.phase)
    || !Array.isArray(item.aliases) || item.aliases.some((alias) => !/^[a-z][a-z0-9.-]*$/.test(alias)) || typeof item.implementation !== "function" || typeof item.validateArgs !== "function") {
    throw new TypeError("Invalid bundled scriptlet definition.");
  }
}

function safeSelector(value) {
  return bounded(value, 512) && !/[{}\u0000-\u001f\u007f]/.test(value) && !/:has\s*\(/i.test(value);
}

function safeStorageKey(value) { return bounded(value, 128) && !/[\u0000-\u001f\u007f]/.test(value); }

function domMutationArgs(firstArgument) {
  return (args) => args.length >= 1 && args.length <= 3 && firstArgument.test(args[0]) && (args.length < 2 || safeSelector(args[1])) && (args.length < 3 || BEHAVIOR.test(args[2]));
}

function bounded(value, maximum) { return typeof value === "string" && value.length > 0 && value.length <= maximum; }
