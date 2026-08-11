import { access, readFile, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(await read("manifest.json"));
const packageDocument = JSON.parse(await read("package.json"));
const failures = [];

check(manifest.manifest_version === 3, "manifest_version must be 3");
check(manifest.version === packageDocument.version, "manifest and package versions must match");
check(/^\d+\.\d+\.\d+$/.test(manifest.version), "version must contain three numeric components");
check(Number(manifest.minimum_chrome_version) >= 121, "minimum Chromium version must preserve the DNR quota baseline");
check(!("update_url" in manifest), "repository builds must not declare an update_url");
check(!("externally_connectable" in manifest), "external runtime messaging must remain disabled");
check(!packageDocument.dependencies, "release must remain runtime-dependency free");

const referencedFiles = [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  manifest.options_ui?.page,
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action?.default_icon ?? {}),
  ...(manifest.content_scripts ?? []).flatMap(({ js = [], css = [] }) => [...js, ...css]),
  ...(manifest.declarative_net_request?.rule_resources ?? []).map(({ path }) => path),
  ...(manifest.web_accessible_resources ?? []).flatMap(({ resources = [] }) => resources),
].filter(Boolean);
for (const path of new Set(referencedFiles)) {
  try { await access(resolve(root, path), constants.R_OK); }
  catch { failures.push(`manifest path is missing: ${path}`); }
}

for (const path of await sourceFiles(resolve(root, "src"))) {
  const source = await readFile(path, "utf8");
  check(!/\b(?:eval|Function)\s*\(/.test(source), `dynamic code execution found in ${path}`);
  check(!/\.(?:innerHTML|outerHTML)\s*=|insertAdjacentHTML\s*\(/.test(source), `unsafe HTML sink found in ${path}`);
  check(!/(?:import\s+|from\s+)["']https?:\/\//.test(source), `remote JavaScript import found in ${path}`);
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`OriginMatrix ${manifest.version} release validation passed (${referencedFiles.length} manifest assets checked).`);
}

async function read(path) { return readFile(resolve(root, path), "utf8"); }
function check(condition, failure) { if (!condition) failures.push(failure); }
async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : entry.name.endsWith(".js") ? [path] : [];
  }));
  return nested.flat();
}
