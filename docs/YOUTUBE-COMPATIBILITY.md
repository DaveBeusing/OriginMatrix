# YouTube compatibility baseline

Version baseline: OriginMatrix `1.4.0`, EasyList snapshot `202608081115`.

This document is deliberately conservative. Filter coverage is testable offline; actual YouTube behavior changes remotely and must be verified in Chromium. OriginMatrix does not claim guaranteed YouTube ad blocking.

## Automated browser acceptance suite

Phase 1 adds opt-in Playwright tests under `tests/browser/youtube/`. They launch a persistent Chromium profile with the unpacked extension and exercise homepage loading, watch-page structure, playback, pause/play, seeking, fullscreen availability, comments, client-side video navigation, console errors, OriginMatrix diagnostics, and observable advertising surfaces.

Install development dependencies and a compatible browser, then run from the repository root:

```sh
npm install
ORIGINMATRIX_YOUTUBE_LIVE=1 npm run test:browser:youtube
```

On PowerShell:

```powershell
$env:ORIGINMATRIX_YOUTUBE_LIVE = '1'
npm run test:browser:youtube
```

The default browser channel is `chrome`; override it with `ORIGINMATRIX_BROWSER_CHANNEL`. A repeatable public watch URL is supplied by default and can be replaced with `ORIGINMATRIX_YOUTUBE_WATCH_URL`. Set `ORIGINMATRIX_HEADLESS=1` only on a Chromium setup that supports extensions in headless mode.

Live tests are intentionally skipped unless `ORIGINMATRIX_YOUTUBE_LIVE=1` is set. YouTube, consent flows, regional ad delivery, and test videos are remote and mutable. A skipped or advertisement-free run is not a passing ad-block result.

Ad observations use four explicit outcomes:

- `not_observed`: no matching surface appeared; this is not evidence of blocking.
- `observed_and_blocked`: the surface was found with OriginMatrix's cosmetic marker.
- `observed_and_visible`: the surface was found and rendered visibly.
- `unknown`: evidence was incomplete or observation failed.

The JSON reporter writes machine-readable results below `test-results/youtube/`; traces, screenshots, video, and the structured `ad-observations` attachment are retained for failures or analysis.

## Relevant filter coverage

The dashboard accepts a hostname such as `youtube.com` and evaluates only filter lines that explicitly reference that hostname, a parent domain, or a subdomain. Supported rules pass both the common filter parser and their destination engine's validation: cosmetic rules pass `CosmeticParser`, and scriptlets must resolve through `ScriptletRegistry`. Results show Network, Cosmetic, Scriptlet, and total coverage with the exact unsupported line, reason, and filter-list source. Coverage measures implementation support only; it does not prove runtime blocking or playback compatibility.

The Phase 4 inventory finds no scriptlet references in the pinned EasyList snapshot, including the YouTube-related subset. No new MAIN-world primitive is therefore activated without filter evidence. See [Scriptlet coverage](SCRIPTLET-COVERAGE.md).

## Working

- OriginMatrix can identify YouTube-, Googlevideo-, ytimg-, and related ad-endpoint rules in the bundled snapshot.
- Supported network rules compile through the normal Filter-to-DNR pipeline.
- Supported site-scoped cosmetic selectors use the normal Cosmetic Engine.
- Selected domain-scoped scriptlet rules can activate only bundled, argument-validated implementations.
- Property-protection scriptlets run in the EARLY phase requested at `document_start`; DOM text removal waits for the NORMAL phase after DOM readiness.
- The dynamic cosmetic observer remains active during same-document SPA navigation.
- Native CSS `:has()` rules cover the pinned list's promoted feed, Shorts, and ad-slot structures without YouTube-specific code.
- Domain-scoped `#@#` exceptions prevent matching hiding rules on excluded YouTube surfaces.
- Diagnostics report unsupported rules instead of treating them as successful.
- The pinned offline sample supports 38 of 42 targeted rules (90.5% syntax coverage).
- Matrix domain cells expose attributable automatic EasyList decisions while explicit user Allow/Block rules remain authoritative.

## Partially working

- General EasyList network and cosmetic protection applies to YouTube, but coverage is limited to the syntax OriginMatrix currently supports.
- Feed, sidebar, promoted-content, pre-roll, and mid-roll filtering may improve where ordinary network or simple CSS rules apply; each scenario remains manually unverified in this baseline.
- The request log shows YouTube lifecycles and, in unpacked builds, exact OriginMatrix DNR rule matches. Packaged builds cannot attribute failed requests reliably.

## Unsupported

- `$rewrite`, `generichide`, wider scriptlet dialects, global/exception scriptlet rules, and procedural cosmetic selectors.
- Guaranteed classification of video-ad requests.
- YouTube-specific hard-coded workarounds.
- Automated signed-in, playlist, Shorts, and guaranteed ad-delivery scenarios.
- Claims that all pre-roll or mid-roll advertisements are removed.

## Required next features

- Browser-driven execution across stable Chrome versions and controlled signed-in test accounts.
- Better unsupported-rule diagnostics tied to real page observations.
- Browser-driven integration tests and repeatable test accounts/scenarios.
- Generic handling for any missing network or cosmetic syntax before considering isolated YouTube-specific code.

## Manual acceptance checklist

Run this checklist after changes to the Network, Filter, Cosmetic, or future Scriptlet Engine:

- [ ] YouTube homepage loads without a console-error flood.
- [ ] Watch page starts video and supports seeking.
- [ ] Switching videos and playlists works.
- [ ] Pre-roll and mid-roll behavior is recorded without claiming success from a single run.
- [ ] Promoted feed content and sidebar/display ads are recorded.
- [ ] Comments load and scrolling remains responsive.
- [ ] Signed-in navigation remains functional.
- [ ] Fullscreen enters and exits normally.
- [ ] SPA navigation does not require forced reloads.
- [ ] No reload loop or excessive CPU activity occurs.

Record browser version, account state, region, EasyList version, tested URL type, console errors, and the OriginMatrix debug report for each run.
