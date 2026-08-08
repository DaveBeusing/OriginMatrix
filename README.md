# OriginMatrix

OriginMatrix is a Manifest V3 request-firewall prototype for Chromium browsers (Chrome 102+). It contains the Phase 0/1 proof of concept, the Phase 2 policy core, and the Phase 3 request observer.

## Implemented

- MV3 service worker and compact popup
- Active tab hostname detection
- Temporary “block third-party scripts” policy
- Tab-scoped `declarativeNetRequest` session rule
- Disable and manual reload controls
- Session policy storage, independent from service-worker lifetime
- Versioned persistent policy storage in `chrome.storage.local`
- Deterministic policy resolution with diagnostic paths
- Persistent dynamic-rule and temporary session-rule compilation
- Deterministic, collision-handled DNR rule IDs
- Service-worker startup reconciliation from logical policies
- Read-only `webRequest` observation, separate from DNR blocking
- Per-tab domain, resource-type, completed, and failed counters
- Session-persisted tab state that survives service-worker suspension
- Compact observed-domain summary in the popup
- Unit tests for compilation, resolution, domains, storage, migration, IDs, and observation

No matrix, cookie control, filter lists, request log, or rule optimizer is included yet.

## Architecture

The popup sends intent; it never constructs DNR rules. `PolicyEngine` coordinates storage and compilation, while `ChromeDnrAdapter` is the only DNR browser boundary. `RequestObserver` only observes lifecycle events and writes through `TabStateManager`; it cannot affect requests. Logical policies remain the blocking source of truth.

See [ARCHITECTURE.md](ARCHITECTURE.md) for details.

## Load locally

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this repository directory.
4. Open an HTTP(S) site, open OriginMatrix, and click **Block third-party scripts**.
5. Click **Reload page**. Use **Disable rule**, then reload again, to remove it.

Inspect the extension service worker from the extensions page if Chrome reports an API or rule error.

## Tests

Requires a current Node.js version with the built-in test runner:

```sh
npm test
```

The tests exercise browser-independent modules. The final network-blocking behavior must be verified in a Chromium browser because Node does not implement extension APIs.

## MV3 limitations in this phase

- DNR applies rules declaratively; JavaScript does not synchronously intercept requests.
- The rule affects only future requests, so an already loaded page must be reloaded.
- `domainType: thirdParty` uses Chromium's DNR party classification.
- The popup controls only third-party scripts on HTTP(S) tabs, although the Phase-2 engine models the planned core resource types.
- A session rule survives service-worker suspension but is not a persistent policy and disappears when the browser session ends.
- Requests served from Chromium's in-memory cache can be invisible to `webRequest`.
- Phase 3 reports successful and failed requests. It does not label failures as blocked because Chrome does not guarantee stable error strings and reliable DNR match feedback is not generally available in production.
- Counts begin when the observer can see a navigation; opening the popup does not retroactively reconstruct earlier network traffic.

## Roadmap

The next step is Phase 4: build the basic SCRIPT/XHR/FRAME/IMAGE/MEDIA matrix from observed domains and connect cell edits to temporary policies.
