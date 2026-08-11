# OriginMatrix 1.22.0 release candidate

This document separates reproducible repository checks from browser behavior that requires hands-on testing. A blank manual result is not evidence of compatibility.

## Automated release gate

Run:

```sh
npm run release:check
```

The gate runs the complete unit suite, validates version alignment and every manifest asset, confirms the MV3/minimum-browser baseline, rejects external messaging and update URLs, verifies that the shipped extension has no runtime dependencies, and scans shipped JavaScript for dynamic-code and unsafe-HTML sinks.

On Windows, create a store-ready source archive after the gate passes:

```powershell
./tools/build-release.ps1
```

The archive contains only runtime directories, `manifest.json`, the MIT license, and third-party notices. `dist/` is generated output and must not be committed.

## Manual browser matrix

Test an unpacked build on current stable releases and record exact browser versions, operating system, date, and result.

| Browser | Install/startup | Network blocking | Matrix edit/reload | Cosmetic/scriptlet | Status |
| --- | --- | --- | --- | --- | --- |
| Chrome | Pending | Pending | Pending | Pending | Not verified |
| Microsoft Edge | Pending | Pending | Pending | Pending | Not verified |
| Brave (Shields off for isolation) | Pending | Pending | Pending | Pending | Not verified |
| Vivaldi (built-in blocker off for isolation) | Pending | Pending | Pending | Pending | Not verified |

## Manual site matrix

For every case, compare a clean profile with OriginMatrix disabled and enabled. Check navigation, console errors, authentication state, media playback, forms, checkout/payment redirects, popup behavior, and Matrix rollback. Never submit a real payment merely to complete this checklist.

| Surface | Required scenario | Status |
| --- | --- | --- |
| YouTube | Home, search, channel, playlist, Shorts, watch page, seek, captions, fullscreen, signed-out and optional dedicated-profile signed-in playback | Not verified |
| Google | Search, image search, result navigation, consent surface | Not verified |
| Amazon | Search, product page, cart; stop before purchase submission | Not verified |
| Reddit | Listing, comments, infinite scroll, sign-in surface | Not verified |
| Major news | At least two publishers, article, consent and media embeds | Not verified |
| Video streaming | Public/free playback where legally available; DRM and seeking | Not verified |
| SPA | Client-side navigation, back/forward, dynamically inserted content | Not verified |
| Authentication | Sign-in/sign-out with a disposable test account; no credentials in reports | Not verified |
| Payment | Sandbox checkout or pre-submit flow only; no real transaction required | Not verified |

Export the local debug report for failures, remove browsing URLs or account data before sharing it, and attach reproducible steps. Exact DNR attribution is expected only where Chromium exposes the unpacked-extension debug API.

## Release decision

The repository may be tagged only after the automated gate passes and all required manual rows have named evidence. This repository snapshot prepares the candidate; it does not claim that the pending browser matrix has already passed.
