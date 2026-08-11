export function removeNodeText(selector, needle) {
  if (typeof selector !== "string" || typeof needle !== "string" || !selector || !needle) return false;
  let visited = 0;
  for (const root of document.querySelectorAll(selector)) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode()) && visited < 1_000) {
      visited += 1;
      if (node.nodeValue.includes(needle)) node.nodeValue = node.nodeValue.split(needle).join("");
    }
    if (visited >= 1_000) break;
  }
  return visited > 0;
}

export function setConstant(propertyPath, token) {
  const constants = { true: true, false: false, null: null, undefined: undefined, "0": 0, "1": 1, "": "", noopFunc: () => {}, "{}": Object.freeze({}) };
  if (!Object.prototype.hasOwnProperty.call(constants, token)) return false;
  const parts = typeof propertyPath === "string" ? propertyPath.split(".") : [];
  if (parts.length === 0 || parts.length > 8 || parts.some((part) => !/^[A-Za-z_$][\w$]*$/.test(part) || ["__proto__", "prototype", "constructor"].includes(part))) return false;
  let owner = globalThis;
  for (const part of parts.slice(0, -1)) {
    owner = owner?.[part];
    if ((typeof owner !== "object" || owner === null) && typeof owner !== "function") return false;
  }
  const property = parts.at(-1);
  const descriptor = Object.getOwnPropertyDescriptor(owner, property);
  if (descriptor && descriptor.configurable === false) return false;
  Object.defineProperty(owner, property, { configurable: true, get: () => constants[token], set: () => {} });
  return true;
}

export function setLocalStorageItem(key, token) {
  if (typeof key !== "string" || !key || key.length > 128 || /[\u0000-\u001f\u007f]/.test(key)) return false;
  if (!new Set(["$remove$", "true", "false", "0", "1", "null", "undefined", ""]).has(token)) return false;
  try {
    if (token === "$remove$") globalThis.localStorage.removeItem(key);
    else globalThis.localStorage.setItem(key, token);
    return true;
  } catch { return false; }
}

export function abortOnPropertyRead(propertyPath) {
  const parts = typeof propertyPath === "string" ? propertyPath.split(".") : [];
  if (parts.length === 0 || parts.length > 8 || parts.some((part) => !/^[A-Za-z_$][\w$]*$/.test(part) || ["__proto__", "prototype", "constructor"].includes(part))) return false;
  let owner = globalThis;
  for (const part of parts.slice(0, -1)) {
    owner = owner?.[part];
    if ((typeof owner !== "object" || owner === null) && typeof owner !== "function") return false;
  }
  const property = parts.at(-1);
  const descriptor = Object.getOwnPropertyDescriptor(owner, property);
  if (descriptor && descriptor.configurable === false) return false;
  Object.defineProperty(owner, property, {
    configurable: true,
    get() { throw new ReferenceError(`OriginMatrix aborted access to ${propertyPath}`); },
    set: () => {},
  });
  return true;
}

export function abortOnPropertyWrite(propertyPath) {
  const parts = typeof propertyPath === "string" ? propertyPath.split(".") : [];
  if (parts.length === 0 || parts.length > 8 || parts.some((part) => !/^[A-Za-z_$][\w$]*$/.test(part) || ["__proto__", "prototype", "constructor"].includes(part))) return false;
  let owner = globalThis;
  for (const part of parts.slice(0, -1)) {
    owner = owner?.[part];
    if ((typeof owner !== "object" || owner === null) && typeof owner !== "function") return false;
  }
  const property = parts.at(-1);
  const descriptor = Object.getOwnPropertyDescriptor(owner, property);
  if (descriptor && descriptor.configurable === false) return false;
  let current = descriptor?.value;
  Object.defineProperty(owner, property, {
    configurable: true,
    get: () => current,
    set() { throw new ReferenceError(`OriginMatrix aborted write to ${propertyPath}`); },
  });
  return true;
}

export function jsonPrune(rawPaths, rawRequiredPaths = "") {
  const parsePaths = (source) => typeof source === "string" ? source.trim().split(/\s+/).filter(Boolean).map((path) => path.split(".")) : [];
  const safe = (parts) => parts.length > 0 && parts.length <= 8 && parts.every((part) => /^[A-Za-z_$][\w$]*$/.test(part) && !["__proto__", "prototype", "constructor"].includes(part));
  const paths = parsePaths(rawPaths);
  const required = parsePaths(rawRequiredPaths);
  if (paths.length === 0 || paths.length > 16 || required.length > 16 || [...paths, ...required].some((parts) => !safe(parts))) return false;
  const registryKey = Symbol.for("originmatrix.json-prune");
  const existing = globalThis[registryKey];
  if (existing?.paths) {
    existing.paths.push({ paths, required });
    return true;
  }
  const nativeParse = JSON.parse;
  const rules = [{ paths, required }];
  const hasPath = (root, parts) => {
    let value = root;
    for (const part of parts) {
      if ((typeof value !== "object" || value === null) || !Object.prototype.hasOwnProperty.call(value, part)) return false;
      value = value[part];
    }
    return true;
  };
  const removePath = (root, parts) => {
    let owner = root;
    for (const part of parts.slice(0, -1)) {
      if (typeof owner !== "object" || owner === null) return;
      owner = owner[part];
    }
    if (typeof owner === "object" && owner !== null) delete owner[parts.at(-1)];
  };
  Object.defineProperty(globalThis, registryKey, { value: { paths: rules }, configurable: false });
  JSON.parse = new Proxy(nativeParse, {
    apply(target, thisArg, args) {
      const value = Reflect.apply(target, thisArg, args);
      if (typeof value !== "object" || value === null) return value;
      for (const rule of rules) {
        if (rule.required.every((parts) => hasPath(value, parts))) for (const parts of rule.paths) removePath(value, parts);
      }
      return value;
    },
  });
  return true;
}

export function removeAttribute(attribute, selector = `[${attribute}]`, behavior = "") {
  if (typeof attribute !== "string" || !/^[a-z_:][a-z0-9_:.-]{0,63}$/i.test(attribute) || typeof selector !== "string" || !selector || selector.length > 512) return false;
  if (behavior && !/^(?:asap|stay)(?:\s+(?:asap|stay))?$/.test(behavior)) return false;
  const apply = (root) => {
    if (root?.nodeType === 1 && root.matches?.(selector)) root.removeAttribute(attribute);
    for (const element of root?.querySelectorAll?.(selector) ?? []) element.removeAttribute(attribute);
  };
  try { apply(document); } catch { return false; }
  if (behavior.includes("stay") && document.documentElement) {
    const observer = new MutationObserver((records) => { for (const record of records) for (const node of record.addedNodes) apply(node); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  return true;
}
