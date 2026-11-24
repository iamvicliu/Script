// ==UserScript==
// @name         GitHub 增强套件 (GitHub Enhancer)
// @namespace    https://github.com/iamvicliu/Script/tree/main/Tampermonkey/GitHub-enhancer
// @version      0.4.0
// @updated      2026-11-24
// @description  增强 GitHub 视觉辨识与日常使用体验：功能1 强化 Private / Public / Internal 列表与详情页区分；功能2 Releases 平台筛选与长更新日志折叠（兼容高速下载脚本）；功能3 禁用 GitHub 易误触单键快捷键（s / w）；功能4 Markdown 图片点击原地看大图（灯箱缩放、拖拽与多图切换，不误伤外链与徽章）
// @author       维克牛
// @license      MIT
// @homepageURL  https://github.com/iamvicliu/Script/tree/main/Tampermonkey/GitHub-enhancer
// @updateURL    https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/GitHub-enhancer/GitHub-enhancer.user.js
// @downloadURL  https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/GitHub-enhancer/GitHub-enhancer.user.js
// @match        https://github.com/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// ==/UserScript==

(function () {
  'use strict';

  // ============================================================================
  // 1. 配置管理（所有功能共享一份向后兼容存储）
  // ============================================================================
  const STORAGE_KEY = 'ghe_config_v1';

  const DEFAULT_CONFIG = {
    // 功能1：Private / Public / Internal 可见性增强（列表页 + 详情页）
    visibilityBadge: {
      enabled: true,
      // 配色主题：'amber-green'（默认：Private 琥珀金 + Public 翠绿）| 'red-muted'（Private 警示红 + Public 柔和灰蓝）
      theme: 'amber-green',
      // 列表页私有仓库左侧强调边条
      showListAccentBar: true,
      // 详情页全子页顶栏 + Code 主标题区增强
      enhanceDetailPage: true,
      // 侧边栏 / 顶栏面包屑纯锁图标同步着色
      colorizeLockIcons: true,
      // 私有仓库浏览器标签页标题前置 🔒
      prefixPrivateTabTitle: true,
    },
    // 功能2：Releases 平台筛选与长更新日志折叠
    releaseFilter: {
      enabled: true,
      // null 表示首次按当前操作系统自动检测；[] 表示显示全部
      selectedPlatforms: null,
      // 是否自动折叠超长 Release 说明
      collapseLongNotes: true,
      notesMaxHeight: 420,
    },
    // 功能3：禁用 GitHub 易误触全局单键快捷键
    shortcutGuard: {
      enabled: true,
      blockedKeys: ['s', 'w'],
    },
    // 功能4：Markdown 图片点击原地看大图（Lightbox 灯箱）
    imageLightbox: {
      enabled: true,
    },
  };

  function deepMerge(target, source) {
    const out = { ...target };
    if (!source || typeof source !== 'object') return out;
    for (const key of Object.keys(source)) {
      const val = source[key];
      if (val && typeof val === 'object' && !Array.isArray(val) && target[key] && typeof target[key] === 'object') {
        out[key] = deepMerge(target[key], val);
      } else if (val !== undefined) {
        out[key] = Array.isArray(val) ? val.slice() : val;
      }
    }
    return out;
  }

  function loadConfig() {
    try {
      const raw = typeof GM_getValue === 'function' ? GM_getValue(STORAGE_KEY, null) : null;
      if (!raw) return deepMerge({}, DEFAULT_CONFIG);
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return deepMerge(DEFAULT_CONFIG, parsed);
    } catch {
      return deepMerge({}, DEFAULT_CONFIG);
    }
  }

  function saveConfig(cfg) {
    try {
      if (typeof GM_setValue === 'function') {
        GM_setValue(STORAGE_KEY, JSON.stringify(cfg));
      }
    } catch {
      // 忽略存储异常
    }
  }

  const config = loadConfig();

  // ============================================================================
  // 2. 样式注入工具与统一菜单管理器
  // ============================================================================
  function injectCSS(cssText) {
    if (typeof GM_addStyle === 'function') {
      GM_addStyle(cssText);
      return;
    }
    const style = document.createElement('style');
    style.setAttribute('data-ghe-style', 'true');
    style.textContent = cssText;
    (document.head || document.documentElement).appendChild(style);
  }

  const MenuManager = {
    registeredIds: [],

    refreshAllMenus(features) {
      if (typeof GM_registerMenuCommand !== 'function') return;

      if (typeof GM_unregisterMenuCommand === 'function') {
        for (const id of this.registeredIds) {
          try {
            GM_unregisterMenuCommand(id);
          } catch {
            // 忽略注销异常
          }
        }
        this.registeredIds = [];
      }

      for (const feature of features) {
        if (typeof feature.getMenus !== 'function') continue;
        const items = feature.getMenus();
        for (const item of items) {
          const id = GM_registerMenuCommand(item.label, () => {
            item.onClick();
            saveConfig(config);
            for (const f of features) {
              if (typeof f.applyRootFlags === 'function') f.applyRootFlags();
              if (typeof f.scan === 'function') f.scan(document);
            }
            if (typeof GM_unregisterMenuCommand === 'function') {
              this.refreshAllMenus(features);
            }
          });
          if (id !== undefined) this.registeredIds.push(id);
        }
      }
    },
  };

  // ============================================================================
  // 3. 功能1：增强 Private / Public / Internal 区分（列表页 + 详情页）
  // ============================================================================
  const VISIBILITY_PATTERN = /^(Private|Public|Internal)(?:\s+(template|archive))?$/;
  const NON_REPO_FIRST_SEGMENTS = new Set([
    '', 'settings', 'notifications', 'explore', 'marketplace', 'sponsors',
    'orgs', 'organizations', 'users', 'search', 'issues', 'pulls', 'codespaces',
    'copilot', 'features', 'enterprise', 'pricing', 'login', 'signup', 'join',
    'new', 'topics', 'collections', 'trending', 'events', 'account', 'stars',
    'watching', 'sessions', 'dashboard', 'feed', 'gist', 'about', 'security',
    'customer-stories', 'team', 'solutions', 'resources', 'apps', 'integrations',
  ]);
  const TAB_LOCK_PREFIX = '🔒 ';

  // 使用纯 SVG alpha 遮罩（mask-image），零 DOM 子节点侵入，彻底避免 React 冲突
  const SVG_LOCK =
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='black' fill-rule='evenodd' d='M4 4a4 4 0 0 1 8 0v2h.25c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 12.25 15h-8.5A1.75 1.75 0 0 1 2 13.25v-5.5C2 6.784 2.784 6 3.75 6H4Zm1.5 2h5V4a2.5 2.5 0 1 0-5 0v2Zm2.5 3.25a1.25 1.25 0 0 0-.65 2.317l-.1 1.183a.5.5 0 0 0 .5.5h.5a.5.5 0 0 0 .5-.5l-.1-1.183A1.25 1.25 0 0 0 8 9.25Z'/%3E%3C/svg%3E\")";

  const SVG_GLOBE =
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='black' d='M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM5.78 8.75a9.64 9.64 0 0 0 1.363 4.177c.255.426.542.832.857 1.215.245-.296.551-.705.857-1.215A9.64 9.64 0 0 0 10.22 8.75Zm4.44-1.5a9.64 9.64 0 0 0-1.363-4.177c-.307-.51-.612-.919-.857-1.215a9.927 9.927 0 0 0-.857 1.215A9.64 9.64 0 0 0 5.78 7.25Zm-5.944 1.5H1.543a6.507 6.507 0 0 0 4.666 5.5c-.123-.181-.24-.365-.352-.552-.715-1.192-1.437-2.874-1.581-4.948Zm-2.733-1.5h2.733c.144-2.074.866-3.756 1.58-4.948.12-.197.237-.381.353-.552a6.507 6.507 0 0 0-4.666 5.5Zm10.181 1.5c-.144 2.074-.866 3.756-1.58 4.948-.12.197-.237.381-.353.552a6.507 6.507 0 0 0 4.666-5.5Zm2.733-1.5a6.507 6.507 0 0 0-4.666-5.5c.123.181.24.365.353.552.714 1.192 1.436 2.874 1.58 4.948Z'/%3E%3C/svg%3E\")";

  const SVG_BUILDING =
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='black' d='M1.75 16A1.75 1.75 0 0 1 0 14.25V1.75C0 .784.784 0 1.75 0h8.5C11.216 0 12 .784 12 1.75v12.5c0 .085-.006.168-.018.25h2.268a.25.25 0 0 0 .25-.25V8.285a.25.25 0 0 0-.111-.208l-1.055-.703a.749.749 0 1 1 .832-1.248l1.055.703c.487.325.779.871.779 1.456v5.965A1.75 1.75 0 0 1 14.25 16h-3.5a.766.766 0 0 1-.197-.026c-.099.017-.2.026-.303.026h-3a.75.75 0 0 1-.75-.75V14h-1v1.25a.75.75 0 0 1-.75.75Zm-.25-1.75c0 .138.112.25.25.25H4v-1.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 .75.75v1.25h2.25a.25.25 0 0 0 .25-.25V1.75a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25ZM3.75 6h.5a.75.75 0 0 1 0 1.5h-.5a.75.75 0 0 1 0-1.5ZM3 3.75A.75.75 0 0 1 3.75 3h.5a.75.75 0 0 1 0 1.5h-.5A.75.75 0 0 1 3 3.75ZM7.75 3h.5a.75.75 0 0 1 0 1.5h-.5a.75.75 0 0 1 0-1.5ZM7 6.75A.75.75 0 0 1 7.75 6h.5a.75.75 0 0 1 0 1.5h-.5A.75.75 0 0 1 7 6.75ZM3.75 9h.5a.75.75 0 0 1 0 1.5h-.5a.75.75 0 0 1 0-1.5Zm4 0h.5a.75.75 0 0 1 0 1.5h-.5a.75.75 0 0 1 0-1.5Z'/%3E%3C/svg%3E\")";

  const VISIBILITY_LABELS = {
    private: 'Private',
    public: 'Public',
    internal: 'Internal',
  };

  const visibilityBadgeFeature = {
    id: 'visibilityBadge',
    name: 'Private / Public 可见性增强',
    titleObserver: null,

    styles() {
      return `
        /* ===== 浅色主题变量（默认：琥珀金 Private + 翠绿 Public） ===== */
        :root {
          --ghe-private-fg: #9a6700;
          --ghe-private-icon: #bf8700;
          --ghe-private-bg: #fff8c5;
          --ghe-private-border: rgba(212, 167, 44, 0.55);
          --ghe-private-bar: #d4a72c;
          --ghe-private-row-bg: rgba(255, 248, 197, 0.28);
          --ghe-private-header-top: rgba(255, 248, 197, 0.56);
          --ghe-private-header-bottom: rgba(255, 248, 197, 0.16);

          --ghe-public-fg: #1a7f37;
          --ghe-public-icon: #1f883d;
          --ghe-public-bg: #dafbe1;
          --ghe-public-border: rgba(45, 164, 78, 0.42);
          --ghe-public-bar: #2da44e;

          --ghe-internal-fg: #6639ba;
          --ghe-internal-icon: #8250df;
          --ghe-internal-bg: #fbefff;
          --ghe-internal-border: rgba(130, 80, 223, 0.42);
          --ghe-internal-bar: #8250df;
          --ghe-internal-row-bg: rgba(251, 239, 255, 0.45);
          --ghe-internal-header-top: rgba(251, 239, 255, 0.65);
          --ghe-internal-header-bottom: rgba(251, 239, 255, 0.18);
        }

        /* ===== 配色方案 B：警示红 Private + 柔和灰蓝 Public ===== */
        html[data-ghe-vis-theme="red-muted"] {
          --ghe-private-fg: #cf222e;
          --ghe-private-icon: #cf222e;
          --ghe-private-bg: #ffebe9;
          --ghe-private-border: rgba(255, 129, 130, 0.55);
          --ghe-private-bar: #cf222e;
          --ghe-private-row-bg: rgba(255, 235, 233, 0.30);
          --ghe-private-header-top: rgba(255, 235, 233, 0.55);
          --ghe-private-header-bottom: rgba(255, 235, 233, 0.14);

          --ghe-public-fg: #57606a;
          --ghe-public-icon: #6e7781;
          --ghe-public-bg: #f6f8fa;
          --ghe-public-border: rgba(175, 184, 193, 0.55);
          --ghe-public-bar: #8c959f;
        }

        /* ===== 深色主题变量（GitHub Dark / Dimmed / High Contrast） ===== */
        html[data-color-mode="dark"] {
          --ghe-private-fg: #e3b341;
          --ghe-private-icon: #e3b341;
          --ghe-private-bg: rgba(187, 128, 9, 0.20);
          --ghe-private-border: rgba(210, 153, 34, 0.52);
          --ghe-private-bar: #d29922;
          --ghe-private-row-bg: rgba(187, 128, 9, 0.09);
          --ghe-private-header-top: rgba(187, 128, 9, 0.16);
          --ghe-private-header-bottom: rgba(187, 128, 9, 0.04);

          --ghe-public-fg: #3fb950;
          --ghe-public-icon: #3fb950;
          --ghe-public-bg: rgba(46, 160, 67, 0.16);
          --ghe-public-border: rgba(63, 185, 80, 0.42);
          --ghe-public-bar: #3fb950;

          --ghe-internal-fg: #a371f7;
          --ghe-internal-icon: #a371f7;
          --ghe-internal-bg: rgba(137, 87, 229, 0.18);
          --ghe-internal-border: rgba(163, 113, 247, 0.45);
          --ghe-internal-bar: #a371f7;
          --ghe-internal-row-bg: rgba(137, 87, 229, 0.10);
          --ghe-internal-header-top: rgba(137, 87, 229, 0.16);
          --ghe-internal-header-bottom: rgba(137, 87, 229, 0.04);
        }

        html[data-color-mode="dark"][data-ghe-vis-theme="red-muted"] {
          --ghe-private-fg: #ff7b72;
          --ghe-private-icon: #ff7b72;
          --ghe-private-bg: rgba(248, 81, 73, 0.18);
          --ghe-private-border: rgba(248, 81, 73, 0.48);
          --ghe-private-bar: #f85149;
          --ghe-private-row-bg: rgba(248, 81, 73, 0.09);
          --ghe-private-header-top: rgba(248, 81, 73, 0.15);
          --ghe-private-header-bottom: rgba(248, 81, 73, 0.04);

          --ghe-public-fg: #8b949e;
          --ghe-public-icon: #8b949e;
          --ghe-public-bg: rgba(110, 118, 129, 0.14);
          --ghe-public-border: rgba(139, 148, 158, 0.36);
          --ghe-public-bar: #6e7681;
        }

        @media (prefers-color-scheme: dark) {
          html[data-color-mode="auto"] {
            --ghe-private-fg: #e3b341;
            --ghe-private-icon: #e3b341;
            --ghe-private-bg: rgba(187, 128, 9, 0.20);
            --ghe-private-border: rgba(210, 153, 34, 0.52);
            --ghe-private-bar: #d29922;
            --ghe-private-row-bg: rgba(187, 128, 9, 0.09);
            --ghe-private-header-top: rgba(187, 128, 9, 0.16);
            --ghe-private-header-bottom: rgba(187, 128, 9, 0.04);

            --ghe-public-fg: #3fb950;
            --ghe-public-icon: #3fb950;
            --ghe-public-bg: rgba(46, 160, 67, 0.16);
            --ghe-public-border: rgba(63, 185, 80, 0.42);
            --ghe-public-bar: #3fb950;

            --ghe-internal-fg: #a371f7;
            --ghe-internal-icon: #a371f7;
            --ghe-internal-bg: rgba(137, 87, 229, 0.18);
            --ghe-internal-border: rgba(163, 113, 247, 0.45);
            --ghe-internal-bar: #a371f7;
            --ghe-internal-row-bg: rgba(137, 87, 229, 0.10);
            --ghe-internal-header-top: rgba(137, 87, 229, 0.16);
            --ghe-internal-header-bottom: rgba(137, 87, 229, 0.04);
          }

          html[data-color-mode="auto"][data-ghe-vis-theme="red-muted"] {
            --ghe-private-fg: #ff7b72;
            --ghe-private-icon: #ff7b72;
            --ghe-private-bg: rgba(248, 81, 73, 0.18);
            --ghe-private-border: rgba(248, 81, 73, 0.48);
            --ghe-private-bar: #f85149;
            --ghe-private-row-bg: rgba(248, 81, 73, 0.09);
            --ghe-private-header-top: rgba(248, 81, 73, 0.15);
            --ghe-private-header-bottom: rgba(248, 81, 73, 0.04);

            --ghe-public-fg: #8b949e;
            --ghe-public-icon: #8b949e;
            --ghe-public-bg: rgba(110, 118, 129, 0.14);
            --ghe-public-border: rgba(139, 148, 158, 0.36);
            --ghe-public-bar: #6e7681;
          }
        }

        /* ===== 可见性徽章通用样式 ===== */
        html[data-ghe-vis-enabled="true"] span[data-ghe-vis]:not(.d-none) {
          display: inline-flex !important;
          align-items: center !important;
          gap: 4px !important;
          padding: 1px 8px 1px 6px !important;
          font-weight: 600 !important;
          line-height: 18px !important;
          border-width: 1px !important;
          border-style: solid !important;
          border-radius: 999px !important;
          vertical-align: middle !important;
          white-space: nowrap !important;
          transition: background-color 0.15s ease, border-color 0.15s ease;
        }

        /* 兼容仓库顶部 Header 的响应式隐藏类 d-none d-md-block */
        @media (min-width: 768px) {
          html[data-ghe-vis-enabled="true"] span[data-ghe-vis].d-none.d-md-block,
          html[data-ghe-vis-enabled="true"] span[data-ghe-vis].d-none.d-md-inline-block {
            display: inline-flex !important;
          }
        }

        html[data-ghe-vis-enabled="true"] span[data-ghe-vis]::before {
          content: "";
          display: inline-block;
          width: 12px;
          height: 12px;
          flex-shrink: 0;
          -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
          -webkit-mask-position: center;
          mask-position: center;
          -webkit-mask-size: contain;
          mask-size: contain;
        }

        /* Private：带颜色的锁图标 */
        html[data-ghe-vis-enabled="true"] span[data-ghe-vis="private"] {
          color: var(--ghe-private-fg) !important;
          background-color: var(--ghe-private-bg) !important;
          border-color: var(--ghe-private-border) !important;
        }
        html[data-ghe-vis-enabled="true"] span[data-ghe-vis="private"]::before {
          background-color: var(--ghe-private-icon);
          -webkit-mask-image: ${SVG_LOCK};
          mask-image: ${SVG_LOCK};
        }

        /* Public：地球图标 */
        html[data-ghe-vis-enabled="true"] span[data-ghe-vis="public"] {
          color: var(--ghe-public-fg) !important;
          background-color: var(--ghe-public-bg) !important;
          border-color: var(--ghe-public-border) !important;
        }
        html[data-ghe-vis-enabled="true"] span[data-ghe-vis="public"]::before {
          background-color: var(--ghe-public-icon);
          -webkit-mask-image: ${SVG_GLOBE};
          mask-image: ${SVG_GLOBE};
        }

        /* Internal：企业内部建筑图标 */
        html[data-ghe-vis-enabled="true"] span[data-ghe-vis="internal"] {
          color: var(--ghe-internal-fg) !important;
          background-color: var(--ghe-internal-bg) !important;
          border-color: var(--ghe-internal-border) !important;
        }
        html[data-ghe-vis-enabled="true"] span[data-ghe-vis="internal"]::before {
          background-color: var(--ghe-internal-icon);
          -webkit-mask-image: ${SVG_BUILDING};
          mask-image: ${SVG_BUILDING};
        }

        /* 归档仓库略微柔和以示区分 */
        html[data-ghe-vis-enabled="true"] span[data-ghe-vis][data-ghe-vis-variant="archive"] {
          opacity: 0.85;
          border-style: dashed !important;
        }

        /* ===== 仓库列表页 Private 左侧细微指示条（可关闭） ===== */
        html[data-ghe-vis-enabled="true"][data-ghe-vis-bar="true"] #user-repositories-list li.private,
        html[data-ghe-vis-enabled="true"][data-ghe-vis-bar="true"] .org-repos li.private,
        html[data-ghe-vis-enabled="true"][data-ghe-vis-bar="true"] [data-ghe-vis-row="private"] {
          box-shadow: inset 3px 0 0 var(--ghe-private-bar);
          margin-left: -10px;
          padding-left: 10px !important;
          background-image: linear-gradient(90deg, var(--ghe-private-row-bg) 0%, transparent 180px);
          border-radius: 2px;
        }

        /* ===== 仓库详情页：顶栏常驻感知（Code / Issues / PR / Actions / Settings 全子页生效） ===== */
        /* 1) Private 详情页顶栏：3px 琥珀金顶条 + 柔和淡金微渐变 */
        html[data-ghe-vis-enabled="true"][data-ghe-vis-detail="true"][data-ghe-repo-vis="private"] .AppHeader,
        html[data-ghe-vis-enabled="true"][data-ghe-vis-detail="true"][data-ghe-repo-vis="private"] header[role="banner"] {
          box-shadow: inset 0 3px 0 var(--ghe-private-bar), inset 0 -1px 0 var(--ghe-private-border) !important;
          background-image: linear-gradient(180deg, var(--ghe-private-header-top) 0%, var(--ghe-private-header-bottom) 100%) !important;
        }
        html[data-ghe-vis-enabled="true"][data-ghe-vis-detail="true"][data-ghe-repo-vis="private"] .AppHeader .AppHeader-globalBar,
        html[data-ghe-vis-enabled="true"][data-ghe-vis-detail="true"][data-ghe-repo-vis="private"] .AppHeader .AppHeader-localBar {
          background-color: transparent !important;
        }

        /* 经典仓库 Header 容器在私有库下也保持淡金呼应 */
        html[data-ghe-vis-enabled="true"][data-ghe-vis-detail="true"][data-ghe-repo-vis="private"] #repository-container-header {
          background-image: linear-gradient(180deg, var(--ghe-private-header-bottom) 0%, transparent 100%) !important;
        }

        /* 2) Internal 详情页顶栏：3px 紫条 + 极淡紫渐变 */
        html[data-ghe-vis-enabled="true"][data-ghe-vis-detail="true"][data-ghe-repo-vis="internal"] .AppHeader,
        html[data-ghe-vis-enabled="true"][data-ghe-vis-detail="true"][data-ghe-repo-vis="internal"] header[role="banner"] {
          box-shadow: inset 0 3px 0 var(--ghe-internal-bar), inset 0 -1px 0 var(--ghe-internal-border) !important;
          background-image: linear-gradient(180deg, var(--ghe-internal-header-top) 0%, var(--ghe-internal-header-bottom) 100%) !important;
        }
        html[data-ghe-vis-enabled="true"][data-ghe-vis-detail="true"][data-ghe-repo-vis="internal"] .AppHeader .AppHeader-globalBar,
        html[data-ghe-vis-enabled="true"][data-ghe-vis-detail="true"][data-ghe-repo-vis="internal"] .AppHeader .AppHeader-localBar {
          background-color: transparent !important;
        }

        /* 3) Public 详情页顶栏：克制的 2px 清透翠绿顶条（不铺大面积绿底） */
        html[data-ghe-vis-enabled="true"][data-ghe-vis-detail="true"][data-ghe-repo-vis="public"] .AppHeader,
        html[data-ghe-vis-enabled="true"][data-ghe-vis-detail="true"][data-ghe-repo-vis="public"] header[role="banner"] {
          box-shadow: inset 0 2px 0 var(--ghe-public-bar) !important;
        }

        /* 4) 顶栏面包屑旁迷你常驻药丸（全子页可见，不遮挡原仓库名与切换箭头） */
        .ghe-header-pill {
          display: none !important;
          font-size: 11px !important;
          line-height: 16px !important;
          padding: 1px 7px 1px 6px !important;
          margin-left: 6px !important;
          flex-shrink: 0 !important;
          user-select: none;
        }
        html[data-ghe-vis-enabled="true"][data-ghe-vis-detail="true"] .ghe-header-pill {
          display: inline-flex !important;
        }
        html[data-ghe-vis-enabled="true"][data-ghe-vis-detail="true"] .ghe-header-pill::before {
          width: 11px;
          height: 11px;
        }

        /* 5) Code 页主标题栏（头像 + 仓库名 + Private 徽章）：复刻列表页同款左强调条 + 淡金渐变 */
        html[data-ghe-vis-enabled="true"][data-ghe-vis-detail="true"][data-ghe-repo-vis="private"] [data-ghe-repo-titlebar="private"] {
          box-shadow: inset 3px 0 0 var(--ghe-private-bar);
          background-image: linear-gradient(90deg, var(--ghe-private-row-bg) 0%, transparent 380px);
          padding: 5px 12px 5px 11px !important;
          border-radius: 6px;
        }

        html[data-ghe-vis-enabled="true"][data-ghe-vis-detail="true"][data-ghe-repo-vis="internal"] [data-ghe-repo-titlebar="internal"] {
          box-shadow: inset 3px 0 0 var(--ghe-internal-bar);
          background-image: linear-gradient(90deg, var(--ghe-internal-row-bg) 0%, transparent 380px);
          padding: 5px 12px 5px 11px !important;
          border-radius: 6px;
        }

        /* ===== 顶栏面包屑 / 侧边栏 / 仓库标题纯锁图标同步着色（可关闭） ===== */
        html[data-ghe-vis-enabled="true"][data-ghe-vis-locks="true"] .AppHeader svg.octicon-lock,
        html[data-ghe-vis-enabled="true"][data-ghe-vis-locks="true"] header[role="banner"] svg.octicon-lock,
        html[data-ghe-vis-enabled="true"][data-ghe-vis-locks="true"] .AppHeader-context svg.octicon-lock,
        html[data-ghe-vis-enabled="true"][data-ghe-vis-locks="true"] #repository-container-header svg.octicon-lock,
        html[data-ghe-vis-enabled="true"][data-ghe-vis-locks="true"] #repo-title-component svg.octicon-lock,
        html[data-ghe-vis-enabled="true"][data-ghe-vis-locks="true"] .dashboard-sidebar svg.octicon-lock,
        html[data-ghe-vis-enabled="true"][data-ghe-vis-locks="true"] aside[aria-label="Account"] svg.octicon-lock,
        html[data-ghe-vis-enabled="true"][data-ghe-vis-locks="true"] [data-target="loading-context.details"] svg.octicon-lock {
          color: var(--ghe-private-icon) !important;
          fill: var(--ghe-private-icon) !important;
        }
      `;
    },

    applyRootFlags() {
      const root = document.documentElement;
      const opt = config.visibilityBadge;
      root.setAttribute('data-ghe-vis-enabled', String(Boolean(opt.enabled)));
      root.setAttribute('data-ghe-vis-theme', opt.theme || 'amber-green');
      root.setAttribute('data-ghe-vis-bar', String(Boolean(opt.showListAccentBar)));
      root.setAttribute('data-ghe-vis-detail', String(Boolean(opt.enhanceDetailPage)));
      root.setAttribute('data-ghe-vis-locks', String(Boolean(opt.colorizeLockIcons)));
    },

    /**
     * 判断一个 span 是否属于 GitHub 仓库可见性徽章，避免误伤 Issue Label / 正文 / 下拉菜单
     */
    isCandidateBadge(el) {
      if (!el || el.tagName !== 'SPAN') return false;
      if (el.classList.contains('ghe-header-pill')) return false;
      if (el.childElementCount > 0) return false;

      if (
        el.closest(
          '.IssueLabel, .topic-tag, .markdown-body, .comment-body, pre, code, button, [role="menuitem"], [role="option"], [role="listbox"], .SelectMenu, .ActionListContent'
        )
      ) {
        return false;
      }

      const cls = typeof el.className === 'string' ? el.className : '';
      const hasLabelClass =
        el.classList.contains('Label') ||
        cls.includes('prc-Label-Label') ||
        cls.includes('Label__StyledLabel') ||
        el.getAttribute('data-component') === 'Label';

      return hasLabelClass;
    },

    processElement(el) {
      if (!this.isCandidateBadge(el)) return;

      const text = (el.textContent || '').trim();
      const match = VISIBILITY_PATTERN.exec(text);
      if (!match) {
        if (el.hasAttribute('data-ghe-vis')) {
          el.removeAttribute('data-ghe-vis');
          el.removeAttribute('data-ghe-vis-variant');
        }
        return;
      }

      const kind = match[1].toLowerCase(); // 'private' | 'public' | 'internal'
      const variant = match[2] ? match[2].toLowerCase() : ''; // '' | 'template' | 'archive'

      if (el.getAttribute('data-ghe-vis') !== kind) {
        el.setAttribute('data-ghe-vis', kind);
      }
      if (variant) {
        el.setAttribute('data-ghe-vis-variant', variant);
      } else if (el.hasAttribute('data-ghe-vis-variant')) {
        el.removeAttribute('data-ghe-vis-variant');
      }

      // 兼容新版 React 列表项（没有经典 li.private 类名时也能显示左侧边条）
      const listItem = el.closest('li[data-testid="repository-list-item"], [data-testid="results-list"] > div');
      if (listItem) {
        if (kind === 'private') {
          listItem.setAttribute('data-ghe-vis-row', 'private');
        } else if (listItem.getAttribute('data-ghe-vis-row') === 'private') {
          listItem.removeAttribute('data-ghe-vis-row');
        }
      }
    },

    /**
     * 判断当前页面是否为仓库详情页（排除个人主页、组织列表、搜索、通知等非仓库页）
     */
    isRepoDetailPage() {
      // 预览沙盒页或真实 GitHub 仓库页均支持检测
      if (document.querySelector('#repository-container-header, #repo-title-component')) {
        return true;
      }

      const pathname = (typeof location !== 'undefined' && location.pathname) || '';
      const segments = pathname.split('/').filter(Boolean);
      if (segments.length < 2) return false;
      if (NON_REPO_FIRST_SEGMENTS.has(segments[0].toLowerCase())) return false;

      // 校验是否存在仓库元信息或全局顶栏仓库导航
      if (document.querySelector('meta[name="octolytics-dimension-repository_nwo"], meta[name="octolytics-dimension-repository_id"]')) {
        return true;
      }
      if (document.querySelector('.AppHeader-localBar nav[aria-label="Repository"], nav[aria-label="Repository"]')) {
        return true;
      }
      return false;
    },

    /**
     * 检测当前仓库详情页的可见性（private | public | internal | ''）
     */
    detectRepoVisibility() {
      if (!this.isRepoDetailPage()) return '';

      // 信号 1：详情页标题区域已被标记的可见性徽章（最精准，可区分 Internal）
      const titleBadge = document.querySelector(
        '#repo-title-component span[data-ghe-vis], #repository-container-header span[data-ghe-vis]'
      );
      if (titleBadge) {
        const k = titleBadge.getAttribute('data-ghe-vis');
        if (k) return k;
      }

      // 信号 2：新版顶栏面包屑里的锁图标（Code / Issues / PR / Actions / Settings 全子页常驻）
      const headerLock = document.querySelector(
        '.AppHeader-context svg.octicon-lock, header[role="banner"] .AppHeader-context svg.octicon-lock, #repository-container-header svg.octicon-lock'
      );
      if (headerLock) return 'private';

      // 信号 3：GitHub 页面 head 元数据
      const metaPublic = document.querySelector('meta[name="octolytics-dimension-repository_public"]');
      if (metaPublic) {
        const val = (metaPublic.getAttribute('content') || '').trim().toLowerCase();
        if (val === 'false') return 'private';
        if (val === 'true') return 'public';
      }

      // 信号 4：回退检查详情页主标题区域尚未处理的 Label
      const fallbackLabel = document.querySelector('#repo-title-component span.Label, #repository-container-header span.Label');
      if (fallbackLabel) {
        const m = VISIBILITY_PATTERN.exec((fallbackLabel.textContent || '').trim());
        if (m) return m[1].toLowerCase();
      }

      return '';
    },

    /**
     * 同步详情页状态：顶栏标记、面包屑常驻药丸、Code 主标题强调条、标签页 🔒 前缀
     */
    syncDetailPage() {
      const root = document.documentElement;
      const opt = config.visibilityBadge;
      const vis = opt.enabled ? this.detectRepoVisibility() : '';

      if (vis) {
        if (root.getAttribute('data-ghe-repo-vis') !== vis) {
          root.setAttribute('data-ghe-repo-vis', vis);
        }
      } else if (root.hasAttribute('data-ghe-repo-vis')) {
        root.removeAttribute('data-ghe-repo-vis');
      }

      this.syncHeaderPill(vis);
      this.syncDetailTitleBar(vis);
      this.syncTabTitle(vis);
    },

    syncHeaderPill(vis) {
      const existing = document.querySelectorAll('.ghe-header-pill');
      const shouldShow = Boolean(config.visibilityBadge.enabled && config.visibilityBadge.enhanceDetailPage && vis);

      if (!shouldShow) {
        existing.forEach((el) => el.remove());
        return;
      }

      // 优先挂在新版全局顶栏面包屑 .AppHeader-context 紧后方（同级节点，绝不干扰内部菜单与下拉箭头）
      const anchor = document.querySelector('.AppHeader-context');
      if (!anchor || !anchor.parentElement) {
        existing.forEach((el) => el.remove());
        return;
      }

      let pill = anchor.parentElement.querySelector(':scope > .ghe-header-pill');
      if (!pill) {
        existing.forEach((el) => el.remove());
        pill = document.createElement('span');
        pill.className = 'ghe-header-pill';
        pill.setAttribute('title', `当前仓库可见性：${VISIBILITY_LABELS[vis] || vis}`);
        anchor.insertAdjacentElement('afterend', pill);
      }

      if (pill.getAttribute('data-ghe-vis') !== vis) {
        pill.setAttribute('data-ghe-vis', vis);
      }
      const label = VISIBILITY_LABELS[vis] || vis;
      if (pill.textContent !== label) {
        pill.textContent = label;
      }
    },

    syncDetailTitleBar(vis) {
      const prevMarked = document.querySelectorAll('[data-ghe-repo-titlebar]');
      const shouldMark = Boolean(
        config.visibilityBadge.enabled &&
          config.visibilityBadge.enhanceDetailPage &&
          (vis === 'private' || vis === 'internal')
      );

      if (!shouldMark) {
        prevMarked.forEach((el) => el.removeAttribute('data-ghe-repo-titlebar'));
        return;
      }

      // 优先锁定新版 Code 页 #repo-title-component，不干扰右侧 Watch / Fork / Star 按钮
      let target = document.querySelector('#repo-title-component');
      if (!target) {
        const badge = document.querySelector(
          '#repository-container-header span[data-ghe-vis], main span[data-ghe-vis]:not(.ghe-header-pill)'
        );
        if (badge && !badge.closest('#user-repositories-list, .org-repos, .pinned-item-list-item, [data-testid="results-list"], li')) {
          const candidate = badge.closest('.d-flex.flex-wrap, h1') || badge.parentElement;
          if (candidate && candidate.tagName !== 'MAIN' && candidate.tagName !== 'BODY') {
            target = candidate;
          }
        }
      }

      prevMarked.forEach((el) => {
        if (el !== target) el.removeAttribute('data-ghe-repo-titlebar');
      });

      if (target && target.getAttribute('data-ghe-repo-titlebar') !== vis) {
        target.setAttribute('data-ghe-repo-titlebar', vis);
      }
    },

    syncTabTitle(vis) {
      if (typeof document.title !== 'string') return;
      const shouldPrefix = Boolean(
        config.visibilityBadge.enabled &&
          config.visibilityBadge.prefixPrivateTabTitle &&
          vis === 'private'
      );

      if (shouldPrefix) {
        if (document.title && !document.title.startsWith(TAB_LOCK_PREFIX)) {
          document.title = TAB_LOCK_PREFIX + document.title;
        }
      } else if (document.title.startsWith(TAB_LOCK_PREFIX)) {
        document.title = document.title.slice(TAB_LOCK_PREFIX.length);
      }
    },

    watchTitleChanges() {
      if (this.titleObserver || !document.head) return;
      const titleEl = document.head.querySelector('title');
      if (!titleEl) return;

      this.titleObserver = new MutationObserver(() => {
        const vis = document.documentElement.getAttribute('data-ghe-repo-vis') || '';
        this.syncTabTitle(vis);
      });
      this.titleObserver.observe(titleEl, { childList: true, characterData: true, subtree: true });
    },

    scan(root) {
      if (!config.visibilityBadge.enabled) {
        this.syncDetailPage();
        return;
      }
      if (!root || (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11)) return;

      const selector = 'span.Label, span[class*="prc-Label-Label"], span[class*="Label__StyledLabel"], span[data-component="Label"]';

      if (root.nodeType === 1 && root.matches && root.matches(selector)) {
        this.processElement(root);
      }

      if (typeof root.querySelectorAll === 'function') {
        const nodes = root.querySelectorAll(selector);
        for (let i = 0; i < nodes.length; i++) {
          this.processElement(nodes[i]);
        }
      }

      this.syncDetailPage();
      this.watchTitleChanges();
    },

    getMenus() {
      const opt = config.visibilityBadge;
      return [
        {
          label: `${opt.enabled ? '✅' : '⬜'} 功能1：Private / Public 区分增强`,
          onClick: () => {
            opt.enabled = !opt.enabled;
          },
        },
        {
          label: `  ↳ 配色（当前：${opt.theme === 'red-muted' ? '警示红 Private' : '琥珀金 + 翠绿'}）`,
          onClick: () => {
            opt.theme = opt.theme === 'red-muted' ? 'amber-green' : 'red-muted';
          },
        },
        {
          label: `  ${opt.enhanceDetailPage ? '✅' : '⬜'} 详情页顶栏与标题区增强`,
          onClick: () => {
            opt.enhanceDetailPage = !opt.enhanceDetailPage;
          },
        },
        {
          label: `  ${opt.showListAccentBar ? '✅' : '⬜'} 私有仓库列表左侧强调条`,
          onClick: () => {
            opt.showListAccentBar = !opt.showListAccentBar;
          },
        },
        {
          label: `  ${opt.colorizeLockIcons ? '✅' : '⬜'} 顶栏/侧边栏锁图标同步着色`,
          onClick: () => {
            opt.colorizeLockIcons = !opt.colorizeLockIcons;
          },
        },
        {
          label: `  ${opt.prefixPrivateTabTitle ? '✅' : '⬜'} 私有仓库标签页标题加 🔒 前缀`,
          onClick: () => {
            opt.prefixPrivateTabTitle = !opt.prefixPrivateTabTitle;
          },
        },
      ];
    },

    init() {
      this.applyRootFlags();
      injectCSS(this.styles());
    },
  };

  // ============================================================================
  // 4. 功能2：Releases 平台筛选与长更新日志折叠
  // ============================================================================
  const PLATFORM_ORDER = ['windows', 'macos', 'linux', 'android'];
  const PLATFORM_META = {
    windows: {
      label: 'Windows',
      patterns: [
        '.exe', '.msi', '.msix', 'windows', 'pc-windows', 'win32', 'win64',
        '-win.', '.win.', '-win-', '_win_', 'win_x64', 'win_arm64', 'win-x64', 'win-arm64',
      ],
    },
    macos: {
      label: 'macOS',
      patterns: [
        '.dmg', '.pkg', 'darwin', 'apple-darwin', 'macos', 'osx', '-mac.', '.mac.',
        '-mac-', '_mac_', 'mac-universal', 'mac-os', 'mac_arm64', 'mac_x64',
        'aarch64-apple', 'x86_64-apple', 'universal-apple',
      ],
    },
    linux: {
      label: 'Linux',
      patterns: [
        '.deb', '.rpm', '.appimage', '.snap', '.flatpak', 'linux', 'unknown-linux',
        '-linux.', '.linux.', '-linux-', '_linux_', 'ubuntu', 'debian', 'fedora',
        'archlinux', 'freebsd', 'musl', 'manylinux',
      ],
    },
    android: {
      label: 'Android',
      patterns: ['.apk', '.aab', 'android', '-android.', '.android.', '-android-', '_android_'],
    },
  };

  const SVG_FILTER =
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='black' d='M.75 3h14.5a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1 0-1.5ZM3 7.75A.75.75 0 0 1 3.75 7h8.5a.75.75 0 0 1 0 1.5h-8.5A.75.75 0 0 1 3 7.75Zm3 4a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z'/%3E%3C/svg%3E\")";

  const releaseFilterFeature = {
    id: 'releaseFilter',
    name: 'Releases 平台筛选与日志折叠',

    styles() {
      return `
        /* ===== 功能2：浅/深色主题变量 ===== */
        :root {
          --ghe-rel-surface: #ffffff;
          --ghe-rel-surface-subtle: #f6f8fa;
          --ghe-rel-surface-hover: #f3f4f6;
          --ghe-rel-border: #d0d7de;
          --ghe-rel-fg: #1f2328;
          --ghe-rel-muted: #656d76;
          --ghe-rel-accent: #0969da;
          --ghe-rel-accent-bg: #ddf4ff;
          --ghe-rel-shadow: 0 8px 24px rgba(140, 149, 159, 0.22);
          --ghe-rel-fade-end: #ffffff;
        }

        html[data-color-mode="dark"] {
          --ghe-rel-surface: #161b22;
          --ghe-rel-surface-subtle: #21262d;
          --ghe-rel-surface-hover: #30363d;
          --ghe-rel-border: #30363d;
          --ghe-rel-fg: #e6edf3;
          --ghe-rel-muted: #8b949e;
          --ghe-rel-accent: #4493f8;
          --ghe-rel-accent-bg: rgba(56, 139, 253, 0.16);
          --ghe-rel-shadow: 0 8px 24px rgba(1, 4, 9, 0.55);
          --ghe-rel-fade-end: #0d1117;
        }

        @media (prefers-color-scheme: dark) {
          html[data-color-mode="auto"] {
            --ghe-rel-surface: #161b22;
            --ghe-rel-surface-subtle: #21262d;
            --ghe-rel-surface-hover: #30363d;
            --ghe-rel-border: #30363d;
            --ghe-rel-fg: #e6edf3;
            --ghe-rel-muted: #8b949e;
            --ghe-rel-accent: #4493f8;
            --ghe-rel-accent-bg: rgba(56, 139, 253, 0.16);
            --ghe-rel-shadow: 0 8px 24px rgba(1, 4, 9, 0.55);
            --ghe-rel-fade-end: #0d1117;
          }
        }

        /* 隐藏未命中平台的资产行（不覆盖原有行内 style，完整兼容高速下载按钮） */
        html[data-ghe-page-releases="true"][data-ghe-rel-enabled="true"] .ghe-asset-hidden {
          display: none !important;
        }

        /* 内联筛选状态提示条 */
        .ghe-release-filter-notice {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 7px 12px;
          font-size: 12px;
          line-height: 18px;
          color: var(--ghe-rel-muted);
          background-color: var(--ghe-rel-surface-subtle);
          border-bottom: 1px solid var(--ghe-rel-border);
        }
        ul + .ghe-release-filter-notice,
        .ghe-release-filter-notice[data-ghe-outside="true"] {
          border: 1px solid var(--ghe-rel-border);
          border-bottom: none;
          border-radius: 6px 6px 0 0;
        }
        .ghe-release-filter-notice-btn {
          padding: 2px 9px;
          border-radius: 6px;
          border: 1px solid var(--ghe-rel-border);
          background-color: var(--ghe-rel-surface);
          color: var(--ghe-rel-accent);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
        }
        .ghe-release-filter-notice-btn:hover {
          background-color: var(--ghe-rel-surface-hover);
        }

        /* 右侧悬浮平台筛选面板 */
        .ghe-platform-filter {
          position: fixed;
          top: 72px;
          right: -1px;
          z-index: 1050;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
        }
        .ghe-platform-filter-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 7px 10px 7px 9px;
          border: 1px solid var(--ghe-rel-border);
          border-right: none;
          border-radius: 8px 0 0 8px;
          background-color: var(--ghe-rel-surface);
          color: var(--ghe-rel-fg);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: var(--ghe-rel-shadow);
          white-space: nowrap;
          transition: background-color 0.15s ease, padding 0.15s ease;
        }
        .ghe-platform-filter-btn:hover {
          background-color: var(--ghe-rel-surface-hover);
          padding-right: 13px;
        }
        .ghe-platform-filter-icon {
          display: inline-block;
          width: 14px;
          height: 14px;
          flex-shrink: 0;
          background-color: var(--ghe-rel-fg);
          -webkit-mask-image: ${SVG_FILTER};
          mask-image: ${SVG_FILTER};
          -webkit-mask-repeat: no-repeat;
          mask-repeat: no-repeat;
          -webkit-mask-position: center;
          mask-position: center;
          -webkit-mask-size: contain;
          mask-size: contain;
        }
        .ghe-platform-filter-label {
          display: none;
        }
        .ghe-platform-filter:hover .ghe-platform-filter-label,
        .ghe-platform-filter.is-open .ghe-platform-filter-label {
          display: inline;
        }
        .ghe-platform-filter-count {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 18px;
          height: 18px;
          padding: 0 5px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
          background-color: var(--ghe-rel-accent-bg);
          color: var(--ghe-rel-accent);
        }
        .ghe-platform-dropdown {
          display: none;
          position: absolute;
          top: calc(100% + 6px);
          right: 8px;
          min-width: 156px;
          padding: 6px;
          border-radius: 10px;
          border: 1px solid var(--ghe-rel-border);
          background-color: var(--ghe-rel-surface);
          box-shadow: var(--ghe-rel-shadow);
        }
        .ghe-platform-filter:hover .ghe-platform-dropdown,
        .ghe-platform-filter.is-open .ghe-platform-dropdown {
          display: block;
        }
        .ghe-platform-option,
        .ghe-platform-show-all {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 7px 10px;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: var(--ghe-rel-fg);
          font-size: 13px;
          font-weight: 500;
          text-align: left;
          cursor: pointer;
        }
        .ghe-platform-option:hover,
        .ghe-platform-show-all:hover {
          background-color: var(--ghe-rel-surface-hover);
        }
        .ghe-platform-option.is-selected,
        .ghe-platform-show-all.is-selected {
          background-color: var(--ghe-rel-accent-bg);
          color: var(--ghe-rel-accent);
          font-weight: 600;
        }
        .ghe-platform-divider {
          height: 1px;
          margin: 5px 4px;
          background-color: var(--ghe-rel-border);
        }

        /* 长 Release Notes 折叠与渐变遮罩（仅 Releases 页生效） */
        html[data-ghe-page-releases="true"][data-ghe-rel-enabled="true"][data-ghe-rel-collapse="true"] .markdown-body[data-ghe-notes-state="collapsed"] {
          position: relative !important;
          max-height: ${config.releaseFilter.notesMaxHeight || 420}px !important;
          overflow: hidden !important;
          padding-bottom: 48px !important;
        }
        html[data-ghe-page-releases="true"][data-ghe-rel-enabled="true"][data-ghe-rel-collapse="true"] .markdown-body[data-ghe-notes-state="expanded"] {
          position: relative !important;
          max-height: none !important;
          padding-bottom: 44px !important;
        }
        .ghe-notes-toggle {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          width: 100%;
          height: 44px;
          margin: 0;
          padding: 10px 12px;
          border: none;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          text-align: center;
          color: var(--ghe-rel-accent);
          background: transparent;
        }
        .markdown-body[data-ghe-notes-state="collapsed"] > .ghe-notes-toggle {
          height: 64px;
          padding-top: 28px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0) 0%, var(--ghe-rel-fade-end) 76%);
        }
        .markdown-body[data-ghe-notes-state="expanded"] > .ghe-notes-toggle {
          border-top: 1px solid var(--ghe-rel-border);
          background-color: var(--ghe-rel-surface-subtle);
        }
        .ghe-notes-toggle:hover {
          text-decoration: underline;
        }
      `;
    },

    isReleasesPage() {
      if (document.querySelector('[data-ghe-preview-releases="true"]')) {
        return true;
      }
      const pathname = (typeof location !== 'undefined' && location.pathname) || '';
      return /^\/[^/]+\/[^/]+\/releases(?:\/|$)/i.test(pathname);
    },

    applyRootFlags() {
      const root = document.documentElement;
      const opt = config.releaseFilter;
      root.setAttribute('data-ghe-rel-enabled', String(Boolean(opt.enabled)));
      root.setAttribute('data-ghe-rel-collapse', String(Boolean(opt.collapseLongNotes)));
      if (opt.enabled && this.isReleasesPage()) {
        root.setAttribute('data-ghe-page-releases', 'true');
      } else {
        root.removeAttribute('data-ghe-page-releases');
      }
    },

    detectCurrentPlatform() {
      const nav = typeof navigator !== 'undefined' ? navigator : {};
      const uaDataPlat = (nav.userAgentData && nav.userAgentData.platform ? String(nav.userAgentData.platform) : '').toLowerCase();
      const plat = String(nav.platform || '').toLowerCase();
      const ua = String(nav.userAgent || '').toLowerCase();

      // Android 的 UA 通常也包含 Linux，必须优先识别
      if (uaDataPlat.includes('android') || plat.includes('android') || ua.includes('android')) {
        return 'android';
      }
      if (
        uaDataPlat.includes('mac') ||
        plat.includes('mac') ||
        ua.includes('macintosh') ||
        ua.includes('darwin')
      ) {
        return 'macos';
      }
      if (uaDataPlat.includes('win') || plat.includes('win') || ua.includes('windows')) {
        return 'windows';
      }
      if (uaDataPlat.includes('linux') || plat.includes('linux') || ua.includes('linux')) {
        return 'linux';
      }
      return '';
    },

    getSelectedPlatforms() {
      const opt = config.releaseFilter;
      if (opt.selectedPlatforms === null || opt.selectedPlatforms === undefined) {
        const detected = this.detectCurrentPlatform();
        opt.selectedPlatforms = detected ? [detected] : [];
        saveConfig(config);
      }
      if (!Array.isArray(opt.selectedPlatforms)) return [];
      return opt.selectedPlatforms.filter((p) => Boolean(PLATFORM_META[p]));
    },

    findAssetContainers() {
      const containers = [];
      const seen = new Set();

      const addContainer = (el) => {
        if (!el || seen.has(el)) return;
        if (el.closest('.ghe-platform-filter')) return;
        seen.add(el);
        containers.push(el);
      };

      const direct = document.querySelectorAll('.Box--condensed, [data-testid="release-assets"], [data-ghe-assets-list]');
      for (let i = 0; i < direct.length; i++) {
        const c = direct[i];
        // 若 .Box--condensed 内嵌套了唯一的 ul 列表，依然按外层容器管理，不重复登记
        addContainer(c);
      }

      // 兜底适配没有 .Box--condensed 类名但含 /releases/download/ 的列表容器
      const downloadLinks = document.querySelectorAll('a[href*="/releases/download/"]');
      for (let i = 0; i < downloadLinks.length; i++) {
        const wrapper = downloadLinks[i].closest('.Box, [data-testid="release-assets"], ul');
        if (wrapper && !containers.some((c) => c === wrapper || c.contains(wrapper) || wrapper.contains(c))) {
          addContainer(wrapper);
        }
      }

      return containers;
    },

    getAssetRows(container) {
      let candidates = Array.from(container.querySelectorAll('.Box-row, [data-ghe-asset-row]'));
      if (candidates.length === 0) {
        candidates = Array.from(container.querySelectorAll('li'));
      }
      return candidates.filter((row) => {
        if (row.classList.contains('ghe-release-filter-notice')) return false;
        if (row.closest('.ghe-release-filter-notice')) return false;
        // 避免把页面说明或非资产项误判为资产行
        const hasLink = Boolean(row.querySelector('a'));
        const hasAssetAttr = row.hasAttribute('data-ghe-asset-row') || row.classList.contains('Box-row');
        return hasLink || hasAssetAttr;
      });
    },

    getAssetMatchInfo(row) {
      const link =
        row.querySelector('a[href*="/releases/download/"]') ||
        row.querySelector('a[href*="/archive/"]') ||
        row.querySelector('a');

      const href = link ? String(link.getAttribute('href') || '') : '';
      let label = link ? (link.textContent || '').trim().toLowerCase() : '';
      if (!label && href) {
        label = (href.split('/').pop() || '').split('?')[0].toLowerCase();
      }
      if (!label) {
        label = (row.textContent || '').trim().toLowerCase();
      }

      const isSourceArchive =
        /source\s*code/i.test(label) || /\/archive\/refs\/tags\//i.test(href);

      const matched = [];
      if (!isSourceArchive) {
        for (const key of PLATFORM_ORDER) {
          const patterns = PLATFORM_META[key].patterns;
          if (patterns.some((pat) => label.includes(pat))) {
            matched.push(key);
          }
        }
      }

      return { label, isSourceArchive, matched };
    },

    syncContainerNotice(container, selected, hiddenCount, tempShowAll) {
      // 将 notice 关联在容器身上或紧前兄弟节点，防止在 <ul> 内直插 <div>
      const useOutside = container.tagName === 'UL';
      const existingOutside =
        container.previousElementSibling &&
        container.previousElementSibling.classList &&
        container.previousElementSibling.classList.contains('ghe-release-filter-notice')
          ? container.previousElementSibling
          : null;
      const existingInside = container.querySelector('.ghe-release-filter-notice');
      let notice = useOutside ? existingOutside : existingInside;

      // 如果容器从一种形态切到另一种，清掉多余节点
      if (useOutside && existingInside) existingInside.remove();
      if (!useOutside && existingOutside) existingOutside.remove();

      const shouldShow = selected.length > 0 && (hiddenCount > 0 || tempShowAll);
      if (!shouldShow) {
        if (notice) notice.remove();
        return;
      }

      if (!notice) {
        notice = document.createElement('div');
        notice.className = 'ghe-release-filter-notice';
        if (useOutside) {
          notice.setAttribute('data-ghe-outside', 'true');
          container.insertAdjacentElement('beforebegin', notice);
        } else if (typeof container.prepend === 'function') {
          container.prepend(notice);
        } else if (container.firstChild) {
          container.insertBefore(notice, container.firstChild);
        } else {
          container.appendChild(notice);
        }
      }

      const platformNames = selected.map((k) => PLATFORM_META[k].label).join(' / ');
      const expectedText = tempShowAll
        ? `已临时显示全部文件（默认筛选：${platformNames}）`
        : `已按 ${platformNames} 筛选 · 已隐藏 ${hiddenCount} 个其他平台文件`;
      const expectedBtnText = tempShowAll ? '恢复平台筛选' : '临时显示全部';

      let textSpan = notice.querySelector('.ghe-release-filter-notice-text');
      let btn = notice.querySelector('.ghe-release-filter-notice-btn');
      if (!textSpan || !btn) {
        notice.textContent = '';
        textSpan = document.createElement('span');
        textSpan.className = 'ghe-release-filter-notice-text';
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ghe-release-filter-notice-btn';
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const isTemp = container.getAttribute('data-ghe-temp-show-all') === 'true';
          if (isTemp) {
            container.removeAttribute('data-ghe-temp-show-all');
          } else {
            container.setAttribute('data-ghe-temp-show-all', 'true');
          }
          this.filterAllContainers();
        });
        notice.appendChild(textSpan);
        notice.appendChild(btn);
      }

      if (textSpan.textContent !== expectedText) textSpan.textContent = expectedText;
      if (btn.textContent !== expectedBtnText) btn.textContent = expectedBtnText;
    },

    filterContainer(container, selected) {
      const rows = this.getAssetRows(container);
      if (rows.length === 0) return;

      const tempShowAll = container.getAttribute('data-ghe-temp-show-all') === 'true';
      let hiddenCount = 0;

      for (const row of rows) {
        const info = this.getAssetMatchInfo(row);
        const isSpecific = info.matched.length > 0;
        const hitsSelected = info.matched.some((p) => selected.includes(p));

        const shouldHide =
          !tempShowAll &&
          selected.length > 0 &&
          !info.isSourceArchive &&
          isSpecific &&
          !hitsSelected;

        if (shouldHide) {
          row.classList.add('ghe-asset-hidden');
          hiddenCount++;
        } else {
          row.classList.remove('ghe-asset-hidden');
        }
      }

      this.syncContainerNotice(container, selected, hiddenCount, tempShowAll);
    },

    filterAllContainers() {
      const selected = this.getSelectedPlatforms();
      const containers = this.findAssetContainers();
      for (const container of containers) {
        this.filterContainer(container, selected);
      }
      this.syncFloatingFilterState(selected);
    },

    syncFloatingFilterState(selected) {
      const panel = document.querySelector('.ghe-platform-filter');
      if (!panel) return;

      const countEl = panel.querySelector('.ghe-platform-filter-count');
      if (countEl) {
        countEl.textContent = selected.length > 0 ? String(selected.length) : '全';
      }

      const opts = panel.querySelectorAll('.ghe-platform-option');
      for (let i = 0; i < opts.length; i++) {
        const optEl = opts[i];
        const key = optEl.getAttribute('data-platform');
        const active = selected.includes(key);
        optEl.classList.toggle('is-selected', active);
        const mark = optEl.querySelector('.ghe-platform-check');
        if (mark) mark.textContent = active ? '✓' : '';
      }

      const showAllBtn = panel.querySelector('.ghe-platform-show-all');
      if (showAllBtn) {
        showAllBtn.classList.toggle('is-selected', selected.length === 0);
        const mark = showAllBtn.querySelector('.ghe-platform-check');
        if (mark) mark.textContent = selected.length === 0 ? '✓' : '';
      }
    },

    ensureFloatingFilter() {
      if (!document.body) return;

      const containers = this.findAssetContainers();
      const hasAssets = containers.some((c) => this.getAssetRows(c).length > 0);
      const existing = document.querySelector('.ghe-platform-filter');

      if (!hasAssets) {
        if (existing) existing.remove();
        return;
      }

      if (existing) {
        this.syncFloatingFilterState(this.getSelectedPlatforms());
        return;
      }

      const panel = document.createElement('div');
      panel.className = 'ghe-platform-filter';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ghe-platform-filter-btn';

      const icon = document.createElement('span');
      icon.className = 'ghe-platform-filter-icon';
      icon.setAttribute('aria-hidden', 'true');

      const labelSpan = document.createElement('span');
      labelSpan.className = 'ghe-platform-filter-label';
      labelSpan.textContent = '平台筛选';

      const countSpan = document.createElement('span');
      countSpan.className = 'ghe-platform-filter-count';

      btn.appendChild(icon);
      btn.appendChild(labelSpan);
      btn.appendChild(countSpan);

      const dropdown = document.createElement('div');
      dropdown.className = 'ghe-platform-dropdown';

      const clearAllTemp = () => {
        document.querySelectorAll('[data-ghe-temp-show-all]').forEach((el) => {
          el.removeAttribute('data-ghe-temp-show-all');
        });
      };

      for (const key of PLATFORM_ORDER) {
        const optBtn = document.createElement('button');
        optBtn.type = 'button';
        optBtn.className = 'ghe-platform-option';
        optBtn.setAttribute('data-platform', key);

        const nameSpan = document.createElement('span');
        nameSpan.textContent = PLATFORM_META[key].label;
        const checkSpan = document.createElement('span');
        checkSpan.className = 'ghe-platform-check';

        optBtn.appendChild(nameSpan);
        optBtn.appendChild(checkSpan);

        optBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const current = this.getSelectedPlatforms().slice();
          const idx = current.indexOf(key);
          if (idx >= 0) {
            current.splice(idx, 1);
          } else {
            current.push(key);
          }
          config.releaseFilter.selectedPlatforms = current;
          saveConfig(config);
          clearAllTemp();
          this.filterAllContainers();
        });

        dropdown.appendChild(optBtn);
      }

      const divider = document.createElement('div');
      divider.className = 'ghe-platform-divider';
      dropdown.appendChild(divider);

      const showAllBtn = document.createElement('button');
      showAllBtn.type = 'button';
      showAllBtn.className = 'ghe-platform-show-all';
      const allLabel = document.createElement('span');
      allLabel.textContent = '显示全部';
      const allCheck = document.createElement('span');
      allCheck.className = 'ghe-platform-check';
      showAllBtn.appendChild(allLabel);
      showAllBtn.appendChild(allCheck);

      showAllBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        config.releaseFilter.selectedPlatforms = [];
        saveConfig(config);
        clearAllTemp();
        this.filterAllContainers();
      });
      dropdown.appendChild(showAllBtn);

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        panel.classList.toggle('is-open');
      });

      panel.appendChild(btn);
      panel.appendChild(dropdown);
      document.body.appendChild(panel);

      this.syncFloatingFilterState(this.getSelectedPlatforms());
    },

    findReleaseNoteBodies() {
      const all = document.querySelectorAll('.markdown-body');
      const out = [];
      for (let i = 0; i < all.length; i++) {
        const el = all[i];
        if (el.closest('.comment-body, .timeline-comment, .ghe-platform-filter')) continue;
        // 在预览沙盒页时，仅允许预览区块内的 .markdown-body
        const previewCard = document.querySelector('[data-ghe-preview-releases="true"]');
        if (previewCard && !previewCard.contains(el)) continue;
        out.push(el);
      }
      return out;
    },

    syncReleaseNotes() {
      const shouldCollapse = Boolean(config.releaseFilter.enabled && config.releaseFilter.collapseLongNotes);
      const maxHeight = config.releaseFilter.notesMaxHeight || 420;
      const bodies = this.findReleaseNoteBodies();

      if (!shouldCollapse) {
        document.querySelectorAll('.ghe-notes-toggle').forEach((el) => el.remove());
        document.querySelectorAll('[data-ghe-notes-state]').forEach((el) => el.removeAttribute('data-ghe-notes-state'));
        return;
      }

      for (const panel of bodies) {
        const height = panel.scrollHeight || 0;
        if (height <= maxHeight) {
          if (panel.hasAttribute('data-ghe-notes-state')) {
            panel.removeAttribute('data-ghe-notes-state');
          }
          const btn = panel.querySelector(':scope > .ghe-notes-toggle');
          if (btn) btn.remove();
          continue;
        }

        const currentState = panel.getAttribute('data-ghe-notes-state');
        const nextState = currentState === 'expanded' ? 'expanded' : 'collapsed';
        if (currentState !== nextState) {
          panel.setAttribute('data-ghe-notes-state', nextState);
        }

        let toggleBtn = panel.querySelector(':scope > .ghe-notes-toggle');
        if (!toggleBtn) {
          toggleBtn = document.createElement('button');
          toggleBtn.type = 'button';
          toggleBtn.className = 'ghe-notes-toggle';
          toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isExpanded = panel.getAttribute('data-ghe-notes-state') === 'expanded';
            const updatedState = isExpanded ? 'collapsed' : 'expanded';
            panel.setAttribute('data-ghe-notes-state', updatedState);
            toggleBtn.textContent = updatedState === 'expanded' ? '收起说明' : '展开完整说明';

            if (isExpanded && typeof panel.scrollIntoView === 'function') {
              const top = typeof panel.getBoundingClientRect === 'function' ? panel.getBoundingClientRect().top : 0;
              if (top < 64) {
                panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }
            }
          });
          panel.appendChild(toggleBtn);
        }

        const expectedLabel = nextState === 'expanded' ? '收起说明' : '展开完整说明';
        if (toggleBtn.textContent !== expectedLabel) {
          toggleBtn.textContent = expectedLabel;
        }
      }
    },

    cleanup() {
      document.documentElement.removeAttribute('data-ghe-page-releases');
      document
        .querySelectorAll('.ghe-platform-filter, .ghe-release-filter-notice, .ghe-notes-toggle')
        .forEach((el) => el.remove());
      document.querySelectorAll('.ghe-asset-hidden').forEach((el) => el.classList.remove('ghe-asset-hidden'));
      document.querySelectorAll('[data-ghe-temp-show-all]').forEach((el) => el.removeAttribute('data-ghe-temp-show-all'));
      document.querySelectorAll('[data-ghe-notes-state]').forEach((el) => el.removeAttribute('data-ghe-notes-state'));
    },

    scan() {
      this.applyRootFlags();
      if (!config.releaseFilter.enabled || !this.isReleasesPage()) {
        this.cleanup();
        return;
      }

      this.ensureFloatingFilter();
      this.filterAllContainers();
      this.syncReleaseNotes();
    },

    bindGlobalClickClose() {
      const target = typeof window !== 'undefined' ? window : null;
      if (target && typeof target.__gheReleaseClickCleanup === 'function') {
        target.__gheReleaseClickCleanup();
      }
      const onDocClick = (e) => {
        const panel = document.querySelector('.ghe-platform-filter');
        if (panel && panel.classList.contains('is-open') && e.target && !panel.contains(e.target)) {
          panel.classList.remove('is-open');
        }
      };
      if (typeof document.addEventListener === 'function') {
        document.addEventListener('click', onDocClick);
        if (target) {
          target.__gheReleaseClickCleanup = () => {
            if (typeof document.removeEventListener === 'function') {
              document.removeEventListener('click', onDocClick);
            }
          };
        }
      }
    },

    getMenus() {
      const opt = config.releaseFilter;
      return [
        {
          label: `${opt.enabled ? '✅' : '⬜'} 功能2：Releases 平台筛选`,
          onClick: () => {
            opt.enabled = !opt.enabled;
          },
        },
        {
          label: `  ${opt.collapseLongNotes ? '✅' : '⬜'} 长更新日志自动折叠`,
          onClick: () => {
            opt.collapseLongNotes = !opt.collapseLongNotes;
          },
        },
      ];
    },

    init() {
      this.applyRootFlags();
      injectCSS(this.styles());
      this.bindGlobalClickClose();
    },
  };

  // ============================================================================
  // 5. 功能3：禁用 GitHub 易误触全局单键快捷键（s / w）
  // ============================================================================
  const shortcutGuardFeature = {
    id: 'shortcutGuard',
    name: '禁用误触快捷键 (s / w)',

    isEditableTarget(target) {
      if (!target) return false;
      const tag = typeof target.tagName === 'string' ? target.tagName.toUpperCase() : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (target.isContentEditable === true) return true;
      if (typeof target.getAttribute === 'function') {
        const ce = target.getAttribute('contenteditable');
        if (ce === 'true' || ce === '') return true;
      }
      if (typeof target.closest === 'function') {
        if (
          target.closest(
            'input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"], .CodeMirror, .cm-editor'
          )
        ) {
          return true;
        }
      }
      return false;
    },

    applyRootFlags() {
      document.documentElement.setAttribute(
        'data-ghe-shortcut-guard',
        String(Boolean(config.shortcutGuard.enabled))
      );
    },

    getMenus() {
      const opt = config.shortcutGuard;
      return [
        {
          label: `${opt.enabled ? '✅' : '⬜'} 功能3：禁用 GitHub 误触快捷键（s / w）`,
          onClick: () => {
            opt.enabled = !opt.enabled;
          },
        },
      ];
    },

    init() {
      this.applyRootFlags();

      const target = typeof window !== 'undefined' ? window : null;
      if (target && typeof target.__gheShortcutCleanup === 'function') {
        target.__gheShortcutCleanup();
      }

      const onKeydown = (e) => {
        const opt = config.shortcutGuard;
        if (!opt.enabled) return;
        if (!e || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || e.keyCode === 229) return;
        if (this.isEditableTarget(e.target)) return;

        const key = typeof e.key === 'string' ? e.key.toLowerCase() : '';
        if (!key) return;

        const blocked = Array.isArray(opt.blockedKeys) ? opt.blockedKeys : ['s', 'w'];
        if (blocked.includes(key) && typeof e.stopPropagation === 'function') {
          e.stopPropagation();
        }
      };

      if (typeof document.addEventListener === 'function') {
        document.addEventListener('keydown', onKeydown, true);
        if (target) {
          target.__gheShortcutCleanup = () => {
            if (typeof document.removeEventListener === 'function') {
              document.removeEventListener('keydown', onKeydown, true);
            }
          };
        }
      }
    },
  };

  // ============================================================================
  // 6. 功能4：Markdown 图片点击原地看大图（Lightbox 灯箱）
  // ============================================================================
  const LIGHTBOX_IMAGE_EXT_RE = /\.(?:png|jpe?g|gif|webp|avif|bmp|svg|ico)$/i;
  const LIGHTBOX_REPO_IMAGE_RE = /^\/[^/]+\/[^/]+\/(?:blob|raw)\/.+\.(?:png|jpe?g|gif|webp|avif|bmp|svg|ico)$/i;
  const LIGHTBOX_GITHUB_MEDIA_HOST_RE = /^(?:raw|user-images|private-user-images|camo|objects|gist)\.githubusercontent\.com$/i;
  const LIGHTBOX_BADGE_HOST_RE = /(^|\.)(img\.shields\.io|shields\.io|badgen\.net|badge\.fury\.io|codecov\.io|coveralls\.io|komarev\.com|visitor-badge\.[\w.-]+|forthebadge\.com|img\.badgesize\.io|travis-ci\.(?:org|com)|circleci\.com|david-dm\.org)$/i;
  const LIGHTBOX_BADGE_URL_RE = /\/api\/badge\/|\/actions\/workflows\/[^/]+\/badge\.svg|\/badge\.svg(?:\?|$)/i;

  const imageLightboxFeature = {
    id: 'imageLightbox',
    name: 'Markdown 图片点击看大图',
    state: {
      isOpen: false,
      items: [],
      index: 0,
      scale: 1,
      tx: 0,
      ty: 0,
      dragging: false,
      dragMoved: false,
      startX: 0,
      startY: 0,
      originTx: 0,
      originTy: 0,
    },
    els: null,
    keyHandler: null,

    styles() {
      return `
        html[data-ghe-lightbox-enabled="true"] .markdown-body img[data-ghe-lightbox="true"] {
          cursor: zoom-in !important;
          transition: filter 0.15s ease;
        }
        html[data-ghe-lightbox-enabled="true"] .markdown-body img[data-ghe-lightbox="true"]:hover {
          filter: brightness(1.03);
        }
        html[data-ghe-lightbox-open="true"] {
          overflow: hidden !important;
        }

        .ghe-lightbox-overlay {
          position: fixed;
          inset: 0;
          z-index: 2147483640;
          display: flex;
          flex-direction: column;
          background: rgba(13, 17, 23, 0.88);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          color: #f0f6fc;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
          user-select: none;
        }
        .ghe-lightbox-overlay[hidden] {
          display: none !important;
        }

        .ghe-lightbox-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 16px;
          background: linear-gradient(180deg, rgba(13, 17, 23, 0.78) 0%, rgba(13, 17, 23, 0.25) 100%);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          flex-shrink: 0;
        }
        .ghe-lightbox-meta {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
          flex: 1;
        }
        .ghe-lightbox-counter {
          padding: 2px 8px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.14);
          font-size: 12px;
          font-weight: 600;
          white-space: nowrap;
        }
        .ghe-lightbox-title {
          font-size: 13px;
          color: #e6edf3;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .ghe-lightbox-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
          flex-wrap: wrap;
        }
        .ghe-lightbox-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 28px;
          height: 28px;
          padding: 0 10px;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          background: rgba(255, 255, 255, 0.10);
          color: #f0f6fc !important;
          font-size: 12px;
          font-weight: 500;
          line-height: 1;
          text-decoration: none !important;
          cursor: pointer;
          white-space: nowrap;
          transition: background-color 0.15s ease, border-color 0.15s ease;
        }
        .ghe-lightbox-btn:hover {
          background: rgba(255, 255, 255, 0.20);
          border-color: rgba(255, 255, 255, 0.28);
        }
        .ghe-lightbox-btn[hidden] {
          display: none !important;
        }
        .ghe-lightbox-zoom-label {
          min-width: 46px;
          text-align: center;
          font-size: 12px;
          font-variant-numeric: tabular-nums;
          color: #c9d1d9;
        }
        .ghe-lightbox-sep {
          width: 1px;
          height: 16px;
          background: rgba(255, 255, 255, 0.18);
          margin: 0 2px;
        }
        .ghe-lightbox-close {
          background: rgba(248, 81, 73, 0.22);
          border-color: rgba(248, 81, 73, 0.42);
        }
        .ghe-lightbox-close:hover {
          background: rgba(248, 81, 73, 0.38);
        }

        .ghe-lightbox-stage {
          position: relative;
          flex: 1;
          min-height: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px 64px;
          overflow: hidden;
        }
        .ghe-lightbox-img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          border-radius: 6px;
          box-shadow: 0 20px 56px rgba(0, 0, 0, 0.55);
          transform-origin: center center;
          transition: transform 0.12s ease-out;
          cursor: zoom-in;
          -webkit-user-drag: none;
        }
        .ghe-lightbox-img[data-zoomed="true"] {
          cursor: grab;
        }
        .ghe-lightbox-img[data-dragging="true"] {
          transition: none;
          cursor: grabbing;
        }

        .ghe-lightbox-nav {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 40px;
          height: 40px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(13, 17, 23, 0.65);
          color: #f0f6fc;
          font-size: 20px;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 2;
          transition: background-color 0.15s ease, transform 0.15s ease;
        }
        .ghe-lightbox-nav:hover {
          background: rgba(255, 255, 255, 0.22);
          transform: translateY(-50%) scale(1.06);
        }
        .ghe-lightbox-nav[hidden] {
          display: none !important;
        }
        .ghe-lightbox-prev {
          left: 16px;
        }
        .ghe-lightbox-next {
          right: 16px;
        }

        .ghe-lightbox-hint {
          padding: 8px 16px 12px;
          text-align: center;
          font-size: 11px;
          color: rgba(230, 237, 243, 0.65);
          flex-shrink: 0;
        }
      `;
    },

    getBaseHref() {
      return (typeof location !== 'undefined' && location.href) || 'https://github.com/';
    },

    getCurrentHost() {
      return (typeof location !== 'undefined' && location.hostname) || 'github.com';
    },

    safeUrl(rawUrl) {
      if (!rawUrl || typeof rawUrl !== 'string') return null;
      const trimmed = rawUrl.trim();
      if (!trimmed || trimmed.startsWith('#') || /^javascript:/i.test(trimmed)) return null;
      try {
        const parsed = new URL(trimmed, this.getBaseHref());
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'data:') {
          return null;
        }
        return parsed;
      } catch {
        return null;
      }
    },

    decodeCamoUrl(rawUrl) {
      const parsed = this.safeUrl(rawUrl);
      if (!parsed || parsed.hostname.toLowerCase() !== 'camo.githubusercontent.com') return rawUrl || '';
      const parts = parsed.pathname.split('/').filter(Boolean);
      const hex = parts[1];
      if (!hex || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return rawUrl || '';
      try {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < hex.length; i += 2) {
          bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
        }
        if (typeof TextDecoder === 'function') {
          return new TextDecoder('utf-8').decode(bytes);
        }
        let pct = '';
        for (let i = 0; i < bytes.length; i++) {
          pct += '%' + bytes[i].toString(16).padStart(2, '0');
        }
        return decodeURIComponent(pct);
      } catch {
        return rawUrl || '';
      }
    },

    isBadgeUrl(rawUrl) {
      if (!rawUrl) return false;
      const candidates = [rawUrl, this.decodeCamoUrl(rawUrl)];
      for (const candidate of candidates) {
        if (!candidate) continue;
        if (LIGHTBOX_BADGE_URL_RE.test(candidate)) return true;
        const parsed = this.safeUrl(candidate);
        if (parsed && LIGHTBOX_BADGE_HOST_RE.test(parsed.hostname)) return true;
      }
      return false;
    },

    resolveImageUrl(img) {
      if (!img) return '';
      const raw =
        img.currentSrc ||
        (typeof img.getAttribute === 'function' && img.getAttribute('src')) ||
        img.src ||
        '';
      const parsed = this.safeUrl(raw);
      return parsed ? parsed.href : '';
    },

    isImageSelfLink(link, img) {
      if (!link) return false;
      const rawHref =
        (typeof link.getAttribute === 'function' && link.getAttribute('href')) ||
        link.href ||
        '';
      const hrefUrl = this.safeUrl(rawHref);
      if (!hrefUrl || (hrefUrl.protocol !== 'http:' && hrefUrl.protocol !== 'https:')) {
        return false;
      }

      const imgSrc = this.resolveImageUrl(img);
      const imgUrl = this.safeUrl(imgSrc);
      if (imgUrl && hrefUrl.href === imgUrl.href) return true;

      const host = hrefUrl.hostname.toLowerCase();
      const currentHost = this.getCurrentHost().toLowerCase();
      if (host === 'github.com' || host === currentHost) {
        if (LIGHTBOX_REPO_IMAGE_RE.test(hrefUrl.pathname)) return true;
        if (/^\/user-attachments\/assets\//i.test(hrefUrl.pathname)) return true;
        if (/^\/[^/]+\/[^/]+\/assets\/\d+\//i.test(hrefUrl.pathname)) return true;
      }

      if (LIGHTBOX_GITHUB_MEDIA_HOST_RE.test(host)) return true;
      if (LIGHTBOX_IMAGE_EXT_RE.test(hrefUrl.pathname)) return true;

      return false;
    },

    isTinyIcon(img) {
      if (!img) return true;
      const attrW = typeof img.getAttribute === 'function' ? parseInt(img.getAttribute('width') || '', 10) : NaN;
      const attrH = typeof img.getAttribute === 'function' ? parseInt(img.getAttribute('height') || '', 10) : NaN;
      if (attrW > 0 && attrH > 0 && attrW <= 40 && attrH <= 40) return true;

      if (img.complete && typeof img.naturalHeight === 'number' && img.naturalHeight > 0) {
        const rect = typeof img.getBoundingClientRect === 'function' ? img.getBoundingClientRect() : null;
        if (rect && rect.height > 0) {
          if (rect.height < 48 && img.naturalHeight < 64) return true;
          if (rect.width > 0 && rect.width < 48 && rect.height < 48) return true;
        }
      }
      return false;
    },

    isPreviewableImage(img) {
      if (!img || img.tagName !== 'IMG') return false;
      if (typeof img.closest !== 'function' || !img.closest('.markdown-body')) return false;
      if (
        (img.classList && (img.classList.contains('avatar') || img.classList.contains('emoji'))) ||
        img.closest('.avatar, g-emoji, svg')
      ) {
        return false;
      }

      const src = this.resolveImageUrl(img);
      if (!src) return false;

      const link = img.closest('a[href]');
      if (link && !this.isImageSelfLink(link, img)) {
        return false;
      }

      const linkHref = link
        ? (typeof link.getAttribute === 'function' && link.getAttribute('href')) || link.href || ''
        : '';
      if (this.isBadgeUrl(src) || (linkHref && this.isBadgeUrl(linkHref))) {
        return false;
      }

      if (this.isTinyIcon(img)) {
        return false;
      }

      return true;
    },

    getImageTitle(img, src) {
      const alt = ((typeof img.getAttribute === 'function' && img.getAttribute('alt')) || img.alt || '').trim();
      if (alt) return alt;
      const parsed = this.safeUrl(src);
      if (parsed) {
        const seg = parsed.pathname.split('/').filter(Boolean).pop();
        if (seg) {
          try {
            return decodeURIComponent(seg);
          } catch {
            return seg;
          }
        }
      }
      return '图片预览';
    },

    collectGallery(clickedImg) {
      const scope = (typeof clickedImg.closest === 'function' && clickedImg.closest('.markdown-body')) || document;
      const imgs = typeof scope.querySelectorAll === 'function' ? scope.querySelectorAll('img') : [clickedImg];
      const items = [];
      let activeIndex = 0;

      for (let i = 0; i < imgs.length; i++) {
        const el = imgs[i];
        if (!this.isPreviewableImage(el)) continue;
        const src = this.resolveImageUrl(el);
        const link = typeof el.closest === 'function' ? el.closest('a[href]') : null;
        const rawHref = link
          ? (typeof link.getAttribute === 'function' && link.getAttribute('href')) || link.href || ''
          : '';
        const linkUrl = this.safeUrl(rawHref);
        if (el === clickedImg) activeIndex = items.length;
        items.push({
          el,
          src,
          repoHref: linkUrl ? linkUrl.href : '',
          title: this.getImageTitle(el, src),
        });
      }

      if (!items.length) {
        const src = this.resolveImageUrl(clickedImg);
        const link = typeof clickedImg.closest === 'function' ? clickedImg.closest('a[href]') : null;
        const rawHref = link
          ? (typeof link.getAttribute === 'function' && link.getAttribute('href')) || link.href || ''
          : '';
        const linkUrl = this.safeUrl(rawHref);
        items.push({
          el: clickedImg,
          src,
          repoHref: linkUrl ? linkUrl.href : '',
          title: this.getImageTitle(clickedImg, src),
        });
      }

      return { items, activeIndex };
    },

    ensureDOM() {
      if (this.els && this.els.overlay) return this.els;

      const existing = typeof document.querySelector === 'function' ? document.querySelector('.ghe-lightbox-overlay') : null;
      if (existing) existing.remove();

      const overlay = document.createElement('div');
      overlay.className = 'ghe-lightbox-overlay';
      overlay.hidden = true;
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', '图片大图预览');

      const topbar = document.createElement('div');
      topbar.className = 'ghe-lightbox-topbar';

      const meta = document.createElement('div');
      meta.className = 'ghe-lightbox-meta';
      const counter = document.createElement('span');
      counter.className = 'ghe-lightbox-counter';
      const title = document.createElement('span');
      title.className = 'ghe-lightbox-title';
      meta.appendChild(counter);
      meta.appendChild(title);

      const actions = document.createElement('div');
      actions.className = 'ghe-lightbox-actions';

      const makeBtn = (text, cls, titleText) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `ghe-lightbox-btn ${cls || ''}`.trim();
        btn.textContent = text;
        if (titleText) btn.setAttribute('title', titleText);
        return btn;
      };

      const makeLink = (text, titleText) => {
        const a = document.createElement('a');
        a.className = 'ghe-lightbox-btn';
        a.textContent = text;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        if (titleText) a.setAttribute('title', titleText);
        return a;
      };

      const zoomOutBtn = makeBtn('−', '', '缩小');
      const zoomLabel = document.createElement('span');
      zoomLabel.className = 'ghe-lightbox-zoom-label';
      zoomLabel.textContent = '100%';
      const zoomInBtn = makeBtn('+', '', '放大');
      const fitBtn = makeBtn('适应', '', '适应窗口');
      const oneToOneBtn = makeBtn('1:1', '', '原始尺寸 / 2倍');

      const sep = document.createElement('span');
      sep.className = 'ghe-lightbox-sep';

      const rawLink = makeLink('原图 ↗', '新标签打开图片直链');
      const repoLink = makeLink('仓库文件 ↗', '新标签打开原仓库链接');
      const closeBtn = makeBtn('✕', 'ghe-lightbox-close', '关闭 (Esc)');

      actions.appendChild(zoomOutBtn);
      actions.appendChild(zoomLabel);
      actions.appendChild(zoomInBtn);
      actions.appendChild(fitBtn);
      actions.appendChild(oneToOneBtn);
      actions.appendChild(sep);
      actions.appendChild(rawLink);
      actions.appendChild(repoLink);
      actions.appendChild(closeBtn);

      topbar.appendChild(meta);
      topbar.appendChild(actions);

      const stage = document.createElement('div');
      stage.className = 'ghe-lightbox-stage';

      const prevBtn = makeBtn('‹', 'ghe-lightbox-nav ghe-lightbox-prev', '上一张 (←)');
      const nextBtn = makeBtn('›', 'ghe-lightbox-nav ghe-lightbox-next', '下一张 (→)');
      const img = document.createElement('img');
      img.className = 'ghe-lightbox-img';
      img.alt = '';

      stage.appendChild(prevBtn);
      stage.appendChild(img);
      stage.appendChild(nextBtn);

      const hint = document.createElement('div');
      hint.className = 'ghe-lightbox-hint';
      hint.textContent = '滚轮缩放 · 双击切换 1:1 · 左右方向键切图 · Esc 关闭 · 按住 Cmd/Ctrl 点击原图可直接打开原链接';

      overlay.appendChild(topbar);
      overlay.appendChild(stage);
      overlay.appendChild(hint);

      const host = document.body || document.documentElement;
      if (host && typeof host.appendChild === 'function') {
        host.appendChild(overlay);
      }

      // 绑定交互事件
      closeBtn.addEventListener('click', () => this.close());
      prevBtn.addEventListener('click', (e) => {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        this.step(-1);
      });
      nextBtn.addEventListener('click', (e) => {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        this.step(1);
      });
      zoomOutBtn.addEventListener('click', () => this.setZoom(this.state.scale / 1.25));
      zoomInBtn.addEventListener('click', () => this.setZoom(this.state.scale * 1.25));
      fitBtn.addEventListener('click', () => this.resetTransform());
      oneToOneBtn.addEventListener('click', () => this.toggleOneToOne());

      stage.addEventListener('click', (e) => {
        if (this.state.dragMoved) {
          this.state.dragMoved = false;
          return;
        }
        if (e && (e.target === stage || e.target === overlay)) {
          this.close();
        }
      });

      img.addEventListener('dblclick', (e) => {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        this.toggleOneToOne();
      });

      overlay.addEventListener(
        'wheel',
        (e) => {
          if (!this.state.isOpen) return;
          if (typeof e.preventDefault === 'function') e.preventDefault();
          if (typeof e.stopPropagation === 'function') e.stopPropagation();
          const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
          this.setZoom(this.state.scale * factor);
        },
        { passive: false }
      );

      img.addEventListener('mousedown', (e) => {
        if (!e || e.button !== 0 || this.state.scale <= 1) return;
        if (typeof e.preventDefault === 'function') e.preventDefault();
        this.state.dragging = true;
        this.state.dragMoved = false;
        this.state.startX = e.clientX;
        this.state.startY = e.clientY;
        this.state.originTx = this.state.tx;
        this.state.originTy = this.state.ty;
        img.setAttribute('data-dragging', 'true');
      });

      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        if (typeof window.__gheLightboxMouseCleanup === 'function') {
          window.__gheLightboxMouseCleanup();
        }
        const onMouseMove = (e) => {
          if (!this.state.dragging) return;
          const dx = e.clientX - this.state.startX;
          const dy = e.clientY - this.state.startY;
          if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
            this.state.dragMoved = true;
          }
          this.state.tx = this.state.originTx + dx;
          this.state.ty = this.state.originTy + dy;
          this.applyTransform();
        };
        const onMouseUp = () => {
          if (!this.state.dragging) return;
          this.state.dragging = false;
          if (this.els && this.els.img) {
            this.els.img.removeAttribute('data-dragging');
          }
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        window.__gheLightboxMouseCleanup = () => {
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        };
      }

      this.els = {
        overlay,
        counter,
        title,
        zoomLabel,
        rawLink,
        repoLink,
        prevBtn,
        nextBtn,
        img,
      };
      return this.els;
    },

    applyTransform() {
      if (!this.els || !this.els.img) return;
      const { scale, tx, ty } = this.state;
      this.els.img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
      if (scale > 1.01) {
        this.els.img.setAttribute('data-zoomed', 'true');
      } else {
        this.els.img.removeAttribute('data-zoomed');
      }
      if (this.els.zoomLabel) {
        this.els.zoomLabel.textContent = `${Math.round(scale * 100)}%`;
      }
    },

    resetTransform() {
      this.state.scale = 1;
      this.state.tx = 0;
      this.state.ty = 0;
      this.state.dragging = false;
      this.state.dragMoved = false;
      this.applyTransform();
    },

    setZoom(nextScale) {
      const clamped = Math.min(5, Math.max(0.25, nextScale));
      this.state.scale = clamped;
      if (clamped <= 1) {
        this.state.tx = 0;
        this.state.ty = 0;
      }
      this.applyTransform();
    },

    toggleOneToOne() {
      if (Math.abs(this.state.scale - 1) > 0.05 || this.state.tx !== 0 || this.state.ty !== 0) {
        this.resetTransform();
        return;
      }
      let target = 2;
      const img = this.els && this.els.img;
      if (img && img.naturalWidth > 0 && img.clientWidth > 0) {
        const naturalRatio = img.naturalWidth / img.clientWidth;
        target = naturalRatio > 1.15 ? Math.min(5, naturalRatio) : 2;
      }
      this.setZoom(target);
    },

    goTo(index) {
      const { items } = this.state;
      if (!items.length) return;
      const total = items.length;
      const nextIdx = ((index % total) + total) % total;
      this.state.index = nextIdx;
      const item = items[nextIdx];
      const els = this.ensureDOM();

      this.resetTransform();
      els.img.src = item.src;
      els.img.alt = item.title;
      els.counter.textContent = `${nextIdx + 1} / ${total}`;
      els.title.textContent = item.title;
      els.rawLink.href = item.src;

      if (item.repoHref && item.repoHref !== item.src) {
        els.repoLink.href = item.repoHref;
        els.repoLink.hidden = false;
      } else {
        els.repoLink.hidden = true;
      }

      const showNav = total > 1;
      els.prevBtn.hidden = !showNav;
      els.nextBtn.hidden = !showNav;
    },

    step(delta) {
      if (!this.state.isOpen || this.state.items.length <= 1) return;
      this.goTo(this.state.index + delta);
    },

    bindKeyHandler() {
      if (this.keyHandler || typeof document.addEventListener !== 'function') return;
      this.keyHandler = (e) => {
        if (!this.state.isOpen || !e) return;
        const key = e.key;
        if (key === 'Escape') {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          if (typeof e.stopPropagation === 'function') e.stopPropagation();
          this.close();
        } else if (key === 'ArrowLeft') {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          if (typeof e.stopPropagation === 'function') e.stopPropagation();
          this.step(-1);
        } else if (key === 'ArrowRight') {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          if (typeof e.stopPropagation === 'function') e.stopPropagation();
          this.step(1);
        }
      };
      document.addEventListener('keydown', this.keyHandler, true);
    },

    unbindKeyHandler() {
      if (!this.keyHandler) return;
      if (typeof document.removeEventListener === 'function') {
        document.removeEventListener('keydown', this.keyHandler, true);
      }
      this.keyHandler = null;
    },

    open(clickedImg) {
      if (!clickedImg) return;
      const { items, activeIndex } = this.collectGallery(clickedImg);
      if (!items.length) return;

      const els = this.ensureDOM();
      this.state.items = items;
      this.state.isOpen = true;
      this.goTo(activeIndex);

      els.overlay.hidden = false;
      document.documentElement.setAttribute('data-ghe-lightbox-open', 'true');
      this.bindKeyHandler();
    },

    close() {
      if (!this.state.isOpen) return;
      this.state.isOpen = false;
      this.state.items = [];
      this.resetTransform();
      if (this.els && this.els.overlay) {
        this.els.overlay.hidden = true;
      }
      document.documentElement.removeAttribute('data-ghe-lightbox-open');
      this.unbindKeyHandler();
    },

    applyRootFlags() {
      const enabled = Boolean(config.imageLightbox && config.imageLightbox.enabled);
      document.documentElement.setAttribute('data-ghe-lightbox-enabled', String(enabled));
      if (!enabled) {
        this.close();
      }
    },

    scan(root) {
      if (!root || (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11)) return;
      const enabled = Boolean(config.imageLightbox && config.imageLightbox.enabled);

      if (!enabled) {
        const marked = document.querySelectorAll('img[data-ghe-lightbox]');
        for (let i = 0; i < marked.length; i++) {
          marked[i].removeAttribute('data-ghe-lightbox');
        }
        return;
      }

      let imgs = [];
      if (root.nodeType === 1 && root.tagName === 'IMG') {
        imgs = [root];
      } else if (typeof root.querySelectorAll === 'function') {
        imgs = root.querySelectorAll('.markdown-body img');
        if (!imgs.length && root.nodeType === 1 && typeof root.closest === 'function' && root.closest('.markdown-body')) {
          imgs = root.querySelectorAll('img');
        }
      }

      for (let i = 0; i < imgs.length; i++) {
        const img = imgs[i];
        if (this.isPreviewableImage(img)) {
          if (img.getAttribute('data-ghe-lightbox') !== 'true') {
            img.setAttribute('data-ghe-lightbox', 'true');
          }
        } else if (typeof img.hasAttribute === 'function' && img.hasAttribute('data-ghe-lightbox')) {
          img.removeAttribute('data-ghe-lightbox');
        }
      }
    },

    getMenus() {
      const opt = config.imageLightbox;
      return [
        {
          label: `${opt.enabled ? '✅' : '⬜'} 功能4：Markdown 图片点击看大图`,
          onClick: () => {
            opt.enabled = !opt.enabled;
            if (!opt.enabled) this.close();
          },
        },
      ];
    },

    init() {
      this.applyRootFlags();
      injectCSS(this.styles());

      const target = typeof window !== 'undefined' ? window : null;
      if (target && typeof target.__gheLightboxCleanup === 'function') {
        target.__gheLightboxCleanup();
      }

      const onDocClick = (e) => {
        const opt = config.imageLightbox;
        if (!opt || !opt.enabled || !e) return;
        if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

        const targetEl = e.target;
        const img =
          targetEl && targetEl.tagName === 'IMG'
            ? targetEl
            : targetEl && typeof targetEl.closest === 'function'
              ? targetEl.closest('.markdown-body img')
              : null;
        if (!img) return;
        if (typeof img.closest === 'function' && img.closest('.ghe-lightbox-overlay')) return;
        if (!this.isPreviewableImage(img)) return;

        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
        this.open(img);
      };

      if (typeof document.addEventListener === 'function') {
        document.addEventListener('click', onDocClick, true);
        if (target) {
          target.__gheLightboxCleanup = () => {
            if (typeof document.removeEventListener === 'function') {
              document.removeEventListener('click', onDocClick, true);
            }
          };
        }
      }
    },
  };

  // ============================================================================
  // 7. 功能注册表与 SPA / 动态 DOM 调度器
  // ============================================================================
  const FEATURES = [
    visibilityBadgeFeature,
    releaseFilterFeature,
    shortcutGuardFeature,
    imageLightboxFeature,
  ];

  // 合并高频 DOM 变更，按帧批量增量扫描
  const pendingRoots = new Set();
  let scheduled = false;

  function isOwnInjectedNode(node) {
    if (!node || node.nodeType !== 1) return false;
    if (
      node.classList &&
      (node.classList.contains('ghe-header-pill') ||
        node.classList.contains('ghe-platform-filter') ||
        node.classList.contains('ghe-release-filter-notice') ||
        node.classList.contains('ghe-notes-toggle') ||
        node.classList.contains('ghe-lightbox-overlay'))
    ) {
      return true;
    }
    if (
      typeof node.closest === 'function' &&
      node.closest('.ghe-platform-filter, .ghe-release-filter-notice, .ghe-notes-toggle, .ghe-lightbox-overlay')
    ) {
      return true;
    }
    return false;
  }

  function scheduleScan(root) {
    if (!root) return;
    pendingRoots.add(root);
    if (scheduled) return;
    scheduled = true;

    const run = () => {
      scheduled = false;
      const targets = Array.from(pendingRoots);
      pendingRoots.clear();

      if (targets.includes(document) || targets.includes(document.body)) {
        for (const feature of FEATURES) {
          if (typeof feature.scan === 'function') feature.scan(document);
        }
        return;
      }

      for (const target of targets) {
        for (const feature of FEATURES) {
          if (typeof feature.scan === 'function') feature.scan(target);
        }
      }
    };

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(run);
    } else {
      setTimeout(run, 16);
    }
  }

  function startObserver() {
    if (!document.body) return;

    const observer = new MutationObserver((mutations) => {
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (m.type === 'childList') {
          for (let j = 0; j < m.addedNodes.length; j++) {
            const node = m.addedNodes[j];
            if (node.nodeType === 1 && !isOwnInjectedNode(node)) {
              scheduleScan(node);
            }
          }
        } else if (m.type === 'characterData' && m.target && m.target.parentElement) {
          if (!isOwnInjectedNode(m.target.parentElement)) {
            scheduleScan(m.target.parentElement);
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  function bootstrap() {
    for (const feature of FEATURES) {
      if (typeof feature.init === 'function') feature.init();
    }
    MenuManager.refreshAllMenus(FEATURES);

    const onReady = () => {
      scheduleScan(document);
      startObserver();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', onReady, { once: true });
    } else {
      onReady();
    }

    // 兼容 GitHub Turbo / PJAX 局部路由切换与浏览器前进后退
    const onRouteChange = () => {
      imageLightboxFeature.close();
      scheduleScan(document);
    };
    ['turbo:load', 'turbo:render', 'turbo:frame-load', 'pjax:end'].forEach((evt) => {
      document.addEventListener(evt, onRouteChange);
    });
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('popstate', onRouteChange);
    }
  }

  bootstrap();
})();
