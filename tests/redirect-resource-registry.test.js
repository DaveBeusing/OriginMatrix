import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { listRedirectResources, resolveRedirectResource } from "../src/filters/redirect-resource-registry.js";

test("resolves only bundled reviewed resource aliases", () => {
  assert.equal(resolveRedirectResource("noopjs").name, "noop.js");
  assert.equal(resolveRedirectResource("noopjson").extensionPath, "/resources/empty.json");
  assert.equal(resolveRedirectResource("nooptext").extensionPath, "/resources/empty.txt");
  assert.equal(resolveRedirectResource("google-ima.js"), null);
  assert.equal(listRedirectResources().length, 3);
});

test("manifest exposes exactly the redirect resource registry files", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
  const exposed = manifest.web_accessible_resources.flatMap(({ resources }) => resources).sort();
  assert.deepEqual(exposed, listRedirectResources().map(({ extensionPath }) => extensionPath.slice(1)).sort());
  assert.deepEqual(manifest.web_accessible_resources[0].matches, ["http://*/*", "https://*/*"]);
  for (const resource of exposed) await readFile(new URL(`../${resource}`, import.meta.url));
});
