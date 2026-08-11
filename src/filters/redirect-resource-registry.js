const DEFINITIONS = Object.freeze([
  resource("noop.js", ["noopjs"], "/resources/noop.js", ["script", "xmlhttprequest"]),
  resource("empty.json", ["noopjson"], "/resources/empty.json", ["xmlhttprequest"]),
  resource("empty.txt", ["noop.txt", "nooptext"], "/resources/empty.txt", ["xmlhttprequest", "other"]),
]);

const BY_NAME = new Map();
for (const definition of DEFINITIONS) {
  BY_NAME.set(definition.name, definition);
  for (const alias of definition.aliases) BY_NAME.set(alias, definition);
}

export function resolveRedirectResource(name) {
  if (typeof name !== "string") return null;
  return BY_NAME.get(name.trim().toLowerCase()) ?? null;
}

export function listRedirectResources() {
  return Object.freeze(DEFINITIONS.map((definition) => Object.freeze({ ...definition })));
}

function resource(name, aliases, extensionPath, resourceTypes) {
  return Object.freeze({ name, aliases: Object.freeze(aliases), extensionPath, resourceTypes: Object.freeze(resourceTypes) });
}
