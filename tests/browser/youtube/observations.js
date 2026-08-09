export const OBSERVATION_STATUS = Object.freeze({
  NOT_OBSERVED: "not_observed",
  OBSERVED_BLOCKED: "observed_and_blocked",
  OBSERVED_VISIBLE: "observed_and_visible",
  UNKNOWN: "unknown",
});

export function classifyAdObservation({ detected, visible, originMatrixHidden, error = null }) {
  if (error || typeof detected !== "boolean") return OBSERVATION_STATUS.UNKNOWN;
  if (!detected) return OBSERVATION_STATUS.NOT_OBSERVED;
  if (originMatrixHidden === true) return OBSERVATION_STATUS.OBSERVED_BLOCKED;
  if (visible === true) return OBSERVATION_STATUS.OBSERVED_VISIBLE;
  return OBSERVATION_STATUS.UNKNOWN;
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
