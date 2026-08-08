import { ChromeDnrAdapter } from "./browser-adapter.js";
import { RequestObserver } from "./request-observer.js";
import { TabStateManager } from "./tab-state-manager.js";
import { DnrCompiler } from "../engine/dnr-compiler.js";
import { PolicyEngine } from "../engine/policy-engine.js";
import { PolicyResolver } from "../engine/policy-resolver.js";
import { buildMatrixModel, MATRIX_RESOURCE_TYPES } from "../engine/matrix-projector.js";
import { PolicyStore } from "../storage/policy-store.js";
import { PARTY, POLICY_ACTION, createPolicy } from "../shared/models.js";

const compiler = new DnrCompiler();
const policyStore = new PolicyStore();
const tabStateManager = new TabStateManager();
const policyEngine = new PolicyEngine({
  store: policyStore,
  resolver: new PolicyResolver(),
  compiler,
  browserAdapter: new ChromeDnrAdapter(),
});
const requestObserver = new RequestObserver({
  tabStateManager,
  getTab: (tabId) => chrome.tabs.get(tabId),
});

requestObserver.start();

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
    await Promise.all([policyStore.removeTemporaryPolicy(tabId), tabStateManager.remove(tabId)]);
    await policyEngine.recompile({ temporary: true });
  } catch (error) {
    console.error("Could not remove closed tab policy", error);
  }
});

async function handleMessage(message) {
  if (!message || typeof message.type !== "string") throw new TypeError("Invalid message.");
  switch (message.type) {
    case "GET_TAB_STATE": return getTabState(message.tabId, message.url);
    case "SET_MATRIX_POLICY": return setMatrixPolicy(message);
    default: throw new TypeError(`Unknown message type: ${message.type}`);
  }
}

async function getTabState(tabId, url) {
  const [policies, observation] = await Promise.all([
    policyStore.getAllPolicies(),
    tabStateManager.get(tabId),
  ]);
  const topDomain = observation?.topDomain ?? hostnameFromUrl(url);
  const matrix = buildMatrixModel({
    tabId,
    topDomain,
    domains: observation?.domains ?? {},
    policies,
    resolver: policyEngine.resolver,
  });
  return { ok: true, observation, matrix };
}

async function setMatrixPolicy({ tabId, url, target, resourceType, action }) {
  if (!MATRIX_RESOURCE_TYPES.includes(resourceType)) throw new TypeError(`Unsupported matrix resource type: ${resourceType}`);
  if (!Object.values(POLICY_ACTION).includes(action)) throw new TypeError(`Unsupported matrix action: ${action}`);
  const policy = createPolicy({
    scope: hostnameFromUrl(url),
    target,
    party: PARTY.ANY,
    resourceType,
    action,
    temporary: true,
    tabId,
  });
  await policyEngine.apply(policy);
  return getTabState(tabId, url);
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
