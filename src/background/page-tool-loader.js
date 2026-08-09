const PICKER_FILES = Object.freeze(["src/picker/selector-generator.js", "src/picker/element-picker.js"]);

export class PageToolLoader {
  constructor({ scripting = chrome.scripting, tabs = chrome.tabs } = {}) { this.scripting = scripting; this.tabs = tabs; }

  async startElementPicker(tabId) {
    if (!Number.isInteger(tabId) || tabId < 0) throw new TypeError("Element picker requires a tab ID.");
    await this.scripting.executeScript({ target: { tabId, frameIds: [0] }, files: [...PICKER_FILES] });
    await this.tabs.sendMessage(tabId, { type: "ORIGINMATRIX_START_ELEMENT_PICKER" }, { frameId: 0 });
  }
}

export const ON_DEMAND_PAGE_TOOL_FILES = PICKER_FILES;
