# Bundled network rules

`base-network.json` is a deliberately small, versioned Manifest V3 DNR ruleset used to prove the automatic-filtering pipeline. It blocks a few well-known advertising endpoints plus reserved `.example` test targets, and excludes main-frame navigation.

Static rules use priority `10`. Matrix rules use specificity-derived priorities of at least `100,000,000`, so an explicit Matrix `allow` decision always wins. This test set is not intended to replace a maintained filter-list compiler.
