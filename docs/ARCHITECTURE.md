# OriginMatrix architecture

## Data flow

```text
UI intent
  → PolicyEngine
  → PolicyStore (source of truth)
  → PolicyResolver / DnrCompiler
  → RuleIdManager
  → NetworkEngine
  → updateDynamicRules() or updateSessionRules()
```

UI code does not construct or install DNR rules. Direct DNR API access is isolated in `src/network/`; all policy and compiler modules remain browser-independent.

## Network Engine foundation

`NetworkEngine` is the single DNR boundary shared by matrix policies and future automatic filter compilers:

```text
Matrix DnrCompiler ──┐
                     ├── NetworkEngine
Future filters ──────┘      ├── StaticRuleManager
                            ├── DynamicRuleManager
                            ├── SessionRuleManager
                            └── RuleBudget
```

`DynamicRuleManager` and `SessionRuleManager` validate IDs and rule counts before installation and support targeted install/removal. Dynamic Matrix and filter generations use a deterministic range-scoped diff: removed IDs are deleted, changed IDs are atomically replaced, added rules are installed, and unchanged rules never enter the Chrome update payload. Identical generations skip the DNR API call entirely. `StaticRuleManager` manages enabled rulesets and available-static-rule accounting. The manifest enables the bundled `base-network` ruleset automatically.

## Bundled static network filtering

`rules/base-network.json` is a small, versioned proof-of-architecture ruleset. It blocks selected advertising endpoints and reserved `.example` test targets for subresources while leaving main-frame navigation untouched. It does not download data, parse external filter syntax, or act as a hand-maintained production filter database.

Static rules use priority `10`. Matrix priorities are specificity-derived and start at `100,000,000`; therefore an explicit Matrix `allow` has higher priority than a matching automatic block. Dynamic and tab-scoped session generations remain independent from the static ruleset and keep their reserved ID ranges.

## Filter rule model

`src/filters/filter-model.js` defines immutable normalized models for network blocks, network exceptions, cosmetic selectors, and scriptlet references. These abstract models—not generated DNR rules—are the source of truth for the future filter pipeline. Network models retain pattern, domain restrictions, excluded domains, resource types, party constraint, and semantic action without Chrome-specific conditions or rule IDs.

The network parser recognizes host-anchored and URL patterns, `@@` exceptions, supported resource-type options, `third-party`/`~third-party`, `domain=` inclusions and exclusions, and simple site-scoped cosmetic selectors. Comments and list headers are ignored. Unsupported patterns, options, cosmetic forms, and scriptlets are returned with a reason and line number instead of being guessed.

Parser diagnostics expose total, parsed, supported, unsupported, and ignored rule counts. Parsing produces only normalized filter models and has no dependency on Chrome or DNR.

`NetworkFilterCompiler` is separate from the Matrix `DnrCompiler`. It translates normalized network blocks and exceptions into standard DNR rules accepted by the shared Network Engine, while non-network models remain untouched for later engines. Exact host filters are safely aggregated through `requestDomains`; other URL patterns remain independent. Duplicate models are removed before compilation.

Filter rules occupy dynamic IDs `500000–899999`, between persistent Matrix IDs and session IDs. Automatic blocks use priority `10000`, filter exceptions use `20000`, and Matrix priorities begin at `100000000`. This makes filter conflicts deterministic while preserving explicit Matrix overrides. The compiler accounts for already-reserved Matrix rules before accepting a generation against the shared dynamic budget. Range-scoped diffing in `DynamicRuleManager` lets Matrix and filter generations update independently without deleting or rewriting one another.

## Automatic filters and Matrix overrides

Phase 13 defines the product semantics independently of incidental DNR ordering: an applicable automatic block or exception is the default only while Matrix resolution returns `inherit`. Any effective Matrix `allow` or `block` wins. The compiler priorities mirror that rule—automatic block, automatic exception, then Matrix policy—so the browser and UI resolve conflicts consistently.

`AutomaticFilterResolver` keeps a domain-suffix index of normalized, host-anchored network filters and applies their initiator, exclusion, resource, and party constraints. The matrix uses this index only for observed domain rows. It exposes automatic action/source separately from user policy and effective result. Arbitrary URL patterns still execute through DNR but are not attributed to a domain-only cell, preventing misleading UI claims. COOKIE remains Matrix-only because network filters do not describe cookie-header policy.

## Unified EasyList and EasyPrivacy integration

OriginMatrix ships unmodified, version- and hash-pinned EasyList and EasyPrivacy snapshots. Bundled snapshots make advertising and tracking protection available offline and keep releases reproducible. Both lists are filter data only and are parsed locally; they never become executable code.

At service-worker reconciliation, `UnifiedFilterListManager` loads every enabled source and passes their combined data through one `FilterListService`. Network filters are deduplicated and budgeted before one incremental atomic DNR update, while cosmetic filters, scriptlets, and automatic Matrix attribution use the same combined generation. The dashboard retains independent enable, update, version, checksum, and rule-count state for each source.

The versioned `FilterListSettingsStore` keeps EasyList and EasyPrivacy enabled by default across service-worker restarts. Toggling either list rebuilds the unified candidate from the remaining enabled sources. State is persisted only after successful activation, and a failed toggle restores the previous combined generation.

`FilterListUpdater` and the versioned `FilterListGenerationStore` apply the same controls independently to both catalog entries. Updates use only catalogued HTTPS URLs, omit credentials, reject redirects, cap declared and actual payload size at 5 MB, require an Adblock header, version metadata, and a meaningful rule count, then calculate SHA-256. Parsing, unified compilation, cosmetic preparation, scriptlet validation, and shared rule-budget checks all occur before the candidate can replace the active generation. The downloaded source is stored only after successful activation; activation or storage failure reinstalls the previous combined generation.

The minimum supported Chromium version is 121. Earlier versions shared a 5,000-rule limit between dynamic and session rules; Chromium 121 provides the larger safe dynamic-rule quota required for the optimized EasyList and EasyPrivacy generation while retaining a separate session quota.

## Cosmetic filtering foundation

`CosmeticParser` separates bounded native selectors from supported procedural plans. `SelectorStore` keeps separate global and site indexes, applies hostname-specific exclusions, and caches deduplicated effective native plans for up to 128 hostnames. Native plans are capped at 20,000 selectors and dynamic site subsets at 5,000 selectors.

The service worker prepares the cosmetic generation before replacing network rules and activates it only after the network update succeeds. A declarative content script requests the effective selector plan for its frame hostname at `document_start`; `CosmeticInjector` writes the global and site-specific native selectors into one reusable style element using `textContent`. No filter-provided JavaScript is executed.

## Dynamic cosmetic filtering

`DynamicCosmeticFilter` prepares and caches selector metadata, separating simple ID, class, tag, attribute, and tag-class fast paths from complex selector groups. Its observer derives the bounded attribute filter from the active selectors and omits attribute observation entirely when no selector can depend on an attribute change. Added or changed roots are deduplicated without per-root array allocation, nested roots collapse to their ancestor, and a configurable 100-root burst threshold escalates work to one document scan. Work remains debounced into 50 ms batches. Each batch scans only the bounded site-specific selector subset; global selectors rely on the browser's native CSS engine.

Validated selectors are cached in bounded groups, and matching elements receive a dedicated hide attribute covered by the injected stylesheet. Metrics track mutation records, batches, scanned roots, hidden elements, cumulative scan time, and worst-batch time. The observer does not evaluate remote code, parse new filters, or perform an unconditional full-DOM scan for every mutation.

## Procedural cosmetic filtering

`ProceduralCosmeticFilter` is a separate evaluator for the high-value `:has-text(...)` syntax present in the pinned lists. It supports bounded literal matching, restricted regular expressions, and one nested descendant form such as `.card:has(.label:has-text(Sponsored))`. Overlapping ancestor roots are coalesced, bursts escalate at a configurable 50-root limit, and batches use `requestIdleCallback` with a bounded 100 ms timeout and timer fallback; native CSS application remains immediate. It rejects backreferences, lookarounds, nested quantified groups, unsafe selectors, oversized text arguments, additional procedural operators, and complex trailing expressions.

The engine accepts at most 500 applicable rules per document, queues at most 50 mutation roots, walks at most eight ancestors for inserted text, evaluates at most 2,000 candidate elements per 100 ms batch, and reads at most 10,000 text characters per candidate. Native selectors never enter this evaluator. Hostname scoping and procedural exceptions are resolved before plans reach the content script.

## SPA navigation lifecycle

`SpaNavigationLifecycle` consumes Chromium's `webNavigation.onHistoryStateUpdated` and `onReferenceFragmentUpdated` events instead of modifying page History APIs. Events are debounced per tab and frame for 75 ms, so rapid route transitions produce one evaluation of the final URL. The service worker resets top-frame session diagnostics and site state, clears per-frame scriptlet execution keys, and sends a bounded navigation token to the affected content-script frame.

`breakage-diagnostics.js` evaluates bounded, session-only tab signals for media that never becomes playable, repeated player errors, navigation loops, exception bursts, and failed SPA delivery. It correlates warnings with recent attributable network matches, cosmetic plans, executed scriptlets, and applicable Matrix overrides. The dashboard presents evidence for manual review; diagnostics never change or disable a rule.

Filter attribution metadata follows supported filter models from the combined-list parser into a compiler-owned index. Only valid DNR rule fields are installed in Chromium. Debug matches resolve their rule ID against the separate index and retain the bounded original rule text and source-list name in the tab-session request log. Cosmetic plans and bundled scriptlet invocations expose the same source metadata to diagnostics; persistent Matrix policies and temporary session overrides are labelled separately.

`CustomFilterStore` persists one versioned local My Filters document. `custom-filter-validator.js` applies source-size, parser, cosmetic-engine, and scriptlet-registry validation before `UnifiedFilterListManager` stages the text as a labelled `My Filters` source. The complete combined generation activates before storage changes; activation or persistence failure restores the previous generation. Unsupported lines remain visible in the editor and are never silently accepted.

The element picker is not part of the always-on content-script bundle. `PageToolLoader` injects its bundled selector generator and picker implementation into the top frame only after an explicit popup request. The picker uses a closed Shadow DOM control surface, bounded selector depth, stable IDs or data attributes where available, and an explicit preview/save step. It creates only site-scoped cosmetic candidates and never executes page-provided code.

The existing content script then requests a fresh effective cosmetic plan and runs the EARLY and NORMAL scriptlet phases for that route. A generation counter prevents an older asynchronous cosmetic response from replacing a newer route's plan. Scriptlet execution remains deduplicated within each document, route, and phase while allowing the same applicable bundled scriptlet to be evaluated again after a genuine SPA transition.

## YouTube compatibility diagnostics

`youtube-compatibility.js` performs an offline, versioned analysis of the active EasyList and EasyPrivacy sources explicitly targeting YouTube, Googlevideo, ytimg, and related endpoints. It validates cosmetic and scriptlet models through their destination engines, separates supported network blocks, exceptions, controls, and selectors from unsupported syntax, and retains bounded line-aware samples for diagnosis.

This analysis measures filter-language coverage only. It cannot prove that an advertisement was blocked or that playback, login, comments, playlists, fullscreen, or SPA navigation work. Those scenarios remain an explicit manual checklist in `YOUTUBE-COMPATIBILITY.md`; no YouTube-specific workaround is introduced by the diagnostic.

YouTube coverage improves through generic Cosmetic Engine behavior rather than site-specific code. Domain lists, `#@#` hiding exceptions, and `$generichide` controls share validated models. A matching `$generichide` control suppresses only global native and procedural filters while preserving explicitly site-scoped rules. Native CSS `:has()` covers relational ad-slot selectors, and supported `:has-text()` rules use the separate bounded evaluator; runtime behavior still requires the documented browser checklist.

## Scriptlet Engine foundation

`ScriptletRegistry` is an immutable allowlist of bundled implementation functions. It provides `remove-node-text`, `set-constant`, and `abort-on-property-read`; each has a strict argument validator and an immutable EARLY or NORMAL execution phase. Unsafe property paths, arbitrary constant expressions, oversized text, and unsupported selectors are rejected. Filter data cannot register implementations.

`ScriptletParser` accepts the selected uBlock-style `domain##+js(name, args...)` form, including included/excluded domains, bounded quoted or escaped arguments, and a small explicit alias map. Global rules, exceptions, malformed calls, excessive arguments, and wider dialects are reported as unsupported. Parsed names still pass through the closed registry, so unknown identifiers and invalid arguments never become active.

Scriptlet-library expansion is evidence-gated. `ScriptletUsage` inventories executable references from every enabled list and My Filters by canonical name, source, domain scope, exclusions, global frequency, requested-host relevance, parser/registry support, and supported execution phase. Exact duplicate lines within one source are counted once. Unsupported primitives are ranked deterministically: relevant unsupported occurrences dominate, followed by global unsupported occurrences and affected source count. Results are cached with the active unified-list generation and exposed through the existing site-coverage dashboard. The inventory is also reproducible with `tools/analyze-scriptlet-usage.mjs [hostname]`.

The pinned EasyList `202608081115` and EasyPrivacy `202608091151` sources contain 27 scriptlet references in total, all currently unsupported, but none apply to `youtube.com`, `www.youtube.com`, or `m.youtube.com`. Phase 4 therefore adds analysis rather than speculative MAIN-world primitives. See `SCRIPTLET-COVERAGE.md` for the measured ranking and interpretation.

Phase 5 uses that inventory to enable 11 real rules through three bounded capabilities. The common `set` and `rmnt` names normalize to the reviewed `set-constant` and `remove-node-text` implementations. Constant values remain an explicit allowlist, extended only with an inert function and frozen empty object. `set-local-storage-item` accepts a bounded key and a small literal/removal-token allowlist, catches unavailable-storage failures, and runs in the early phase. Higher-risk `acs`, `aost`, Fetch/XHR, cookie, attribute, and JSON-edit primitives remain unsupported pending stronger relevance and narrowly testable semantics.

`ScriptletEngine` validates a filter-list generation before activation, applies domain inclusions/exclusions per document, filters and deduplicates invocations by phase, and brands plans through the registry. `set-constant` and `abort-on-property-read` are EARLY; `remove-node-text` is NORMAL. The `document_start` content script requests EARLY execution before other engine messages and waits for it before requesting NORMAL execution after DOM readiness. The service worker derives hostname, tab, frame, and document identity only from Chrome's sender metadata and deduplicates each phase per document. `execute` accepts only branded plans and passes the already-bundled function reference plus validated string arguments to `chrome.scripting.executeScript` in the `MAIN` world. No code string, `eval`, `Function`, remote script, or dynamically downloaded implementation is accepted.

`RuleBudget` centralizes conservative defaults for static, dynamic, and session capacity and rejects oversized generations before Chrome is called. Runtime diagnostics expose used and available dynamic/session capacity alongside enabled and available static-rule information.

The `PolicyEngine` depends only on `NetworkEngine.replaceRules({ temporary, rules })`: persistent matrix policies still become dynamic rules, while tab policies still become session rules. Generated DNR state remains reconstructable from logical stores.

## Policy model

Every policy uses one canonical shape: `id`, `scope`, `target`, `party`, `resourceType`, `action`, `temporary`, and optional `tabId`. Missing scope and target values become `*`; missing party and resource type values become `any` and `all`. Hostnames are normalized to lowercase. IDs are derived from policy coordinates rather than actions, so changing an action replaces the same logical matrix cell.

`inherit` means that no explicit policy exists at that coordinate. Saving it removes the corresponding stored policy and it never reaches DNR compilation.

## Resolution

`PolicyResolver` matches top-level domain, target domain, party, resource type, and optional tab. Domain policies include subdomains. Matching candidates receive deterministic specificity scores:

```text
global 100; resource 200; target 300; target+resource 400
site 500; site+resource 600; site+target 700
site+target+resource 800; temporary tab 900 + base specificity
```

It returns the effective action, winning policy, diagnostic reason, and ordered resolution path. Equal scores use canonical policy IDs as a deterministic tie-breaker.

## DNR compilation and IDs

The compiler accepts validated logical policies and emits block or allow rules. Conditions are added only for non-wildcard policy dimensions. Temporary policies receive `tabIds` and compile to session rules; persistent policies compile to dynamic rules.

`RuleIdManager` hashes canonical policy IDs into reserved persistent (`100000–499999`) and session (`900000–999999`) ranges. It sorts inputs and resolves collisions deterministically. The mapping is stored as derived diagnostic metadata, never as the policy source of truth.

Compiler and budget errors occur before browser updates. The manager compares canonical object-key signatures once per old and new rule, then sends only removed, changed, and added rules in one atomic DNR update. Unchanged rules remain installed.

DNR priorities encode the specificity band plus the same canonical-ID tie-breaker. This prevents Chrome's action-type tie rules from producing a different winner than `PolicyResolver` when two overlapping policies have equal specificity.

## Storage and migration

Persistent documents use `chrome.storage.local`; temporary documents use `chrome.storage.session`. Both are versioned:

```json
{ "schemaVersion": 1, "policies": [], "ruleIds": {} }
```

`migration.js` owns schema validation and future migration entry points. Unsupported versions and duplicate IDs fail explicitly. The service worker recompiles both rule generations when it starts, so generated rules remain reconstructable.

## Request observation

Blocking and observation are separate systems:

```text
Chrome network lifecycle
  → read-only webRequest listeners
  → RequestObserver
  → TabStateManager
  → chrome.storage.session
  → popup summary
```

`RequestObserver` registers `onBeforeRequest`, `onCompleted`, and `onErrorOccurred` without blocking options. It never returns a request decision. Start and final events are ordered by request ID so fast completions cannot overtake the initial state write.

`TabStateManager` serializes mutations to prevent concurrent request callbacks from overwriting counters. A main-frame request resets the tab state. Each target hostname records totals and resource-type counts; the tab and domain records also distinguish completed and failed outcomes. Closing a tab removes both its observation state and temporary policies.

Chrome explicitly does not guarantee stable webRequest error strings, so failures are not classified as DNR blocks. Requests served from the in-memory cache can also be invisible to the observer. The UI exposes only the data Phase 3 can report honestly.

## Basic matrix

`matrix-projector.js` is the browser-independent read model between policies, observed tab state, and the popup. It accepts observed domains and all logical policies, then returns five cells per row: SCRIPT, XHR, FRAME, IMAGE, and MEDIA.

Each cell contains both its direct policy (`explicitAction`, `source`) and resolver result (`effectiveAction`, `winningPolicyId`). `editAction` uses the temporary action when present and otherwise the persistent action as the cycle baseline. A click still creates only a temporary edit until Commit.

Temporary `inherit` markers are editor operations rather than effective policies. They suppress the same-coordinate persistent policy in the preview, never compile to DNR, and delete that persistent cell when committed. This makes the full allow/block/inherit cycle reversible without confusing inheritance with an executable network action.

The popup renders the projection and sends only cell intent (`target`, `resourceType`, and next action). The service worker validates that intent, creates a site/target/type tab policy, and delegates storage and DNR updates to `PolicyEngine`. `inherit` removes that temporary cell policy. Buttons are native keyboard controls and expose full state through accessible labels.

First-/third-party projection currently recognizes hostname equality and parent/child hostnames. Public-Suffix-List-backed registrable-domain classification remains a later prerequisite for production-grade site grouping.

## Temporary and persistent workflow

Matrix clicks continue to create tab-scoped policies and session DNR rules. `PolicyWorkflow` owns the Phase-5 transitions:

```text
Commit: selected tab/scope policies → persistent policies → dynamic rules
Revert: selected tab/scope policies → removed → session rules recompiled
```

Commit promotes only policies whose `tabId` and exact `scope` match the active popup. A promoted policy receives a canonical persistent identity and replaces a persistent policy at the same site/target/party/type coordinates. Policies from other sites and tabs remain untouched. Revert removes only the matching temporary policies.

Both workflows compile candidate generations before modifying storage. Because Chrome exposes dynamic and session rules through separate update calls, their joint transition cannot be atomic. The workflow therefore snapshots both logical stores and performs compensating restoration and recompilation after failures. Service-worker policy operations are serialized to prevent concurrent cell edits, commits, and reverts from racing.

`reloadRequired` lives in the session-persisted tab state. Any effective rule edit marks it, and a new main-frame navigation clears it. The popup separately reports the number of temporary changes, enabling Commit and Revert only when the current tab/scope has pending policies.

## Full matrix vocabulary

The matrix projector exposes eleven resource columns: ALL, COOKIE, CSS, IMAGE, MEDIA, SCRIPT, XHR, FRAME, FONT, WEBSOCKET, and OTHER. Its synthetic rows map directly to policy coordinates:

```text
GLOBAL      scope=*     target=*  party=any
*           scope=site  target=*  party=any
1st-party   scope=site  target=*  party=firstParty
3rd-party   scope=site  target=*  party=thirdParty
domain      scope=site  target=domain  party=any
```

Aggregate cells resolve only against compatible parent and same-level policies. More-specific domain policies therefore do not incorrectly color a site or party row. ALL cells represent resource-agnostic policies; type-specific policies do not determine their effective color. Each cell still distinguishes its temporary edit, direct persistent/temporary policy, and effective inherited result.

Global policies can be tested as tab-scoped session policies before Commit. Phase-5 Commit/Revert now selects both the current site scope and global scope for the active tab.

## Cookie and grouped-resource compilation

COOKIE is a logical OriginMatrix type rather than a DNR resource type. A cookie block compiles into two rules with identical conditions and priorities: one removes the request `Cookie` header and one removes the response `Set-Cookie` header. `DnrCompiler.compilePolicySet` consequently returns both rules and a `policyId → ruleIds[]` mapping.

DNR has no cookie-only allow action. A generic `allow` rule could override unrelated block rules on the same request, so the compiler rejects COOKIE allow policies and the UI cycles COOKIE cells only between inherit and block. This is an explicit safety boundary rather than simulated functionality.

OTHER currently expands to the local DNR types `other`, `object`, and `csp_report`. Static filter systems remain separate from this matrix compiler.

## Request log

`TabStateManager` retains up to 250 lifecycle entries per tab in `chrome.storage.session`. Each entry records request ID, timestamp, source site, target domain, normalized resource type, URL, and the reliable final outcome (`completed`, `failed`, or still `pending`). Outcome events update their matching start entry after the observer's per-request ordering barrier.

`RuleAttributionRegistry` maps the current static, dynamic, and session rule IDs to the Network or Matrix Engine and their action. In unpacked Chromium builds, `DnrMatchObserver` consumes `onRuleMatchedDebug` and enriches matching entries with `allowed`, `blocked`, or `modified`, the engine, ruleset, rule ID, and source. A short bounded retry handles ordering against `webRequest` start events. Chrome exposes this event only to unpacked extensions with `declarativeNetRequestFeedback`; packaged builds therefore retain `decision: unknown`. This restriction is surfaced in diagnostics and the dashboard rather than hidden.

The dashboard filters the bounded local log by decision, outcome, type, and domain. Chrome cache invisibility and non-stable error descriptions remain unchanged; `failed` is a lifecycle outcome and is never treated as proof of blocking without an attributable DNR match.

## Dashboard and diagnostics

The manifest options page is a standalone dashboard. It reads state through service-worker messages and does not access storage or DNR directly. Diagnostics report logical policy counts, generated dynamic/session rules, tracked tabs, observed domains/requests, retained log entries, and conservative optimizer results. Actions can recompile both generations, clear session policies/rules, or export a debug report.

## Privacy-preserving statistics

Phase 18 derives statistics exclusively from the current `chrome.storage.session` tab document. It reports requests, exactly attributed blocked requests, EasyList/base-rule ad blocks, tracker blocks, dynamically hidden cosmetic elements, contacted domains, and blocked domains. Closing a tab removes its entire contribution; main-frame navigation resets page-level state. No separate long-term URL, hostname, or browsing-history database is created.

Block counters advance only when a request first receives an exact `blocked` OriginMatrix DNR match. EasyList and the advertising base rule are categorized as ads; Matrix rules are not reclassified as ads or trackers. `blockedTrackers` remains zero until a dedicated categorized tracker dataset exists. Cosmetic content scripts report only cumulative element counts per browser-provided tab/frame sender, and the service worker converts repeated reports into deltas. Native CSS hiding that cannot be counted without an extra DOM scan is deliberately not estimated.

## Performance diagnostics

The dashboard reports service-worker reconciliation time and message activity, total active DNR rules, the latest DNR generation diff and skipped/update call counts, filter parsing and compilation durations, prepared-generation cache hits, and cumulative per-frame cosmetic processing metrics. DNR metrics separate previous, next, added, removed, changed, and unchanged rules. Cosmetic metrics include prepared fast/complex selectors, containment checks, root escalations, dynamic roots and scan time, and procedural batches, roots, and evaluated nodes. In-memory filter generations are reused only when the source, feature flags, and reserved DNR capacity are identical.

The persistent prepared-generation cache stores only the serializable network compiler result. Its identity includes a SHA-256 source checksum, feature configuration, reserved dynamic-rule capacity, and compiler schema version. Reads validate schema, rule structure, and a four-megabyte serialized-size ceiling; missing, stale, corrupt, oversized, or inaccessible entries fall back to normal compilation. Cache writes are likewise optional and cannot prevent activation. Parsing plus cosmetic, scriptlet, and automatic-rule preparation still run on reconstruction so their runtime-specific validated models are never trusted from storage. Metrics expose persistent hits, misses, invalid entries, read/write duration, stored size, and compiler-signature reuse.

Compiled DNR rule signatures are serialized once, then reused for deterministic sorting and ID hashing instead of being recalculated in sort comparisons. Mutation processing remains debounced, scans collapsed DOM roots in batches, and caches validated selector metadata.

Runtime counters live only as long as their service worker or session-backed tab state. JavaScript heap size is shown only where Chromium exposes it; YouTube playback and comparative page-load impact deliberately remain manual browser-profile baselines because an extension cannot isolate those effects reliably from its own runtime.

## Security boundaries

The service worker authenticates every runtime message against its own extension ID and rejects oversized or non-serializable payloads before dispatch. Parser inputs, policy imports, scriptlet arguments, selector delivery, stored list sources, and DNR generations are independently bounded. These checks complement schema validation and transactional activation; they do not rely on the UI as a security boundary. See `SECURITY.md` for the Phase 20 review and permission rationale.

## Release validation

The Phase 21 release gate combines the complete browser-independent test suite with a static package validator. It verifies version alignment, referenced manifest assets, the MV3 and minimum-Chromium baselines, absence of external messaging, update configuration and runtime dependencies, and shipped JavaScript sinks. Packaging uses an explicit runtime allowlist. Cross-browser and live-site behavior remains a separately evidenced manual matrix in `RELEASE-CANDIDATE.md`.

## Browser-driven YouTube acceptance

The opt-in Playwright suite launches a clean persistent Chromium context with OriginMatrix loaded unpacked. Independent scenarios cover homepage, watch, search, channel, playlist, Shorts, signed-out and optional dedicated signed-in health; watch-page controls and comments; actual media pause/play/seek behavior; client-side watch-route changes; extension diagnostics; and structured ad-surface observations. Live execution is gated by `ORIGINMATRIX_YOUTUBE_LIVE=1`, serialized to one worker, and retains diagnostic artifacts.

Each scenario attaches a normalized telemetry document. Advertising evidence distinguishes `not_observed`, `observed`, `suppressed`, `visible`, and `unknown`; only an OriginMatrix cosmetic marker can classify a detected surface as suppressed, while absence is never promoted to blocking. Playback health records only asserted booleans for the scenario. The performance snapshot allowlists content-script setup, cosmetic mutations/batches/roots/timing, procedural batches/nodes, executed scriptlets, and DNR generation changes; unavailable values remain `null`. Session aggregation reports tested sessions, observed/suppressed/visible/unknown ad states, playback failures, SPA failures, and major page-health regressions without synthesizing observations.

## Site-specific filter coverage

`SiteFilterCoverage` reuses the common filter parser plus the existing cosmetic and scriptlet validators to calculate relevant support for an arbitrary hostname. Relevance requires an explicit matching hostname, parent, or subdomain in the normalized model or raw unsupported line; unrelated suffix lookalikes are excluded. The result separates Network, Cosmetic, and Scriptlet totals and retains line number, unsupported reason, source list, and a bounded source sample. The service worker evaluates the active EasyList source and caches results only while that exact source remains active. This diagnostic is an implementation-coverage metric, not evidence that a request or visible advertisement was blocked.

## Policy transfer and profiles

Exports use `{ format: "originmatrix", version: 1, policies: [] }`. Imports validate every canonical policy and precompile the complete candidate generation before replacing browser state. Replace and coordinate-aware merge modes use compensating rollback on failure.

Protection profiles combine immutable engine feature flags with Matrix defaults and are persisted independently from policies. Balanced enables network, cosmetic, and scriptlet engines without installing global Matrix overrides. Strict enables the same engines and blocks third-party scripts, frames, and XHR through explicit global Matrix policies. Relaxed retains network and cosmetic protection, disables scriptlets, and installs no global Matrix defaults. All profiles report enhanced tracking coverage because EasyPrivacy remains part of the default network and cosmetic generation.

Applying a profile preserves site-scoped policies, precompiles the candidate Matrix generation, activates the requested filter-engine generation, and stores the profile name. Failure restores the previous policies and protection features. Startup loads the stored profile before filter-list activation. This keeps UI state, logical policy state, and generated browser rules aligned across service-worker restarts.

Non-JSON/uMatrix text imports fail explicitly. A future compatibility adapter must parse old syntax, report unsupported constructs, and produce the same validated OriginMatrix import document before activation.

## Rule optimization boundary

`RuleOptimizer` currently removes only rules whose priority, action, and condition are semantically identical. It deliberately does not merge request domains or rewrite priorities: either operation could change allow/block conflict resolution. Its output is exposed diagnostically while logical policies and their generated rule-ID mappings remain authoritative.

External filter lists remain a separate future compiler pipeline. They must not be imported into or optimized together with matrix policies.
