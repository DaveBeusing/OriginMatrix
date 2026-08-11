# uBO filter compatibility

Version baseline: OriginMatrix `1.20.0`, EasyList `202608081115`, EasyPrivacy `202608091151`.

OriginMatrix is an independent Manifest V3 implementation. It treats public uBlock-compatible filter syntax as data and does not embed or copy the uBlock Origin runtime. Run the deterministic analyzer with:

```sh
npm run analyze:ubo -- youtube.com
```

Append `--json` for the complete machine-readable result. Exact duplicate lines are counted once per source; the same rule in different lists remains separate so source demand is retained. Overall coverage counts primary filter rules. Modifier coverage counts each modifier independently and is therefore not added to the overall denominator. Host coverage includes rules that explicitly name the requested hostname, a parent, or a subdomain; generic rules and related Google/YouTube service domains are not silently attributed to `youtube.com`.

The command analyzes enabled-by-default lists. Add `--all` to include the four bundled opt-in uAssets sources before enabling them.

With all six bundled snapshots included, the analyzer measures 143,509 of 153,539 primary rules supported (93.5%). Explicit `youtube.com` coverage is 53 of 118 (44.9%). The all-list dataset contains 215 preprocessor directives, 3,247 scriptlet rules, and 661 redirect rules. These figures explain why the uAssets sources remain opt-in: analyzing mutually exclusive branches is useful, but activating them before preprocessing would be semantically unsafe.

## Measured compatibility

| Area | Supported | Total | Coverage |
| --- | ---: | ---: | ---: |
| Overall filters | 138,838 | 142,596 | 97.4% |
| Network filters | 113,229 | 116,533 | 97.2% |
| Network modifiers | 10,945 | 14,056 | 77.9% |
| Exceptions | 1,528 | 1,591 | 96.0% |
| Cosmetic filters | 23,825 | 24,138 | 98.7% |
| Procedural cosmetic filters | 245 | 282 | 86.9% |
| Scriptlets | 11 | 27 | 40.7% |
| Redirect rules | 0 | 25 | 0% |
| Preprocessor directives | 0 | 0 | no observations |

The explicit `youtube.com` subset contains 39 rules: 15 network blocks, four exceptions, and 20 cosmetic rules. All 39 pass the current parser and destination-engine validation. Their 11 modifiers are also supported. This is syntax/engine coverage, not evidence that an advertisement was delivered or blocked. The broader YouTube ecosystem and runtime behavior remain covered separately by [YouTube compatibility](YOUTUBE-COMPATIBILITY.md).

## Supported

- Ordinary block and exception network patterns accepted by the OriginMatrix parser
- Resource-type, party, domain and `generichide` modifiers
- Domain-scoped native cosmetic hiding and exceptions
- The bounded `:has-text(...)` procedural subset
- Bundled, argument-validated scriptlets registered by OriginMatrix

## Partially supported

- Network filtering: regular expressions, advanced anchors and several uBO modifiers remain outside the normalized model
- Cosmetic filtering: HTML filtering, entity-wildcard domains and several procedural operators remain unsupported
- Scriptlets: only bundled reviewed primitives and aliases are executable
- Rule semantics: `important`, `badfilter` and preprocessor evaluation are not yet resolved

## Unsupported ranking

The largest measured gaps are `popup` (3,050 occurrences), invalid entity-style cosmetic domains (277), unsupported network patterns (149), other unsupported options (125), unsafe selector syntax (35), unsupported `:has-text` forms (33), redirects (25 total), `important` (10), `object` resource filters (8), and `rewrite` (8). The analyzer reports source lists, up to 50 affected-domain samples, total affected-domain count, and requested-host relevance for every ranked primitive.

No unsupported primitive in the current snapshots explicitly references `youtube.com`. This does not mean generic unsupported rules can never affect YouTube; it means the conservative hostname metric does not infer relevance without an explicit domain reference.

## Unsupported or MV3-constrained

- Response-body/HTML filtering is not available through Declarative Net Request.
- Popup suppression cannot be represented as ordinary DNR request blocking with equivalent uBO semantics.
- Remote executable redirect resources and downloaded scriptlets are prohibited.
- Redirect/rewrite filters require a future reviewed bundled-resource engine; they are currently reported, not approximated.
- Preprocessor directives are currently measured but not evaluated.
- Unsupported syntax is never silently treated as successfully blocked.

Coverage is a compatibility metric, not a blocking-effectiveness score. Advertising observations, visible promotions, tracker blocks and page health require browser evidence.
