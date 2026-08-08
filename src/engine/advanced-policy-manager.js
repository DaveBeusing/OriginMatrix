import { policyCoordinates } from "../shared/models.js";
import { policiesForProfile } from "./profiles.js";
import { importPolicies } from "../storage/policy-transfer.js";

export class AdvancedPolicyManager {
  constructor({ store, engine }) {
    this.store = store;
    this.engine = engine;
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
    const previous = await this.store.getPersistentPolicies();
    const sitePolicies = previous.filter((policy) => policy.scope !== "*");
    const next = [...sitePolicies, ...policiesForProfile(name)];
    await this.#replace(previous, next);
    return { profile: name, policies: next.length };
  }

  async #replace(previous, next) {
    this.engine.compiler.compilePolicies(next, { temporary: false });
    try {
      await this.store.replacePolicies(next, { temporary: false });
      await this.engine.recompile({ temporary: false });
    } catch (error) {
      await this.store.replacePolicies(previous, { temporary: false });
      await this.engine.recompile({ temporary: false });
      throw error;
    }
  }
}

function mergePolicies(existing, imported) {
  const importedCoordinates = new Set(imported.map(policyCoordinates));
  return [...existing.filter((policy) => !importedCoordinates.has(policyCoordinates(policy))), ...imported];
}
