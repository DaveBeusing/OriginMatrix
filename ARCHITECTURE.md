# OriginMatrix architecture — Phase 0/1

## Data flow

```text
Popup intent
  → service worker
  → temporary policy model
  → DNR compiler
  → updateSessionRules()
  → Chromium network stack
```

The popup supplies only the active tab identity and URL. It cannot create, assign IDs to, or install DNR rules.

## Policy model

The Phase 1 policy records the top-level hostname as `scope`, wildcard target, third-party party type, script resource type, block action, tab ID, and temporary lifetime. `createThirdPartyScriptPolicy` validates the external inputs. `inherit` and `allow` are model constants for future compatibility but are deliberately not compiled in Phase 1.

## Compilation and rule identity

`DnrCompiler` is browser-independent and rejects policy shapes outside the Phase 1 contract. It emits one `block` rule with `initiatorDomains`, `domainType: thirdParty`, `resourceTypes: script`, and `tabIds`. The deterministic Phase 1 ID is `900000 + tabId`, providing one replaceable session rule per tab. A general collision-safe allocator belongs to Phase 2.

## Storage and worker lifecycle

`PolicyStore` persists the logical temporary policy map in `chrome.storage.session`. The DNR session rule and logical policy therefore do not depend on a continuously running worker. Closing a tab removes its stored policy; Chromium automatically limits the DNR rule to that tab.

Rule installation and removal compensate for subsequent storage failures: a newly installed rule is removed if its policy cannot be saved, while a removed rule is restored if its policy cannot be deleted. Phase 2 should additionally reconcile both stores on startup for external or browser-level inconsistencies.

## Persistent rules and resolution

Dynamic rules, `chrome.storage.local`, schema migration, and the full specificity resolver are intentionally absent. They are Phase 2 responsibilities. The persistent policy store—not generated DNR rules—will remain the source of truth.

## Request observation

Blocking and observation are separate systems. No request observer is implemented in Phase 1; it will be introduced only after the policy engine is stable, without changing the DNR compiler boundary.
