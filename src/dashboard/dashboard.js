const diagnosticsElement = document.querySelector("#diagnostic-values");
const rulesBody = document.querySelector("#rules-body");
const filterListsBody = document.querySelector("#filter-lists-body");
const statusElement = document.querySelector("#status");
const importData = document.querySelector("#import-data");
const logBody = document.querySelector("#log-body");
const logSite = document.querySelector("#log-site");
const outcomeFilter = document.querySelector("#log-outcome");
const typeFilter = document.querySelector("#log-type");
const domainFilter = document.querySelector("#log-domain");
const youtubeValues = document.querySelector("#youtube-values");
const youtubeBody = document.querySelector("#youtube-body");
let logEntries = [];

initialize().catch(showError);

document.querySelector("#recompile").addEventListener("click", () => runAction("RECOMPILE_RULES", {}, "Rules recompiled."));
document.querySelector("#clear-session").addEventListener("click", () => runAction("CLEAR_SESSION_RULES", {}, "Session rules cleared."));
document.querySelectorAll("[data-profile]").forEach((button) => button.addEventListener("click", () => runAction("APPLY_PROFILE", { profile: button.dataset.profile }, `Applied ${button.dataset.profile} profile.`)));
document.querySelector("#import-merge").addEventListener("click", () => importDocument("merge"));
document.querySelector("#import-replace").addEventListener("click", () => importDocument("replace"));
document.querySelector("#export").addEventListener("click", exportDocument);
document.querySelector("#debug-report").addEventListener("click", exportDebugReport);
document.querySelector("#refresh-log").addEventListener("click", refreshLog);
document.querySelector("#youtube-diagnostics").addEventListener("click", runYouTubeDiagnostics);
outcomeFilter.addEventListener("change", renderLog);
typeFilter.addEventListener("change", renderLog);
domainFilter.addEventListener("input", renderLog);

async function initialize() { await Promise.all([refreshDashboard(), refreshLog()]); }

async function refreshDashboard() {
  const state = await send({ type: "GET_DASHBOARD_STATE" });
  document.querySelector("#version").textContent = `v${state.manifestVersion}`;
  diagnosticsElement.replaceChildren(...Object.entries(state.diagnostics).map(([name, value]) => metric(name, value)));
  rulesBody.replaceChildren(...state.policies.map(policyRow));
  if (state.policies.length === 0) rulesBody.append(emptyRow(5, "No persistent policies."));
  filterListsBody.replaceChildren(...state.filterLists.map(filterListRow));
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
    const [tab] = (await chrome.tabs.query({}))
      .filter((candidate) => /^https?:/.test(candidate.url ?? ""))
      .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
    if (!Number.isInteger(tab?.id)) throw new Error("No active browser tab is available.");
    const result = await send({ type: "GET_REQUEST_LOG", tabId: tab.id });
    logEntries = result.entries;
    logSite.textContent = result.topDomain ?? "No observations for the active tab.";
    const types = [...new Set(logEntries.map((entry) => entry.resourceType))].sort();
    typeFilter.replaceChildren(option("all", "All types"), ...types.map((type) => option(type, type)));
    renderLog();
  } catch (error) { showError(error); }
}

async function runYouTubeDiagnostics() {
  try {
    statusElement.textContent = "Analyzing bundled YouTube-related rules…";
    const { diagnostics } = await send({ type: "GET_YOUTUBE_DIAGNOSTICS" });
    const values = Object.fromEntries(Object.entries(diagnostics).filter(([, value]) => typeof value !== "object"));
    youtubeValues.replaceChildren(...Object.entries(values).map(([name, value]) => metric(name, value)));
    youtubeBody.replaceChildren(...diagnostics.samples.map(youtubeDiagnosticRow));
    if (diagnostics.samples.length === 0) youtubeBody.append(emptyRow(4, "No unsupported targeted samples."));
    statusElement.textContent = `YouTube baseline: ${diagnostics.supportedRules}/${diagnostics.relevantRules} targeted rules supported. Runtime behavior remains unverified.`;
  } catch (error) { showError(error); }
}

function renderLog() {
  const domainQuery = domainFilter.value.trim().toLowerCase();
  const entries = logEntries.filter((entry) => (outcomeFilter.value === "all" || entry.outcome === outcomeFilter.value)
    && (typeFilter.value === "all" || entry.resourceType === typeFilter.value)
    && (!domainQuery || entry.domain.includes(domainQuery)));
  logBody.replaceChildren(...entries.slice().reverse().map(logRow));
  if (entries.length === 0) logBody.append(emptyRow(4, "No matching requests."));
}

function metric(name, value) { const wrapper = document.createElement("div"); const term = document.createElement("dt"); const detail = document.createElement("dd"); term.textContent = name.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`); detail.textContent = String(value); wrapper.append(term, detail); return wrapper; }
function policyRow(policy) { const row = document.createElement("tr"); for (const value of [policy.scope, policy.target, policy.party, policy.resourceType, policy.action]) { const cell = document.createElement("td"); cell.textContent = value; row.append(cell); } return row; }
function filterListRow(list) { const row = document.createElement("tr"); for (const value of [list.title, list.enabled ? list.state : "disabled", list.version, list.rulesLoaded ?? 0, list.rulesSupported ?? 0, list.rulesCompiled ?? 0, list.cosmeticRules ?? 0]) { const cell = document.createElement("td"); cell.textContent = String(value); row.append(cell); } return row; }
function logRow(entry) { const row = document.createElement("tr"); const values = [new Date(entry.timestamp).toLocaleTimeString(), entry.outcome, entry.resourceType, `${entry.domain} ${entry.url}`]; for (const value of values) { const cell = document.createElement("td"); cell.textContent = value; cell.title = value; row.append(cell); } return row; }
function youtubeDiagnosticRow(sample) { const row = document.createElement("tr"); for (const value of [sample.line, sample.category, sample.reason, sample.source]) { const cell = document.createElement("td"); cell.textContent = String(value); cell.title = String(value); row.append(cell); } return row; }
function emptyRow(span, text) { const row = document.createElement("tr"); const cell = document.createElement("td"); cell.colSpan = span; cell.className = "empty"; cell.textContent = text; row.append(cell); return row; }
function option(value, label) { const item = document.createElement("option"); item.value = value; item.textContent = label; return item; }
function downloadJson(value, filename) { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); }
async function send(message) { const response = await chrome.runtime.sendMessage(message); if (!response?.ok) throw new Error(response?.error ?? "Service worker did not respond."); return response; }
function showError(error) { console.error(error); statusElement.textContent = error.message; statusElement.className = "error"; }
