import { createPolicy, policyCoordinates } from "../shared/models.js";

export class PolicyWorkflow {
  constructor({ store, engine }) {
    this.store = store;
    this.engine = engine;
  }

  async commit({ tabId, scope }) {
    const [persistent, temporary] = await Promise.all([
      this.store.getPersistentPolicies(),
      this.store.getTemporaryPolicies(),
    ]);
    const selected = temporary.filter((policy) => policy.tabId === tabId && policy.scope === scope);
    if (selected.length === 0) return { changed: 0 };

    const promoted = selected.map((policy) => createPolicy({
      scope: policy.scope,
      target: policy.target,
      party: policy.party,
      resourceType: policy.resourceType,
      action: policy.action,
    }));
    const promotedCoordinates = new Set(promoted.map(policyCoordinates));
    const nextPersistent = [
      ...persistent.filter((policy) => !promotedCoordinates.has(policyCoordinates(policy))),
      ...promoted,
    ];
    const selectedIds = new Set(selected.map((policy) => policy.id));
    const nextTemporary = temporary.filter((policy) => !selectedIds.has(policy.id));

    await this.#replaceBoth({ persistent, temporary, nextPersistent, nextTemporary });
    return { changed: selected.length };
  }

  async revert({ tabId, scope }) {
    const temporary = await this.store.getTemporaryPolicies();
    const nextTemporary = temporary.filter((policy) => policy.tabId !== tabId || policy.scope !== scope);
    if (nextTemporary.length === temporary.length) return { changed: 0 };

    this.engine.compiler.compilePolicies(nextTemporary, { temporary: true });
    try {
      await this.store.replacePolicies(nextTemporary, { temporary: true });
      await this.engine.recompile({ temporary: true });
    } catch (error) {
      await this.#restore({ temporary });
      throw error;
    }
    return { changed: temporary.length - nextTemporary.length };
  }

  async #replaceBoth({ persistent, temporary, nextPersistent, nextTemporary }) {
    this.engine.compiler.compilePolicies(nextPersistent, { temporary: false });
    this.engine.compiler.compilePolicies(nextTemporary, { temporary: true });
    try {
      await this.store.replacePolicies(nextPersistent, { temporary: false });
      await this.store.replacePolicies(nextTemporary, { temporary: true });
      await this.engine.recompile({ temporary: false });
      await this.engine.recompile({ temporary: true });
    } catch (error) {
      await this.#restore({ persistent, temporary });
      throw error;
    }
  }

  async #restore({ persistent, temporary }) {
    const errors = [];
    try {
      if (persistent) await this.store.replacePolicies(persistent, { temporary: false });
      if (temporary) await this.store.replacePolicies(temporary, { temporary: true });
      if (persistent) await this.engine.recompile({ temporary: false });
      if (temporary) await this.engine.recompile({ temporary: true });
    } catch (error) {
      errors.push(error);
    }
    if (errors.length) throw new AggregateError(errors, "Could not restore the previous policy generations.");
  }
}
