// ==UserScript==
// @name         D4 D2Core规划器全屏增强
// @namespace    local.codex.d2core.d4
// @version      1.0.1
// @updated      2026-09-28
// @description  增强D2Core自带全屏：支持技能/巅峰切换，并显示巅峰的面板与雕文
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
  const NAV_CLASS = "d2core-fullscreen-nav";
  const OVERVIEW_CLONE_CLASS = "d2core-overview-clone";
  const STYLE_ID = "d2core-fullscreen-enhancer-style";
  const MODULES = ["skills", "paragon"];

  if (document.getElementById(STYLE_ID)) return;

  let cachedOverview = null;
  let syncQueued = false;

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
    return skills ? { root: skills, module: "skills" } : null;
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

  function enterModuleFullscreen(module, attempt = 0) {
    const button = findVisibleFullscreenButton(module);
    if (button) {
      button.click();
      return;
    }

    if (attempt < 20) {
      window.setTimeout(() => enterModuleFullscreen(module, attempt + 1), 50);
    } else {
      console.error(`[D2Core 全屏增强] 找不到${module === "skills" ? "技能" : "巅峰"}全屏按钮。`);
    }
  }

  function switchModule(module) {
    const tab = document.querySelector(`#variant-tab-${module}`);
    if (!tab || tab.getAttribute("aria-selected") === "true") return;

    if (module === "paragon") cacheOverview();
    tab.click();
    window.setTimeout(() => enterModuleFullscreen(module), 0);
  }

  function createNavigation(activeModule) {
    const nav = document.createElement("div");
    nav.className = NAV_CLASS;
    nav.setAttribute("role", "group");
    nav.setAttribute("aria-label", "全屏模块切换");

    const labels = { skills: "技能", paragon: "巅峰" };
    MODULES.forEach((module) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = labels[module];
      button.dataset.module = module;
      button.setAttribute("aria-pressed", String(module === activeModule));
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        switchModule(module);
      });
      nav.appendChild(button);
    });

    return nav;
  }

  function addOverview(root) {
    if (!cachedOverview || root.querySelector(`.${OVERVIEW_CLONE_CLASS}`)) return;

    const clone = cachedOverview.cloneNode(true);
    clone.classList.add(OVERVIEW_CLONE_CLASS);
    clone.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
    root.appendChild(clone);
  }

  function clearEnhancements(activeRoot = null) {
    document.querySelectorAll(`.${ENHANCED_CLASS}`).forEach((element) => {
      if (element !== activeRoot) element.classList.remove(ENHANCED_CLASS);
    });
    document.querySelectorAll(`.${NAV_CLASS}, .${OVERVIEW_CLONE_CLASS}`).forEach((element) => {
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

    nav.querySelectorAll("button[data-module]").forEach((button) => {
      const pressed = String(button.dataset.module === active.module);
      if (button.getAttribute("aria-pressed") !== pressed) {
        button.setAttribute("aria-pressed", pressed);
      }
    });

    if (active.module === "paragon") addOverview(active.root);
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

  cacheOverview();
  queueSync();
})();
