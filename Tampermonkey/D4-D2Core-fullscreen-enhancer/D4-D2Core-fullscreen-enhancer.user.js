// ==UserScript==
// @name         D4 D2Core规划器全屏增强
// @namespace    local.codex.d2core.d4
// @version      1.1.1
// @updated      2026-09-29
// @description  增强D2Core页面内全屏：支持总览/技能/巅峰/雇佣兵切换、Esc退出及巅峰面板与雕文
// @author       维克牛
// @license      MIT
// @homepageURL  https://github.com/iamvicliu/Script/tree/main/Tampermonkey/D4-D2Core-fullscreen-enhancer
// @updateURL    https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/D4-D2Core-fullscreen-enhancer/D4-D2Core-fullscreen-enhancer.user.js
// @downloadURL  https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/D4-D2Core-fullscreen-enhancer/D4-D2Core-fullscreen-enhancer.user.js
// @match        https://www.d2core.com/d4/planner*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  const ENHANCED_CLASS = "d2core-enhanced-site-fullscreen";
  const CUSTOM_FULLSCREEN_CLASS = "d2core-custom-module-fullscreen";
  const NAV_CLASS = "d2core-fullscreen-nav";
  const EXIT_CLASS = "d2core-fullscreen-exit";
  const TRANSITION_CLASS = "d2core-fullscreen-transition";
  const OVERVIEW_CLONE_CLASS = "d2core-overview-clone";
  const STYLE_ID = "d2core-fullscreen-enhancer-style";
  const MODULES = [
    { key: "equipment", label: "总览", nativeFullscreen: false },
    { key: "skills", label: "技能", nativeFullscreen: true },
    { key: "paragon", label: "巅峰", nativeFullscreen: true },
    { key: "mercenary", label: "雇佣兵", nativeFullscreen: false },
  ];

  if (document.getElementById(STYLE_ID)) return;

  let cachedOverview = null;
  let syncQueued = false;
  let transitionTarget = null;
  let transitionTimer = null;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .${NAV_CLASS} {
      position: fixed;
      left: 50%;
      top: 6px;
      z-index: 2147483647;
      transform: translateX(-50%);
      display: flex;
      gap: 4px;
      padding: 3px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 4px;
      background: rgba(20, 20, 20, 0.94);
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
    }

    .${NAV_CLASS} button {
      min-width: 58px;
      height: 30px;
      padding: 0 12px;
      border: 0;
      border-radius: 3px;
      color: #aaa;
      background: transparent;
      font: 15px/30px system-ui, sans-serif;
      cursor: pointer;
    }

    .${NAV_CLASS} button:hover {
      color: #fff;
      background: rgba(255, 255, 255, 0.08);
    }

    .${NAV_CLASS} button[aria-pressed="true"] {
      color: #ffd33d;
      background: rgba(255, 211, 61, 0.12);
    }

    .${EXIT_CLASS} {
      position: fixed;
      top: 10px;
      right: 18px;
      z-index: 2147483647;
      height: 34px;
      padding: 0 14px;
      border: 0;
      border-radius: 4px;
      color: #ddd;
      background: rgba(52, 52, 52, 0.96);
      font: 15px/34px system-ui, sans-serif;
      cursor: pointer;
      box-shadow: 0 3px 12px rgba(0, 0, 0, 0.35);
    }

    .${EXIT_CLASS}:hover {
      color: #fff;
      background: rgba(70, 70, 70, 0.98);
    }

    .${TRANSITION_CLASS} {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      opacity: 1;
      pointer-events: auto;
      background: #151515;
      transition: opacity 120ms ease;
    }

    .${TRANSITION_CLASS}.is-leaving {
      opacity: 0;
      pointer-events: none;
    }

    .build-variants__panel.${CUSTOM_FULLSCREEN_CLASS} {
      position: fixed !important;
      inset: 0 !important;
      z-index: 2147483600 !important;
      display: block !important;
      width: 100vw !important;
      height: 100vh !important;
      margin: 0 !important;
      padding: 58px 24px 24px !important;
      box-sizing: border-box !important;
      overflow-x: hidden !important;
      overflow-y: auto !important;
      background: #151515 !important;
    }

    .build-variants__panel.${CUSTOM_FULLSCREEN_CLASS} > .build-module {
      width: 100% !important;
      max-width: 1600px !important;
      margin: 0 auto 16px !important;
      box-sizing: border-box !important;
    }

    .paragon-planner.fullscreen.${ENHANCED_CLASS} {
      overflow-x: hidden !important;
      overflow-y: auto !important;
    }

    .paragon-planner.fullscreen.${ENHANCED_CLASS} #paragon-planner-content {
      height: calc(100vh - 234px) !important;
      min-height: 420px !important;
      flex: 0 0 auto !important;
    }

    .paragon-planner.fullscreen.${ENHANCED_CLASS} .${OVERVIEW_CLONE_CLASS} {
      display: block !important;
      width: 100% !important;
      min-height: 190px !important;
      padding: 14px 20px 18px !important;
      box-sizing: border-box !important;
      visibility: visible !important;
      background: #222 !important;
    }
  `;
  document.head.appendChild(style);

  function isVisible(element) {
    return Boolean(element?.getClientRects().length);
  }

  function getActiveFullscreen() {
    const paragon = [...document.querySelectorAll(".paragon-planner.fullscreen")].find(isVisible);
    if (paragon) return { root: paragon, module: "paragon" };

    const skills = [...document.querySelectorAll(".skill-tree-wrapper.fullscreen")].find(isVisible);
    if (skills) return { root: skills, module: "skills" };

    const custom = [...document.querySelectorAll(`.${CUSTOM_FULLSCREEN_CLASS}`)].find(isVisible);
    if (!custom) return null;

    return {
      root: custom,
      module: custom.id.replace("variant-panel-", ""),
    };
  }

  function cacheOverview() {
    const overview = [...document.querySelectorAll(".paragon-overview")]
      .find((element) => !element.classList.contains(OVERVIEW_CLONE_CLASS));
    if (overview) {
      cachedOverview = overview.cloneNode(true);
    }
  }

  function findVisibleFullscreenButton(module) {
    const panel = document.querySelector(`#variant-panel-${module}`);
    if (!panel) return null;

    return [...panel.querySelectorAll(".control-button")]
      .find((button) => isVisible(button) && button.textContent.trim() === "全屏") || null;
  }

  function abortTransition() {
    transitionTarget = null;
    window.clearTimeout(transitionTimer);
    transitionTimer = null;
    document.querySelector(`.${TRANSITION_CLASS}`)?.remove();
  }

  function beginTransition(module) {
    abortTransition();
    transitionTarget = module;

    const cover = document.createElement("div");
    cover.className = TRANSITION_CLASS;
    cover.setAttribute("aria-hidden", "true");
    document.body.appendChild(cover);

    transitionTimer = window.setTimeout(() => {
      console.error(`[D2Core 全屏增强] 切换到${module}超时，已撤除过渡遮罩。`);
      abortTransition();
    }, 2500);
  }

  function finishTransition(module) {
    if (transitionTarget !== module) return;

    transitionTarget = null;
    window.clearTimeout(transitionTimer);
    transitionTimer = null;
    const cover = document.querySelector(`.${TRANSITION_CLASS}`);
    if (!cover) return;

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        cover.classList.add("is-leaving");
        window.setTimeout(() => cover.remove(), 140);
      });
    });
  }

  function enterModuleFullscreen(module, attempt = 0) {
    const config = MODULES.find((item) => item.key === module);
    if (!config) return;

    const active = getActiveFullscreen();
    if (active?.module === module) return;

    if (!config.nativeFullscreen) {
      const panel = document.querySelector(`#variant-panel-${module}`);
      if (panel && isVisible(panel)) {
        panel.classList.add(CUSTOM_FULLSCREEN_CLASS);
        queueSync();
        return;
      }

      if (attempt < 20) {
        window.setTimeout(() => enterModuleFullscreen(module, attempt + 1), 50);
      } else {
        console.error(`[D2Core 全屏增强] 找不到${config.label}面板。`);
        abortTransition();
      }
      return;
    }

    const button = findVisibleFullscreenButton(module);
    if (button) {
      button.click();
      return;
    }

    if (attempt < 20) {
      window.setTimeout(() => enterModuleFullscreen(module, attempt + 1), 50);
    } else {
      console.error(`[D2Core 全屏增强] 找不到${config.label}全屏按钮。`);
      abortTransition();
    }
  }

  function exitActiveFullscreen(active = getActiveFullscreen()) {
    if (!active) return;

    if (active.root.classList.contains(CUSTOM_FULLSCREEN_CLASS)) {
      active.root.classList.remove(CUSTOM_FULLSCREEN_CLASS, ENHANCED_CLASS);
      clearEnhancements();
      return;
    }

    const exitButton = [...active.root.querySelectorAll(".control-button")]
      .find((button) => button.textContent.trim() === "退出全屏");
    if (exitButton) exitButton.click();
  }

  function switchModule(module) {
    const active = getActiveFullscreen();
    const tab = document.querySelector(`#variant-tab-${module}`);
    if (!active || !tab || active.module === module) return;

    if (module === "paragon") cacheOverview();
    beginTransition(module);
    exitActiveFullscreen(active);
    tab.click();
    window.setTimeout(() => enterModuleFullscreen(module), 0);
  }

  function createNavigation(activeModule) {
    const nav = document.createElement("div");
    nav.className = NAV_CLASS;
    nav.setAttribute("role", "group");
    nav.setAttribute("aria-label", "全屏模块切换");

    MODULES.forEach(({ key, label }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.dataset.module = key;
      button.setAttribute("aria-pressed", String(key === activeModule));
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        switchModule(key);
      });
      nav.appendChild(button);
    });

    return nav;
  }

  function createExitButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = EXIT_CLASS;
    button.textContent = "退出全屏";
    button.title = "退出全屏（Esc）";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      exitActiveFullscreen();
    });
    return button;
  }

  function addOverview(root) {
    if (!cachedOverview || root.querySelector(`.${OVERVIEW_CLONE_CLASS}`)) return;

    const clone = cachedOverview.cloneNode(true);
    clone.classList.add(OVERVIEW_CLONE_CLASS);
    clone.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
    root.appendChild(clone);
  }

  function clearEnhancements(activeRoot = null) {
    document.querySelectorAll(`.${ENHANCED_CLASS}, .${CUSTOM_FULLSCREEN_CLASS}`).forEach((element) => {
      if (element !== activeRoot) {
        element.classList.remove(ENHANCED_CLASS, CUSTOM_FULLSCREEN_CLASS);
      }
    });
    document.querySelectorAll(`.${NAV_CLASS}, .${EXIT_CLASS}, .${OVERVIEW_CLONE_CLASS}`).forEach((element) => {
      if (!activeRoot?.contains(element)) element.remove();
    });
  }

  function syncEnhancements() {
    syncQueued = false;
    cacheOverview();

    const active = getActiveFullscreen();
    if (!active) {
      clearEnhancements();
      return;
    }

    clearEnhancements(active.root);
    active.root.classList.add(ENHANCED_CLASS);

    let nav = active.root.querySelector(`.${NAV_CLASS}`);
    if (!nav) {
      nav = createNavigation(active.module);
      active.root.appendChild(nav);
    }

    if (active.root.classList.contains(CUSTOM_FULLSCREEN_CLASS)
      && !active.root.querySelector(`.${EXIT_CLASS}`)) {
      active.root.appendChild(createExitButton());
    }

    nav.querySelectorAll("button[data-module]").forEach((button) => {
      const pressed = String(button.dataset.module === active.module);
      if (button.getAttribute("aria-pressed") !== pressed) {
        button.setAttribute("aria-pressed", pressed);
      }
    });

    if (active.module === "paragon") addOverview(active.root);
    finishTransition(active.module);
  }

  function queueSync() {
    if (syncQueued) return;
    syncQueued = true;
    window.requestAnimationFrame(syncEnhancements);
  }

  const observer = new MutationObserver(queueSync);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "style", "aria-selected"],
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const active = getActiveFullscreen();
    if (!active) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    abortTransition();
    exitActiveFullscreen(active);
  }, true);

  cacheOverview();
  queueSync();
})();
