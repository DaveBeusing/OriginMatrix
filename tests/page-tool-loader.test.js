import test from "node:test";
import assert from "node:assert/strict";
import { ON_DEMAND_PAGE_TOOL_FILES, PageToolLoader } from "../src/background/page-tool-loader.js";

test("injects picker tools into the top frame only when requested", async () => {
  const calls = [];
  const loader = new PageToolLoader({ scripting: { async executeScript(input) { calls.push(["inject", input]); } }, tabs: { async sendMessage(...args) { calls.push(["message", ...args]); } } });
  await loader.startElementPicker(7);
  assert.deepEqual(calls, [
    ["inject", { target: { tabId: 7, frameIds: [0] }, files: [...ON_DEMAND_PAGE_TOOL_FILES] }],
    ["message", 7, { type: "ORIGINMATRIX_START_ELEMENT_PICKER" }, { frameId: 0 }],
  ]);
});

test("rejects invalid picker targets before injection", async () => {
  const loader = new PageToolLoader({ scripting: { executeScript() { throw new Error("unexpected"); } }, tabs: {} });
  await assert.rejects(loader.startElementPicker(-1), /tab ID/);
});
