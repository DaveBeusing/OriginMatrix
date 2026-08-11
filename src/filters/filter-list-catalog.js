export const EASYLIST = Object.freeze({
  id: "easylist",
  title: "EasyList",
  enabled: true,
  path: "filters/easylist.txt",
  snapshotVersion: "202608081115",
  snapshotUpdatedAt: "2026-08-08T11:15:00Z",
  snapshotCommit: "960442253f9e6e945005ad72432c32444c5e4dae",
  sha256: "f16690725f8fd3bfd292fc05e93ee51dd4f6c37d743ef95a5ba98239d8025696",
  sourceUrl: "https://easylist.to/easylist/easylist.txt",
  licenseUrl: "https://easylist.to/pages/licence.html",
  staticRulesetId: "core_easylist",
});

export const EASYPRIVACY = Object.freeze({
  id: "easyprivacy",
  title: "EasyPrivacy",
  enabled: true,
  path: "filters/easyprivacy.txt",
  snapshotVersion: "202608091151",
  snapshotUpdatedAt: "2026-08-09T11:51:00Z",
  snapshotCommit: "2cd2746c456dc48ed99e7d6a3b2726eb223934a1",
  sha256: "6efd5de59b38243f2196075824c78d4ab2f26175ca2a2b73f8557c1110501b08",
  sourceUrl: "https://easylist.to/easylist/easyprivacy.txt",
  licenseUrl: "https://easylist.to/pages/licence.html",
  staticRulesetId: "core_easyprivacy",
});

const UASSETS_LICENSE = "https://github.com/uBlockOrigin/uAssets/blob/master/LICENSE";

export const UBLOCK_ADS = ublockList({ id: "ublock-ads", title: "uBlock filters – Ads", path: "filters/ublock-ads.txt", version: "20260810164418", updatedAt: "2026-08-10T16:44:18Z", sha256: "2f0618722b2a033fd2dd0d42d9b227f5491d4f4f90ab7a1122427fbf7e0315b6", filename: "filters.txt", staticRulesetId: "core_ublock_ads" });
export const UBLOCK_PRIVACY = ublockList({ id: "ublock-privacy", title: "uBlock filters – Privacy", path: "filters/ublock-privacy.txt", version: "20260811151633", updatedAt: "2026-08-11T15:16:33Z", sha256: "3a48ac48a6b0ed7d95d9a556db765c7543e62da46eb36344aec798da7fb2135f", filename: "privacy.txt", staticRulesetId: "core_ublock_privacy" });
export const UBLOCK_QUICK_FIXES = ublockList({ id: "ublock-quick-fixes", title: "uBlock filters – Quick fixes", path: "filters/ublock-quick-fixes.txt", version: "20260811100053", updatedAt: "2026-08-11T10:00:53Z", sha256: "fd57a74c1e74a36bc5274408b34f98086c127cd3bd93fcc6ac0a61407a546bad", filename: "quick-fixes.txt" });
export const UBLOCK_UNBREAK = ublockList({ id: "ublock-unbreak", title: "uBlock filters – Unbreak", path: "filters/ublock-unbreak.txt", version: "20260810155226", updatedAt: "2026-08-10T15:52:26Z", sha256: "75be24d41ee6d18c509088c98b7464231e0faeb2a802ef85aedf7a7bf2fac7c8", filename: "unbreak.txt", staticRulesetId: "core_ublock_unbreak" });

export const UBLOCK_FILTER_LISTS = Object.freeze([UBLOCK_ADS, UBLOCK_PRIVACY, UBLOCK_QUICK_FIXES, UBLOCK_UNBREAK]);
export const DEFAULT_FILTER_LISTS = Object.freeze([EASYLIST, EASYPRIVACY, ...UBLOCK_FILTER_LISTS]);

function ublockList({ id, title, path, version, updatedAt, sha256, filename, staticRulesetId }) {
  return Object.freeze({ id, title, enabled: false, path, snapshotVersion: version, snapshotUpdatedAt: updatedAt, sha256, sourceUrl: `https://ublockorigin.github.io/uAssets/filters/${filename}`, licenseUrl: UASSETS_LICENSE, ...(staticRulesetId ? { staticRulesetId } : {}) });
}
