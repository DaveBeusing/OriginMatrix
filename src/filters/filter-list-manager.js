export class FilterListManager {
  constructor({ services, settingsStore, generationStore = null, updater = null }) {
    if (!Array.isArray(services) || services.length === 0 || services.some((service) => !service?.list?.id)) {
      throw new TypeError("Filter list services are required.");
    }
    if (!settingsStore || typeof settingsStore.getAll !== "function") throw new TypeError("Filter list settings store is required.");
    this.services = new Map(services.map((service) => [service.list.id, service]));
    if (this.services.size !== services.length) throw new TypeError("Filter list IDs must be unique.");
    this.settingsStore = settingsStore;
    this.generationStore = generationStore;
    this.updater = updater;
  }

  async initialize() {
    const settings = await this.settingsStore.getAll();
    for (const [id, service] of this.services) {
      service.setEnabled(settings[id]?.enabled ?? service.list.enabled);
      if (this.generationStore && this.updater) {
        const stored = await this.updater.prepareStored(service, await this.generationStore.get(id));
        if (stored) service.setSource(stored.source, stored.metadata);
      }
    }
    return this.activateAll();
  }

  async activateAll() { return Promise.all([...this.services.values()].map((service) => service.activate())); }
  getStatuses() { return [...this.services.values()].map((service) => service.getStatus()); }

  async setEnabled(id, enabled) {
    const service = this.services.get(id);
    if (!service) throw new TypeError(`Unknown filter list: ${id}`);
    if (typeof enabled !== "boolean") throw new TypeError("Filter list enabled state must be boolean.");
    const previous = service.getStatus().enabled;
    service.setEnabled(enabled);
    try {
      const status = await service.activate();
      await this.settingsStore.setEnabled(id, enabled);
      return status;
    } catch (error) {
      service.setEnabled(previous);
      await service.activate();
      throw error;
    }
  }

  async update(id) {
    const service = this.services.get(id);
    if (!service) throw new TypeError(`Unknown filter list: ${id}`);
    if (!this.updater) throw new Error("Filter list updates are unavailable.");
    const previous = service.getSourceState();
    const staged = await this.updater.downloadAndPrepare(service);
    service.setSource(staged.source, staged.metadata);
    try {
      const status = service.getStatus().enabled ? await service.activatePrepared(staged.prepared) : await service.activate();
      await this.updater.persist(id, staged);
      return status;
    } catch (error) {
      service.setSource(previous.source, previous.metadata);
      if (service.getStatus().enabled && previous.generation) await service.activatePrepared(previous.generation);
      else await service.activate();
      throw error;
    }
  }
}
