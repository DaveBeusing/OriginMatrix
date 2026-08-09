# Scriptlet coverage

## EasyList demand analysis

OriginMatrix 1.6.0 analyzes the pinned EasyList `202608081115` snapshot before expanding executable scriptlets. Run the reproducible inventory with:

```sh
node tools/analyze-scriptlet-usage.mjs
```

The analyzer recognizes supported `##+js(...)` references and unsupported AdGuard-style `#%#//scriptlet(...)` references, counts each name globally, ranks references for the configured YouTube-related domains, validates calls through the existing parser and bundled registry, and retains bounded line samples and failure reasons.

Current result:

| Metric | Count |
| --- | ---: |
| EasyList scriptlet references | 0 |
| YouTube-related scriptlet references | 0 |
| New executable primitives justified | 0 |

The snapshot contains extended procedural cosmetic rules but no executable scriptlet rules. Consequently, candidates such as `abort-on-property-write`, `abort-current-inline-script`, `json-prune`, `prevent-fetch`, `prevent-xhr`, `remove-attr`, and `remove-class` have no measurable demand in the active filter dataset. Adding any of them now would increase MAIN-world attack surface and maintenance cost without activating another real rule, so the bundled registry intentionally remains limited to its existing three validated implementations.

This is an evidence gate, not a claim that the candidates are universally unnecessary. Re-run the analyzer after every filter snapshot or catalog expansion. A future primitive must have non-zero real usage, site relevance or meaningful global frequency, strict bounded argument semantics, prototype-safety where applicable, and dedicated implementation tests before registry inclusion.
