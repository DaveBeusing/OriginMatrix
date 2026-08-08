const siteElement = document.querySelector("#site");
const statusElement = document.querySelector("#status");
const noticeElement = document.querySelector("#notice");
const toggleButton = document.querySelector("#toggle");
const reloadButton = document.querySelector("#reload");

let currentTab;
let active = false;

initialize().catch(showError);

toggleButton.addEventListener("click", async () => {
  setBusy(true);
  try {
    const type = active
      ? "DISABLE_THIRD_PARTY_SCRIPTS_BLOCK"
      : "ENABLE_THIRD_PARTY_SCRIPTS_BLOCK";
    const response = await send({ type, tabId: currentTab.id, url: currentTab.url });
    render(response.active);
    noticeElement.textContent = "Rule updated. Reload the page to apply it to all requests.";
    reloadButton.disabled = false;
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
});

reloadButton.addEventListener("click", async () => {
  await chrome.tabs.reload(currentTab.id);
  window.close();
});

async function initialize() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!Number.isInteger(tab?.id) || !tab.url) {
    throw new Error("No active browser tab is available.");
  }
  currentTab = tab;
  siteElement.textContent = hostnameFromUrl(tab.url);
  const response = await send({ type: "GET_TAB_STATE", tabId: tab.id });
  render(response.active);
  toggleButton.disabled = false;
  reloadButton.disabled = false;
}

function render(isActive) {
  active = isActive;
  statusElement.textContent = active ? "Active" : "Inactive";
  statusElement.dataset.active = String(active);
  toggleButton.textContent = active ? "Disable rule" : "Block third-party scripts";
}

function setBusy(busy) {
  toggleButton.disabled = busy;
  toggleButton.textContent = busy ? "Updating…" : active ? "Disable rule" : "Block third-party scripts";
}

function hostnameFromUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Open an HTTP(S) page to use OriginMatrix.");
  }
  return url.hostname;
}

async function send(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error ?? "The service worker did not respond.");
  }
  return response;
}

function showError(error) {
  console.error(error);
  noticeElement.textContent = error.message;
  noticeElement.classList.add("error");
  toggleButton.disabled = true;
  reloadButton.disabled = true;
}
