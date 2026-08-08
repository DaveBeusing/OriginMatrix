import { policyCoordinates } from "../shared/models.js";
import { policiesForProfile, profileDefinition } from "./profiles.js";
import { importPolicies } from "../storage/policy-transfer.js";

export class AdvancedPolicyManager {
  constructor({ store, engine, profileStore = null, protectionService = null }) {
    this.store = store;
    this.engine = engine;
    this.profileStore = profileStore;
    this.protectionService = protectionService;
  }

  async import(input, { mode = "replace" } = {}) {
    if (mode !== "replace" && mode !== "merge") throw new TypeError(`Unsupported import mode: ${mode}`);
    const imported = importPolicies(input);
    const previous = await this.store.getPersistentPolicies();
    const next = mode === "replace" ? imported : mergePolicies(previous, imported);
    await this.#replace(previous, next);
    return { imported: imported.length, total: next.length };
  }

  async applyProfile(name) {
    const definition = profileDefinition(name);
    const previous = await this.store.getPersistentPolicies();
    const previousProfile = await this.profileStore?.get();
    const sitePolicies = previous.filter((policy) => policy.scope !== "*");
    const next = [...sitePolicies, ...policiesForProfile(name)];
    await this.#replace(previous, next, async () => {
      await this.protectionService?.apply(definition.features);
      await this.profileStore?.set(name);
    }, async () => {
      if (previousProfile) {
        await this.protectionService?.apply(profileDefinition(previousProfile).features);
        await this.profileStore?.set(previousProfile);
      }
    });
    return { profile: name, policies: next.length, features: definition.features };
  }

  async #replace(previous, next, afterReplace = async () => {}, afterRollback = async () => {}) {
    this.engine.compiler.compilePolicies(next, { temporary: false });
    try {
      await this.store.replacePolicies(next, { temporary: false });
      await this.engine.recompile({ temporary: false });
      await afterReplace();
    } catch (error) {
      await this.store.replacePolicies(previous, { temporary: false });
      await this.engine.recompile({ temporary: false });
      await afterRollback();
      throw error;
    }
  }
}

function mergePolicies(existing, imported) {
  const importedCoordinates = new Set(imported.map(policyCoordinates));
  return [...existing.filter((policy) => !importedCoordinates.has(policyCoordinates(policy))), ...imported];
}
