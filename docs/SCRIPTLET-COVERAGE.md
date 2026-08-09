# Scriptlet coverage

## Enabled-list demand analysis

OriginMatrix 1.18.0 analyzes every enabled filter list plus My Filters before expanding executable scriptlets. Run the reproducible inventory for any hostname with:

```sh
node tools/analyze-scriptlet-usage.mjs youtube.com
```

The dashboard uses the same analyzer. It applies positive and excluded domain scopes, treats global rules as relevant to every valid hostname, resolves supported aliases through the bundled registry, records execution phases, deduplicates exact rules within each source, and reports both overall and hostname-specific coverage. Ranking is deterministic: each relevant unsupported occurrence contributes 1,000 points, each global unsupported occurrence contributes 10, and each affected source contributes one.

Measured against EasyList `202608081115` and EasyPrivacy `202608091151`:

| Metric | Count |
| --- | ---: |
| Scriptlet references | 27 |
| Supported | 11 |
| Unsupported | 16 |
| `youtube.com` relevant | 0 |
| `www.youtube.com` relevant | 0 |
| `m.youtube.com` relevant | 0 |

Phase 5 enables four `rmnt` rules through the existing bounded `remove-node-text` implementation, four valid `set` rules through the bounded `set-constant` implementation, and three `set-local-storage-item` rules through a new literal-only storage primitive. This raises measured overall coverage from 0% to 40.7%. Two additional `set` references contain entity-wildcard domain syntax that the filter model does not yet represent safely; one also requests intentionally prohibited prototype traversal.

The remaining ranking starts with `acs` (4), `aost` (3), and `no-xhr-if` (2). They are deliberately deferred: their broad function, stack, or request interception semantics carry substantially more compatibility risk, and none of the current scriptlet rules applies to the analyzed YouTube hostnames. These measurements do not prove that advertising was blocked or visible.
