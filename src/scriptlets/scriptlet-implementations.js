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
  const constants = { true: true, false: false, null: null, undefined: undefined, "0": 0, "1": 1, "": "" };
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
