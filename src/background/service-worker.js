import { DnrCompiler } from "../engine/dnr-compiler.js";
import { PolicyStore } from "../storage/policy-store.js";
import { createThirdPartyScriptPolicy } from "../shared/models.js";

const compiler = new DnrCompiler();
const policyStore = new PolicyStore();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch((error) => {
    console.error("OriginMatrix message failed", error);
    sendResponse({ ok: false, error: error.message });
  });
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  policyStore.removeTemporaryPolicy(tabId).catch((error) => {
    console.error("Could not remove closed tab policy", error);
  });
});

async function handleMessage(message) {
  if (!message || typeof message.type !== "string") {
    throw new TypeError("Invalid message.");
  }

  switch (message.type) {
    case "GET_TAB_STATE":
      return getTabState(message.tabId);
    case "ENABLE_THIRD_PARTY_SCRIPTS_BLOCK":
      return enableRule(message.tabId, message.url);
    case "DISABLE_THIRD_PARTY_SCRIPTS_BLOCK":
      return disableRule(message.tabId);
    default:
      throw new TypeError(`Unknown message type: ${message.type}`);
  }
}

async function getTabState(tabId) {
  const policy = await policyStore.getTemporaryPolicy(tabId);
  return { ok: true, active: Boolean(policy), site: policy?.scope ?? null };
}

async function enableRule(tabId, url) {
  const site = hostnameFromUrl(url);
  const policy = createThirdPartyScriptPolicy({ site, tabId });
  const rule = compiler.compileSessionPolicy(policy);

  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [rule.id],
    addRules: [rule],
  });
  try {
    await policyStore.setTemporaryPolicy(policy);
  } catch (error) {
    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [rule.id] });
    throw error;
  }

  return { ok: true, active: true, site };
}

async function disableRule(tabId) {
  const policy = await policyStore.getTemporaryPolicy(tabId);
  const ruleId = 900_000 + tabId;
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] });
  try {
    await policyStore.removeTemporaryPolicy(tabId);
  } catch (error) {
    if (policy) {
      await chrome.declarativeNetRequest.updateSessionRules({
        addRules: [compiler.compileSessionPolicy(policy)],
      });
    }
    throw error;
  }
  return { ok: true, active: false };
}

function hostnameFromUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("OriginMatrix only supports HTTP(S) tabs in Phase 1.");
  }
  return url.hostname.toLowerCase();
}
