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
});

export const DEFAULT_FILTER_LISTS = Object.freeze([EASYLIST, EASYPRIVACY]);
