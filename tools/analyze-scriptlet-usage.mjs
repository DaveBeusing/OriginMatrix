import { readFile } from "node:fs/promises";
import { analyzeScriptletUsage } from "../src/diagnostics/scriptlet-usage.js";
import { EASYLIST } from "../src/filters/filter-list-catalog.js";

const source = await readFile(new URL(`../${EASYLIST.path}`, import.meta.url), "utf8");
const analysis = analyzeScriptletUsage(source, {
  relevantDomains: ["youtube.com", "youtube-nocookie.com", "youtubei.googleapis.com", "googlevideo.com", "ytimg.com", "googleads.g.doubleclick.net"],
});
console.log(JSON.stringify({ filterList: EASYLIST.title, version: EASYLIST.snapshotVersion, ...analysis }, null, 2));
