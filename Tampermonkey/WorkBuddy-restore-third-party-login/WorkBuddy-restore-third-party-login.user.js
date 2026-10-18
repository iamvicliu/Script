// ==UserScript==
// @name         WorkBuddy 恢复第三方登录
// @namespace    local.vicliu.workbuddy
// @version      1.0
// @updated      2026-10-18
// @description  在 WorkBuddy 登录页恢复页面原有的 Google、GitHub、X 登录入口。
// @author       维克牛
// @license      MIT
// @homepageURL  https://github.com/iamvicliu/Script/tree/main/Tampermonkey/WorkBuddy-restore-third-party-login
// @updateURL    https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/WorkBuddy-restore-third-party-login/WorkBuddy-restore-third-party-login.user.js
// @downloadURL  https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/WorkBuddy-restore-third-party-login/WorkBuddy-restore-third-party-login.user.js
// @match        https://www.workbuddy.ai/auth/realms/copilot/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  var STYLE_ID = "workbuddy-restore-third-party-login-style";
  var BLOCKING_STYLE_ID = "oneid-only-login-style";
  var PROVIDERS_ID = "kc-social-providers-login";
  var observer = null;

  var css = [
    "html body #" + PROVIDERS_ID + " {",
    "  display: block !important;",
    "  margin: 0 0 18px !important;",
    "}",
    "html body #" + PROVIDERS_ID + " > ul {",
    "  display: grid !important;",
    "  gap: 10px !important;",
    "  margin: 0 !important;",
    "  padding: 0 !important;",
    "  list-style: none !important;",
    "}",
    "html body #" + PROVIDERS_ID + " > ul > li {",
    "  display: block !important;",
    "  margin: 0 !important;",
    "  padding: 0 !important;",
    "}",
    "html body #" + PROVIDERS_ID + " a[id^='social-'] {",
    "  display: flex !important;",
    "  align-items: center !important;",
    "  justify-content: center !important;",
    "  gap: 10px !important;",
    "  min-height: 44px !important;",
    "  box-sizing: border-box !important;",
    "  cursor: pointer !important;",
    "}",
    "html body #" + PROVIDERS_ID + " a[id^='social-'][aria-disabled='true'] {",
    "  cursor: wait !important;",
    "  opacity: 0.65 !important;",
    "}"
  ];

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = css.join("\n");
    (document.head || document.documentElement).appendChild(style);
  }

  function removeOneIdOnlyStyle() {
    var blocked = document.getElementById(BLOCKING_STYLE_ID);
    if (blocked) blocked.remove();
  }

  function showThirdPartyProviders() {
    var providers = document.getElementById(PROVIDERS_ID);
    if (!providers) return;

    providers.style.setProperty("display", "block", "important");

    // 页面里实际存在哪些入口就显示哪些，不额外创建登录按钮。
    var items = providers.querySelectorAll("li");
    for (var i = 0; i < items.length; i++) {
      items[i].style.setProperty("display", "block", "important");
    }
  }

  function applyChanges() {
    installStyle();
    removeOneIdOnlyStyle();
    showThirdPartyProviders();
  }

  function start() {
    applyChanges();
    if (!document.documentElement || observer) return;
    observer = new MutationObserver(applyChanges);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  if (document.documentElement) {
    start();
  } else {
    document.addEventListener("readystatechange", start);
    document.addEventListener("DOMContentLoaded", start, { once: true });
  }
})();
