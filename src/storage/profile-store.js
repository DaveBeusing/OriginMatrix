import { profileDefinition } from "../engine/profiles.js";

const PROFILE_KEY = "protectionProfile";
const DEFAULT_PROFILE = "balanced";

export class ProfileStore {
  constructor({ localArea = chrome.storage.local } = {}) { this.localArea = localArea; }

  async get() {
    const value = (await this.localArea.get(PROFILE_KEY))[PROFILE_KEY] ?? DEFAULT_PROFILE;
    profileDefinition(value);
    return value;
  }

  async set(name) {
    profileDefinition(name);
    await this.localArea.set({ [PROFILE_KEY]: name });
    return name;
  }
}
