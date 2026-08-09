(() => {
  if (globalThis.OriginMatrixElementPicker) return;
  let session = null;
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "ORIGINMATRIX_START_ELEMENT_PICKER") start();
  });

  function start() {
    stop();
    const host = document.createElement("div");
    host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none";
    const root = host.attachShadow({ mode: "closed" });
    const banner = document.createElement("div");
    banner.textContent = "OriginMatrix picker · click an element · Esc to cancel";
    banner.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);padding:9px 14px;border-radius:5px;background:#15181b;color:#fff;font:13px system-ui;box-shadow:0 2px 12px #0008";
    root.append(banner);
    document.documentElement.append(host);
    session = { host, root, highlighted: null, previousOutline: "", move: onMove, click: onClick, key: onKey };
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
  }

  function onMove(event) {
    if (!session || event.composedPath().includes(session.host)) return;
    highlight(event.target instanceof Element ? event.target : null);
  }

  function onClick(event) {
    if (!session || event.composedPath().includes(session.host)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const element = event.target instanceof Element ? event.target : null;
    if (!element) return;
    try { showPreview(`${location.hostname}##${globalThis.OriginMatrixSelectorGenerator.generate(element)}`); }
    catch (error) { showPreview("", error.message); }
  }

  function showPreview(rule, error = "") {
    highlight(null);
    document.removeEventListener("pointermove", session.move, true);
    document.removeEventListener("click", session.click, true);
    const root = session.root;
    const panel = document.createElement("div");
    panel.style.cssText = "pointer-events:auto;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(560px,calc(100vw - 32px));padding:16px;border:1px solid #48535c;border-radius:7px;background:#15181b;color:#fff;font:13px system-ui;box-shadow:0 10px 40px #000b";
    const title = document.createElement("strong"); title.textContent = error ? "Selector could not be generated" : "Preview My Filters rule";
    const preview = document.createElement("textarea"); preview.value = rule; preview.readOnly = true; preview.rows = 3; preview.style.cssText = "box-sizing:border-box;width:100%;margin:12px 0;padding:8px;background:#20252a;color:#fff;border:1px solid #48535c";
    const status = document.createElement("p"); status.textContent = error;
    const save = document.createElement("button"); save.textContent = "Save filter"; save.disabled = !rule;
    const cancel = document.createElement("button"); cancel.textContent = "Cancel"; cancel.style.marginLeft = "8px";
    save.addEventListener("click", async () => { save.disabled = true; try { const response = await chrome.runtime.sendMessage({ type: "ADD_CUSTOM_FILTER", rule }); if (response?.ok && response.saved) stop(); else { status.textContent = response?.errors?.map((item) => `Line ${item.line}: ${item.reason}`).join("; ") ?? response?.error ?? "Could not save filter."; save.disabled = false; } } catch (saveError) { status.textContent = saveError.message; save.disabled = false; } });
    cancel.addEventListener("click", stop);
    panel.append(title, preview, status, save, cancel); root.replaceChildren(panel);
  }

  function highlight(element) { if (!session || session.highlighted === element) return; if (session.highlighted) session.highlighted.style.outline = session.previousOutline; session.highlighted = element; session.previousOutline = element?.style.outline ?? ""; if (element) element.style.outline = "3px solid #ff4d6d"; }
  function onKey(event) { if (event.key === "Escape") { event.preventDefault(); stop(); } }
  function stop() { if (!session) return; highlight(null); document.removeEventListener("pointermove", session.move, true); document.removeEventListener("click", session.click, true); document.removeEventListener("keydown", session.key, true); session.host.remove(); session = null; }
  globalThis.OriginMatrixElementPicker = Object.freeze({ start, stop });
})();
