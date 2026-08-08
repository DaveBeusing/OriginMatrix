# OriginMatrix

<p align="center">
  <img src="icons/icon128.png" width="96" height="96" alt="OriginMatrix icon">
</p>

OriginMatrix is a granular request firewall for Chromium-based browsers. Its matrix interface shows which domains a site contacts and lets users allow, block, or inherit policies by destination and resource type.

OriginMatrix is an independent Manifest V3 project—not a port or visual copy of uMatrix. Logical policies are the source of truth and are compiled into Chrome `declarativeNetRequest` rules.

> A granular request firewall for the modern web.

## Current features

- Manifest V3 service worker with restart-safe state
- Bundled, automatically enabled static network protection
- Normalized network, exception, cosmetic, and scriptlet filter data models
- Network filter parser with explicit support and diagnostics reporting
- Budget-aware filter-to-DNR compiler with deterministic optimization
- Matrix columns for ALL, COOKIE, CSS, IMAGE, MEDIA, SCRIPT, XHR, FRAME, FONT, WEBSOCKET, and OTHER
- GLOBAL, site-wide, first-party, third-party, and observed-domain rows
- Explicit and inherited Allow/Block/Inheritance visualization
- Temporary tab rules backed by DNR session rules
- Commit and Revert workflow for persistent dynamic rules
- Deterministic policy resolution, priorities, and rule IDs
- Cookie request and response header removal
- Read-only request observation, domain counters, and bounded per-tab request logs
- Balanced, Strict, and Custom global profiles
- Dashboard with diagnostics, rule inspection, import/export, debug reports, and request-log filters
- Versioned storage schemas and compensating rollback on failed rule updates
- Original scalable icon set for extension and toolbar surfaces
- Browser-independent unit tests for the policy, storage, compiler, workflow, and observation modules

The bundled ruleset is intentionally small and validates the static-filter architecture; it is not yet a comprehensive ad-blocking list. Parsed network models compile into deterministic DNR blocks and exceptions with safe deduplication, host aggregation, isolated rule IDs, and shared dynamic-budget accounting. Unsupported options and syntax are counted and reported. Scriptlet syntax, downloaded filter lists, uMatrix text-rule conversion, a Relaxed tracker-list profile, and Public-Suffix-List-based domain grouping are not currently included.

## Architecture

```text
Matrix / Dashboard
       ↓
Policy Engine and Store  ← source of truth
       ↓
Resolver → DNR Compiler → Rule IDs
       ↓
Unified Network Engine
  ├─ Static Rule Manager
  ├─ Dynamic Rule Manager
  ├─ Session Rule Manager
  └─ Rule Budget
       ↓
Chromium network stack

Network lifecycle → read-only Request Observer → Tab State → UI
```

UI modules send policy intent and never construct DNR rules. All direct `chrome.declarativeNetRequest` access is isolated in `src/network/`; the browser-independent matrix engine supplies validated rule generations through the unified Network Engine interface. Blocking and observation are deliberately separate systems.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the policy model, resolution hierarchy, storage schema, compilation rules, observation flow, and MV3 design decisions.

## Local installation

1. Clone or download this repository.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose the repository root.
5. Open an HTTP(S) page and reload it once so OriginMatrix can observe its requests.
6. Open the OriginMatrix toolbar popup.

After changing a matrix cell, reload the page when prompted. Use **Commit** to make the current tab/site changes persistent or **Revert** to discard them. The **Settings** button opens diagnostics, profiles, persistent rules, import/export, and request logs.

## Matrix interaction

The popup reports **Protection: ON · Network filters active** when the bundled `base-network` ruleset is enabled. Its rules have a low priority, so an explicit Matrix Allow decision overrides automatic blocking.

For normal resource cells, clicking cycles through:

```text
inherit → allow → block → inherit
```

Cookie cells intentionally cycle only between `inherit` and `block`. Manifest V3 cannot represent a cookie-only allow exception without risking an override of unrelated request-blocking rules.

Dark green/red cells are explicit rules; lighter colors are inherited effective results. A highlighted neutral cell represents a temporary `inherit` edit that will remove its persistent cell when committed.

## Development and tests

The project uses HTML, CSS, vanilla JavaScript, ES modules, and Chrome Extension APIs without runtime dependencies or a build step.

Run the browser-independent tests with a current Node.js release:

```sh
npm test
```

Network blocking and extension lifecycle behavior still require integration testing in Chrome, Chromium, or Microsoft Edge.

The PNG icons can be regenerated from the shared vector geometry on Windows:

```powershell
./tools/generate-icons.ps1
```

## Policy import and export

OriginMatrix exports versioned JSON:

```json
{
  "format": "originmatrix",
  "version": 1,
  "policies": []
}
```

Imports support validated merge and replace modes. Unsupported formats and uMatrix text rules are rejected explicitly rather than partially converted.

## Manifest V3 limitations

- Blocking is declarative; JavaScript does not synchronously intercept requests.
- Rule changes affect future requests, so previously loaded resources require a reload.
- Session rules survive service-worker suspension but are cleared with the browser session.
- Requests served from Chromium's in-memory cache may be invisible to `webRequest`.
- Request failures are not labeled as blocked because Chrome does not provide stable production error classification for every case.
- First-party UI grouping currently uses hostname ancestry rather than registrable-domain/eTLD+1 classification.
- On Chrome versions without top-level-domain DNR conditions, requests initiated inside cross-origin subframes may not match a top-level-site policy.
- Request logs retain at most 250 entries per tab in session storage. They may contain full URLs but are never transmitted by OriginMatrix.
- The conservative optimizer removes only semantically identical rules.

## Security and privacy

- No remote code, `eval`, analytics, telemetry, or external assets
- No synchronous `webRequestBlocking`
- Policies are validated before compilation
- Failed generation changes use compensating rollback
- Request observation cannot modify network requests
- Logical policies—not generated DNR rules—remain authoritative

## Roadmap

- Local Public Suffix List integration
- Initial established network-filter-list integration
- Explicit uMatrix compatibility reports and import adapter
- Production browser integration tests
- Further rule optimization where semantic equivalence can be proven

## License

OriginMatrix is available under the [MIT License](LICENSE.md).
