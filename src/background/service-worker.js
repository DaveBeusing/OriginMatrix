import { ChromeDnrAdapter } from "./browser-adapter.js";
import { RequestObserver } from "./request-observer.js";
import { TabStateManager } from "./tab-state-manager.js";
import { DnrCompiler } from "../engine/dnr-compiler.js";
import { PolicyEngine } from "../engine/policy-engine.js";
import { PolicyResolver } from "../engine/policy-resolver.js";
import { PolicyWorkflow } from "../engine/policy-workflow.js";
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
const policyWorkflow = new PolicyWorkflow({ store: policyStore, engine: policyEngine });
let policyOperations = Promise.resolve();
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
    await Promise.all([
      enqueuePolicyOperation(async () => {
        await policyStore.removeTemporaryPolicy(tabId);
        await policyEngine.recompile({ temporary: true });
      }),
      tabStateManager.remove(tabId),
    ]);
  } catch (error) {
    console.error("Could not remove closed tab policy", error);
  }
});

async function handleMessage(message) {
  if (!message || typeof message.type !== "string") throw new TypeError("Invalid message.");
  switch (message.type) {
    case "GET_TAB_STATE": return policyOperations.then(() => getTabState(message.tabId, message.url));
    case "SET_MATRIX_POLICY": return enqueuePolicyOperation(() => setMatrixPolicy(message));
    case "COMMIT_MATRIX": return enqueuePolicyOperation(() => commitMatrix(message));
    case "REVERT_MATRIX": return enqueuePolicyOperation(() => revertMatrix(message));
    default: throw new TypeError(`Unknown message type: ${message.type}`);
  }
}

async function getTabState(tabId, url) {
  const [policies, temporary, observation] = await Promise.all([
    policyStore.getAllPolicies(),
    policyStore.getTemporaryPolicies(),
    tabStateManager.get(tabId),
  ]);
  const topDomain = hostnameFromUrl(url);
  const matrix = buildMatrixModel({
    tabId,
    topDomain,
    domains: observation?.domains ?? {},
    policies,
    resolver: policyEngine.resolver,
  });
  const pendingChanges = temporary.filter((policy) => policy.tabId === tabId && policy.scope === topDomain).length;
  return { ok: true, observation, matrix, pendingChanges, reloadRequired: observation?.reloadRequired === true };
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
  await tabStateManager.setReloadRequired({ tabId, required: true, topUrl: url });
  return getTabState(tabId, url);
}

async function commitMatrix({ tabId, url }) {
  const result = await policyWorkflow.commit({ tabId, scope: hostnameFromUrl(url) });
  if (result.changed > 0) await tabStateManager.setReloadRequired({ tabId, required: true, topUrl: url });
  return { ...(await getTabState(tabId, url)), changed: result.changed };
}

async function revertMatrix({ tabId, url }) {
  const result = await policyWorkflow.revert({ tabId, scope: hostnameFromUrl(url) });
  if (result.changed > 0) await tabStateManager.setReloadRequired({ tabId, required: true, topUrl: url });
  return { ...(await getTabState(tabId, url)), changed: result.changed };
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

function enqueuePolicyOperation(task) {
  const operation = policyOperations.then(task);
  policyOperations = operation.catch(() => {});
  return operation;
}
