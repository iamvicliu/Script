// ==UserScript==
// @name         D4 D2Core规划器全屏增强
// @namespace    local.codex.d2core.d4
// @version      1.0.0
// @updated      2026-09-28
// @description  D2Core规划器全屏时保留技能/巅峰切换，并显示巅峰的面板与雕文
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

  const ROOT_SELECTOR = "#build-module-variants";
  const ENHANCED_CLASS = "d2core-enhanced-fullscreen";
  const STYLE_ID = "d2core-fullscreen-enhancer-style";

  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    ${ROOT_SELECTOR}.${ENHANCED_CLASS} {
      width: 100vw !important;
      height: 100vh !important;
      max-width: none !important;
      margin: 0 !important;
      padding: 0 16px 16px !important;
      box-sizing: border-box !important;
      overflow-x: hidden !important;
      overflow-y: auto !important;
      background: #151515 !important;
    }

    ${ROOT_SELECTOR}.${ENHANCED_CLASS} .variant-tabs__heading,
    ${ROOT_SELECTOR}.${ENHANCED_CLASS} .variant-tabs__variants {
      display: none !important;
    }

    ${ROOT_SELECTOR}.${ENHANCED_CLASS} .variant-tabs__module-bar {
      position: sticky !important;
      top: 0 !important;
      z-index: 2147483646 !important;
      margin: 0 -16px !important;
      padding: 8px 16px 0 !important;
      background: rgba(21, 21, 21, 0.98) !important;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
    }

    ${ROOT_SELECTOR}.${ENHANCED_CLASS} .variant-tabs__modules {
      overflow-x: auto !important;
      scrollbar-width: thin;
    }

    ${ROOT_SELECTOR}.${ENHANCED_CLASS} .build-variants__panel {
      padding-top: 0 !important;
    }

    ${ROOT_SELECTOR}.${ENHANCED_CLASS} .paragon-planner {
      height: auto !important;
      min-height: calc(100vh - 58px) !important;
      overflow: visible !important;
    }

    ${ROOT_SELECTOR}.${ENHANCED_CLASS} #paragon-planner-content {
      height: calc(100vh - 270px) !important;
      min-height: 500px !important;
    }

    ${ROOT_SELECTOR}.${ENHANCED_CLASS} .paragon-overview {
      display: block !important;
      min-height: 167px !important;
      visibility: visible !important;
    }

    ${ROOT_SELECTOR}.${ENHANCED_CLASS} .canvas-tool.control-button,
    ${ROOT_SELECTOR}.${ENHANCED_CLASS} .tree-tool.control-button {
      cursor: pointer !important;
    }

    .d2core-fullscreen-error {
      position: fixed;
      left: 50%;
      bottom: 28px;
      z-index: 2147483647;
      transform: translateX(-50%);
      padding: 10px 14px;
      border: 1px solid #8c3b32;
      border-radius: 4px;
      color: #fff;
      background: #5a201b;
      font: 14px/1.4 system-ui, sans-serif;
      box-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
    }
  `;
  document.head.appendChild(style);

  function isFullscreenButton(element) {
    const button = element.closest(".control-button");
    if (!button || !button.closest(ROOT_SELECTOR)) return null;

    const label = button.textContent.trim();
    return /^(全屏|退出全屏)$/.test(label) ? button : null;
  }

  function showError(message) {
    document.querySelector(".d2core-fullscreen-error")?.remove();
    const toast = document.createElement("div");
    toast.className = "d2core-fullscreen-error";
    toast.textContent = message;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 5000);
  }

  async function toggleEnhancedFullscreen() {
    const root = document.querySelector(ROOT_SELECTOR);
    if (!root) {
      showError("没有找到 D2Core 技能/巅峰区域，请刷新页面后重试。");
      return;
    }

    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    root.classList.add(ENHANCED_CLASS);
    try {
      await root.requestFullscreen();
    } catch (error) {
      root.classList.remove(ENHANCED_CLASS);
      console.error("[D2Core 全屏增强] 进入全屏失败：", error);
      showError("进入全屏失败，请确认浏览器允许此页面使用全屏。");
    }
  }

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (!isFullscreenButton(event.target)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    void toggleEnhancedFullscreen();
  }, true);

  document.addEventListener("fullscreenchange", () => {
    const root = document.querySelector(ROOT_SELECTOR);
    if (!root) return;

    const active = document.fullscreenElement === root;
    root.classList.toggle(ENHANCED_CLASS, active);

    root.querySelectorAll(".control-button").forEach((button) => {
      if (/^(全屏|退出全屏)$/.test(button.textContent.trim())) {
        button.title = active ? "退出完整规划器全屏（Esc）" : "完整规划器全屏";
      }
    });
  });
})();
