# Scriptlet coverage

## Enabled-list demand analysis

OriginMatrix 1.23.0 analyzes every enabled filter list plus My Filters before expanding executable scriptlets. The development CLI inventories all six bundled snapshots so compatibility work can be ranked before opt-in lists are enabled. Run it for any hostname with:

```sh
node tools/analyze-scriptlet-usage.mjs youtube.com
```

The dashboard uses the same analyzer. It applies positive and excluded domain scopes, treats global rules as relevant to every valid hostname, resolves supported aliases through the bundled registry, records execution phases, deduplicates exact rules within each source, and reports both overall and hostname-specific coverage. Ranking is deterministic: each relevant unsupported occurrence contributes 1,000 points, each global unsupported occurrence contributes 10, and each affected source contributes one.

Measured across all six bundled snapshots:

| Metric | Count |
| --- | ---: |
| Scriptlet references | 3,286 |
| Supported | 1,153 (35.1%) |
| Unsupported | 2,133 |
| `youtube.com` relevant | 659 |
| `youtube.com` supported | 1 (0.2%) |

The compatibility registry owns canonical names and aliases. Phase 4 adds `aopw`, `json-prune`, and `ra` aliases for bounded `abort-on-property-write`, JSON property pruning, and attribute removal implementations. Together with existing aliases this raises all-list scriptlet coverage from 1,008/3,286 (30.7%) to 1,153/3,286 (35.1%). The enabled EasyList/EasyPrivacy baseline remains 11/27 (40.7%).

`json-prune` supports only bounded literal property paths, so wildcard and array-selector variants remain rejected. `acs`, `no-xhr-if`, `no-fetch-if`, and trusted response-replacement primitives are deliberately deferred: their broad script, stack, or request interception semantics carry substantially more compatibility risk. These measurements do not prove that advertising was blocked or visible.
