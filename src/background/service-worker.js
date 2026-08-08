import { ChromeDnrAdapter } from "./browser-adapter.js";
import { DnrCompiler } from "../engine/dnr-compiler.js";
import { PolicyEngine } from "../engine/policy-engine.js";
import { PolicyResolver } from "../engine/policy-resolver.js";
import { PolicyStore } from "../storage/policy-store.js";
import { createThirdPartyScriptPolicy } from "../shared/models.js";

const compiler = new DnrCompiler();
const policyStore = new PolicyStore();
const policyEngine = new PolicyEngine({
  store: policyStore,
  resolver: new PolicyResolver(),
  compiler,
  browserAdapter: new ChromeDnrAdapter(),
});

reconcileRules().catch((error) => console.error("OriginMatrix reconciliation failed", error));

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch((error) => {
    console.error("OriginMatrix message failed", error);
    sendResponse({ ok: false, error: error.message });
  });
  return true;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    await policyStore.removeTemporaryPolicy(tabId);
    await policyEngine.recompile({ temporary: true });
  } catch (error) {
    console.error("Could not remove closed tab policy", error);
  }
});

async function handleMessage(message) {
  if (!message || typeof message.type !== "string") throw new TypeError("Invalid message.");
  switch (message.type) {
    case "GET_TAB_STATE": return getTabState(message.tabId);
    case "ENABLE_THIRD_PARTY_SCRIPTS_BLOCK": return enableRule(message.tabId, message.url);
    case "DISABLE_THIRD_PARTY_SCRIPTS_BLOCK": return disableRule(message.tabId);
    default: throw new TypeError(`Unknown message type: ${message.type}`);
  }
}

async function getTabState(tabId) {
  const policy = await policyStore.getTemporaryPolicy(tabId);
  return { ok: true, active: Boolean(policy), site: policy?.scope ?? null };
}

async function enableRule(tabId, url) {
  const policy = createThirdPartyScriptPolicy({ site: hostnameFromUrl(url), tabId });
  await policyEngine.apply(policy);
  return { ok: true, active: true, site: policy.scope };
}

async function disableRule(tabId) {
  const previous = await policyStore.getTemporaryPolicy(tabId);
  if (previous) await policyStore.removePolicy(previous.id, { temporary: true });
  try {
    await policyEngine.recompile({ temporary: true });
  } catch (error) {
    if (previous) await policyStore.putPolicy(previous);
    throw error;
  }
  return { ok: true, active: false };
}

async function reconcileRules() {
  await policyEngine.recompile({ temporary: false });
  await policyEngine.recompile({ temporary: true });
}

function hostnameFromUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("OriginMatrix only supports HTTP(S) tabs.");
  }
  return url.hostname.toLowerCase();
}
