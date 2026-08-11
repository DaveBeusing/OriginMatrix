const RESOURCE_LABELS = Object.freeze({
  all: "ALL", cookie: "COOKIE", stylesheet: "CSS", image: "IMG", media: "MED", script: "JS",
  xmlhttprequest: "XHR", sub_frame: "FRM", font: "FONT", websocket: "WEBSOCKET", other: "OTHER",
});
const NEXT_ACTION = Object.freeze({ inherit: "allow", allow: "block", block: "inherit" });

const siteElement = document.querySelector("#site");
const protectionElement = document.querySelector("#protection");
const noticeElement = document.querySelector("#notice");
const reloadButton = document.querySelector("#reload");
const settingsButton = document.querySelector("#settings");
const pickerButton = document.querySelector("#picker");
const commitButton = document.querySelector("#commit");
const revertButton = document.querySelector("#revert");
const pendingCountElement = document.querySelector("#pending-count");
const reloadRequiredElement = document.querySelector("#reload-required");
const requestCountElement = document.querySelector("#request-count");
const domainCountElement = document.querySelector("#domain-count");
const failedCountElement = document.querySelector("#failed-count");
const matrixBody = document.querySelector("#matrix-body");
const versionElement = document.querySelector("#version");

versionElement.textContent = `v${chrome.runtime.getManifest().version}`;

let currentTab;

initialize().catch(showError);

matrixBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-target]");
  if (!button) return;
  button.disabled = true;
  noticeElement.classList.remove("error");
  noticeElement.textContent = "Updating rule…";
  try {
    const response = await send({
      type: "SET_MATRIX_POLICY",
      tabId: currentTab.id,
      url: currentTab.url,
      scope: button.dataset.scope,
      target: button.dataset.target,
      party: button.dataset.party,
      resourceType: button.dataset.resourceType,
      action: nextAction(button.dataset.resourceType, button.dataset.editAction),
    });
    renderState(response);
    noticeElement.textContent = "Rule updated. Reload required for previous requests.";
  } catch (error) {
    showError(error);
  } finally {
    if (button.isConnected) button.disabled = false;
  }
});

reloadButton.addEventListener("click", async () => {
  await chrome.tabs.reload(currentTab.id);
  window.close();
});

settingsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());
pickerButton.addEventListener("click", async () => { try { await send({ type: "START_ELEMENT_PICKER", tabId: currentTab.id }); window.close(); } catch (error) { showError(error); } });

commitButton.addEventListener("click", () => runWorkflow("COMMIT_MATRIX", "Committed"));
revertButton.addEventListener("click", () => runWorkflow("REVERT_MATRIX", "Reverted"));

async function initialize() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!Number.isInteger(tab?.id) || !tab.url) throw new Error("No active browser tab is available.");
  currentTab = tab;
  hostnameFromUrl(tab.url);
  renderState(await send({ type: "GET_TAB_STATE", tabId: tab.id, url: tab.url }));
  reloadButton.disabled = false;
}

function renderState(state) {
  siteElement.textContent = state.matrix.site;
  protectionElement.textContent = state.protection?.enabled ? "ON · Network filters active" : "OFF";
  protectionElement.dataset.enabled = String(state.protection?.enabled === true);
  renderMetrics(state.observation, Object.keys(state.observation?.domains ?? {}).length);
  pendingCountElement.textContent = `${state.pendingChanges} temporary ${state.pendingChanges === 1 ? "change" : "changes"}`;
  reloadRequiredElement.hidden = !state.reloadRequired;
  commitButton.disabled = state.pendingChanges === 0;
  revertButton.disabled = state.pendingChanges === 0;
  matrixBody.replaceChildren();
  if (state.matrix.rows.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 12;
    cell.className = "empty";
    cell.textContent = "Reload to collect requests.";
    row.append(cell);
    matrixBody.append(row);
    return;
  }
  for (const rowData of state.matrix.rows) matrixBody.append(createRow(rowData, state.matrix.resourceTypes));
}

async function runWorkflow(type, pastTense) {
  setWorkflowBusy(true);
  noticeElement.classList.remove("error");
  try {
    const response = await send({ type, tabId: currentTab.id, url: currentTab.url });
    renderState(response);
    noticeElement.textContent = response.changed > 0
      ? `${pastTense} ${response.changed} ${response.changed === 1 ? "rule" : "rules"}.`
      : "No temporary rules to update.";
  } catch (error) {
    showError(error);
  } finally {
    setWorkflowBusy(false);
  }
}

function setWorkflowBusy(busy) {
  if (busy) {
    commitButton.disabled = true;
    revertButton.disabled = true;
    return;
  }
  const count = Number.parseInt(pendingCountElement.textContent, 10) || 0;
  commitButton.disabled = count === 0;
  revertButton.disabled = count === 0;
}

function createRow(rowData, resourceTypes) {
  const row = document.createElement("tr");
  row.className = `row-${rowData.kind}`;
  const heading = document.createElement("th");
  heading.scope = "row";
  heading.title = rowData.label;
  heading.textContent = rowData.label;
  if (Number.isInteger(rowData.total)) {
    const count = document.createElement("small");
    count.textContent = String(rowData.total);
    heading.append(count);
  }
  row.append(heading);
  for (const resourceType of resourceTypes) {
    const cellData = rowData.cells[resourceType];
    const cell = document.createElement("td");
    const button = document.createElement("button");
    button.type = "button";
    button.className = `matrix-cell effective-${cellData.effectiveAction} effective-source-${cellData.effectiveSource} explicit-${cellData.explicitAction} ${cellData.source ? "explicit" : "inherited"}`;
    button.dataset.scope = rowData.scope;
    button.dataset.target = rowData.target;
    button.dataset.party = rowData.party;
    button.dataset.resourceType = resourceType;
    button.dataset.editAction = cellData.editAction;
    const automatic = cellData.automaticAction === "inherit" ? "none" : `${cellData.automaticAction} (${cellData.automaticSource})`;
    button.title = `${rowData.label} ${RESOURCE_LABELS[resourceType]}: user ${cellData.explicitAction}, automatic ${automatic}, effective ${cellData.effectiveAction} via ${cellData.effectiveSource}`;
    button.setAttribute("aria-label", button.title);
    button.textContent = cellData.explicitAction !== "inherit"
      ? cellData.explicitAction === "allow" ? "+" : "−"
      : cellData.effectiveSource === "automatic" ? cellData.automaticAction === "allow" ? "A+" : "A−" : "·";
    cell.append(button);
    row.append(cell);
  }
  return row;
}

function nextAction(resourceType, currentAction) {
  if (resourceType === "cookie") return currentAction === "inherit" ? "block" : "inherit";
  return NEXT_ACTION[currentAction];
}

function renderMetrics(observation, domainCount) {
  requestCountElement.textContent = String(observation?.totalRequests ?? 0);
  domainCountElement.textContent = String(domainCount);
  failedCountElement.textContent = String(observation?.failedRequests ?? 0);
}

function hostnameFromUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Open an HTTP(S) page to use OriginMatrix.");
  return url.hostname;
}

async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error ?? "The service worker did not respond.");
  return response;
}

function showError(error) {
  console.error(error);
  noticeElement.textContent = error.message;
  noticeElement.classList.add("error");
}
