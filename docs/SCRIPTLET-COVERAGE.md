# Scriptlet coverage

## Enabled-list demand analysis

OriginMatrix 1.16.0 analyzes every enabled filter list plus My Filters before expanding executable scriptlets. Run the reproducible inventory for any hostname with:

```sh
node tools/analyze-scriptlet-usage.mjs youtube.com
```

The dashboard uses the same analyzer. It applies positive and excluded domain scopes, treats global rules as relevant to every valid hostname, resolves supported aliases through the bundled registry, records execution phases, deduplicates exact rules within each source, and reports both overall and hostname-specific coverage. Ranking is deterministic: each relevant unsupported occurrence contributes 1,000 points, each global unsupported occurrence contributes 10, and each affected source contributes one.

Measured against EasyList `202608081115` and EasyPrivacy `202608091151`:

| Metric | Count |
| --- | ---: |
| Scriptlet references | 27 |
| Supported | 0 |
| Unsupported | 27 |
| `youtube.com` relevant | 0 |
| `www.youtube.com` relevant | 0 |
| `m.youtube.com` relevant | 0 |

The current global unsupported ranking starts with `set` (6 occurrences, score 61), `acs` and `rmnt` (4 each, score 41), followed by `aost` and `set-local-storage-item` (3 each, score 31). None is relevant to the three analyzed YouTube hostnames. These are measurements of enabled filter demand, not proof of advertising being blocked or visible.

No executable primitive is added in this phase. Phase 5 must use this evidence together with safety, general usefulness, and relevant-site demand before selecting implementations. A high global count alone does not justify a broad page-API interception or unsafe compatibility alias.
