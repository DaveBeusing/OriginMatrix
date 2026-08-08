import { NetworkEngine } from "../network/network-engine.js";
import { RequestObserver } from "./request-observer.js";
import { TabStateManager } from "./tab-state-manager.js";
import { DnrCompiler } from "../engine/dnr-compiler.js";
import { PolicyEngine } from "../engine/policy-engine.js";
import { PolicyResolver } from "../engine/policy-resolver.js";
import { PolicyWorkflow } from "../engine/policy-workflow.js";
import { AdvancedPolicyManager } from "../engine/advanced-policy-manager.js";
import { RuleOptimizer } from "../engine/rule-optimizer.js";
import { buildMatrixModel, MATRIX_RESOURCE_TYPES } from "../engine/matrix-projector.js";
import { PolicyStore } from "../storage/policy-store.js";
import { exportPolicies } from "../storage/policy-transfer.js";
import { PARTY, POLICY_ACTION, createPolicy } from "../shared/models.js";
import { EASYLIST } from "../filters/filter-list-catalog.js";
import { FilterListService } from "../filters/filter-list-service.js";
import { NetworkFilterCompiler } from "../filters/network-filter-compiler.js";
import { CosmeticEngine } from "../cosmetic/cosmetic-engine.js";

const compiler = new DnrCompiler();
const policyStore = new PolicyStore();
const tabStateManager = new TabStateManager();
const networkEngine = new NetworkEngine();
const cosmeticEngine = new CosmeticEngine();
const filterListService = new FilterListService({
  list: EASYLIST,
  networkEngine,
  compiler: new NetworkFilterCompiler({ budget: networkEngine.budget }),
  cosmeticEngine,
  loadText: loadBundledText,
});
const policyEngine = new PolicyEngine({
  store: policyStore,
  resolver: new PolicyResolver(),
  compiler,
  networkEngine,
});
const policyWorkflow = new PolicyWorkflow({ store: policyStore, engine: policyEngine });
const advancedPolicyManager = new AdvancedPolicyManager({ store: policyStore, engine: policyEngine });
const ruleOptimizer = new RuleOptimizer();
let policyOperations = Promise.resolve();
const requestObserver = new RequestObserver({
  tabStateManager,
  getTab: (tabId) => chrome.tabs.get(tabId),
});

requestObserver.start();

const startupReconciliation = reconcileRules().catch((error) => console.error("OriginMatrix reconciliation failed", error));

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
    case "GET_DASHBOARD_STATE": return Promise.all([policyOperations, startupReconciliation]).then(getDashboardState);
    case "EXPORT_POLICIES": return policyOperations.then(exportPolicyDocument);
    case "IMPORT_POLICIES": return enqueuePolicyOperation(() => importPolicyDocument(message));
    case "APPLY_PROFILE": return enqueuePolicyOperation(() => applyProfile(message));
    case "RECOMPILE_RULES": return enqueuePolicyOperation(recompileWithResult);
    case "CLEAR_SESSION_RULES": return enqueuePolicyOperation(clearSessionRules);
    case "GET_REQUEST_LOG": return getRequestLog(message.tabId);
    case "GET_COSMETIC_SELECTORS": return startupReconciliation.then(() => getCosmeticSelectors(message.hostname));
    case "EXPORT_DEBUG_REPORT": return policyOperations.then(exportDebugReport);
    default: throw new TypeError(`Unknown message type: ${message.type}`);
  }
}

async function getTabState(tabId, url) {
  const [policies, temporary, observation, protection] = await Promise.all([
    policyStore.getAllPolicies(),
    policyStore.getTemporaryPolicies(),
    tabStateManager.get(tabId),
    networkEngine.getProtectionStatus(),
  ]);
  const topDomain = hostnameFromUrl(url);
  const matrix = buildMatrixModel({
    tabId,
    topDomain,
    domains: observation?.domains ?? {},
    policies,
    temporaryPolicies: temporary,
    resolver: policyEngine.resolver,
  });
  const pendingChanges = temporary.filter((policy) => policy.tabId === tabId && [topDomain, "*"].includes(policy.scope)).length;
  return { ok: true, observation, matrix, protection, pendingChanges, reloadRequired: observation?.reloadRequired === true };
}

async function setMatrixPolicy({ tabId, url, scope, target, party, resourceType, action }) {
  if (!MATRIX_RESOURCE_TYPES.includes(resourceType)) throw new TypeError(`Unsupported matrix resource type: ${resourceType}`);
  if (!Object.values(POLICY_ACTION).includes(action)) throw new TypeError(`Unsupported matrix action: ${action}`);
  if (resourceType === "cookie" && action === POLICY_ACTION.ALLOW) throw new TypeError("Cookie cells support inherit or block only.");
  const site = hostnameFromUrl(url);
  validateMatrixCoordinates({ site, scope, target, party });
  const policy = createPolicy({
    scope,
    target,
    party,
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
  const site = hostnameFromUrl(url);
  const result = await policyWorkflow.commit({ tabId, scopes: [site, "*"] });
  if (result.changed > 0) await tabStateManager.setReloadRequired({ tabId, required: true, topUrl: url });
  return { ...(await getTabState(tabId, url)), changed: result.changed };
}

async function revertMatrix({ tabId, url }) {
  const site = hostnameFromUrl(url);
  const result = await policyWorkflow.revert({ tabId, scopes: [site, "*"] });
  if (result.changed > 0) await tabStateManager.setReloadRequired({ tabId, required: true, topUrl: url });
  return { ...(await getTabState(tabId, url)), changed: result.changed };
}

async function reconcileRules() {
  await policyEngine.recompile({ temporary: false });
  await policyEngine.recompile({ temporary: true });
  await filterListService.activate();
}

async function getDashboardState() {
  const [persistent, temporary, network, observation] = await Promise.all([
    policyStore.getPersistentPolicies(),
    policyStore.getTemporaryPolicies(),
    networkEngine.getDiagnostics(),
    tabStateManager.getDiagnostics(),
  ]);
  const optimization = ruleOptimizer.optimize([...network.dynamicRules, ...network.sessionRules]);
  return {
    ok: true,
    manifestVersion: chrome.runtime.getManifest().version,
    policies: persistent,
    filterLists: [filterListService.getStatus()],
    diagnostics: {
      persistentPolicies: persistent.length,
      temporaryPolicies: temporary.length,
      dynamicRules: network.dynamicRules.length,
      sessionRules: network.sessionRules.length,
      enabledStaticRulesets: network.enabledStaticRulesets.length,
      availableStaticRules: network.availableStaticRules,
      dynamicRuleBudgetAvailable: network.budget.dynamic.available,
      sessionRuleBudgetAvailable: network.budget.session.available,
      optimizedAway: optimization.optimizedAway,
      ...observation,
    },
  };
}

async function loadBundledText(path) {
  const response = await fetch(chrome.runtime.getURL(path));
  if (!response.ok) throw new Error(`Could not load bundled filter data: ${path}`);
  return response.text();
}

async function exportPolicyDocument() {
  return { ok: true, document: exportPolicies(await policyStore.getPersistentPolicies()) };
}

async function importPolicyDocument({ document, mode }) {
  const result = await advancedPolicyManager.import(document, { mode });
  return { ok: true, ...result };
}

async function applyProfile({ profile }) {
  return { ok: true, ...(await advancedPolicyManager.applyProfile(profile)) };
}

async function recompileWithResult() {
  await reconcileRules();
  return { ok: true };
}

async function clearSessionRules() {
  await policyStore.replacePolicies([], { temporary: true });
  await policyEngine.recompile({ temporary: true });
  return { ok: true };
}

async function getRequestLog(tabId) {
  const state = await tabStateManager.get(tabId);
  return { ok: true, tabId, topDomain: state?.topDomain ?? null, entries: state?.requestLog ?? [] };
}

function getCosmeticSelectors(hostname) {
  return { ok: true, selectors: cosmeticEngine.getSelectors(hostname) };
}

async function exportDebugReport() {
  const state = await getDashboardState();
  return {
    ok: true,
    report: {
      format: "originmatrix-debug",
      version: 1,
      generatedAt: new Date().toISOString(),
      extensionVersion: state.manifestVersion,
      diagnostics: state.diagnostics,
      policies: state.policies,
    },
  };
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

function validateMatrixCoordinates({ site, scope, target, party }) {
  if (![PARTY.ANY, PARTY.FIRST_PARTY, PARTY.THIRD_PARTY].includes(party)) throw new TypeError("Invalid matrix party.");
  if (scope !== site && scope !== "*") throw new TypeError("Matrix scope does not match the active site.");
  if (scope === "*" && (target !== "*" || party !== PARTY.ANY)) throw new TypeError("Global rows cannot target a site or party.");
  if (target !== "*" && (scope !== site || party !== PARTY.ANY)) throw new TypeError("Domain rows require the current site and any-party scope.");
  if (party !== PARTY.ANY && target !== "*") throw new TypeError("Party rows cannot target a domain.");
}
