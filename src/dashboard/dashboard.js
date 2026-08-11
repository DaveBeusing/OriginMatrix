const diagnosticsElement = document.querySelector("#diagnostic-values");
const statisticsElement = document.querySelector("#statistic-values");
const performanceElement = document.querySelector("#performance-values");
const rulesBody = document.querySelector("#rules-body");
const filterListsBody = document.querySelector("#filter-lists-body");
const statusElement = document.querySelector("#status");
const importData = document.querySelector("#import-data");
const logBody = document.querySelector("#log-body");
const logSite = document.querySelector("#log-site");
const logAttribution = document.querySelector("#log-attribution");
const outcomeFilter = document.querySelector("#log-outcome");
const decisionFilter = document.querySelector("#log-decision");
const typeFilter = document.querySelector("#log-type");
const domainFilter = document.querySelector("#log-domain");
const coverageValues = document.querySelector("#coverage-values");
const coverageBody = document.querySelector("#coverage-body");
const coverageHostname = document.querySelector("#coverage-hostname");
const scriptletRanking = document.querySelector("#scriptlet-ranking");
const profileState = document.querySelector("#profile-state");
let logEntries = [];
const breakageSummary = document.querySelector("#breakage-summary");
const breakageIssues = document.querySelector("#breakage-issues");
const breakageActions = document.querySelector("#breakage-actions");
const customFilterSource = document.querySelector("#custom-filter-source");
const customFilterSummary = document.querySelector("#custom-filter-summary");
const customFilterErrors = document.querySelector("#custom-filter-errors");

document.querySelector("#version").textContent = `v${chrome.runtime.getManifest().version}`;

initialize().catch(showError);

document.querySelector("#recompile").addEventListener("click", () => runAction("RECOMPILE_RULES", {}, "Rules recompiled."));
document.querySelector("#clear-session").addEventListener("click", () => runAction("CLEAR_SESSION_RULES", {}, "Session rules cleared."));
document.querySelectorAll("[data-profile]").forEach((button) => button.addEventListener("click", () => runAction("APPLY_PROFILE", { profile: button.dataset.profile }, `Applied ${button.dataset.profile} profile.`)));
document.querySelector("#import-merge").addEventListener("click", () => importDocument("merge"));
document.querySelector("#import-replace").addEventListener("click", () => importDocument("replace"));
document.querySelector("#export").addEventListener("click", exportDocument);
document.querySelector("#debug-report").addEventListener("click", exportDebugReport);
document.querySelector("#refresh-log").addEventListener("click", refreshLog);
document.querySelector("#refresh-breakage").addEventListener("click", refreshBreakage);
document.querySelector("#coverage-diagnostics").addEventListener("click", runSiteCoverage);
document.querySelector("#save-custom-filters").addEventListener("click", saveCustomFilters);
filterListsBody.addEventListener("click", toggleFilterList);
outcomeFilter.addEventListener("change", renderLog);
decisionFilter.addEventListener("change", renderLog);
typeFilter.addEventListener("change", renderLog);
domainFilter.addEventListener("input", renderLog);

async function initialize() { await Promise.all([refreshDashboard(), refreshLog(), refreshBreakage(), refreshCustomFilters()]); }

async function refreshCustomFilters() { const result = await send({ type: "GET_CUSTOM_FILTERS" }); customFilterSource.value = result.source; renderCustomFilterValidation(result); }
async function saveCustomFilters() { try { statusElement.textContent = "Validating My Filters…"; const result = await send({ type: "SAVE_CUSTOM_FILTERS", source: customFilterSource.value }); renderCustomFilterValidation(result); statusElement.textContent = result.saved ? "My Filters activated." : "My Filters contains unsupported rules and was not changed."; if (result.saved) await refreshDashboard(); } catch (error) { showError(error); } }
function renderCustomFilterValidation(result) { customFilterSummary.textContent = `${result.supported} supported rule(s), ${result.ignored} comment/empty line(s), ${result.errors.length} error(s).`; customFilterErrors.replaceChildren(...result.errors.map((item) => tableRow([item.line, item.reason, item.details ?? "—", item.rule]))); if (!result.errors.length) customFilterErrors.append(emptyRow(4, "All rules are supported.")); }

async function refreshBreakage() {
  try {
    const tab = await getObservedTab();
    const result = await send({ type: "GET_BREAKAGE_DIAGNOSTICS", tabId: tab.id });
    const diagnostics = result.diagnostics;
    breakageSummary.textContent = diagnostics.issues.length
      ? `${result.topDomain}: ${diagnostics.issues.length} potential breakage signal(s). Review recent actions before changing a rule.`
      : `${result.topDomain ?? "Active tab"}: no supported breakage signal detected.`;
    breakageIssues.replaceChildren(...diagnostics.issues.map((item) => tableRow([item.type, item.evidenceCount, item.summary])));
    if (!diagnostics.issues.length) breakageIssues.append(emptyRow(3, "No potential breakage detected."));
    breakageActions.replaceChildren(...diagnostics.recentActions.map((item) => tableRow([new Date(item.timestamp).toLocaleTimeString(), item.type, item.source, item.details])));
    if (!diagnostics.recentActions.length) breakageActions.append(emptyRow(4, "No matching filters or Matrix overrides recorded."));
  } catch (error) { showError(error); }
}

async function refreshDashboard() {
  const state = await send({ type: "GET_DASHBOARD_STATE" });
  diagnosticsElement.replaceChildren(...Object.entries(state.diagnostics).map(([name, value]) => metric(name, value)));
  statisticsElement.replaceChildren(...Object.entries(state.statistics).map(([name, value]) => metric(name, value)));
  performanceElement.replaceChildren(...Object.entries(state.performance).map(([name, value]) => metric(name, value)));
  rulesBody.replaceChildren(...state.policies.map(policyRow));
  if (state.policies.length === 0) rulesBody.append(emptyRow(5, "No persistent policies."));
  filterListsBody.replaceChildren(...state.filterLists.map(filterListRow));
  renderProfile(state.profile);
}

function renderProfile(profile) {
  const enabled = Object.entries(profile.features).filter(([, value]) => value).map(([name]) => name).join(", ");
  profileState.textContent = `Active: ${profile.title} · ${enabled} · ${profile.matrixMode} Matrix`;
  for (const button of document.querySelectorAll("[data-profile]")) {
    const active = button.dataset.profile === profile.name;
    button.disabled = active;
    button.setAttribute("aria-pressed", String(active));
  }
}

async function runAction(type, payload, success) {
  try { await send({ type, ...payload }); statusElement.textContent = success; await refreshDashboard(); }
  catch (error) { showError(error); }
}

async function importDocument(mode) {
  try {
    const result = await send({ type: "IMPORT_POLICIES", document: importData.value, mode });
    statusElement.textContent = `Imported ${result.imported} policies; ${result.total} active.`;
    await refreshDashboard();
  } catch (error) { showError(error); }
}

async function exportDocument() {
  try {
    const { document: data } = await send({ type: "EXPORT_POLICIES" });
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `originmatrix-policies-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    statusElement.textContent = "Policy export created.";
  } catch (error) { showError(error); }
}

async function exportDebugReport() {
  try {
    const { report } = await send({ type: "EXPORT_DEBUG_REPORT" });
    downloadJson(report, `originmatrix-debug-${new Date().toISOString().slice(0, 10)}.json`);
    statusElement.textContent = "Debug report created.";
  } catch (error) { showError(error); }
}

async function refreshLog() {
  try {
    const tab = await getObservedTab();
    const result = await send({ type: "GET_REQUEST_LOG", tabId: tab.id });
    logEntries = result.entries;
    logAttribution.textContent = result.attributionAvailable
      ? "Exact OriginMatrix DNR attribution is available in this unpacked build."
      : "Chromium did not expose DNR debug feedback; unmatched decisions remain unknown.";
    logSite.textContent = result.topDomain ?? "No observations for the active tab.";
    const types = [...new Set(logEntries.map((entry) => entry.resourceType))].sort();
    typeFilter.replaceChildren(option("all", "All types"), ...types.map((type) => option(type, type)));
    renderLog();
  } catch (error) { showError(error); }
}

async function runSiteCoverage() {
  try {
    const hostname = coverageHostname.value.trim().toLowerCase();
    statusElement.textContent = `Analyzing rules relevant to ${hostname}…`;
    const [{ diagnostics }, { diagnostics: scriptlets }] = await Promise.all([
      send({ type: "GET_SITE_FILTER_COVERAGE", hostname }),
      send({ type: "GET_SCRIPTLET_COVERAGE", hostname }),
    ]);
    const values = {
      hostname: diagnostics.hostname,
      filterList: `${diagnostics.filterList} ${diagnostics.listVersion}`,
      network: coverageLabel(diagnostics.coverage.network),
      cosmetic: coverageLabel(diagnostics.coverage.cosmetic),
      scriptlets: coverageLabel(diagnostics.coverage.scriptlet),
      relevantScriptletCoverage: coverageLabel(scriptlets.relevant),
      overallScriptletCoverage: coverageLabel(scriptlets.overall),
      totalRelevantCoverage: coverageLabel(diagnostics.coverage.total),
    };
    coverageValues.replaceChildren(...Object.entries(values).map(([name, value]) => metric(name, value)));
    coverageBody.replaceChildren(...diagnostics.unsupportedRelevantRules.map(coverageDiagnosticRow));
    if (diagnostics.unsupportedRelevantRules.length === 0) coverageBody.append(emptyRow(5, "No unsupported relevant rules."));
    scriptletRanking.replaceChildren(...scriptlets.unsupportedRanking.map((item, index) => tableRow([
      index + 1, item.name, item.score, item.relevantUnsupported, item.occurrences, item.sourceLists.join(", "), item.relevantDomains.join(", "),
    ])));
    if (scriptlets.unsupportedRanking.length === 0) scriptletRanking.append(emptyRow(7, "No unsupported relevant scriptlet primitives."));
    statusElement.textContent = `${diagnostics.hostname}: ${diagnostics.coverage.total.supported}/${diagnostics.coverage.total.total} relevant rules supported (${diagnostics.coverage.total.percent}%).`;
  } catch (error) { showError(error); }
}

function renderLog() {
  const domainQuery = domainFilter.value.trim().toLowerCase();
  const entries = logEntries.filter((entry) => (outcomeFilter.value === "all" || entry.outcome === outcomeFilter.value)
    && (decisionFilter.value === "all" || entry.decision === decisionFilter.value)
    && (typeFilter.value === "all" || entry.resourceType === typeFilter.value)
    && (!domainQuery || entry.domain.includes(domainQuery)));
  logBody.replaceChildren(...entries.slice().reverse().map(logRow));
  if (entries.length === 0) logBody.append(emptyRow(9, "No matching requests."));
}

async function toggleFilterList(event) {
  const button = event.target.closest("button[data-list-id]");
  if (!button) return;
  button.disabled = true;
  if (button.dataset.action === "update") {
    try {
      statusElement.textContent = `Validating update for ${button.dataset.listId}…`;
      await send({ type: "UPDATE_FILTER_LIST", id: button.dataset.listId });
      statusElement.textContent = `${button.dataset.listId} updated successfully.`;
      await refreshDashboard();
    } catch (error) { showError(error); if (button.isConnected) button.disabled = false; }
    return;
  }
  const enabled = button.dataset.enabled !== "true";
  try {
    await send({ type: "SET_FILTER_LIST_ENABLED", id: button.dataset.listId, enabled });
    statusElement.textContent = `${button.dataset.listId} ${enabled ? "enabled" : "disabled"}.`;
    await refreshDashboard();
  } catch (error) { showError(error); if (button.isConnected) button.disabled = false; }
}

function metric(name, value) { const wrapper = document.createElement("div"); const term = document.createElement("dt"); const detail = document.createElement("dd"); term.textContent = name.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`); detail.textContent = String(value); wrapper.append(term, detail); return wrapper; }
function policyRow(policy) { const row = document.createElement("tr"); for (const value of [policy.scope, policy.target, policy.party, policy.resourceType, policy.action]) { const cell = document.createElement("td"); cell.textContent = value; row.append(cell); } return row; }
function filterListRow(list) {
  const row = document.createElement("tr");
  const values = [list.title, list.enabled ? "Yes" : "No", list.state, list.version, list.lastUpdated ? new Date(list.lastUpdated).toLocaleString() : "—", list.rulesCompiled ?? 0, list.cosmeticRules ?? 0, list.scriptletRules ?? 0, list.rulesUnsupported ?? 0];
  for (const value of values) { const cell = document.createElement("td"); cell.textContent = String(value); row.append(cell); }
  const action = document.createElement("td");
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.dataset.listId = list.id;
  toggle.dataset.enabled = String(list.enabled);
  toggle.dataset.action = "toggle";
  toggle.textContent = list.enabled ? "Disable" : "Enable";
  if (list.enabled) toggle.className = "danger";
  const update = document.createElement("button");
  update.type = "button";
  update.dataset.listId = list.id;
  update.dataset.action = "update";
  update.textContent = "Update";
  action.append(toggle, update);
  row.append(action);
  return row;
}
function logRow(entry) { const row = document.createElement("tr"); const attribution = entry.attributionSource ? `${entry.engine ?? "rule"}: ${entry.attributionSource}` : entry.engine ?? "—"; const values = [new Date(entry.timestamp).toLocaleTimeString(), entry.sourceSite, entry.domain, entry.resourceType, entry.decision, entry.outcome, attribution, entry.filterRule ?? "—", entry.url]; for (const value of values) { const cell = document.createElement("td"); cell.textContent = value; cell.title = value; row.append(cell); } return row; }
function coverageDiagnosticRow(sample) { const row = document.createElement("tr"); for (const value of [sample.line, sample.type, sample.reason, sample.sourceFilterList, sample.source]) { const cell = document.createElement("td"); cell.textContent = String(value); cell.title = String(value); row.append(cell); } return row; }
function coverageLabel(value) { return `${value.supported}/${value.total} (${value.percent}%)`; }
function tableRow(values) { const row = document.createElement("tr"); for (const value of values) { const cell = document.createElement("td"); cell.textContent = String(value); cell.title = String(value); row.append(cell); } return row; }
function emptyRow(span, text) { const row = document.createElement("tr"); const cell = document.createElement("td"); cell.colSpan = span; cell.className = "empty"; cell.textContent = text; row.append(cell); return row; }
function option(value, label) { const item = document.createElement("option"); item.value = value; item.textContent = label; return item; }
function downloadJson(value, filename) { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); }
async function send(message) { const response = await chrome.runtime.sendMessage(message); if (!response?.ok) throw new Error(response?.error ?? "Service worker did not respond."); return response; }
async function getObservedTab() { const [tab] = (await chrome.tabs.query({})).filter((candidate) => /^https?:/.test(candidate.url ?? "")).sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0)); if (!Number.isInteger(tab?.id)) throw new Error("No active browser tab is available."); return tab; }
function showError(error) { console.error(error); statusElement.textContent = error.message; statusElement.className = "error"; }
