import { classifyYouTubeAdEvidence, YOUTUBE_EVIDENCE } from "../../../src/diagnostics/youtube-telemetry.js";

export const OBSERVATION_STATUS = YOUTUBE_EVIDENCE;
export const classifyAdObservation = classifyYouTubeAdEvidence;

export const YOUTUBE_AD_SURFACES = Object.freeze([
  Object.freeze({ name: "promoted-feed", selectors: Object.freeze(["ytd-promoted-video-renderer", "ytd-ad-slot-renderer"]) }),
  Object.freeze({ name: "promoted-shorts", selectors: Object.freeze(["ytd-reel-item-renderer:has([aria-label*='Ad'])"]) }),
  Object.freeze({ name: "sidebar-display", selectors: Object.freeze(["#player-ads", "ytd-action-companion-ad-renderer"]) }),
  Object.freeze({ name: "player-ad-state", selectors: Object.freeze([".ad-showing", ".ytp-ad-player-overlay", ".ytp-ad-preview-container"]) }),
  Object.freeze({ name: "player-ad-indicators", selectors: Object.freeze([".ytp-ad-text", ".ytp-ad-simple-ad-badge"]) }),
  Object.freeze({ name: "skip-ad-controls", selectors: Object.freeze([".ytp-ad-skip-button", ".ytp-skip-ad-button"]) }),
]);

export function observeYouTubeAdSurfaces(page) {
  return Promise.all(YOUTUBE_AD_SURFACES.map(({ name, selectors }) => observeAdSurface(page, name, selectors)));
}

export async function observeAdSurface(page, name, selectors) {
  try {
    const samples = await page.locator(selectors.join(",")).evaluateAll((elements) => elements.map((element) => {
      const style = getComputedStyle(element);
      const rectangle = element.getBoundingClientRect();
      return {
        visible: style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) !== 0 && rectangle.width > 0 && rectangle.height > 0,
        originMatrixHidden: element.hasAttribute("data-originmatrix-cosmetic-hidden"),
      };
    }));
    const detected = samples.length > 0;
    return {
      name,
      status: classifyAdObservation({
        detected,
        visible: samples.some(({ visible }) => visible),
        originMatrixHidden: samples.some(({ originMatrixHidden }) => originMatrixHidden),
      }),
      detected,
      sampleCount: samples.length,
    };
  } catch (error) {
    return { name, status: OBSERVATION_STATUS.UNKNOWN, detected: null, sampleCount: 0, error: error.message };
  }
}
