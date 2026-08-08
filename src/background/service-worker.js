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
import { ProfileStore } from "../storage/profile-store.js";
import { FilterListSettingsStore } from "../storage/filter-list-settings-store.js";
import { FilterListGenerationStore } from "../storage/filter-list-generation-store.js";
import { exportPolicies } from "../storage/policy-transfer.js";
import { PARTY, POLICY_ACTION, createPolicy } from "../shared/models.js";
import { EASYLIST } from "../filters/filter-list-catalog.js";
import { FilterListService } from "../filters/filter-list-service.js";
import { FilterListManager } from "../filters/filter-list-manager.js";
import { FilterListUpdater } from "../filters/filter-list-updater.js";
import { NetworkFilterCompiler } from "../filters/network-filter-compiler.js";
import { CosmeticEngine } from "../cosmetic/cosmetic-engine.js";
import { analyzeYouTubeCompatibility } from "../diagnostics/youtube-compatibility.js";
import { ScriptletEngine } from "../scriptlets/scriptlet-engine.js";
import { profileDefinition } from "../engine/profiles.js";
import { RuleAttributionRegistry } from "./rule-attribution-registry.js";
import { DnrMatchObserver } from "./dnr-match-observer.js";

const compiler = new DnrCompiler();
const policyStore = new PolicyStore();
const profileStore = new ProfileStore();
const tabStateManager = new TabStateManager();
const networkEngine = new NetworkEngine();
const cosmeticEngine = new CosmeticEngine();
const scriptletEngine = new ScriptletEngine();
const ruleAttributionRegistry = new RuleAttributionRegistry();
const dnrMatchObserver = new DnrMatchObserver({ tabStateManager, registry: ruleAttributionRegistry });
const filterListService = new FilterListService({
  list: EASYLIST,
  networkEngine,
  compiler: new NetworkFilterCompiler({ budget: networkEngine.budget }),
  cosmeticEngine,
  scriptletEngine,
  loadText: loadBundledText,
});
const filterListGenerationStore = new FilterListGenerationStore({ listIds: [EASYLIST.id] });
const filterListManager = new FilterListManager({
  services: [filterListService],
  settingsStore: new FilterListSettingsStore({ lists: [EASYLIST] }),
  generationStore: filterListGenerationStore,
  updater: new FilterListUpdater({ generationStore: filterListGenerationStore }),
});
const policyEngine = new PolicyEngine({
  store: policyStore,
  resolver: new PolicyResolver(),
  compiler,
  networkEngine,
});
const policyWorkflow = new PolicyWorkflow({ store: policyStore, engine: policyEngine });
const advancedPolicyManager = new AdvancedPolicyManager({
  store: policyStore,
  engine: policyEngine,
  profileStore,
  protectionService: { apply: applyProtectionFeatures },
});
const ruleOptimizer = new RuleOptimizer();
let policyOperations = Promise.resolve();
let youtubeDiagnosticsPromise = null;
const requestObserver = new RequestObserver({
  tabStateManager,
  getTab: (tabId) => chrome.tabs.get(tabId),
});

requestObserver.start();
dnrMatchObserver.start();

const startupReconciliation = reconcileRules().catch((error) => console.error("OriginMatrix reconciliation failed", error));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch((error) => {
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

async function handleMessage(message, sender) {
  if (!message || typeof message.type !== "string") throw new TypeError("Invalid message.");
  switch (message.type) {
    case "GET_TAB_STATE": return Promise.all([policyOperations, startupReconciliation]).then(() => getTabState(message.tabId, message.url));
    case "SET_MATRIX_POLICY": return enqueuePolicyOperation(() => setMatrixPolicy(message));
    case "COMMIT_MATRIX": return enqueuePolicyOperation(() => commitMatrix(message));
    case "REVERT_MATRIX": return enqueuePolicyOperation(() => revertMatrix(message));
    case "GET_DASHBOARD_STATE": return Promise.all([policyOperations, startupReconciliation]).then(getDashboardState);
    case "EXPORT_POLICIES": return policyOperations.then(exportPolicyDocument);
    case "IMPORT_POLICIES": return enqueuePolicyOperation(() => importPolicyDocument(message));
    case "APPLY_PROFILE": return enqueuePolicyOperation(() => applyProfile(message));
    case "SET_FILTER_LIST_ENABLED": return enqueuePolicyOperation(() => setFilterListEnabled(message));
    case "UPDATE_FILTER_LIST": return enqueuePolicyOperation(() => updateFilterList(message));
    case "RECOMPILE_RULES": return enqueuePolicyOperation(recompileWithResult);
    case "CLEAR_SESSION_RULES": return enqueuePolicyOperation(clearSessionRules);
    case "GET_REQUEST_LOG": return getRequestLog(message.tabId);
    case "GET_COSMETIC_SELECTORS": return startupReconciliation.then(() => getCosmeticSelectors(message.hostname));
    case "RUN_SCRIPTLETS": return startupReconciliation.then(() => runScriptletsForSender(sender));
    case "REPORT_COSMETIC_METRICS": return reportCosmeticMetrics(message, sender);
    case "GET_YOUTUBE_DIAGNOSTICS": return getYouTubeDiagnostics();
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
    automaticResolver: { resolve: (context) => filterListService.resolveAutomatic(context) },
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
  filterListService.configure(profileDefinition(await profileStore.get()).features);
  await policyEngine.recompile({ temporary: false });
  await policyEngine.recompile({ temporary: true });
  await filterListManager.initialize();
  await refreshRuleAttribution();
}

async function getDashboardState() {
  const [persistent, temporary, network, observation, activeProfile, statistics] = await Promise.all([
    policyStore.getPersistentPolicies(),
    policyStore.getTemporaryPolicies(),
    networkEngine.getDiagnostics(),
    tabStateManager.getDiagnostics(),
    profileStore.get(),
    tabStateManager.getStatistics(),
  ]);
  const optimization = ruleOptimizer.optimize([...network.dynamicRules, ...network.sessionRules]);
  return {
    ok: true,
    manifestVersion: chrome.runtime.getManifest().version,
    policies: persistent,
    filterLists: filterListManager.getStatuses(),
    profile: profileDefinition(activeProfile),
    statistics,
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
      dnrAttributionAvailable: dnrMatchObserver.available,
      ...scriptletEngine.getDiagnostics(),
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

async function applyProtectionFeatures(features) {
  filterListService.configure(features);
  await filterListManager.activateAll();
}

async function setFilterListEnabled({ id, enabled }) {
  return { ok: true, list: await filterListManager.setEnabled(id, enabled) };
}

async function updateFilterList({ id }) {
  return { ok: true, list: await filterListManager.update(id) };
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
  return { ok: true, tabId, topDomain: state?.topDomain ?? null, attributionAvailable: dnrMatchObserver.available, entries: state?.requestLog ?? [] };
}

function getCosmeticSelectors(hostname) {
  return { ok: true, selectors: cosmeticEngine.getSelectors(hostname) };
}

async function runScriptletsForSender(sender) {
  if (!Number.isInteger(sender?.tab?.id) || !Number.isInteger(sender?.frameId) || sender.frameId < 0) {
    throw new TypeError("Scriptlet execution requires a tab frame sender.");
  }
  const hostname = hostnameFromUrl(sender.url);
  const result = await scriptletEngine.execute(scriptletEngine.prepareForHostname(hostname), {
    tabId: sender.tab.id,
    frameIds: [sender.frameId],
  });
  return { ok: true, executed: result.executed };
}

async function reportCosmeticMetrics({ elementsHidden }, sender) {
  if (!Number.isInteger(sender?.tab?.id) || !Number.isInteger(sender?.frameId) || sender.frameId < 0) {
    throw new TypeError("Cosmetic metrics require a tab frame sender.");
  }
  await tabStateManager.recordCosmeticMetrics({ tabId: sender.tab.id, frameId: sender.frameId, elementsHidden });
  return { ok: true };
}

async function getYouTubeDiagnostics() {
  youtubeDiagnosticsPromise ??= loadBundledText(EASYLIST.path)
    .then((source) => analyzeYouTubeCompatibility(source, { listVersion: EASYLIST.snapshotVersion }));
  return { ok: true, diagnostics: await youtubeDiagnosticsPromise };
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
  const operation = policyOperations.then(task).then(async (result) => {
    await refreshRuleAttribution();
    return result;
  });
  policyOperations = operation.catch(() => {});
  return operation;
}

async function refreshRuleAttribution() {
  const [dynamicRules, sessionRules] = await Promise.all([
    networkEngine.getDynamicRules(),
    networkEngine.getSessionRules(),
  ]);
  ruleAttributionRegistry.replace({ dynamicRules, sessionRules });
}

function validateMatrixCoordinates({ site, scope, target, party }) {
  if (![PARTY.ANY, PARTY.FIRST_PARTY, PARTY.THIRD_PARTY].includes(party)) throw new TypeError("Invalid matrix party.");
  if (scope !== site && scope !== "*") throw new TypeError("Matrix scope does not match the active site.");
  if (scope === "*" && (target !== "*" || party !== PARTY.ANY)) throw new TypeError("Global rows cannot target a site or party.");
  if (target !== "*" && (scope !== site || party !== PARTY.ANY)) throw new TypeError("Domain rows require the current site and any-party scope.");
  if (party !== PARTY.ANY && target !== "*") throw new TypeError("Party rows cannot target a domain.");
}
