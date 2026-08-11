import test from "node:test";
import assert from "node:assert/strict";
import { FilterListUpdater } from "../src/filters/filter-list-updater.js";

const source = "[Adblock Plus 2.0]\n! Version: 202608081300\n||ads.example^";

function response(text = source, { ok = true, status = 200, length = null } = {}) {
  return { ok, status, headers: { get(name) { return name === "content-length" ? length : null; } }, async text() { return text; } };
}

test("downloads, validates, hashes, and prepares a candidate without activating it", async () => {
  const calls = [];
  const service = {
    list: { sourceUrl: "https://easylist.example/list.txt" },
    async prepareSource(text, metadata) { calls.push({ text, metadata }); return { candidate: true }; },
  };
  const updater = new FilterListUpdater({
    generationStore: { async set() {} }, fetcher: async (_url, options) => { calls.push(options); return response(); },
    now: () => "2026-08-08T13:00:00.000Z", minimumRules: 1,
  });
  const staged = await updater.downloadAndPrepare(service);
  assert.deepEqual(calls[0], { cache: "no-store", credentials: "omit", redirect: "error" });
  assert.equal(staged.metadata.version, "202608081300");
  assert.match(staged.metadata.checksum, /^[a-f0-9]{64}$/);
  assert.deepEqual(staged.prepared, { candidate: true });
});

test("rejects insecure, malformed, undersized, and failed downloads before preparation", async () => {
  const store = { async set() {} };
  const updater = new FilterListUpdater({ generationStore: store, fetcher: async () => response(), minimumRules: 2 });
  await assert.rejects(() => updater.downloadAndPrepare({ list: { sourceUrl: "http://easylist.example/list.txt" } }), /HTTPS/);
  await assert.rejects(() => updater.downloadAndPrepare({ list: { sourceUrl: "https://easylist.example/list.txt" }, prepareSource() {} }), /enough rules/);
  const failed = new FilterListUpdater({ generationStore: store, fetcher: async () => response("", { ok: false, status: 503 }), minimumRules: 1 });
  await assert.rejects(() => failed.downloadAndPrepare({ list: { sourceUrl: "https://easylist.example/list.txt" } }), /HTTP 503/);
});

test("verifies persisted source checksums before reuse", async () => {
  const updater = new FilterListUpdater({ generationStore: { async set() {} }, fetcher: async () => response(), minimumRules: 1 });
  const staged = await updater.downloadAndPrepare({ list: { sourceUrl: "https://easylist.example/list.txt" }, async prepareSource() { return {}; } });
  const service = { async prepareSource() { return { restored: true }; } };
  assert.deepEqual((await updater.prepareStored(service, { source: staged.source, ...staged.metadata })).prepared, { restored: true });
  await assert.rejects(() => updater.prepareStored(service, { source: `${staged.source}\n||tampered.example^`, ...staged.metadata }), /checksum/);
});

test("accepts official uAssets title and Last modified metadata", async () => {
  const uAssets = "! Title: uBlock filters – Test\n! Last modified: Tue, 11 Aug 2026 15:16:33 +0000\n||ads.example^";
  const updater = new FilterListUpdater({ generationStore: { async set() {} }, fetcher: async () => response(uAssets), minimumRules: 1 });
  const staged = await updater.downloadAndPrepare({ list: { sourceUrl: "https://ublockorigin.github.io/uAssets/filters/test.txt" }, async prepareSource() { return {}; } });
  assert.equal(staged.metadata.version, "20260811151633");
});
