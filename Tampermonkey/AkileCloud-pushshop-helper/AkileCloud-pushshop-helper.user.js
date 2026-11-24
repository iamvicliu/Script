// ==UserScript==
// @name         AkileCloud Push 市场助手
// @namespace    https://github.com/iamvicliu/Script
// @version      1.1.0
// @description  在 AkileCloud Push 交易市场将服务器列表转为可排序的溢价计算表格，并将刷新按钮移至搜索框旁，两项功能均可单独开关。
// @author       维克牛
// @license      MIT
// @match        https://akile.ai/*
// @match        https://akile.io/*
// @homepageURL  https://github.com/iamvicliu/Script/tree/main/Tampermonkey/AkileCloud-pushshop-helper
// @supportURL   https://github.com/iamvicliu/Script/issues
// @updateURL    https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/AkileCloud-pushshop-helper/AkileCloud-pushshop-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/AkileCloud-pushshop-helper/AkileCloud-pushshop-helper.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        window.onurlchange
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    if (window.__AKILE_PUSHSHOP_HELPER_ACTIVE__) return;
    window.__AKILE_PUSHSHOP_HELPER_ACTIVE__ = true;

    const CONFIG_KEY = 'akile_pushshop_helper_config_v1';
    const DEFAULT_CONFIG = {
        enableTableView: true,
        enableMoveRefresh: true,
        defaultBudget: 200
    };

    const TABLE_BTN_ID = 'akile-pushshop-table-btn';
    const TABLE_BTN_WRAP_ATTR = 'data-akile-table-btn-wrap';
    const TOAST_ID = 'akile-pushshop-toast';
    const FALLBACK_MODAL_ID = 'akile-pushshop-fallback-modal';
    const MOVED_REFRESH_ATTR = 'data-akile-moved-refresh';
    const MOVED_REFRESH_WRAP_ATTR = 'data-akile-moved-refresh-wrap';
    const HIDDEN_ORIGIN_ATTR = 'data-akile-origin-refresh-hidden';

    let config = loadConfig();
    let menuIds = [];
    let domObserver = null;
    let syncTimer = null;
    let urlWatchTimer = null;
    let lastSeenHref = typeof window !== 'undefined' && window.location ? String(window.location.href || '') : '';
    let toastTimer = null;
    let routePatched = false;
    let movedRefreshRef = null; // { originBtn, hostNode, clonedBtn, wrapperEl, targetContainer, clickHandler }

    function loadConfig() {
        try {
            if (typeof GM_getValue === 'function') {
                const saved = GM_getValue(CONFIG_KEY, null);
                if (saved && typeof saved === 'object') {
                    const merged = Object.assign({}, DEFAULT_CONFIG, saved);
                    if (!Number.isFinite(Number(merged.defaultBudget)) || Number(merged.defaultBudget) <= 0) {
                        merged.defaultBudget = DEFAULT_CONFIG.defaultBudget;
                    } else {
                        merged.defaultBudget = Number(merged.defaultBudget);
                    }
                    merged.enableTableView = Boolean(merged.enableTableView);
                    merged.enableMoveRefresh = Boolean(merged.enableMoveRefresh);
                    return merged;
                }
            }
        } catch (_) {
            // 忽略读取失败，使用默认配置
        }
        return Object.assign({}, DEFAULT_CONFIG);
    }

    function saveConfig() {
        try {
            if (typeof GM_setValue === 'function') {
                GM_setValue(CONFIG_KEY, config);
            }
        } catch (_) {
            // 忽略写入失败
        }
    }

    function clearMenuCommands() {
        if (typeof GM_unregisterMenuCommand !== 'function') {
            menuIds = [];
            return;
        }
        menuIds.forEach((id) => {
            try {
                GM_unregisterMenuCommand(id);
            } catch (_) {
                // 忽略个别管理器不支持注销的情况
            }
        });
        menuIds = [];
    }

    function registerMenuCommands() {
        if (typeof GM_registerMenuCommand !== 'function') return;
        clearMenuCommands();
        const items = [
            {
                label: (config.enableTableView ? '✅' : '⬜') + ' 表格视图与溢价计算',
                onClick: () => {
                    config.enableTableView = !config.enableTableView;
                    saveConfig();
                    syncPageState();
                    registerMenuCommands();
                }
            },
            {
                label: (config.enableMoveRefresh ? '✅' : '⬜') + ' 刷新按钮移至搜索框旁',
                onClick: () => {
                    config.enableMoveRefresh = !config.enableMoveRefresh;
                    saveConfig();
                    syncPageState();
                    registerMenuCommands();
                }
            },
            {
                label: '设置默认预算（当前 ' + formatBudgetNumber(config.defaultBudget) + ' 元）',
                onClick: () => {
                    const raw = window.prompt('请输入默认预算金额（人民币，必须为大于 0 的数字）：', String(config.defaultBudget));
                    if (raw === null) return;
                    const parsed = Number(String(raw).trim());
                    if (!Number.isFinite(parsed) || parsed <= 0) {
                        showToast('请输入大于 0 的有效数字金额。');
                        return;
                    }
                    config.defaultBudget = Math.round(parsed * 100) / 100;
                    saveConfig();
                    registerMenuCommands();
                    showToast('默认预算已更新为 ' + formatBudgetNumber(config.defaultBudget) + ' 元。');
                }
            }
        ];

        items.forEach((item) => {
            try {
                const id = GM_registerMenuCommand(item.label, item.onClick);
                if (id !== undefined && id !== null) {
                    menuIds.push(id);
                }
            } catch (_) {
                // 忽略注册异常
            }
        });
    }

    function formatBudgetNumber(val) {
        const num = Number(val);
        if (!Number.isFinite(num)) return String(DEFAULT_CONFIG.defaultBudget);
        return Number.isInteger(num) ? String(num) : String(Number(num.toFixed(2)));
    }

    function isPushShopPage() {
        const pathname = (window.location && window.location.pathname) || '';
        return /^\/console\/pushshop(?:\/)?$/.test(pathname);
    }

    function getText(el) {
        return el && typeof el.textContent === 'string' ? el.textContent.trim() : '';
    }

    function showToast(message) {
        const parent = document.body || document.documentElement;
        if (!parent) return;
        let toast = document.getElementById(TOAST_ID);
        if (!toast) {
            toast = document.createElement('div');
            toast.id = TOAST_ID;
            toast.style.cssText = [
                'position:fixed',
                'top:20px',
                'left:50%',
                'transform:translateX(-50%)',
                'z-index:2147483646',
                'padding:10px 16px',
                'border-radius:8px',
                'background:rgba(15,23,42,0.92)',
                'color:#f8fafc',
                'font-size:13px',
                'line-height:1.5',
                'box-shadow:0 8px 24px rgba(0,0,0,0.2)',
                'max-width:min(90vw,480px)',
                'pointer-events:none'
            ].join(';');
            parent.appendChild(toast);
        }
        toast.textContent = message;
        if (toastTimer) {
            clearTimeout(toastTimer);
        }
        toastTimer = setTimeout(() => {
            if (toast && toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
            toastTimer = null;
        }, 3000);
    }

    function parseFloatSafe(text) {
        if (typeof text !== 'string') return null;
        const m = text.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
        if (!m) return null;
        const num = parseFloat(m[0]);
        return Number.isFinite(num) ? num : null;
    }

    function parseDateSafe(str) {
        if (typeof str !== 'string') return null;
        const trimmed = str.trim();
        if (!trimmed) return null;

        const localMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
        if (localMatch) {
            const year = parseInt(localMatch[1], 10);
            const month = parseInt(localMatch[2], 10) - 1;
            const day = parseInt(localMatch[3], 10);
            const hour = localMatch[4] ? parseInt(localMatch[4], 10) : 0;
            const minute = localMatch[5] ? parseInt(localMatch[5], 10) : 0;
            const second = localMatch[6] ? parseInt(localMatch[6], 10) : 0;
            const dt = new Date(year, month, day, hour, minute, second, 0);
            if (Number.isFinite(dt.getTime()) && dt.getFullYear() === year && dt.getMonth() === month && dt.getDate() === day) {
                return dt.getTime();
            }
            return null;
        }

        const parsed = Date.parse(trimmed);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function formatLocalDate(ms) {
        if (!Number.isFinite(ms)) return '-';
        const d = new Date(ms);
        if (!Number.isFinite(d.getTime())) return '-';
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + day;
    }

    function parseBandwidthMbps(str) {
        if (typeof str !== 'string') return null;
        const m = str.trim().match(/([\d.]+)\s*([a-zA-Z]+)/);
        if (!m) return null;
        const val = parseFloat(m[1]);
        if (!Number.isFinite(val)) return null;
        const unit = m[2].toUpperCase();
        if (unit.startsWith('G')) return val * 1000;
        if (unit.startsWith('M')) return val;
        if (unit.startsWith('K')) return val / 1000;
        return val;
    }

    function parseTrafficGB(str) {
        if (typeof str !== 'string') return null;
        const m = str.trim().match(/([\d.]+)\s*([a-zA-Z]+)/);
        if (!m) return null;
        const val = parseFloat(m[1]);
        if (!Number.isFinite(val)) return null;
        const unit = m[2].toUpperCase();
        if (unit.startsWith('T')) return val * 1024;
        if (unit.startsWith('G')) return val;
        if (unit.startsWith('M')) return val / 1024;
        if (unit.startsWith('K')) return val / (1024 * 1024);
        if (unit === 'B') return val / (1024 * 1024 * 1024);
        return val;
    }

    function parseRenewalInfo(value) {
        const text = typeof value === 'string' ? value.trim() : '';
        if (!text) {
            return {
                renewalText: '',
                renewalAmount: null,
                currencySymbol: '¥',
                cycleType: 'month',
                cycleDays: 30,
                cycleOrder: 1
            };
        }
        const renewalAmount = parseFloatSafe(text);
        const currencyMatch = text.match(/[￥¥$€£]/);
        const currencySymbol = currencyMatch ? currencyMatch[0] : '¥';

        let cycleType = 'month';
        let cycleDays = 30;
        let cycleOrder = 1;
        if (/\/\s*3\s*年|3\s*年付|3\s*Years?/i.test(text)) {
            cycleType = '3year';
            cycleDays = 1095;
            cycleOrder = 5;
        } else if (/\/\s*半年|半年付|6\s*Months?/i.test(text)) {
            cycleType = 'halfyear';
            cycleDays = 182.5;
            cycleOrder = 3;
        } else if (/\/\s*年|年付|\/\s*Year\b|\bYear\b/i.test(text)) {
            cycleType = 'year';
            cycleDays = 365;
            cycleOrder = 4;
        } else if (/\/\s*季|季付|Quarter|3\s*Months?/i.test(text)) {
            cycleType = 'quarter';
            cycleDays = 90;
            cycleOrder = 2;
        }

        return {
            renewalText: text,
            renewalAmount: renewalAmount,
            currencySymbol: currencySymbol,
            cycleType: cycleType,
            cycleDays: cycleDays,
            cycleOrder: cycleOrder
        };
    }

    function parseIpCheckAndDescription(card) {
        const ipCheckEl = card.querySelector('.server-ip-check');
        if (ipCheckEl) {
            let statusLabel = '';
            if (ipCheckEl.classList && ipCheckEl.classList.contains('blocked')) {
                statusLabel = '被墙';
            } else if (ipCheckEl.classList && ipCheckEl.classList.contains('normal')) {
                statusLabel = '正常';
            } else if (ipCheckEl.classList && ipCheckEl.classList.contains('no-data')) {
                statusLabel = '暂无数据';
            }

            const pills = Array.from(ipCheckEl.querySelectorAll('.ip-check-results .ip-check-pill'))
                .map(getText)
                .filter(Boolean);
            const emptyText = getText(ipCheckEl.querySelector('.ip-check-empty'));

            let ipStatus = '';
            if (pills.length > 0) {
                ipStatus = (statusLabel ? statusLabel + ' · ' : '') + pills.join(' / ');
            } else if (statusLabel) {
                ipStatus = statusLabel;
            } else if (emptyText) {
                ipStatus = emptyText;
            }

            const labelText = getText(ipCheckEl.querySelector('.ip-check-label'));
            const timeText = getText(ipCheckEl.querySelector('.ip-check-time'));
            const titleAttr = typeof ipCheckEl.getAttribute === 'function' ? (ipCheckEl.getAttribute('title') || '').trim() : '';

            let description = '';
            if (labelText && timeText) {
                description = labelText + ' (' + timeText + ')';
            } else if (labelText) {
                description = labelText;
            } else if (timeText) {
                description = timeText;
            } else if (titleAttr && titleAttr !== emptyText) {
                description = titleAttr;
            }

            return { ipStatus, description };
        }

        // 向后兼容旧版 .server-detail DOM
        const detailEl = card.querySelector('.server-detail');
        const detailText = getText(detailEl);
        if (detailText) {
            const ipStatusMatch = detailText.match(/\[(.*?)\]/);
            const ipStatus = ipStatusMatch ? ipStatusMatch[1].trim() : '';
            const descSplit = detailText.split(/官方描述[:：]\s*/);
            const description = descSplit.length > 1 ? descSplit.slice(1).join('官方描述: ').trim() : '';
            return { ipStatus, description };
        }

        return { ipStatus: '', description: '' };
    }

    function extractServers(serverList, nowMs) {
        if (!serverList) return [];
        const curNow = Number.isFinite(nowMs) ? nowMs : Date.now();
        const cards = serverList.querySelectorAll('.server-manage-card');
        const servers = [];

        cards.forEach((card) => {
            const { ipStatus, description } = parseIpCheckAndDescription(card);
            const server = {
                name: getText(card.querySelector('.server-name')),
                area: '',
                node: '',
                planName: '',
                ipStatus: ipStatus,
                description: description,
                configText: '',
                bandwidth: '',
                bandwidthMbps: null,
                usedTraffic: '',
                usedTrafficGB: null,
                totalTraffic: '',
                totalTrafficGB: null,
                isUnlimitedTraffic: false,
                ipv4: '',
                ipv4Count: null,
                ipv6: '',
                ipv6Count: null,
                renewalPrice: '',
                renewalAmount: null,
                cycleType: 'month',
                cycleDays: 30,
                cycleOrder: 1,
                isYearly: false,
                resetTraffic: '',
                expireTime: '',
                endMs: null,
                price: null,
                priceText: '',
                dailyPrice: null,
                daysLeft: null,
                remainValue: null,
                premium: null
            };

            card.querySelectorAll('.server-info').forEach((info) => {
                const fieldName = getText(info.querySelector('.info-name'));
                const fieldValue = getText(info.querySelector('.info-value'));
                if (!fieldName) return;

                if (fieldName === '网络' || fieldName === 'Network') {
                    const limitedMatch = fieldValue.match(/^(?:带宽|Bandwidth)\s*([\d.]+\s*[A-Za-z]+)\s+(?:流量|Traffic)\s*([\d.]+\s*[A-Za-z]+)\s*\/\s*([\d.]+\s*[A-Za-z]+)/i);
                    const unlimitedMatch = !limitedMatch && fieldValue.match(/^(?:带宽|Bandwidth)\s*([\d.]+\s*[A-Za-z]+)\s+(?:流量|Traffic)\s*(无限制|Unlimited)/i);
                    if (limitedMatch) {
                        server.bandwidth = limitedMatch[1].replace(/\s+/g, '');
                        server.usedTraffic = limitedMatch[2].replace(/\s+/g, '');
                        server.totalTraffic = limitedMatch[3].replace(/\s+/g, '');
                        server.bandwidthMbps = parseBandwidthMbps(server.bandwidth);
                        server.usedTrafficGB = parseTrafficGB(server.usedTraffic);
                        server.totalTrafficGB = parseTrafficGB(server.totalTraffic);
                    } else if (unlimitedMatch) {
                        server.bandwidth = unlimitedMatch[1].replace(/\s+/g, '');
                        server.bandwidthMbps = parseBandwidthMbps(server.bandwidth);
                        server.usedTraffic = '';
                        server.usedTrafficGB = null;
                        server.totalTraffic = unlimitedMatch[2];
                        server.totalTrafficGB = null;
                        server.isUnlimitedTraffic = true;
                    } else {
                        server.bandwidth = fieldValue;
                        server.bandwidthMbps = parseBandwidthMbps(fieldValue);
                    }
                } else if (fieldName === 'IP') {
                    const match = fieldValue.match(/v4\s*(\d+)\s*(?:个|Units?)?.*?v6\s*(\d+)\s*(?:个|Units?)?/i);
                    if (match) {
                        server.ipv4Count = parseInt(match[1], 10);
                        server.ipv6Count = parseInt(match[2], 10);
                        server.ipv4 = server.ipv4Count + '个';
                        server.ipv6 = server.ipv6Count + '个';
                    }
                } else if (fieldName === '续费价格' || fieldName === 'Renewal Price') {
                    const renewalInfo = parseRenewalInfo(fieldValue);
                    server.renewalPrice = renewalInfo.renewalText;
                    server.renewalAmount = renewalInfo.renewalAmount;
                    server.cycleType = renewalInfo.cycleType;
                    server.cycleDays = renewalInfo.cycleDays;
                    server.cycleOrder = renewalInfo.cycleOrder;
                    server.isYearly = renewalInfo.cycleType === 'year' || renewalInfo.cycleType === '3year';
                } else if (fieldName === '地区' || fieldName === 'Region') {
                    server.area = fieldValue;
                } else if (fieldName === '节点' || fieldName === 'Node') {
                    server.node = fieldValue;
                } else if (fieldName === '套餐' || fieldName === 'Plan') {
                    server.planName = fieldValue;
                } else if (fieldName === '配置' || fieldName === 'Config') {
                    server.configText = fieldValue;
                } else if (fieldName === '重置流量' || fieldName === 'Reset Traffic') {
                    server.resetTraffic = fieldValue;
                } else if (fieldName === '到期时间' || fieldName === 'Due Time') {
                    server.expireTime = fieldValue;
                    server.endMs = parseDateSafe(fieldValue);
                }
            });

            const priceText = getText(card.querySelector('.shop-server-price'));
            server.priceText = priceText;
            server.price = parseFloatSafe(priceText);

            if (server.renewalAmount !== null && server.renewalAmount > 0 && server.cycleDays > 0) {
                server.dailyPrice = server.renewalAmount / server.cycleDays;
            }
            if (server.endMs !== null) {
                server.daysLeft = (server.endMs - curNow) / 86400000;
            }
            if (server.dailyPrice !== null && server.daysLeft !== null) {
                server.remainValue = Math.max(0, server.daysLeft) * server.dailyPrice;
            }
            if (server.price !== null && server.remainValue !== null) {
                server.premium = server.price - server.remainValue;
            }

            servers.push(server);
        });

        return servers;
    }

    function escapeJsonForScript(obj) {
        return JSON.stringify(obj)
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e')
            .replace(/&/g, '\\u0026')
            .replace(/\u2028/g, '\\u2028')
            .replace(/\u2029/g, '\\u2029');
    }

    function buildTablePageHtml(servers, initialBudget, generatedNowMs) {
        const payloadJson = escapeJsonForScript({
            servers: servers,
            initialBudget: initialBudget,
            generatedNowMs: generatedNowMs
        });

        return [
            '<!DOCTYPE html>',
            '<html lang="zh-CN">',
            '<head>',
            '<meta charset="utf-8">',
            '<meta name="viewport" content="width=device-width, initial-scale=1">',
            '<title>AkileCloud Push 溢价计算表格</title>',
            '<style>',
            '  :root{--bg:#ffffff;--fg:#1e293b;--muted:#64748b;--border:#e2e8f0;--head:#f1f5f9;--head-hover:#e2e8f0;--row-even:#f8fafc;--btn-bg:#ffffff;--btn-border:#cbd5e1;--accent:#165DFF;--green:#00b42a;--red:#ef4444;--month:#165DFF;--year:#00b42a}',
            '  @media (prefers-color-scheme:dark){:root{--bg:#0f172a;--fg:#e2e8f0;--muted:#94a3b8;--border:#334155;--head:#1e293b;--head-hover:#334155;--row-even:#162033;--btn-bg:#1e293b;--btn-border:#475569;--accent:#60a5fa;--green:#4ade80;--red:#f87171;--month:#60a5fa;--year:#4ade80}}',
            '  *{box-sizing:border-box}',
            '  body{margin:0;padding:16px 20px 32px;background:var(--bg);color:var(--fg);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}',
            '  h1{margin:0 0 12px;font-size:20px;font-weight:600}',
            '  .toolbar{display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:14px;padding:12px 14px;border:1px solid var(--border);border-radius:10px;background:var(--head)}',
            '  .btn{padding:6px 12px;border:1px solid var(--btn-border);border-radius:6px;background:var(--btn-bg);color:var(--fg);cursor:pointer;font-size:13px}',
            '  .btn:hover{border-color:var(--accent)}',
            '  .budget-field{display:inline-flex;align-items:center;gap:6px;font-size:13px}',
            '  .budget-input{width:96px;padding:5px 8px;border:1px solid var(--btn-border);border-radius:6px;background:var(--bg);color:var(--fg);font-size:13px}',
            '  .summary{margin-left:auto;font-size:13px;color:var(--muted)}',
            '  .table-wrap{overflow:auto;max-height:calc(100vh - 140px);border:1px solid var(--border);border-radius:10px}',
            '  table{border-collapse:collapse;width:100%;min-width:1140px}',
            '  th,td{border-bottom:1px solid var(--border);border-right:1px solid var(--border);padding:8px 10px;text-align:left;vertical-align:middle}',
            '  th:last-child,td:last-child{border-right:none}',
            '  th{position:sticky;top:0;z-index:2;background:var(--head);cursor:pointer;user-select:none;white-space:nowrap;font-weight:600}',
            '  th:hover{background:var(--head-hover)}',
            '  tbody tr:nth-child(even){background:var(--row-even)}',
            '  .price-month{color:var(--month);font-weight:500}',
            '  .price-year{color:var(--year);font-weight:500}',
            '  .premium-yes{color:var(--green);font-weight:600}',
            '  .premium-no{color:var(--red);font-weight:600}',
            '  .insufficient{color:var(--red)}',
            '  .sort-asc::after{content:" ▲";font-size:11px}',
            '  .sort-desc::after{content:" ▼";font-size:11px}',
            '  .hidden{display:none}',
            '</style>',
            '</head>',
            '<body>',
            '  <h1>AkileCloud Push 溢价计算</h1>',
            '  <div class="toolbar">',
            '    <button type="button" class="btn" id="toggle-desc-btn">显示官方描述</button>',
            '    <label class="budget-field" for="budget-input">',
            '      <span>预算金额（元）</span>',
            '      <input id="budget-input" class="budget-input" type="number" min="1" step="any">',
            '    </label>',
            '    <button type="button" class="btn" id="copy-table-btn">复制当前表格</button>',
            '    <span class="summary" id="table-summary"></span>',
            '  </div>',
            '  <div class="table-wrap">',
            '    <table id="akile-table">',
            '      <thead><tr id="table-head-row"></tr></thead>',
            '      <tbody id="table-body"></tbody>',
            '    </table>',
            '  </div>',
            '  <script>',
            getEmbeddedTableScript(payloadJson),
            '  </script>',
            '</body>',
            '</html>'
        ].join('\n');
    }

    function getEmbeddedTableScript(payloadJson) {
        return [
            '(function(){',
            '  var PAYLOAD = ' + payloadJson + ';',
            '  var state = {',
            '    rows: [],',
            '    showDesc: false,',
            '    sortCol: -1,',
            '    sortAsc: true,',
            '    budget: Number(PAYLOAD.initialBudget) > 0 ? Number(PAYLOAD.initialBudget) : 200,',
            '    nowMs: Number(PAYLOAD.generatedNowMs) || Date.now()',
            '  };',
            '  function fmtBudget(v){ return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(2))); }',
            '  function fmtDate(ms){',
            '    var d = new Date(ms);',
            '    if (!Number.isFinite(d.getTime())) return "-";',
            '    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");',
            '  }',
            '  function calcBudget(server, budget){',
            '    if (!Number.isFinite(budget) || budget <= 0 || server.price === null || server.dailyPrice === null || server.dailyPrice <= 0) {',
            '      return { label: "-", sortValue: null, insufficient: false };',
            '    }',
            '    if (budget < server.price) {',
            '      var diff = server.price - budget;',
            '      return { label: "预算不足（差 ￥" + diff.toFixed(2) + "）", sortValue: -diff, insufficient: true };',
            '    }',
            '    var baseMs = (server.endMs !== null && server.endMs > state.nowMs) ? server.endMs : state.nowMs;',
            '    var extraDays = Math.min(36500, Math.floor((budget - server.price) / server.dailyPrice));',
            '    var targetMs = baseMs + extraDays * 86400000;',
            '    return { label: fmtDate(targetMs), sortValue: targetMs, insufficient: false };',
            '  }',
            '  function prepareRows(){',
            '    state.rows = (PAYLOAD.servers || []).map(function(srv, idx){',
            '      var bInfo = calcBudget(srv, state.budget);',
            '      return { idx: idx + 1, server: srv, budgetInfo: bInfo };',
            '    });',
            '  }',
            '  var COLUMNS = [',
            '    { key: "idx", title: "序号", type: "num", val: function(r){ return r.idx; }, text: function(r){ return String(r.idx); } },',
            '    { key: "name", title: "套餐名称", type: "str", val: function(r){ return r.server.name || null; }, text: function(r){ return r.server.name || "-"; } },',
            '    { key: "area", title: "地区", type: "str", val: function(r){ return r.server.area || null; }, text: function(r){ return r.server.area || "-"; } },',
            '    { key: "ipStatus", title: "IP状态", type: "str", val: function(r){ return r.server.ipStatus || null; }, text: function(r){ return r.server.ipStatus || "-"; } },',
            '    { key: "description", title: "官方描述", type: "str", isDesc: true, val: function(r){ return r.server.description || null; }, text: function(r){ return r.server.description || "-"; } },',
            '    { key: "configText", title: "配置", type: "str", val: function(r){ return r.server.configText || null; }, text: function(r){ return r.server.configText || "-"; } },',
            '    { key: "bandwidth", title: "带宽", type: "num", val: function(r){ return r.server.bandwidthMbps; }, text: function(r){ return r.server.bandwidth || "-"; } },',
            '    { key: "usedTraffic", title: "已用流量", type: "num", val: function(r){ return r.server.usedTrafficGB; }, text: function(r){ return r.server.usedTraffic || "-"; } },',
            '    { key: "totalTraffic", title: "总流量", type: "num", val: function(r){ return r.server.isUnlimitedTraffic ? Infinity : r.server.totalTrafficGB; }, text: function(r){ return r.server.totalTraffic || "-"; } },',
            '    { key: "ipv4", title: "IPv4", type: "num", val: function(r){ return r.server.ipv4Count; }, text: function(r){ return r.server.ipv4 || "-"; } },',
            '    { key: "ipv6", title: "IPv6", type: "num", val: function(r){ return r.server.ipv6Count; }, text: function(r){ return r.server.ipv6 || "-"; } },',
            '    { key: "renewal", title: "续费价格", type: "renewal", val: function(r){ return r.server.renewalAmount === null ? null : { o: r.server.cycleOrder, a: r.server.renewalAmount }; }, text: function(r){ return r.server.renewalPrice || "-"; }, cls: function(r){ return r.server.isYearly ? "price-year" : (r.server.renewalPrice ? "price-month" : ""); } },',
            '    { key: "resetTraffic", title: "重置流量", type: "str", val: function(r){ return r.server.resetTraffic || null; }, text: function(r){ return r.server.resetTraffic || "-"; } },',
            '    { key: "expireTime", title: "到期时间", type: "num", val: function(r){ return r.server.endMs; }, text: function(r){ return r.server.expireTime || "-"; } },',
            '    { key: "price", title: "售价", type: "num", val: function(r){ return r.server.price; }, text: function(r){ return r.server.price !== null ? ("￥" + r.server.price) : "-"; } },',
            '    { key: "premium", title: "溢价金额", type: "num", val: function(r){ return r.server.premium; }, text: function(r){ return r.server.premium !== null ? ("￥" + r.server.premium.toFixed(2)) : "-"; }, cls: function(r){ return r.server.premium === null ? "" : (r.server.premium > 0 ? "premium-no" : "premium-yes"); } },',
            '    { key: "budgetUsable", title: function(){ return fmtBudget(state.budget) + "元可用至"; }, type: "num", val: function(r){ return r.budgetInfo.sortValue; }, text: function(r){ return r.budgetInfo.label; }, cls: function(r){ return r.budgetInfo.insufficient ? "insufficient" : ""; } }',
            '  ];',
            '  function compareVals(aVal, bVal, type, asc){',
            '    var aMissing = (aVal === null || aVal === undefined || aVal === "");',
            '    var bMissing = (bVal === null || bVal === undefined || bVal === "");',
            '    if (aMissing && bMissing) return 0;',
            '    if (aMissing) return 1;',
            '    if (bMissing) return -1;',
            '    if (type === "renewal") {',
            '      if (aVal.o !== bVal.o) return aVal.o - bVal.o;',
            '      return asc ? (aVal.a - bVal.a) : (bVal.a - aVal.a);',
            '    }',
            '    if (type === "num") {',
            '      if (aVal === bVal) return 0;',
            '      return asc ? (aVal - bVal) : (bVal - aVal);',
            '    }',
            '    var cmp = String(aVal).localeCompare(String(bVal), "zh-CN");',
            '    return asc ? cmp : -cmp;',
            '  }',
            '  function sortRows(colIdx){',
            '    if (state.sortCol === colIdx) { state.sortAsc = !state.sortAsc; } else { state.sortCol = colIdx; state.sortAsc = true; }',
            '    var col = COLUMNS[colIdx];',
            '    state.rows.sort(function(ra, rb){',
            '      var cmp = compareVals(col.val(ra), col.val(rb), col.type, state.sortAsc);',
            '      return cmp !== 0 ? cmp : (ra.idx - rb.idx);',
            '    });',
            '    render();',
            '  }',
            '  function renderHeader(){',
            '    var tr = document.getElementById("table-head-row");',
            '    if (!tr) return;',
            '    tr.textContent = "";',
            '    COLUMNS.forEach(function(col, idx){',
            '      var th = document.createElement("th");',
            '      th.textContent = typeof col.title === "function" ? col.title() : col.title;',
            '      if (col.isDesc && !state.showDesc) th.classList.add("hidden");',
            '      if (state.sortCol === idx) th.classList.add(state.sortAsc ? "sort-asc" : "sort-desc");',
            '      th.addEventListener("click", function(){ sortRows(idx); });',
            '      tr.appendChild(th);',
            '    });',
            '  }',
            '  function renderBody(){',
            '    var tbody = document.getElementById("table-body");',
            '    if (!tbody) return;',
            '    tbody.textContent = "";',
            '    state.rows.forEach(function(row){',
            '      var tr = document.createElement("tr");',
            '      COLUMNS.forEach(function(col){',
            '        var td = document.createElement("td");',
            '        td.textContent = col.text(row);',
            '        if (col.isDesc) {',
            '          td.classList.add("desc-cell");',
            '          if (!state.showDesc) td.classList.add("hidden");',
            '        }',
            '        if (typeof col.cls === "function") {',
            '          var c = col.cls(row);',
            '          if (c) td.classList.add(c);',
            '        }',
            '        tr.appendChild(td);',
            '      });',
            '      tbody.appendChild(tr);',
            '    });',
            '  }',
            '  function renderSummary(){',
            '    var el = document.getElementById("table-summary");',
            '    if (!el) return;',
            '    el.textContent = "共 " + state.rows.length + " 台 · 绿色为无溢价/折价，红色为溢价 · 点击表头排序";',
            '  }',
            '  function render(){',
            '    renderHeader();',
            '    renderBody();',
            '    renderSummary();',
            '    var descBtn = document.getElementById("toggle-desc-btn");',
            '    if (descBtn) descBtn.textContent = state.showDesc ? "隐藏官方描述" : "显示官方描述";',
            '  }',
            '  function copyTsv(){',
            '    var visibleCols = COLUMNS.filter(function(c){ return !c.isDesc || state.showDesc; });',
            '    var lines = [visibleCols.map(function(c){ return typeof c.title === "function" ? c.title() : c.title; }).join("\\t")];',
            '    state.rows.forEach(function(r){',
            '      lines.push(visibleCols.map(function(c){ return String(c.text(r)).replace(/[\\t\\r\\n]+/g, " "); }).join("\\t"));',
            '    });',
            '    var tsv = lines.join("\\n");',
            '    function ok(){',
            '      var btn = document.getElementById("copy-table-btn");',
            '      if (!btn) return;',
            '      var old = btn.textContent;',
            '      btn.textContent = "已复制（可直接粘贴到表格软件）";',
            '      setTimeout(function(){ btn.textContent = old; }, 2200);',
            '    }',
            '    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {',
            '      navigator.clipboard.writeText(tsv).then(ok).catch(function(){ fallbackCopy(tsv, ok); });',
            '    } else {',
            '      fallbackCopy(tsv, ok);',
            '    }',
            '  }',
            '  function fallbackCopy(text, onDone){',
            '    try {',
            '      var ta = document.createElement("textarea");',
            '      ta.value = text;',
            '      ta.style.cssText = "position:fixed;left:-9999px;top:0";',
            '      document.body.appendChild(ta);',
            '      ta.select();',
            '      if (document.execCommand) document.execCommand("copy");',
            '      document.body.removeChild(ta);',
            '      if (onDone) onDone();',
            '    } catch (_) {}',
            '  }',
            '  function init(){',
            '    prepareRows();',
            '    var budgetInput = document.getElementById("budget-input");',
            '    if (budgetInput) {',
            '      budgetInput.value = fmtBudget(state.budget);',
            '      budgetInput.addEventListener("input", function(){',
            '        var v = Number(budgetInput.value);',
            '        if (!Number.isFinite(v) || v <= 0) return;',
            '        state.budget = v;',
            '        state.rows.forEach(function(r){ r.budgetInfo = calcBudget(r.server, state.budget); });',
            '        if (state.sortCol >= 0 && COLUMNS[state.sortCol].key === "budgetUsable") {',
            '          var col = COLUMNS[state.sortCol];',
            '          state.rows.sort(function(ra, rb){',
            '            var cmp = compareVals(col.val(ra), col.val(rb), col.type, state.sortAsc);',
            '            return cmp !== 0 ? cmp : (ra.idx - rb.idx);',
            '          });',
            '        }',
            '        render();',
            '      });',
            '    }',
            '    var descBtn = document.getElementById("toggle-desc-btn");',
            '    if (descBtn) {',
            '      descBtn.addEventListener("click", function(){',
            '        state.showDesc = !state.showDesc;',
            '        render();',
            '      });',
            '    }',
            '    var copyBtn = document.getElementById("copy-table-btn");',
            '    if (copyBtn) copyBtn.addEventListener("click", copyTsv);',
            '    render();',
            '  }',
            '  if (document.readyState === "loading") {',
            '    document.addEventListener("DOMContentLoaded", init, { once: true });',
            '  } else {',
            '    init();',
            '  }',
            '})();'
        ].join('\n');
    }

    function openFallbackModal(servers, initialBudget, generatedNowMs) {
        const old = document.getElementById(FALLBACK_MODAL_ID);
        if (old && old.parentNode) old.parentNode.removeChild(old);

        const overlay = document.createElement('div');
        overlay.id = FALLBACK_MODAL_ID;
        overlay.style.cssText = [
            'position:fixed',
            'inset:0',
            'z-index:2147483645',
            'background:rgba(15,23,42,0.72)',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'padding:16px'
        ].join(';');

        const dialog = document.createElement('div');
        dialog.style.cssText = [
            'width:min(96vw,1360px)',
            'height:min(90vh,860px)',
            'background:#ffffff',
            'color:#1e293b',
            'border-radius:12px',
            'box-shadow:0 20px 60px rgba(0,0,0,0.35)',
            'display:flex',
            'flex-direction:column',
            'overflow:hidden'
        ].join(';');

        const bar = document.createElement('div');
        bar.style.cssText = [
            'display:flex',
            'align-items:center',
            'justify-content:space-between',
            'padding:10px 14px',
            'border-bottom:1px solid #e2e8f0',
            'background:#f8fafc',
            'font-size:13px'
        ].join(';');

        const notice = document.createElement('span');
        notice.textContent = '浏览器拦截了新标签页，已在当前页内展示表格视图';

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.textContent = '关闭表格';
        closeBtn.style.cssText = 'padding:5px 12px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:#1e293b;cursor:pointer;font-size:13px';
        closeBtn.addEventListener('click', () => {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        });

        bar.appendChild(notice);
        bar.appendChild(closeBtn);

        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'flex:1;width:100%;border:0;background:#fff';
        iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
        iframe.srcdoc = buildTablePageHtml(servers, initialBudget, generatedNowMs);

        dialog.appendChild(bar);
        dialog.appendChild(iframe);
        overlay.appendChild(dialog);
        (document.body || document.documentElement).appendChild(overlay);
        showToast('浏览器拦截了新标签页，已在当前页内展示表格视图。');
    }

    function openTableView() {
        const serverList = document.querySelector('.server-list');
        if (!serverList) {
            showToast('当前页面暂未找到服务器列表，请等页面加载完成后再试。');
            return;
        }
        const nowMs = Date.now();
        const servers = extractServers(serverList, nowMs);
        if (!servers.length) {
            showToast('当前页面暂未找到服务器卡片，请等列表加载完成后再试。');
            return;
        }

        const html = buildTablePageHtml(servers, config.defaultBudget, nowMs);
        let win = null;
        try {
            win = window.open('', '_blank');
        } catch (_) {
            win = null;
        }

        if (win && win.document) {
            try {
                win.document.open();
                win.document.write(html);
                win.document.close();
                try {
                    win.opener = null;
                } catch (_) {
                    // 忽略只读 opener
                }
                return;
            } catch (_) {
                // 写入失败时回退到页内模态框
            }
        }
        openFallbackModal(servers, config.defaultBudget, nowMs);
    }

    function createTableButton() {
        const existingBtn = document.getElementById(TABLE_BTN_ID);
        const actionSpace = document.querySelector('.akile-action-bar .actions .arco-space');

        if (existingBtn && existingBtn.isConnected) {
            // 若页面从无操作栏变为出现操作栏，则迁移进操作栏
            if (actionSpace && !actionSpace.querySelector('#' + TABLE_BTN_ID)) {
                removeTableButton();
            } else {
                return;
            }
        } else if (existingBtn) {
            removeTableButton();
        }

        const btn = document.createElement('button');
        btn.id = TABLE_BTN_ID;
        btn.type = 'button';
        btn.textContent = '生成表格视图';
        btn.addEventListener('click', openTableView);

        if (actionSpace) {
            btn.style.cssText = [
                'height:32px',
                'padding:0 14px',
                'background-color:#165DFF',
                'color:#ffffff',
                'border:none',
                'border-radius:4px',
                'cursor:pointer',
                'font-size:13px',
                'font-weight:500',
                'line-height:32px',
                'white-space:nowrap',
                'transition:background-color 0.2s ease'
            ].join(';');
            btn.addEventListener('mouseover', () => { btn.style.backgroundColor = '#0E42CC'; });
            btn.addEventListener('mouseout', () => { btn.style.backgroundColor = '#165DFF'; });

            const wrap = document.createElement('div');
            wrap.className = 'arco-space-item';
            wrap.setAttribute(TABLE_BTN_WRAP_ATTR, '1');
            wrap.appendChild(btn);
            actionSpace.appendChild(wrap);
            return;
        }

        const parent = document.body || document.documentElement;
        if (!parent) return;
        btn.style.cssText = [
            'position:fixed',
            'bottom:24px',
            'right:24px',
            'z-index:9999',
            'padding:9px 16px',
            'background-color:#165DFF',
            'color:#ffffff',
            'border:none',
            'border-radius:6px',
            'cursor:pointer',
            'font-size:14px',
            'font-weight:500',
            'transition:all 0.2s ease',
            'box-shadow:0 4px 14px rgba(22,93,255,0.32)'
        ].join(';');
        btn.addEventListener('mouseover', () => {
            btn.style.backgroundColor = '#0E42CC';
            btn.style.transform = 'translateY(-1px)';
        });
        btn.addEventListener('mouseout', () => {
            btn.style.backgroundColor = '#165DFF';
            btn.style.transform = 'translateY(0)';
        });
        parent.appendChild(btn);
    }

    function removeTableButton() {
        const btn = document.getElementById(TABLE_BTN_ID);
        if (btn && btn.parentNode) {
            btn.parentNode.removeChild(btn);
        }
        document.querySelectorAll('[' + TABLE_BTN_WRAP_ATTR + '="1"]').forEach((el) => {
            if (el.parentNode) el.parentNode.removeChild(el);
        });
    }

    function findOriginRefreshButton() {
        const nodes = document.querySelectorAll('.refresh-icon');
        for (let i = 0; i < nodes.length; i++) {
            const el = nodes[i];
            if (el.getAttribute(MOVED_REFRESH_ATTR) === '1') continue;
            return el;
        }
        return null;
    }

    function resolveHideHostNode(originBtn, targetContainer) {
        const parent = originBtn.parentElement;
        if (
            parent &&
            parent !== targetContainer &&
            parent !== document.body &&
            parent !== document.documentElement &&
            parent.tagName !== 'MAIN' &&
            parent.tagName !== 'FORM' &&
            parent.children &&
            parent.children.length === 1
        ) {
            return parent;
        }
        return originBtn;
    }

    function restoreRefreshButton() {
        if (movedRefreshRef) {
            const { clonedBtn, wrapperEl, hostNode, clickHandler } = movedRefreshRef;
            if (clonedBtn && clickHandler) {
                clonedBtn.removeEventListener('click', clickHandler);
            }
            if (wrapperEl && wrapperEl.parentNode) {
                wrapperEl.parentNode.removeChild(wrapperEl);
            } else if (clonedBtn && clonedBtn.parentNode) {
                clonedBtn.parentNode.removeChild(clonedBtn);
            }
            if (hostNode) {
                if (hostNode.dataset && 'akileOrigDisplay' in hostNode.dataset) {
                    hostNode.style.display = hostNode.dataset.akileOrigDisplay;
                    delete hostNode.dataset.akileOrigDisplay;
                } else {
                    hostNode.style.display = '';
                }
                hostNode.removeAttribute(HIDDEN_ORIGIN_ATTR);
            }
            movedRefreshRef = null;
        }

        document.querySelectorAll('[' + MOVED_REFRESH_WRAP_ATTR + '="1"]').forEach((el) => {
            if (el.parentNode) el.parentNode.removeChild(el);
        });
        document.querySelectorAll('[' + MOVED_REFRESH_ATTR + '="1"]').forEach((el) => {
            if (el.parentNode) el.parentNode.removeChild(el);
        });
        document.querySelectorAll('[' + HIDDEN_ORIGIN_ATTR + '="1"]').forEach((el) => {
            if (el.dataset && 'akileOrigDisplay' in el.dataset) {
                el.style.display = el.dataset.akileOrigDisplay;
                delete el.dataset.akileOrigDisplay;
            } else {
                el.style.display = '';
            }
            el.removeAttribute(HIDDEN_ORIGIN_ATTR);
        });
    }

    function ensureMovedRefreshButton() {
        const actionSpace = document.querySelector('.akile-action-bar .actions .arco-space');
        const targetContainer = actionSpace || document.querySelector('.arco-input-append');
        const originBtn = findOriginRefreshButton();
        if (!targetContainer || !originBtn) {
            if (movedRefreshRef) restoreRefreshButton();
            return;
        }

        if (
            movedRefreshRef &&
            movedRefreshRef.originBtn === originBtn &&
            movedRefreshRef.targetContainer === targetContainer &&
            movedRefreshRef.clonedBtn &&
            movedRefreshRef.clonedBtn.isConnected &&
            movedRefreshRef.originBtn.isConnected
        ) {
            return;
        }

        restoreRefreshButton();

        const hostNode = resolveHideHostNode(originBtn, targetContainer);
        if (!hostNode.dataset || !('akileOrigDisplay' in hostNode.dataset)) {
            hostNode.dataset.akileOrigDisplay = hostNode.style.display || '';
        }
        hostNode.style.display = 'none';
        hostNode.setAttribute(HIDDEN_ORIGIN_ATTR, '1');

        const clonedBtn = originBtn.cloneNode(true);
        clonedBtn.setAttribute(MOVED_REFRESH_ATTR, '1');
        if (clonedBtn.style) {
            clonedBtn.style.display = '';
            clonedBtn.style.cursor = 'pointer';
        }

        const clickHandler = function (e) {
            if (e) e.preventDefault();
            if (!originBtn || !originBtn.isConnected) return;
            if (typeof originBtn.click === 'function') {
                originBtn.click();
            } else {
                originBtn.dispatchEvent(new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                }));
            }
        };
        clonedBtn.addEventListener('click', clickHandler);

        let wrapperEl = null;
        if (actionSpace) {
            wrapperEl = document.createElement('div');
            wrapperEl.className = 'arco-space-item';
            wrapperEl.setAttribute(MOVED_REFRESH_WRAP_ATTR, '1');
            wrapperEl.appendChild(clonedBtn);
            const tableWrap = actionSpace.querySelector('[' + TABLE_BTN_WRAP_ATTR + '="1"]');
            if (tableWrap && typeof actionSpace.insertBefore === 'function') {
                actionSpace.insertBefore(wrapperEl, tableWrap);
            } else {
                actionSpace.appendChild(wrapperEl);
            }
        } else {
            targetContainer.appendChild(clonedBtn);
        }

        movedRefreshRef = {
            originBtn: originBtn,
            hostNode: hostNode,
            clonedBtn: clonedBtn,
            wrapperEl: wrapperEl,
            targetContainer: targetContainer,
            clickHandler: clickHandler
        };
    }

    function disconnectObserver() {
        if (domObserver) {
            domObserver.disconnect();
            domObserver = null;
        }
        if (syncTimer) {
            clearTimeout(syncTimer);
            syncTimer = null;
        }
    }

    function ensureObserver() {
        if (domObserver) return;
        const target = document.body || document.documentElement;
        if (!target || typeof MutationObserver !== 'function') return;

        domObserver = new MutationObserver(() => {
            if (syncTimer) clearTimeout(syncTimer);
            syncTimer = setTimeout(() => {
                syncTimer = null;
                syncPageState();
            }, 250);
        });
        domObserver.observe(target, { childList: true, subtree: true });
    }

    function syncPageState() {
        if (!isPushShopPage()) {
            disconnectObserver();
            removeTableButton();
            restoreRefreshButton();
            return;
        }

        if (config.enableTableView || config.enableMoveRefresh) {
            ensureObserver();
        } else {
            disconnectObserver();
        }

        if (config.enableMoveRefresh) {
            ensureMovedRefreshButton();
        } else {
            restoreRefreshButton();
        }

        const serverList = document.querySelector('.server-list');
        if (config.enableTableView && serverList) {
            createTableButton();
        } else {
            removeTableButton();
        }
    }

    function onRouteChange() {
        lastSeenHref = (window.location && window.location.href) || '';
        syncPageState();
    }

    function stopRouteWatcher() {
        disconnectObserver();
        if (urlWatchTimer) {
            clearInterval(urlWatchTimer);
            urlWatchTimer = null;
        }
    }

    function setupRouteListener() {
        if (routePatched) return;
        routePatched = true;

        if (typeof history !== 'undefined') {
            const origPush = history.pushState;
            const origReplace = history.replaceState;
            if (typeof origPush === 'function') {
                history.pushState = function () {
                    const ret = origPush.apply(this, arguments);
                    onRouteChange();
                    return ret;
                };
            }
            if (typeof origReplace === 'function') {
                history.replaceState = function () {
                    const ret = origReplace.apply(this, arguments);
                    onRouteChange();
                    return ret;
                };
            }
        }

        if (window.onurlchange === null && typeof window.addEventListener === 'function') {
            window.addEventListener('urlchange', onRouteChange);
        }

        window.addEventListener('popstate', onRouteChange);
        window.addEventListener('hashchange', onRouteChange);
        window.addEventListener('unload', stopRouteWatcher);

        // 兜底应对 Tampermonkey 沙箱隔离导致主世界 history.pushState 不触发沙箱钩子的 SPA 路由跳转
        urlWatchTimer = setInterval(() => {
            const curHref = (window.location && window.location.href) || '';
            if (curHref !== lastSeenHref) {
                lastSeenHref = curHref;
                syncPageState();
            }
        }, 400);
    }

    registerMenuCommands();
    setupRouteListener();
    syncPageState();
})();
