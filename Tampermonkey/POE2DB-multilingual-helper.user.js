// ==UserScript==
// @name         POE2DB 多语言信息助手
// @namespace    http://tampermonkey.net/
// @version      2.1.5
// @lastUpdated  2026-06-13 04:14:38 +08:00
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
            top: 20px;
            right: 20px;
            z-index: 9999;
            padding: 8px 14px;
            border-radius: 18px;
            border: 1px solid rgba(99, 102, 241, 0.38);
            background: rgba(30, 41, 59, 0.88);
            color: #c7d2fe;
            font-size: 13px;
            cursor: pointer;
            box-shadow: 0 8px 22px rgba(0, 0, 0, 0.32);
            backdrop-filter: blur(10px);
        }
        .poe-helper-toggle:hover {
            background: rgba(49, 46, 129, 0.92);
            color: #fff;
        }
        .poe-helper-panel {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 390px;
            max-height: 82vh;
            overflow-y: auto;
            z-index: 10000;
            padding: 16px;
            border-radius: 10px;
            border: 1px solid rgba(148, 163, 184, 0.22);
            background: rgba(15, 23, 42, 0.96);
            color: #e2e8f0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            box-shadow: 0 18px 42px rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(12px);
        }
        .poe-helper-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 14px;
            padding-bottom: 10px;
            border-bottom: 1px solid rgba(148, 163, 184, 0.16);
        }
        .poe-helper-title {
            font-size: 16px;
            font-weight: 700;
            color: #c7d2fe;
        }
        .poe-helper-close {
            width: 28px;
            height: 28px;
            border-radius: 6px;
            border: 1px solid rgba(248, 113, 113, 0.35);
            background: rgba(127, 29, 29, 0.25);
            color: #fca5a5;
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
            border-radius: 6px;
            border: 1px solid rgba(148, 163, 184, 0.22);
            background: rgba(15, 23, 42, 0.9);
            color: #e2e8f0;
            outline: none;
        }
        .poe-helper-search {
            position: relative;
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 8px;
            margin-bottom: 14px;
        }
        .poe-helper-input {
            padding: 8px 10px;
            font-size: 13px;
        }
        .poe-helper-input:focus {
            border-color: rgba(129, 140, 248, 0.72);
            box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.18);
        }
        .poe-helper-search-btn,
        .poe-helper-btn {
            border-radius: 6px;
            border: 1px solid rgba(99, 102, 241, 0.34);
            background: rgba(79, 70, 229, 0.2);
            color: #c7d2fe;
            cursor: pointer;
            font-size: 12px;
        }
        .poe-helper-search-btn {
            padding: 0 14px;
            font-weight: 600;
        }
        .poe-helper-search-btn:hover,
        .poe-helper-btn:hover {
            background: rgba(79, 70, 229, 0.32);
            color: #fff;
        }
        .poe-helper-results {
            position: absolute;
            top: calc(100% + 6px);
            left: 0;
            right: 0;
            display: none;
            max-height: 320px;
            overflow-y: auto;
            border-radius: 8px;
            border: 1px solid rgba(99, 102, 241, 0.34);
            background: rgba(15, 23, 42, 0.98);
            box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
        }
        .poe-helper-results.active {
            display: block;
        }
        .poe-helper-result {
            padding: 8px 10px;
            border-bottom: 1px solid rgba(148, 163, 184, 0.1);
            cursor: pointer;
        }
        .poe-helper-result:hover {
            background: rgba(99, 102, 241, 0.18);
        }
        .poe-helper-result-top {
            display: grid;
            grid-template-columns: 1fr auto;
            align-items: center;
            gap: 8px;
        }
        .poe-helper-result-name {
            min-width: 0;
            color: #e2e8f0;
            font-size: 13px;
            font-weight: 600;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .poe-helper-lang-badge {
            flex: none;
            padding: 2px 7px;
            border-radius: 999px;
            border: 1px solid rgba(129, 140, 248, 0.34);
            background: rgba(67, 56, 202, 0.28);
            color: #c7d2fe;
            font-size: 11px;
            line-height: 1.35;
        }
        .poe-helper-lang-badge.cn {
            border-color: rgba(52, 211, 153, 0.34);
            background: rgba(6, 95, 70, 0.22);
            color: #86efac;
        }
        .poe-helper-lang-badge.tw {
            border-color: rgba(129, 140, 248, 0.38);
            background: rgba(67, 56, 202, 0.28);
            color: #c7d2fe;
        }
        .poe-helper-lang-badge.us {
            border-color: rgba(251, 191, 36, 0.36);
            background: rgba(146, 64, 14, 0.2);
            color: #fde68a;
        }
        .poe-helper-result-desc {
            display: flex;
            justify-content: space-between;
            gap: 8px;
            margin-top: 3px;
            color: #94a3b8;
            font-size: 11px;
        }
        .poe-helper-empty,
        .poe-helper-loading {
            padding: 18px 10px;
            text-align: center;
            color: #94a3b8;
            font-size: 12px;
        }
        .poe-helper-section {
            margin-top: 10px;
            padding: 12px;
            border-radius: 8px;
            border: 1px solid rgba(148, 163, 184, 0.14);
            background: rgba(30, 41, 59, 0.48);
        }
        .poe-helper-section-title {
            margin-bottom: 8px;
            color: #a5b4fc;
            font-size: 13px;
            font-weight: 700;
        }
        .poe-helper-name-row {
            display: grid;
            grid-template-columns: 1fr auto;
            align-items: start;
            gap: 8px;
        }
        .poe-helper-name {
            min-width: 0;
            color: #e2e8f0;
            font-size: 13px;
            line-height: 1.45;
            word-break: break-word;
        }
        .poe-helper-actions {
            display: flex;
            gap: 4px;
            flex-wrap: wrap;
            justify-content: flex-end;
        }
        .poe-helper-btn {
            padding: 4px 7px;
        }
        .poe-helper-buy {
            border-color: rgba(52, 211, 153, 0.35);
            background: rgba(6, 95, 70, 0.22);
            color: #86efac;
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
                top: 10px;
                right: 10px;
                left: 10px;
                width: auto;
                max-height: 78vh;
            }
            .poe-helper-name-row {
                grid-template-columns: 1fr;
            }
            .poe-helper-actions {
                justify-content: flex-start;
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

        const perLangResults = LANGS.map((lang) => {
            const matches = [];
            const seen = new Set();

            for (const item of state.searchIndex[lang] || []) {
                if (item.searchText.includes(q)) {
                    const path = item.path;
                    if (seen.has(path)) continue;
                    seen.add(path);
                    matches.push({
                        lang,
                        path,
                        label: item.label,
                        desc: item.desc,
                        score: item.labelLower === q ? 0 : item.labelLower.startsWith(q) ? 1 : item.valueLower.includes(q) ? 2 : 3
                    });
                    if (matches.length >= 12) break;
                }
            }

            return matches.sort((a, b) => a.score - b.score || a.label.length - b.label.length);
        });

        const merged = [];
        for (let index = 0; index < 12; index++) {
            for (const group of perLangResults) {
                if (group[index]) merged.push(group[index]);
            }
        }

        return merged.slice(0, 36);
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

    const renderSearchResults = (container, results) => {
        container.innerHTML = '';
        if (!results.length) {
            container.innerHTML = '<div class="poe-helper-empty">未找到相关结果</div>';
            container.classList.add('active');
            return;
        }

        for (const result of results) {
            const row = document.createElement('div');
            row.className = 'poe-helper-result';
            row.innerHTML = `
                <div class="poe-helper-result-top">
                    <div class="poe-helper-result-name">${escapeHtml(result.label)}</div>
                    <span class="poe-helper-lang-badge ${escapeHtml(result.lang)}">${LANG_NAMES[result.lang]}</span>
                </div>
                <div class="poe-helper-result-desc">
                    <span>${escapeHtml(result.desc)}</span>
                    <span>poe2db.tw/${escapeHtml(result.lang)}</span>
                </div>
            `;
            row.addEventListener('click', () => {
                window.location.href = `https://poe2db.tw/${result.lang}/${result.path}`;
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
            resultsBox.classList.remove('active');
            resultsBox.innerHTML = '';
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

    const renderLangSections = (panel, langInfoMap, path) => {
        const content = panel.querySelector('.poe-helper-content');
        content.innerHTML = LANGS.map((lang) => {
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

        content.querySelectorAll('.poe-helper-btn').forEach((button) => {
            button.addEventListener('click', () => {
                const action = button.dataset.action;
                if (action === 'copy') copyText(button.dataset.name);
                if (action === 'buy') buyItem(button.dataset.name, button.dataset.lang);
            });
        });
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
        renderLangSections(panel, langInfoMap, current.path);
    };

    const createPanel = () => {
        const panel = document.createElement('div');
        panel.className = 'poe-helper-panel';
        panel.innerHTML = `
            <div class="poe-helper-header">
                <div class="poe-helper-title">POE2DB 助手</div>
                <button class="poe-helper-close" title="关闭">×</button>
            </div>
            <div class="poe-helper-search">
                <input class="poe-helper-input" type="text" placeholder="输入中文或英文，搜索三种 POE2DB 语言...">
                <button class="poe-helper-search-btn">搜索</button>
                <div class="poe-helper-results"></div>
            </div>
            <div class="poe-helper-content">
                <div class="poe-helper-loading">正在加载多语言信息...</div>
            </div>
        `;

        document.body.appendChild(panel);

        panel.querySelector('.poe-helper-close').addEventListener('click', () => {
            panel.remove();
            state.panel = null;
        });

        const debouncedSearch = debounce(() => handleSearch(panel), 350);
        const searchInput = panel.querySelector('.poe-helper-input');
        const searchButton = panel.querySelector('.poe-helper-search-btn');
        const resultsBox = panel.querySelector('.poe-helper-results');

        searchInput.addEventListener('input', debouncedSearch);
        searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') handleSearch(panel);
        });
        searchInput.addEventListener('focus', () => {
            if (resultsBox.children.length) resultsBox.classList.add('active');
        });
        searchButton.addEventListener('click', () => handleSearch(panel));

        document.addEventListener('click', (event) => {
            if (!panel.contains(event.target)) resultsBox.classList.remove('active');
        });

        loadAutocompleteData().catch((error) => console.error(error));
        loadPanelInfo(panel);
        return panel;
    };

    const togglePanel = () => {
        if (state.panel) {
            state.panel.remove();
            state.panel = null;
            return;
        }
        state.panel = createPanel();
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
        togglePanel();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
