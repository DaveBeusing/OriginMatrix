import test from "node:test";
import assert from "node:assert/strict";
import { parseFilterText } from "../src/filters/filter-parser.js";
import { resolveFilterSemantics } from "../src/filters/filter-semantics-resolver.js";
import { NetworkFilterCompiler, NETWORK_FILTER_PRIORITY } from "../src/filters/network-filter-compiler.js";
import { AutomaticFilterResolver } from "../src/filters/automatic-filter-resolver.js";

test("badfilter disables the matching normalized rule regardless of attribution", () => {
  const parsed = parseFilterText("! OriginMatrix source: Ads\n||ads.example^$script\n! OriginMatrix source: Fixes\n||ads.example^$script,badfilter\n||other.example^");
  const result = resolveFilterSemantics(parsed.filters);
  assert.deepEqual(result.filters.map(({ pattern }) => pattern), ["||other.example^"]);
  assert.deepEqual(result.diagnostics, { filtersReceived: 3, badfilterDirectives: 1, filtersDisabled: 2 });
});

test("important precedence is translated only after semantic resolution", () => {
  const parsed = parseFilterText("||ads.example^\n@@||ads.example^\n||ads.example^$important\n@@||cdn.example^$important");
  const result = new NetworkFilterCompiler().compile(parsed.filters);
  assert.deepEqual(result.rules.map(({ priority }) => priority).sort((a, b) => a - b), [
    NETWORK_FILTER_PRIORITY.block, NETWORK_FILTER_PRIORITY.exception,
    NETWORK_FILTER_PRIORITY.importantBlock, NETWORK_FILTER_PRIORITY.importantException,
  ]);
});

test("automatic decisions use semantic importance instead of exception presence", () => {
  const filters = parseFilterText("@@||ads.example^\n||ads.example^$important").filters;
  const resolver = new AutomaticFilterResolver();
  resolver.activate(resolver.prepare(filters, { source: "Fixture" }));
  assert.equal(resolver.resolve({ topDomain: "site.example", targetDomain: "ads.example", resourceType: "script", party: "thirdParty" }).action, "block");
});
