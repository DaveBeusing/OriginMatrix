# Bundled network rules

`base-network.json` is a deliberately small, versioned Manifest V3 DNR ruleset used to prove the automatic-filtering pipeline. It blocks a few well-known advertising endpoints plus reserved `.example` test targets, and excludes main-frame navigation.

`generated/` contains deterministic build-time DNR output for the pinned EasyList, EasyPrivacy, uBlock Ads, uBlock Privacy, and uBlock Unbreak snapshots. Run `npm run build:rulesets` after changing a snapshot or compiler. `metadata.json` records source and output checksums, source and compiler versions, generated rule counts, and unsupported counts. The build fails above the 300,000-rule static limit instead of truncating output.

Matrix rules use specificity-derived priorities of at least `100,000,000`, so explicit Matrix decisions remain authoritative. Quick Fixes, My Filters, downloaded list updates, Matrix policies, user overrides, and session rules remain in the dynamic or session layers. Cosmetic and scriptlet data from core lists is still prepared at runtime because those engines are not DNR rulesets.
