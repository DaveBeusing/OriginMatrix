# OriginMatrix

OriginMatrix is a Manifest V3 request-firewall prototype for Chromium browsers (Chrome 102+). This repository currently implements only Phase 0 and Phase 1: a complete path from a popup action through a temporary logical policy and DNR compilation to a tab-scoped session rule.

## Implemented

- MV3 service worker and compact popup
- Active tab hostname detection
- Temporary “block third-party scripts” policy
- Tab-scoped `declarativeNetRequest` session rule
- Disable and manual reload controls
- Session policy storage, independent from service-worker lifetime
- Unit tests for compilation and temporary storage

No matrix, request observer, persistent policies, cookie control, filter lists, or Phase 2 resolver is included yet.

## Architecture

The popup sends intent; it never constructs DNR rules. The service worker creates a logical policy, the compiler validates and translates it, and the browser adapter boundary is the service worker's DNR API call. Logical policies are the source of truth and temporary policies live in `chrome.storage.session`.

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
- Only HTTP(S) tabs and the `script` resource type are supported.
- A session rule survives service-worker suspension but is not a persistent policy and disappears when the browser session ends.
- Observed request/domain counts and blocked-request feedback are not implemented.

## Roadmap

The next step is Phase 2: formalize the complete policy model, deterministic resolution hierarchy, persistent store with schema migrations, stable rule-ID management, and dynamic-rule compilation. That work should retain the tested compiler boundary established here.
