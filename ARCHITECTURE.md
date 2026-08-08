# OriginMatrix architecture — Phase 3

## Data flow

```text
UI intent
  → PolicyEngine
  → PolicyStore (source of truth)
  → PolicyResolver / DnrCompiler
  → RuleIdManager
  → ChromeDnrAdapter
  → updateDynamicRules() or updateSessionRules()
```

UI code does not construct or install DNR rules. Browser API access is isolated in `ChromeDnrAdapter`; all engine modules are browser-independent.

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

Compiler errors occur before browser rule replacement. Chrome removes the previous generation and adds the new generation in one atomic DNR update.

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
