# YouTube compatibility baseline

Version baseline: OriginMatrix `0.27.0`, EasyList snapshot `202608081115`.

This document is deliberately conservative. Filter coverage is testable offline; actual YouTube behavior changes remotely and must be verified manually in Chromium. OriginMatrix does not claim guaranteed YouTube ad blocking.

## Working

- OriginMatrix can identify YouTube-, Googlevideo-, ytimg-, and related ad-endpoint rules in the bundled snapshot.
- Supported network rules compile through the normal Filter-to-DNR pipeline.
- Supported site-scoped cosmetic selectors use the normal Cosmetic Engine.
- Selected domain-scoped scriptlet rules can activate only bundled, argument-validated implementations.
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
- Automated playback, login, comments, playlist, fullscreen, and SPA end-to-end tests.
- Claims that all pre-roll or mid-roll advertisements are removed.

## Required next features

- Browser-driven execution of the acceptance checklist across signed-out and signed-in sessions.
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
