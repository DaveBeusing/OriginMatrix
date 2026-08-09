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
import { CustomFilterStore } from "../storage/custom-filter-store.js";
import { PreparedGenerationCacheStore } from "../storage/prepared-generation-cache-store.js";
import { exportPolicies } from "../storage/policy-transfer.js";
import { PARTY, POLICY_ACTION, createPolicy } from "../shared/models.js";
import { DEFAULT_FILTER_LISTS, EASYLIST } from "../filters/filter-list-catalog.js";
import { validateCustomFilters } from "../filters/custom-filter-validator.js";
import { UnifiedFilterListManager } from "../filters/unified-filter-list-manager.js";
import { FilterListUpdater } from "../filters/filter-list-updater.js";
import { NetworkFilterCompiler } from "../filters/network-filter-compiler.js";
import { CosmeticEngine } from "../cosmetic/cosmetic-engine.js";
import { analyzeYouTubeCompatibility } from "../diagnostics/youtube-compatibility.js";
import { analyzeSiteFilterCoverage } from "../diagnostics/site-filter-coverage.js";
import { analyzeBreakage } from "../diagnostics/breakage-diagnostics.js";
import { ScriptletEngine } from "../scriptlets/scriptlet-engine.js";
import { SCRIPTLET_PHASE } from "../scriptlets/scriptlet-registry.js";
import { profileDefinition } from "../engine/profiles.js";
import { RuleAttributionRegistry } from "./rule-attribution-registry.js";
import { DnrMatchObserver } from "./dnr-match-observer.js";
import { assertTrustedMessage } from "./message-security.js";
import { SpaNavigationLifecycle } from "./spa-navigation-lifecycle.js";
import { PageToolLoader } from "./page-tool-loader.js";

const compiler = new DnrCompiler();
const policyStore = new PolicyStore();
const profileStore = new ProfileStore();
const tabStateManager = new TabStateManager();
const networkEngine = new NetworkEngine();
const cosmeticEngine = new CosmeticEngine();
const scriptletEngine = new ScriptletEngine();
const ruleAttributionRegistry = new RuleAttributionRegistry();
const dnrMatchObserver = new DnrMatchObserver({ tabStateManager, registry: ruleAttributionRegistry });
const filterListGenerationStore = new FilterListGenerationStore({ listIds: DEFAULT_FILTER_LISTS.map(({ id }) => id) });
const customFilterStore = new CustomFilterStore();
const preparedGenerationStore = new PreparedGenerationCacheStore();
const filterListManager = new UnifiedFilterListManager({
  lists: DEFAULT_FILTER_LISTS,
  networkEngine,
  compiler: new NetworkFilterCompiler({ budget: networkEngine.budget }),
  cosmeticEngine,
  scriptletEngine,
  loadText: loadBundledText,
  settingsStore: new FilterListSettingsStore({ lists: DEFAULT_FILTER_LISTS }),
  generationStore: filterListGenerationStore,
  preparedGenerationStore,
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
const workerStartedAt = performance.now();
let workerMessagesHandled = 0;
let startupTimeMs = null;
let policyOperations = Promise.resolve();
let youtubeDiagnosticsPromise = null;
let siteCoverageCache = { source: null, values: new Map() };
const executedScriptletPhases = new Set();
const pageToolLoader = new PageToolLoader();
const spaNavigationLifecycle = new SpaNavigationLifecycle({
  sendMessage: (tabId, message, options) => chrome.tabs.sendMessage(tabId, message, options),
  onNavigation: async ({ tabId, frameId }) => clearExecutedScriptlets(tabId, frameId),
  onTopFrameNavigation: async ({ tabId, url, timeStamp }) => {
    clearExecutedScriptlets(tabId);
    await tabStateManager.startNavigation({ tabId, url, timestamp: timeStamp, preserveDiagnostics: true });
    await tabStateManager.recordBreakageSignal({ tabId, frameId: 0, type: "spa-navigation", timestamp: timeStamp });
  },
  onError: (error, navigation) => {
    console.warn("OriginMatrix SPA navigation update failed", error);
    if (navigation) tabStateManager.recordBreakageSignal({ tabId: navigation.tabId, frameId: navigation.frameId, type: "spa-delivery-failed", details: error.message, timestamp: Date.now() }).catch(console.error);
  },
});
const requestObserver = new RequestObserver({
  tabStateManager,
  getTab: (tabId) => chrome.tabs.get(tabId),
});

requestObserver.start();
dnrMatchObserver.start();
spaNavigationLifecycle.start();

const startupReconciliation = reconcileRules()
  .then(() => { startupTimeMs = roundPerformance(performance.now() - workerStartedAt); })
  .catch((error) => console.error("OriginMatrix reconciliation failed", error));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  Promise.resolve().then(() => assertTrustedMessage(message, sender, chrome.runtime.id))
    .then(() => handleMessage(message, sender)).then(sendResponse).catch((error) => {
    console.error("OriginMatrix message failed", error);
    sendResponse({ ok: false, error: error.message });
  });
  return true;
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  clearExecutedScriptlets(tabId);
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
  workerMessagesHandled += 1;
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
    case "GET_COSMETIC_SELECTORS": return startupReconciliation.then(() => getCosmeticSelectors(message.hostname, sender));
    case "RUN_SCRIPTLETS": return startupReconciliation.then(() => runScriptletsForSender(sender, message.phase, message.navigationId));
    case "REPORT_COSMETIC_METRICS": return reportCosmeticMetrics(message, sender);
    case "REPORT_BREAKAGE_SIGNAL": return reportBreakageSignal(message, sender);
    case "GET_BREAKAGE_DIAGNOSTICS": return Promise.all([policyOperations, startupReconciliation]).then(() => getBreakageDiagnostics(message.tabId));
    case "GET_YOUTUBE_DIAGNOSTICS": return getYouTubeDiagnostics();
    case "GET_SITE_FILTER_COVERAGE": return startupReconciliation.then(() => getSiteFilterCoverage(message.hostname));
    case "GET_CUSTOM_FILTERS": return getCustomFilters();
    case "SAVE_CUSTOM_FILTERS": return enqueuePolicyOperation(() => saveCustomFilters(message.source));
    case "ADD_CUSTOM_FILTER": return enqueuePolicyOperation(() => addCustomFilter(message.rule));
    case "START_ELEMENT_PICKER": return startElementPicker(message.tabId);
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
    automaticResolver: { resolve: (context) => filterListManager.resolveAutomatic(context) },
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
  filterListManager.configureCustomSource((await customFilterStore.get()).source);
  filterListManager.configure(profileDefinition(await profileStore.get()).features);
  await policyEngine.recompile({ temporary: false });
  await policyEngine.recompile({ temporary: true });
  await filterListManager.initialize();
  await refreshRuleAttribution();
}

async function getCustomFilters() {
  const { source } = await customFilterStore.get();
  return { ok: true, ...validateCustomFilters(source) };
}

async function saveCustomFilters(source) {
  const validation = validateCustomFilters(source);
  if (!validation.valid) return { ok: true, saved: false, ...validation };
  const previous = (await customFilterStore.get()).source;
  await filterListManager.setCustomSource(source);
  try { await customFilterStore.set(source); }
  catch (error) { await filterListManager.setCustomSource(previous); throw error; }
  return { ok: true, saved: true, ...validation };
}

async function addCustomFilter(rule) {
  if (typeof rule !== "string" || !rule.trim()) throw new TypeError("A custom filter rule is required.");
  const previous = (await customFilterStore.get()).source;
  const source = `${previous}${previous && !previous.endsWith("\n") ? "\n" : ""}${rule.trim()}\n`;
  return saveCustomFilters(source);
}

async function startElementPicker(tabId) {
  await pageToolLoader.startElementPicker(tabId);
  return { ok: true };
}

async function getDashboardState() {
  const [persistent, temporary, network, observation, activeProfile, statistics, contentPerformance] = await Promise.all([
    policyStore.getPersistentPolicies(),
    policyStore.getTemporaryPolicies(),
    networkEngine.getDiagnostics(),
    tabStateManager.getDiagnostics(),
    profileStore.get(),
    tabStateManager.getStatistics(),
    tabStateManager.getPerformanceDiagnostics(),
  ]);
  const optimization = ruleOptimizer.optimize([...network.dynamicRules, ...network.sessionRules]);
  return {
    ok: true,
    manifestVersion: chrome.runtime.getManifest().version,
    policies: persistent,
    filterLists: filterListManager.getStatuses(),
    profile: profileDefinition(activeProfile),
    statistics,
    performance: {
      startupTimeMs: startupTimeMs ?? "measuring",
      serviceWorkerWakeups: 1,
      serviceWorkerMessages: workerMessagesHandled,
      serviceWorkerUptimeMs: roundPerformance(performance.now() - workerStartedAt),
      dnrRuleCount: network.dynamicRules.length + network.sessionRules.length + network.availableStaticRules,
      memoryUsage: performance.memory?.usedJSHeapSize ?? "unavailable",
      youtubePlaybackBehavior: "manual baseline required",
      pageLoadImpact: "browser profiling required",
      ...filterListManager.getPerformanceDiagnostics(),
      ...contentPerformance,
    },
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
      dnrRulesPrevious: network.dnrGeneration.rulesPrevious,
      dnrRulesNext: network.dnrGeneration.rulesNext,
      dnrRulesAdded: network.dnrGeneration.rulesAdded,
      dnrRulesRemoved: network.dnrGeneration.rulesRemoved,
      dnrRulesChanged: network.dnrGeneration.rulesChanged,
      dnrRulesUnchanged: network.dnrGeneration.rulesUnchanged,
      dnrUpdateCalls: network.dnrGeneration.updateCalls,
      dnrSkippedUpdates: network.dnrGeneration.skippedUpdates,
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
  filterListManager.configure(features);
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

async function getCosmeticSelectors(hostname, sender) {
  const plan = cosmeticEngine.getSelectorPlan(hostname);
  const proceduralFilters = cosmeticEngine.getProceduralFilters(hostname);
  if (Number.isInteger(sender?.tab?.id) && Number.isInteger(sender?.frameId)) {
    const samples = plan.attributions.slice(0, 5);
    for (const sample of samples) await tabStateManager.recordProtectionAction({ tabId: sender.tab.id, frameId: sender.frameId, type: "cosmetic", source: `${sample.source} Cosmetic`, details: sample.rule });
  }
  return { ok: true, selectors: plan.nativeSelectors, dynamicSelectors: plan.dynamicSelectors, proceduralFilters };
}

async function runScriptletsForSender(sender, phase, navigationId = "initial") {
  if (!Number.isInteger(sender?.tab?.id) || !Number.isInteger(sender?.frameId) || sender.frameId < 0 || typeof sender.documentId !== "string" || !sender.documentId) {
    throw new TypeError("Scriptlet execution requires a tab frame sender.");
  }
  if (!Object.values(SCRIPTLET_PHASE).includes(phase)) throw new TypeError("Invalid scriptlet execution phase.");
  if (typeof navigationId !== "string" || !navigationId || navigationId.length > 100) throw new TypeError("Invalid scriptlet navigation ID.");
  const executionKey = `${sender.tab.id}:${sender.frameId}:${sender.documentId}:${navigationId}:${phase}`;
  if (executedScriptletPhases.has(executionKey)) return { ok: true, executed: 0, duplicate: true, phase };
  const hostname = hostnameFromUrl(sender.url);
  const generation = scriptletEngine.prepareForHostname(hostname, { phase });
  const result = await scriptletEngine.execute(generation, {
    tabId: sender.tab.id,
    frameIds: [sender.frameId],
  });
  executedScriptletPhases.add(executionKey);
  if (generation.invocations.length) await tabStateManager.recordProtectionAction({
    tabId: sender.tab.id, frameId: sender.frameId, type: "scriptlet", source: `${phase} scriptlet phase`,
    details: generation.invocations.map((item) => `${item.source}: ${item.rule}`).join(", "),
  });
  return { ok: true, executed: result.executed, duplicate: false, phase };
}

function clearExecutedScriptlets(tabId, frameId = null) {
  const prefix = frameId === null ? `${tabId}:` : `${tabId}:${frameId}:`;
  for (const key of executedScriptletPhases) if (key.startsWith(prefix)) executedScriptletPhases.delete(key);
}

async function reportCosmeticMetrics(message, sender) {
  if (!Number.isInteger(sender?.tab?.id) || !Number.isInteger(sender?.frameId) || sender.frameId < 0) {
    throw new TypeError("Cosmetic metrics require a tab frame sender.");
  }
  await tabStateManager.recordCosmeticMetrics({ tabId: sender.tab.id, frameId: sender.frameId, ...message });
  return { ok: true };
}

async function reportBreakageSignal(message, sender) {
  if (!Number.isInteger(sender?.tab?.id) || !Number.isInteger(sender?.frameId) || sender.frameId < 0) throw new TypeError("Breakage signals require a tab frame sender.");
  await tabStateManager.recordBreakageSignal({ tabId: sender.tab.id, frameId: sender.frameId, type: message.signalType, details: message.details });
  return { ok: true };
}

async function getBreakageDiagnostics(tabId) {
  if (!Number.isInteger(tabId) || tabId < 0) throw new TypeError("Breakage diagnostics require a tab ID.");
  const [state, persistent, temporary] = await Promise.all([tabStateManager.get(tabId), policyStore.getPersistentPolicies(), policyStore.getTemporaryPolicies()]);
  const topDomain = state?.topDomain;
  const relevant = [...persistent.filter((policy) => topDomain && [topDomain, "*"].includes(policy.scope)), ...temporary.filter((policy) => policy.tabId === tabId)];
  return { ok: true, tabId, topDomain: topDomain ?? null, diagnostics: analyzeBreakage({ state, matrixOverrides: relevant }) };
}

function roundPerformance(value) { return Math.round(value * 100) / 100; }

async function getYouTubeDiagnostics() {
  youtubeDiagnosticsPromise ??= Promise.all(DEFAULT_FILTER_LISTS.map(async (list) => ({ list, source: (filterListManager.getSourceState(list.id).source ?? await loadBundledText(list.path)) })))
    .then((sources) => analyzeYouTubeCompatibility(sources.map(({ list, source }) => `! OriginMatrix source: ${list.title}\n${source}`).join("\n"), {
      listVersion: sources.map(({ list }) => `${list.title} ${filterListManager.getSourceState(list.id).metadata?.version ?? list.snapshotVersion}`).join(" + "),
    }));
  return { ok: true, diagnostics: await youtubeDiagnosticsPromise };
}

async function getSiteFilterCoverage(hostname) {
  const sourceState = filterListManager.getSourceState(EASYLIST.id);
  const source = sourceState.source ?? await loadBundledText(EASYLIST.path);
  if (siteCoverageCache.source !== source) siteCoverageCache = { source, values: new Map() };
  if (!siteCoverageCache.values.has(hostname)) {
    siteCoverageCache.values.set(hostname, analyzeSiteFilterCoverage(source, {
      hostname,
      filterList: EASYLIST.title,
      listVersion: sourceState.metadata?.version ?? EASYLIST.snapshotVersion,
    }));
  }
  return { ok: true, diagnostics: siteCoverageCache.values.get(hostname) };
}

async function exportDebugReport() {
  const state = await getDashboardState();
  const tabs = await chrome.tabs.query({});
  const observed = tabs.find((tab) => Number.isInteger(tab.id) && /^https?:/.test(tab.url ?? ""));
  const breakage = observed ? (await getBreakageDiagnostics(observed.id)).diagnostics : null;
  return {
    ok: true,
    report: {
      format: "originmatrix-debug",
      version: 1,
      generatedAt: new Date().toISOString(),
      extensionVersion: state.manifestVersion,
      diagnostics: state.diagnostics,
      performance: state.performance,
      policies: state.policies,
      breakage,
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
  const filterAttributions = filterListManager.getSourceState(DEFAULT_FILTER_LISTS[0].id).generation?.networkAttributions ?? {};
  ruleAttributionRegistry.replace({ dynamicRules, sessionRules, filterAttributions });
}

function validateMatrixCoordinates({ site, scope, target, party }) {
  if (![PARTY.ANY, PARTY.FIRST_PARTY, PARTY.THIRD_PARTY].includes(party)) throw new TypeError("Invalid matrix party.");
  if (scope !== site && scope !== "*") throw new TypeError("Matrix scope does not match the active site.");
  if (scope === "*" && (target !== "*" || party !== PARTY.ANY)) throw new TypeError("Global rows cannot target a site or party.");
  if (target !== "*" && (scope !== site || party !== PARTY.ANY)) throw new TypeError("Domain rows require the current site and any-party scope.");
  if (party !== PARTY.ANY && target !== "*") throw new TypeError("Party rows cannot target a domain.");
}
