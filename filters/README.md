# Bundled filter snapshots

OriginMatrix bundles pinned, unmodified filter-data snapshots so releases work offline and remain reproducible. Catalog metadata in `src/filters/filter-list-catalog.js` records source URL, snapshot version/time, SHA-256 digest, default state, and license URL.

EasyList and EasyPrivacy are enabled by default. The following GPL-3.0 uAssets lists are integrated but remain opt-in until OriginMatrix evaluates their 215 preprocessor directives in Phase 3:

- uBlock filters – Ads
- uBlock filters – Privacy
- uBlock filters – Quick fixes
- uBlock filters – Unbreak

Users can enable, disable, or update each complete list independently from the dashboard. Updates come only from catalogued HTTPS URLs and are size-, format-, timestamp/version-, checksum-, parser-, compiler-, and budget-validated before activation. Both Adblock Plus headers and official uAssets `Title` plus `Last modified` metadata are accepted. Filter content remains data and is never executed as code.

See [Third-party notices](../docs/THIRD_PARTY_NOTICES.md) for upstream sources and license terms.
