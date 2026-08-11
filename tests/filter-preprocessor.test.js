import test from "node:test";
import assert from "node:assert/strict";
import { ORIGINMATRIX_FILTER_CAPABILITIES, preprocessFilterText } from "../src/filters/filter-preprocessor.js";

test("declares only capabilities OriginMatrix actually provides", () => {
  assert.equal(ORIGINMATRIX_FILTER_CAPABILITIES.env_chromium, true);
  assert.equal(ORIGINMATRIX_FILTER_CAPABILITIES.env_mv3, true);
  assert.equal(ORIGINMATRIX_FILTER_CAPABILITIES.ext_originmatrix, true);
  assert.equal(ORIGINMATRIX_FILTER_CAPABILITIES.cap_dnr, true);
  assert.equal(ORIGINMATRIX_FILTER_CAPABILITIES.cap_html_filtering, false);
  assert.equal(ORIGINMATRIX_FILTER_CAPABILITIES.cap_ipaddress, false);
});

test("selects supported environment branches and nested conditions", async () => {
  const result = await preprocessFilterText(`!#if env_chromium
||chromium.example^
!#if !cap_html_filtering
||dnr.example^
!#else
||html.example^
!#endif
!#else
||firefox.example^
!#endif`);
  assert.equal(result.source, "||chromium.example^\n||dnr.example^");
  assert.equal(result.diagnostics.directives, 6);
  assert.equal(result.diagnostics.branchesExcluded, 2);
});

test("resolves active includes and skips includes in inactive branches", async () => {
  const requested = [];
  const result = await preprocessFilterText("!#include base.txt\n!#if env_firefox\n!#include firefox.txt\n!#endif", { include: async (name) => { requested.push(name); return name === "base.txt" ? "||included.example^" : null; } });
  assert.equal(result.source, "||included.example^");
  assert.deepEqual(requested, ["base.txt"]);
  assert.equal(result.diagnostics.includesResolved, 1);
});

test("rejects malformed condition structure and unsafe includes", async () => {
  await assert.rejects(preprocessFilterText("!#if env_chromium\n||x.example^"), /Missing !#endif/);
  await assert.rejects(preprocessFilterText("!#if env_chromium && env_mv3\n!#endif"), /Unsupported !#if expression/);
  const unsafe = await preprocessFilterText("!#include ../secret.txt", { include: async () => "secret" });
  assert.equal(unsafe.source, "");
  assert.equal(unsafe.diagnostics.includesSkipped, 1);
});
