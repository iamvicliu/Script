// ==UserScript==
// @name         POE2DB 多语言信息助手
// @namespace    http://tampermonkey.net/
// @version      3.4
// @lastUpdated  2026-06-16 13:12:52 +08:00
// @description  POE2DB 多语言名称、三语搜索与复制助手
// @author       维克牛
// @contact      https://nga.178.com/nuke.php?func=ucp&uid=6888984
// @contributor  Codex optimized
// @match        https://poe2db.tw/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      poe2db.tw
// @connect      cdn.poe2db.tw
// @license      MIT
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const LANGS = ['cn', 'tw', 'us'];
    const LANG_NAMES = { cn: '简体中文', tw: '繁体中文', us: '英文' };
    const PANEL_STATE_KEY = 'poe2db-helper-panel-expanded';
    const RECENT_ITEMS_KEY = 'poe2db-helper-recent-items';
    const VISITED_PAGES_KEY = 'poe2db-helper-visited-pages';
    const MAX_RECENT_ITEMS = 5;
    const MAX_VISITED_PAGES = 8;
    const MARKET_SERVERS = {
        cn: { name: '国服', url: 'https://poe.game.qq.com/trade2/search/poe2/', query: false },
        tw: { name: '台服', url: 'https://pathofexile.tw/trade2', query: false },
        us: { name: '国际服', url: 'https://www.pathofexile.com/trade2/search/poe2/', query: true }
    };

    const state = {
        panel: null,
        toggle: null,
        autocomplete: {},
        autocompleteByValue: {},
        searchIndex: {},
        autocompleteLoading: null,
        headerScriptUrl: null,
        autocompleteFiles: {}
    };

    GM_addStyle(`
        .poe-helper-toggle {
            position: fixed;
            top: 8px;
            right: 8px;
            z-index: 9999;
            padding: 7px 12px;
            border-radius: 4px;
            border: 1px solid rgba(180, 137, 72, 0.5);
            background: rgba(19, 16, 13, 0.9);
            color: #d9c08a;
            font-size: 13px;
            cursor: pointer;
            box-shadow: 0 6px 18px rgba(0, 0, 0, 0.42);
            backdrop-filter: blur(10px);
        }
        .poe-helper-toggle:hover {
            background: rgba(45, 34, 23, 0.95);
            color: #f3d99b;
        }
        .poe-helper-panel {
            position: fixed;
            top: 8px;
            right: 8px;
            width: 280px;
            max-height: calc(100vh - 24px);
            box-sizing: border-box;
            overflow-y: auto;
            z-index: 10000;
            padding: 12px;
            border-radius: 6px;
            border: 1px solid rgba(154, 119, 70, 0.48);
            background: rgba(10, 9, 8, 0.94);
            color: #d7d0bd;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            box-shadow: 0 14px 34px rgba(0, 0, 0, 0.62), inset 0 1px 0 rgba(255, 255, 255, 0.04);
            backdrop-filter: blur(8px);
        }
        .poe-helper-panel *,
        .poe-helper-toggle {
            box-sizing: border-box;
        }
        .poe-helper-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 8px;
            padding-bottom: 8px;
            border-bottom: 1px solid rgba(154, 119, 70, 0.32);
        }
        .poe-helper-title {
            font-size: 15px;
            font-weight: 700;
            color: #d9c08a;
        }
        .poe-helper-close {
            width: 26px;
            height: 26px;
            border-radius: 4px;
            border: 1px solid rgba(151, 75, 55, 0.62);
            background: rgba(58, 24, 18, 0.52);
            color: #d99a84;
            cursor: pointer;
            font-size: 18px;
            line-height: 1;
        }
        .poe-helper-label {
            color: #94a3b8;
            font-size: 12px;
        }
        .poe-helper-input {
            width: 100%;
            min-width: 0;
            box-sizing: border-box;
            border-radius: 4px;
            border: 1px solid rgba(154, 119, 70, 0.42);
            background: rgba(18, 16, 13, 0.82);
            color: #e2dccd;
            outline: none;
        }
        .poe-helper-search {
            position: relative;
            display: grid;
            grid-template-columns: 1fr 52px;
            gap: 6px;
        }
        .poe-helper-input {
            padding: 7px 9px;
            font-size: 13px;
        }
        .poe-helper-input:focus {
            border-color: rgba(217, 176, 95, 0.7);
            box-shadow: 0 0 0 2px rgba(154, 119, 70, 0.18);
        }
        .poe-helper-search-btn,
        .poe-helper-btn {
            border-radius: 4px;
            border: 1px solid rgba(154, 119, 70, 0.48);
            background: rgba(48, 36, 24, 0.78);
            color: #e3c886;
            cursor: pointer;
            font-size: 12px;
        }
        .poe-helper-search-btn {
            padding: 0 8px;
            font-weight: 600;
        }
        .poe-helper-search-btn:hover,
        .poe-helper-btn:hover {
            background: rgba(85, 62, 34, 0.9);
            color: #ffe2a0;
        }
        .poe-helper-results {
            position: absolute;
            top: calc(100% + 6px);
            left: 0;
            right: 0;
            display: none;
            z-index: 1;
            max-height: min(260px, calc(100vh - 190px));
            overflow-y: auto;
            border-radius: 4px;
            border: 1px solid rgba(154, 119, 70, 0.45);
            background: rgba(12, 10, 8, 0.98);
            box-shadow: 0 12px 30px rgba(0, 0, 0, 0.56);
        }
        .poe-helper-results.active {
            display: block;
        }
        .poe-helper-result {
            padding: 7px 9px;
            border-bottom: 1px solid rgba(154, 119, 70, 0.14);
            cursor: pointer;
        }
        .poe-helper-result:hover {
            background: rgba(154, 119, 70, 0.16);
        }
        .poe-helper-result-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            margin-bottom: 5px;
        }
        .poe-helper-result-name {
            min-width: 0;
            color: #e7dfce;
            font-size: 13px;
            font-weight: 600;
            line-height: 1.35;
            overflow-wrap: anywhere;
        }
        .poe-helper-type-badge {
            flex: none;
            padding: 2px 7px;
            border-radius: 999px;
            border: 1px solid rgba(154, 119, 70, 0.4);
            background: rgba(55, 40, 24, 0.6);
            color: #d9c08a;
            font-size: 11px;
            line-height: 1.35;
        }
        .poe-helper-result-langs {
            display: grid;
            gap: 4px;
        }
        .poe-helper-result-lang {
            display: grid;
            grid-template-columns: 30px 1fr auto auto;
            align-items: center;
            gap: 7px;
            padding: 3px 5px;
            border-radius: 4px;
            color: #d9d1bf;
            font-size: 12px;
            line-height: 1.35;
            cursor: pointer;
            transition: background 0.12s ease, color 0.12s ease;
        }
        .poe-helper-result-lang:hover {
            background: rgba(154, 119, 70, 0.18);
        }
        .poe-helper-lang-badge {
            align-self: start;
            padding: 1px 4px;
            border-radius: 3px;
            border: 1px solid rgba(154, 119, 70, 0.4);
            background: rgba(55, 40, 24, 0.6);
            color: #d9c08a;
            font-size: 11px;
            line-height: 1.35;
            text-align: center;
        }
        .poe-helper-lang-text {
            min-width: 0;
            overflow-wrap: anywhere;
        }
        .poe-helper-open-mark {
            color: #9f9686;
            font-size: 12px;
            line-height: 1.35;
            opacity: 0.72;
            transition: color 0.12s ease, transform 0.12s ease, opacity 0.12s ease;
        }
        .poe-helper-result-lang:hover .poe-helper-lang-text {
            color: #ffe2a0;
        }
        .poe-helper-result-lang:hover .poe-helper-open-mark {
            color: #d9c08a;
            opacity: 1;
            transform: translateX(1px);
        }
        .poe-helper-mini-btn {
            min-width: 24px;
            height: 20px;
            padding: 0 5px;
            border-radius: 3px;
            border: 1px solid rgba(154, 119, 70, 0.42);
            background: rgba(48, 36, 24, 0.62);
            color: #d9c08a;
            cursor: pointer;
            font-size: 11px;
            line-height: 18px;
        }
        .poe-helper-mini-btn:hover {
            background: rgba(85, 62, 34, 0.9);
            color: #ffe2a0;
        }
        .poe-helper-danger-btn {
            border-color: transparent;
            background: transparent;
            color: #8f8574;
        }
        .poe-helper-danger-btn:hover {
            border-color: rgba(151, 75, 55, 0.45);
            background: rgba(58, 24, 18, 0.45);
            color: #d99a84;
        }
        .poe-helper-lang-badge.cn {
            border-color: rgba(88, 142, 111, 0.45);
            background: rgba(24, 63, 48, 0.48);
            color: #9fd6b4;
        }
        .poe-helper-lang-badge.tw {
            border-color: rgba(154, 119, 70, 0.45);
            background: rgba(55, 40, 24, 0.6);
            color: #d9c08a;
        }
        .poe-helper-lang-badge.us {
            border-color: rgba(121, 139, 166, 0.45);
            background: rgba(34, 42, 55, 0.5);
            color: #c9d4e6;
        }
        .poe-helper-result-desc {
            display: flex;
            justify-content: space-between;
            gap: 8px;
            margin-top: 3px;
            color: #9f9686;
            font-size: 11px;
        }
        .poe-helper-recent-title {
            padding: 8px 10px 4px;
            color: #d9c08a;
            font-size: 12px;
            font-weight: 700;
        }
        .poe-helper-empty,
        .poe-helper-loading {
            padding: 18px 10px;
            text-align: center;
            color: #9f9686;
            font-size: 12px;
        }
        .poe-helper-module {
            margin-top: 12px;
        }
        .poe-helper-module:first-of-type {
            margin-top: 0;
        }
        .poe-helper-module-title {
            margin: 0 0 7px;
            color: #d9c08a;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.2px;
        }
        .poe-helper-module-body {
            display: grid;
            gap: 6px;
        }
        .poe-helper-section {
            margin-top: 0;
            padding: 8px 9px;
            border-radius: 4px;
            border: 1px solid rgba(154, 119, 70, 0.24);
            background: rgba(28, 24, 18, 0.6);
        }
        .poe-helper-section-title {
            margin-bottom: 4px;
            color: #d9c08a;
            font-size: 13px;
            font-weight: 700;
            line-height: 1.25;
        }
        .poe-helper-name-row {
            display: grid;
            grid-template-columns: 1fr auto;
            align-items: center;
            gap: 6px;
        }
        .poe-helper-name {
            min-width: 0;
            color: #eee6d3;
            font-size: 13px;
            line-height: 1.3;
            overflow-wrap: anywhere;
            word-break: normal;
        }
        .poe-helper-actions {
            display: flex;
            gap: 4px;
            flex-wrap: wrap;
            justify-content: flex-end;
            align-items: center;
        }
        .poe-helper-btn {
            padding: 3px 7px;
            line-height: 1.35;
        }
        .poe-helper-buy {
            border-color: rgba(88, 142, 111, 0.46);
            background: rgba(17, 72, 52, 0.42);
            color: #9fd6b4;
        }
        .poe-helper-history {
            margin-top: 10px;
        }
        .poe-helper-history-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            margin-bottom: 5px;
        }
        .poe-helper-history-clear {
            border: 0;
            background: transparent;
            color: #9f9686;
            cursor: pointer;
            font-size: 11px;
            padding: 2px 0;
        }
        .poe-helper-history-clear:hover {
            color: #d9c08a;
        }
        .poe-helper-history-list {
            display: grid;
            gap: 4px;
        }
        .poe-helper-history-row {
            display: grid;
            grid-template-columns: auto 1fr auto auto;
            align-items: center;
            gap: 5px;
            padding: 4px 5px;
            border-radius: 4px;
            color: #d9d1bf;
            cursor: pointer;
        }
        .poe-helper-history-row:hover {
            background: rgba(154, 119, 70, 0.16);
            color: #ffe2a0;
        }
        .poe-helper-history-name {
            min-width: 0;
            font-size: 12px;
            line-height: 1.35;
            overflow-wrap: anywhere;
        }
        .poe-helper-history-delete {
            width: 22px;
            min-width: 22px;
            padding: 0;
        }
        .poe-helper-toast {
            position: fixed;
            top: 50%;
            left: 50%;
            z-index: 10003;
            transform: translate(-50%, -50%);
            padding: 14px 20px;
            border-radius: 8px;
            background: rgba(34, 197, 94, 0.96);
            color: #fff;
            font-size: 14px;
            font-weight: 700;
            box-shadow: 0 12px 28px rgba(0, 0, 0, 0.35);
            animation: poeHelperToast 1.8s ease forwards;
            pointer-events: none;
        }
        .poe-helper-toast.error {
            background: rgba(239, 68, 68, 0.96);
        }
        .poe-helper-toast.info {
            background: rgba(99, 102, 241, 0.96);
        }
        @keyframes poeHelperToast {
            0% { opacity: 0; transform: translate(-50%, -50%) scale(0.94); }
            12% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            88% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            100% { opacity: 0; transform: translate(-50%, -50%) scale(0.94); }
        }
        @media (max-width: 768px) {
            .poe-helper-panel {
                top: 8px;
                right: 8px;
                left: auto;
                width: min(280px, calc(100vw - 16px));
                max-height: calc(100vh - 20px);
            }
            .poe-helper-name-row {
                grid-template-columns: 1fr auto;
            }
            .poe-helper-actions {
                justify-content: flex-end;
            }
        }
    `);

    const requestText = (url) => new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'GET',
            url,
            timeout: 12000,
            onload: (response) => {
                if (response.status >= 200 && response.status < 300) {
                    resolve(response.responseText);
                } else {
                    reject(new Error(`HTTP ${response.status}: ${url}`));
                }
            },
            onerror: () => reject(new Error(`请求失败: ${url}`)),
            ontimeout: () => reject(new Error(`请求超时: ${url}`))
        });
    });

    const escapeHtml = (text) => String(text ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));

    const debounce = (fn, delay) => {
        let timer = null;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), delay);
        };
    };

    const isPanelExpanded = () => {
        try {
            return window.localStorage.getItem(PANEL_STATE_KEY) !== '0';
        } catch (error) {
            console.warn('POE2DB 助手读取面板状态失败', error);
            return true;
        }
    };

    const rememberPanelExpanded = (expanded) => {
        try {
            window.localStorage.setItem(PANEL_STATE_KEY, expanded ? '1' : '0');
        } catch (error) {
            console.warn('POE2DB 助手保存面板状态失败', error);
        }
    };

    const getRecentItems = () => {
        try {
            const parsed = JSON.parse(window.localStorage.getItem(RECENT_ITEMS_KEY) || '[]');
            return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT_ITEMS) : [];
        } catch (error) {
            console.warn('POE2DB 助手读取最近搜索打开失败', error);
            return [];
        }
    };

    const saveRecentItems = (items) => {
        try {
            window.localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify(items.slice(0, MAX_RECENT_ITEMS)));
        } catch (error) {
            console.warn('POE2DB 助手保存最近搜索打开失败', error);
        }
    };

    const rememberRecentItem = (item, lang) => {
        const recent = getRecentItems().filter((entry) => entry.path !== item.path);
        recent.unshift({
            path: item.path,
            labels: item.labels,
            desc: item.desc || '',
            lastLang: lang
        });
        saveRecentItems(recent);
    };

    const getVisitedPages = () => {
        try {
            const parsed = JSON.parse(window.localStorage.getItem(VISITED_PAGES_KEY) || '[]');
            return Array.isArray(parsed) ? parsed.slice(0, MAX_VISITED_PAGES) : [];
        } catch (error) {
            console.warn('POE2DB 助手读取最近访问失败', error);
            return [];
        }
    };

    const saveVisitedPages = (items) => {
        try {
            window.localStorage.setItem(VISITED_PAGES_KEY, JSON.stringify(items.slice(0, MAX_VISITED_PAGES)));
        } catch (error) {
            console.warn('POE2DB 助手保存最近访问失败', error);
        }
    };

    const rememberVisitedPage = (entry) => {
        if (!entry.path || ['cn', 'tw', 'us'].includes(entry.path)) return getVisitedPages();

        const labels = Object.fromEntries(
            Object.entries(entry.labels || {}).filter(([, value]) => value && value !== 'N/A' && value !== '加载失败')
        );

        if (!Object.keys(labels).length) return getVisitedPages();

        const visited = getVisitedPages().filter((item) => item.path !== entry.path);
        visited.unshift({
            path: entry.path,
            labels,
            lastLang: entry.lang,
            visitedAt: Date.now()
        });
        saveVisitedPages(visited);
        return visited;
    };

    const removeVisitedPage = (path) => {
        saveVisitedPages(getVisitedPages().filter((item) => item.path !== path));
    };

    const getCurrentLangAndPath = () => {
        const match = window.location.href.match(/^https:\/\/poe2db\.tw\/(cn|tw|us)\/?(.*)$/);
        if (!match) return null;
        return {
            lang: match[1],
            path: match[2].replace(/^\/+/, '')
        };
    };

    const normalizeRelativePath = (value) => {
        const cleaned = String(value || '').replace(/^https:\/\/poe2db\.tw\/(cn|tw|us)\//, '').replace(/^\/+/, '');
        return cleaned || '';
    };

    const getHeaderScriptUrl = async () => {
        if (state.headerScriptUrl) return state.headerScriptUrl;

        const currentScript = [...document.scripts]
            .map((script) => script.src)
            .find((src) => /\/js\/poedb_header\.[a-z0-9]+\.js(?:\?.*)?$/i.test(src) || src.includes('/js/poedb_header.'));

        if (currentScript) {
            state.headerScriptUrl = currentScript;
            return currentScript;
        }

        const html = await requestText('https://poe2db.tw/cn/');
        const match = html.match(/https:\/\/cdn\.poe2db\.tw\/js\/poedb_header\.[a-f0-9]+\.js/);
        if (!match) throw new Error('没有找到 poedb_header 脚本');

        state.headerScriptUrl = match[0];
        return state.headerScriptUrl;
    };

    const parseAutocompleteFiles = (headerJs) => {
        const files = {};
        for (const lang of LANGS) {
            const match = headerJs.match(new RegExp(`autocompletecb_${lang}\\.[a-z0-9]+\\.json`, 'i'));
            if (match) files[lang] = `https://cdn.poe2db.tw/json/${match[0]}`;
        }
        return files;
    };

    const buildSearchIndex = (lang, data) => {
        const list = Array.isArray(data) ? data : [];
        state.autocomplete[lang] = list;
        state.autocompleteByValue[lang] = new Map(
            list.map((item) => [normalizeRelativePath(item.value), item])
        );
        state.searchIndex[lang] = list.map((item) => {
            const path = normalizeRelativePath(item.value);
            const label = item.label || path;
            const desc = item.desc || '';
            const value = item.value || '';
            return {
                lang,
                path,
                label,
                desc,
                labelLower: String(label).toLowerCase(),
                valueLower: String(value).toLowerCase(),
                searchText: `${label} ${desc} ${value}`.toLowerCase()
            };
        }).filter((item) => item.path);
    };

    const loadAutocompleteData = async () => {
        if (state.autocompleteLoading) return state.autocompleteLoading;

        state.autocompleteLoading = (async () => {
            try {
                if (!Object.keys(state.autocompleteFiles).length) {
                    const headerUrl = await getHeaderScriptUrl();
                    const headerJs = await requestText(headerUrl);
                    state.autocompleteFiles = parseAutocompleteFiles(headerJs);
                }

                const results = await Promise.allSettled(LANGS.map(async (lang) => {
                    if (state.searchIndex[lang]?.length) return;

                    const fileUrl = state.autocompleteFiles[lang];
                    if (!fileUrl) throw new Error(`没有找到 ${lang} 自动补全文件`);

                    const raw = await requestText(fileUrl);
                    buildSearchIndex(lang, JSON.parse(raw));
                }));

                const failures = results
                    .map((result, index) => ({ result, lang: LANGS[index] }))
                    .filter((entry) => entry.result.status === 'rejected');

                failures.forEach((entry) => console.warn(`POE2DB ${entry.lang} 搜索数据加载失败`, entry.result.reason));

                const loadedLangs = LANGS.filter((lang) => state.searchIndex[lang]?.length);
                if (!loadedLangs.length) {
                    throw new Error('三种语言搜索数据都加载失败');
                }

                return state.autocomplete;
            } catch (error) {
                state.autocompleteLoading = null;
                throw error;
            }
        })();

        return state.autocompleteLoading;
    };

    const findSearchResults = (query) => {
        const q = query.trim().toLowerCase();
        if (!q) return [];

        const groups = new Map();

        for (const lang of LANGS) {
            let langMatches = 0;

            for (const item of state.searchIndex[lang] || []) {
                if (!item.searchText.includes(q)) continue;

                const score = item.labelLower === q ? 0 : item.labelLower.startsWith(q) ? 1 : item.valueLower.includes(q) ? 2 : 3;
                const existing = groups.get(item.path);

                if (!existing) {
                    groups.set(item.path, {
                        path: item.path,
                        desc: item.desc || '',
                        score,
                        matchedLangs: new Set([lang])
                    });
                } else {
                    existing.score = Math.min(existing.score, score);
                    existing.desc = existing.desc || item.desc || '';
                    existing.matchedLangs.add(lang);
                }

                langMatches++;
                if (langMatches >= 18) break;
            }
        }

        return [...groups.values()]
            .map((group) => {
                const labels = {};
                const descs = [];

                for (const lang of LANGS) {
                    const item = state.autocompleteByValue[lang]?.get(group.path);
                    if (item?.label) labels[lang] = item.label;
                    if (item?.desc) descs.push(item.desc);
                }

                return {
                    path: group.path,
                    labels,
                    desc: group.desc || descs[0] || '',
                    score: group.score,
                    matchedLangCount: group.matchedLangs.size
                };
            })
            .sort((a, b) => a.score - b.score || b.matchedLangCount - a.matchedLangCount || (a.labels.cn || a.labels.tw || a.labels.us || a.path).length - (b.labels.cn || b.labels.tw || b.labels.us || b.path).length)
            .slice(0, 18);
    };

    const extractInfoFromDocument = (doc) => {
        const selectors = [
            '.itemName .lc',
            '.itemName',
            '[class*="itemName"]',
            'h1',
            'h3',
            'title'
        ];

        for (const selector of selectors) {
            const element = doc.querySelector(selector);
            const text = element ? element.textContent.trim().replace(/\s+/g, ' ') : '';
            if (text) return { title: text.replace(/ - PoE2DB.*/i, '') };
        }

        return { title: 'N/A' };
    };

    const fetchLangInfo = async (lang, path, currentLang) => {
        if (lang === currentLang) {
            return extractInfoFromDocument(document);
        }

        const html = await requestText(`https://poe2db.tw/${lang}/${path}`);
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return extractInfoFromDocument(doc);
    };

    const showNotification = (message, type = 'success') => {
        document.querySelectorAll('.poe-helper-toast').forEach((node) => node.remove());
        const toast = document.createElement('div');
        toast.className = `poe-helper-toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 1800);
    };

    const copyText = async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            showNotification('已复制到剪贴板');
        } catch (error) {
            console.error(error);
            showNotification('复制失败', 'error');
        }
    };

    const buyItem = async (itemName, lang) => {
        const server = MARKET_SERVERS[lang] || MARKET_SERVERS.cn;

        try {
            await navigator.clipboard.writeText(itemName);
        } catch (error) {
            console.error(error);
        }

        showNotification(`已复制，正在打开${server.name}市集`, 'success');
        const url = server.query ? `${server.url}${encodeURIComponent(itemName)}` : server.url;
        setTimeout(() => window.open(url, '_blank'), 800);
    };

    const openSearchResult = (result, lang) => {
        rememberRecentItem(result, lang);
        window.location.href = `https://poe2db.tw/${lang}/${result.path}`;
    };

    const openVisitedPage = (entry) => {
        const lang = LANGS.includes(entry.lastLang) ? entry.lastLang : 'cn';
        window.location.href = `https://poe2db.tw/${lang}/${entry.path}`;
    };

    const getResultLabel = (result, lang) => result.labels?.[lang] || result.labels?.cn || result.labels?.tw || result.labels?.us || result.path;

    const renderSearchResults = (container, results, options = {}) => {
        container.innerHTML = '';
        if (!results.length) {
            container.innerHTML = '<div class="poe-helper-empty">未找到相关结果</div>';
            container.classList.add('active');
            return;
        }

        if (options.title) {
            const title = document.createElement('div');
            title.className = 'poe-helper-recent-title';
            title.textContent = options.title;
            container.appendChild(title);
        }

        for (const result of results) {
            const row = document.createElement('div');
            row.className = 'poe-helper-result';
            const primaryLabel = getResultLabel(result, 'cn');
            const typeText = result.desc || '条目';
            const langRows = LANGS
                .filter((lang) => result.labels[lang])
                .map((lang) => `
                    <div class="poe-helper-result-lang" data-lang="${lang}">
                        <span class="poe-helper-lang-badge ${lang}">${lang === 'us' ? 'EN' : lang === 'tw' ? '繁' : '简'}</span>
                        <span class="poe-helper-lang-text">${escapeHtml(result.labels[lang])}</span>
                        ${options.allowCopy ? `<button class="poe-helper-mini-btn" data-action="copy-result" data-name="${escapeHtml(result.labels[lang])}" type="button">复制</button>` : ''}
                        <span class="poe-helper-open-mark">›</span>
                    </div>
                `)
                .join('');

            row.innerHTML = `
                <div class="poe-helper-result-top">
                    <div class="poe-helper-result-name">${escapeHtml(primaryLabel)}</div>
                    <span class="poe-helper-type-badge">${escapeHtml(typeText)}</span>
                </div>
                <div class="poe-helper-result-langs">${langRows}</div>
            `;
            row.querySelectorAll('.poe-helper-result-lang').forEach((langRow) => {
                langRow.addEventListener('click', (event) => {
                    event.stopPropagation();
                    openSearchResult(result, langRow.dataset.lang);
                });
            });
            row.querySelectorAll('[data-action="copy-result"]').forEach((button) => {
                button.addEventListener('click', (event) => {
                    event.stopPropagation();
                    copyText(button.dataset.name);
                });
            });
            container.appendChild(row);
        }

        container.classList.add('active');
    };

    const handleSearch = async (panel) => {
        const input = panel.querySelector('.poe-helper-input');
        const resultsBox = panel.querySelector('.poe-helper-results');
        const query = input.value.trim();

        if (!query) {
            const recent = getRecentItems();
            if (recent.length) {
                renderSearchResults(resultsBox, recent, { title: '最近搜索打开', allowCopy: true });
            } else {
                resultsBox.classList.remove('active');
                resultsBox.innerHTML = '';
            }
            return;
        }

        resultsBox.innerHTML = '<div class="poe-helper-loading">正在搜索...</div>';
        resultsBox.classList.add('active');

        try {
            await loadAutocompleteData();
            renderSearchResults(resultsBox, findSearchResults(query));
        } catch (error) {
            console.error(error);
            resultsBox.innerHTML = '<div class="poe-helper-empty">搜索数据加载失败，正在等待下次输入重试</div>';
        }
    };

    const renderVisitedPages = (items) => {
        if (!items.length) return '';

        return `
            <div class="poe-helper-module poe-helper-history">
                <div class="poe-helper-history-head">
                    <div class="poe-helper-module-title">最近访问</div>
                    <button class="poe-helper-history-clear" data-action="clear-visited" type="button">清空</button>
                </div>
                <div class="poe-helper-history-list">
                    ${items.map((item) => {
                        const lang = LANGS.includes(item.lastLang) ? item.lastLang : 'cn';
                        const title = getResultLabel(item, lang);
                        return `
                            <div class="poe-helper-history-row" data-action="open-visited" data-path="${escapeHtml(item.path)}">
                                <span class="poe-helper-lang-badge ${lang}">${lang === 'us' ? 'EN' : lang === 'tw' ? '繁' : '简'}</span>
                                <span class="poe-helper-history-name">${escapeHtml(title)}</span>
                                <button class="poe-helper-mini-btn" data-action="copy-visited" data-name="${escapeHtml(title)}" type="button">复制</button>
                                <button class="poe-helper-mini-btn poe-helper-danger-btn poe-helper-history-delete" data-action="delete-visited" data-path="${escapeHtml(item.path)}" type="button" title="删除">×</button>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    };

    const refreshVisitedPages = (content) => {
        content.querySelector('.poe-helper-history')?.remove();
        const html = renderVisitedPages(getVisitedPages());
        if (html) {
            content.insertAdjacentHTML('beforeend', html);
            bindVisitedPageEvents(content);
        }
    };

    const bindVisitedPageEvents = (content) => {
        content.querySelectorAll('[data-action="open-visited"]').forEach((row) => {
            row.addEventListener('click', () => {
                const entry = getVisitedPages().find((item) => item.path === row.dataset.path);
                if (entry) openVisitedPage(entry);
            });
        });

        content.querySelectorAll('[data-action="delete-visited"]').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                removeVisitedPage(button.dataset.path);
                refreshVisitedPages(content);
            });
        });

        content.querySelectorAll('[data-action="copy-visited"]').forEach((button) => {
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                copyText(button.dataset.name);
            });
        });

        content.querySelector('[data-action="clear-visited"]')?.addEventListener('click', () => {
            saveVisitedPages([]);
            refreshVisitedPages(content);
        });
    };

    const renderLangSections = (panel, langInfoMap, path, currentLang) => {
        const content = panel.querySelector('.poe-helper-content');
        const labels = Object.fromEntries(LANGS.map((lang) => [lang, langInfoMap[lang]?.title || '']));
        const visitedItems = rememberVisitedPage({ path, lang: currentLang, labels });

        const langSections = LANGS.map((lang) => {
            const info = langInfoMap[lang] || { title: '加载失败' };
            const title = info.title || 'N/A';
            return `
                <div class="poe-helper-section">
                    <div class="poe-helper-section-title">${LANG_NAMES[lang]}</div>
                    <div class="poe-helper-name-row">
                        <div class="poe-helper-name">${escapeHtml(title)}</div>
                        <div class="poe-helper-actions">
                            <button class="poe-helper-btn" data-action="copy" data-name="${escapeHtml(title)}">复制</button>
                            <button class="poe-helper-btn poe-helper-buy" data-action="buy" data-name="${escapeHtml(title)}" data-lang="${lang}">购买</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        content.innerHTML = `
            <div class="poe-helper-module">
                <div class="poe-helper-module-title">多语言对照</div>
                <div class="poe-helper-module-body">${langSections}</div>
            </div>
            ${renderVisitedPages(visitedItems)}
        `;

        content.querySelectorAll('.poe-helper-btn').forEach((button) => {
            button.addEventListener('click', () => {
                const action = button.dataset.action;
                if (action === 'copy') copyText(button.dataset.name);
                if (action === 'buy') buyItem(button.dataset.name, button.dataset.lang);
            });
        });

        bindVisitedPageEvents(content);
    };

    const loadPanelInfo = async (panel) => {
        const current = getCurrentLangAndPath();
        if (!current) {
            panel.querySelector('.poe-helper-content').innerHTML = '<div class="poe-helper-empty">当前页面不是 POE2DB 语言页面</div>';
            return;
        }

        const langInfoMap = {};
        const tasks = LANGS.map(async (lang) => {
            try {
                langInfoMap[lang] = await fetchLangInfo(lang, current.path, current.lang);
            } catch (error) {
                console.error(error);
                langInfoMap[lang] = { title: '加载失败' };
            }
        });

        await Promise.all(tasks);
        renderLangSections(panel, langInfoMap, current.path, current.lang);
    };

    const createPanel = () => {
        const panel = document.createElement('div');
        panel.className = 'poe-helper-panel';
        panel.innerHTML = `
            <div class="poe-helper-header">
                <div class="poe-helper-title">POE2DB 助手</div>
                <button class="poe-helper-close" title="关闭">×</button>
            </div>
            <div class="poe-helper-module">
                <div class="poe-helper-module-title">搜索跳转</div>
                <div class="poe-helper-search">
                    <input class="poe-helper-input" type="text" placeholder="搜索中文或英文词条...">
                    <button class="poe-helper-search-btn">搜索</button>
                    <div class="poe-helper-results"></div>
                </div>
            </div>
            <div class="poe-helper-content">
                <div class="poe-helper-loading">正在加载多语言信息...</div>
            </div>
        `;

        document.body.appendChild(panel);

        panel.querySelector('.poe-helper-close').addEventListener('click', () => {
            panel.remove();
            state.panel = null;
            rememberPanelExpanded(false);
        });

        const debouncedSearch = debounce(() => handleSearch(panel), 350);
        const searchArea = panel.querySelector('.poe-helper-search');
        const searchInput = panel.querySelector('.poe-helper-input');
        const searchButton = panel.querySelector('.poe-helper-search-btn');
        const resultsBox = panel.querySelector('.poe-helper-results');

        const hideResults = () => {
            resultsBox.classList.remove('active');
        };

        searchInput.addEventListener('input', debouncedSearch);
        searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') handleSearch(panel);
        });
        searchInput.addEventListener('focus', () => {
            if (resultsBox.children.length) {
                resultsBox.classList.add('active');
                return;
            }

            const recent = getRecentItems();
            if (recent.length) renderSearchResults(resultsBox, recent, { title: '最近搜索打开', allowCopy: true });
        });
        searchInput.addEventListener('blur', () => {
            setTimeout(() => {
                if (!searchArea.contains(document.activeElement)) hideResults();
            }, 120);
        });
        searchButton.addEventListener('click', () => handleSearch(panel));

        document.addEventListener('click', (event) => {
            if (!searchArea.contains(event.target)) hideResults();
        });

        loadAutocompleteData().catch((error) => console.error(error));
        loadPanelInfo(panel);
        return panel;
    };

    const togglePanel = () => {
        if (state.panel) {
            state.panel.remove();
            state.panel = null;
            rememberPanelExpanded(false);
            return;
        }
        state.panel = createPanel();
        rememberPanelExpanded(true);
    };

    const createToggle = () => {
        if (state.toggle) return;
        const button = document.createElement('button');
        button.className = 'poe-helper-toggle';
        button.textContent = 'POE2DB 信息助手';
        button.addEventListener('click', togglePanel);
        document.body.appendChild(button);
        state.toggle = button;
    };

    const start = () => {
        createToggle();
        if (isPanelExpanded()) {
            state.panel = createPanel();
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
