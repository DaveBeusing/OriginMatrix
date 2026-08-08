const RESOURCE_LABELS = Object.freeze({
  script: "JS", xmlhttprequest: "XHR", sub_frame: "FRM", image: "IMG", media: "MED",
});
const NEXT_ACTION = Object.freeze({ inherit: "allow", allow: "block", block: "inherit" });

const siteElement = document.querySelector("#site");
const noticeElement = document.querySelector("#notice");
const reloadButton = document.querySelector("#reload");
const requestCountElement = document.querySelector("#request-count");
const domainCountElement = document.querySelector("#domain-count");
const failedCountElement = document.querySelector("#failed-count");
const matrixBody = document.querySelector("#matrix-body");

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
      target: button.dataset.target,
      resourceType: button.dataset.resourceType,
      action: NEXT_ACTION[button.dataset.editAction],
    });
    renderState(response);
    noticeElement.textContent = "Rule updated. Reload required for previous requests.";
  } catch (error) {
    showError(error);
  }
});

reloadButton.addEventListener("click", async () => {
  await chrome.tabs.reload(currentTab.id);
  window.close();
});

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
  renderMetrics(state.observation, state.matrix.rows.length);
  matrixBody.replaceChildren();
  if (state.matrix.rows.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 6;
    cell.className = "empty";
    cell.textContent = "Reload to collect requests.";
    row.append(cell);
    matrixBody.append(row);
    return;
  }
  for (const rowData of state.matrix.rows) matrixBody.append(createRow(rowData, state.matrix.resourceTypes));
}

function createRow(rowData, resourceTypes) {
  const row = document.createElement("tr");
  const heading = document.createElement("th");
  heading.scope = "row";
  heading.title = rowData.target;
  heading.textContent = rowData.target;
  const count = document.createElement("small");
  count.textContent = String(rowData.total);
  heading.append(count);
  row.append(heading);
  for (const resourceType of resourceTypes) {
    const cellData = rowData.cells[resourceType];
    const cell = document.createElement("td");
    const button = document.createElement("button");
    button.type = "button";
    button.className = `matrix-cell effective-${cellData.effectiveAction} ${cellData.source ? "explicit" : "inherited"}`;
    button.dataset.target = rowData.target;
    button.dataset.resourceType = resourceType;
    button.dataset.editAction = cellData.editAction;
    button.title = `${rowData.target} ${RESOURCE_LABELS[resourceType]}: explicit ${cellData.explicitAction}, effective ${cellData.effectiveAction}`;
    button.setAttribute("aria-label", button.title);
    button.textContent = cellData.explicitAction === "inherit" ? "·" : cellData.explicitAction === "allow" ? "+" : "−";
    cell.append(button);
    row.append(cell);
  }
  return row;
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
