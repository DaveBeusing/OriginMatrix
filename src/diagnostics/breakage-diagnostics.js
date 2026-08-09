const RECENT_ACTION_LIMIT = 50;

export function analyzeBreakage({ state, matrixOverrides = [], now = Date.now() }) {
  const signals = Array.isArray(state?.breakageSignals) ? state.breakageSignals : [];
  const actions = Array.isArray(state?.protectionActions) ? state.protectionActions : [];
  const recent = (type, windowMs) => signals.filter((item) => item.type === type && now - item.timestamp <= windowMs);
  const issues = [];
  if (recent("media-not-playable", 60_000).length) issues.push(issue("video-never-playable", "Video or audio did not become playable.", recent("media-not-playable", 60_000).length));
  if (recent("media-error", 30_000).length >= 3) issues.push(issue("repeated-player-errors", "Repeated media element errors were observed.", recent("media-error", 30_000).length));
  if (recent("spa-navigation", 10_000).length >= 5) issues.push(issue("continuous-navigation-loop", "Many same-document navigations occurred in a short interval.", recent("spa-navigation", 10_000).length));
  const exceptionBurst = (state?.requestLog ?? []).filter((item) => item.decision === "allowed" && now - item.timestamp <= 5_000);
  if (exceptionBurst.length >= 10) issues.push(issue("large-exception-burst", "Many network exceptions matched in a short interval.", exceptionBurst.length));
  if (recent("spa-delivery-failed", 60_000).length) issues.push(issue("failed-spa-navigation", "A same-document navigation update could not reach the page.", recent("spa-delivery-failed", 60_000).length));

  const network = (state?.requestLog ?? []).filter((item) => item.decision !== "unknown").map((item) => ({
    type: "network", timestamp: item.timestamp, source: item.reason, details: `${item.decision} ${item.resourceType} ${item.domain}`,
  }));
  const matrix = matrixOverrides.map((policy) => ({
    type: "matrix", timestamp: state?.updatedAt ?? now, source: policy.temporary ? "temporary Matrix override" : "persistent Matrix override",
    details: `${policy.action} ${policy.scope} → ${policy.target} (${policy.party}, ${policy.resourceType})`,
  }));
  return Object.freeze({
    status: issues.length ? "potential-breakage" : "no-breakage-signal",
    issues: Object.freeze(issues),
    signals: Object.freeze(signals.slice(-50).reverse()),
    recentActions: Object.freeze([...network, ...actions, ...matrix].sort((a, b) => b.timestamp - a.timestamp).slice(0, RECENT_ACTION_LIMIT)),
    automaticChangesApplied: false,
  });
}

function issue(type, summary, count) { return Object.freeze({ type, severity: "warning", summary, evidenceCount: count }); }
