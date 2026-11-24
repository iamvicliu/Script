// ==UserScript==
// @name         网页隐私打码助手 (IP / 邮箱 / 手机 / 选中打码)
// @namespace    https://github.com/iamvicliu/Script/tree/main/Tampermonkey/Page-privacy-mask
// @version      1.0.0
// @updated      2026-11-24
// @description  截图或录屏前自动给网页中的 IP（IPv4/IPv6）、邮箱、手机号打码，支持随时点击小眼睛查看或还原原文、手动选中任意文字打码、按站点开关与复制时仅脱敏敏感词。
// @author       维克牛
// @license      MIT
// @homepageURL  https://github.com/iamvicliu/Script/tree/main/Tampermonkey/Page-privacy-mask
// @updateURL    https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/Page-privacy-mask/Page-privacy-mask.user.js
// @downloadURL  https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/Page-privacy-mask/Page-privacy-mask.user.js
// @match        *://*/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ============================================================================
    // 1. 配置管理
    // ============================================================================
    const STORAGE_KEY = 'ppm_config_v1';

    const DEFAULT_CONFIG = {
        maskIP: true,
        maskEmail: false,
        maskPhone: false,
        maskOnCopy: false,
        pausedHosts: [],
    };

    function sanitizeConfig(raw) {
        const merged = { ...DEFAULT_CONFIG, ...(raw && typeof raw === 'object' ? raw : {}) };
        return {
            maskIP: Boolean(merged.maskIP),
            maskEmail: Boolean(merged.maskEmail),
            maskPhone: Boolean(merged.maskPhone),
            maskOnCopy: Boolean(merged.maskOnCopy),
            pausedHosts: Array.isArray(merged.pausedHosts)
                ? Array.from(new Set(merged.pausedHosts.map((h) => String(h || '').trim().toLowerCase()).filter(Boolean)))
                : [],
        };
    }

    function loadConfig() {
        try {
            if (typeof GM_getValue === 'function') {
                const raw = GM_getValue(STORAGE_KEY, null);
                if (!raw) return sanitizeConfig(null);
                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                return sanitizeConfig(parsed);
            }
        } catch {
            // 忽略异常回退默认配置
        }
        return sanitizeConfig(null);
    }

    function saveConfig(cfg) {
        try {
            if (typeof GM_setValue === 'function') {
                GM_setValue(STORAGE_KEY, JSON.stringify(sanitizeConfig(cfg)));
            }
        } catch {
            // 忽略存储异常
        }
    }

    let config = loadConfig();

    function getCurrentHost() {
        return (window.location && window.location.hostname ? window.location.hostname : '').toLowerCase();
    }

    function isHostPaused(cfg = config) {
        const host = getCurrentHost();
        if (!host) return false;
        return cfg.pausedHosts.includes(host);
    }

    // ============================================================================
    // 2. 样式注入（ppm- 专属前缀，自适应浅色与深色模式）
    // ============================================================================
    const STYLE_TEXT = `
        .ppm-wrapper {
            display: inline;
        }
        .ppm-text.ppm-hidden {
            color: transparent !important;
            text-shadow: 0 0 5px rgba(100, 116, 139, 0.72) !important;
        }
        .ppm-eye {
            display: inline-block;
            width: 16px;
            height: 16px;
            margin: 0 2px 0 3px;
            padding: 0;
            border: none;
            background: transparent;
            color: #16a34a;
            cursor: pointer;
            vertical-align: -2px;
            line-height: 1;
            border-radius: 3px;
            opacity: 0.85;
            user-select: none;
            -webkit-user-select: none;
            transition: opacity 0.15s ease, transform 0.15s ease;
        }
        .ppm-eye svg {
            display: block;
            width: 14px;
            height: 14px;
        }
        .ppm-eye:hover {
            opacity: 1;
            transform: scale(1.08);
        }
        .ppm-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.45);
            backdrop-filter: blur(2px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 2147483646;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        #ppm-config-panel {
            width: 340px;
            max-width: calc(100vw - 32px);
            background: #ffffff;
            color: #0f172a;
            border: 1px solid #e2e8f0;
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 20px 50px rgba(15, 23, 42, 0.25);
            box-sizing: border-box;
        }
        #ppm-config-panel h3 {
            margin: 0 0 14px 0;
            font-size: 16px;
            font-weight: 600;
            color: #0f172a;
            text-align: center;
        }
        .ppm-config-items {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-bottom: 14px;
        }
        .ppm-config-items label {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 14px;
            color: #1e293b;
            cursor: pointer;
            line-height: 1.4;
        }
        .ppm-site-note {
            font-size: 12px;
            color: #475569;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 8px 10px;
            margin-bottom: 14px;
            line-height: 1.5;
        }
        .ppm-actions {
            display: flex;
            gap: 8px;
        }
        .ppm-btn-primary,
        .ppm-btn-secondary {
            flex: 1;
            padding: 8px 12px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            border: 1px solid transparent;
        }
        .ppm-btn-primary {
            background: #16a34a;
            color: #ffffff;
        }
        .ppm-btn-primary:hover {
            background: #15803d;
        }
        .ppm-btn-secondary {
            background: #f1f5f9;
            color: #334155;
            border-color: #cbd5e1;
        }
        .ppm-btn-secondary:hover {
            background: #e2e8f0;
        }
        #ppm-toast {
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: rgba(15, 23, 42, 0.9);
            color: #f8fafc;
            padding: 10px 16px;
            border-radius: 8px;
            font-size: 13px;
            z-index: 2147483647;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            pointer-events: none;
        }
        @media (prefers-color-scheme: dark) {
            #ppm-config-panel {
                background: #1e293b;
                color: #f1f5f9;
                border-color: #334155;
            }
            #ppm-config-panel h3 {
                color: #f8fafc;
            }
            .ppm-config-items label {
                color: #e2e8f0;
            }
            .ppm-site-note {
                background: #0f172a;
                border-color: #334155;
                color: #cbd5e1;
            }
            .ppm-btn-secondary {
                background: #334155;
                color: #e2e8f0;
                border-color: #475569;
            }
            .ppm-btn-secondary:hover {
                background: #475569;
            }
        }
    `;

    function injectStyles() {
        if (typeof GM_addStyle === 'function') {
            GM_addStyle(STYLE_TEXT);
            return;
        }
        if (document.head) {
            const style = document.createElement('style');
            style.textContent = STYLE_TEXT;
            document.head.appendChild(style);
        }
    }

    // ============================================================================
    // 3. 精准无状态匹配引擎（IPv4 / RFC 4291 IPv6 / Email / Phone）
    // ============================================================================
    const IPV4_PART = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
    const STRICT_IPV4_RE = new RegExp(`^${IPV4_PART}(?:\\.${IPV4_PART}){3}$`);
    const IPV4_CANDIDATE_RE = new RegExp(`(?<![0-9.])${IPV4_PART}(?:\\.${IPV4_PART}){3}(?![0-9.])`, 'g');
    const IPV6_CANDIDATE_RE = /(?<![0-9a-zA-Z_])[0-9a-fA-F:]{2,}(?:[0-9a-fA-F:.]*)(?:%[0-9a-zA-Z._-]+)?(?![0-9a-zA-Z_])/g;
    const EMAIL_RE = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,24}(?![A-Za-z0-9._%+-])/g;
    const CN_PHONE_RE = /(?<!\d)(?:\+?86[\s-]?)?1[3-9]\d(?:[\s-]?\d{4}){2}(?!\d)/g;
    const INTL_PHONE_RE = /(?<!\d)\+[1-9]\d{0,2}[\s-]\d{2,4}(?:[\s-]\d{3,4}){1,3}(?!\d)/g;

    function isValidIPv6(raw) {
        if (!raw || typeof raw !== 'string') return false;
        let body = raw;
        const pctIdx = body.indexOf('%');
        if (pctIdx !== -1) {
            const zone = body.slice(pctIdx + 1);
            body = body.slice(0, pctIdx);
            if (!zone || !/^[0-9a-zA-Z._-]+$/.test(zone)) return false;
            if (!/^fe80:/i.test(body)) return false;
        }

        if (!body.includes(':') || body === '::' || body.includes(':::')) {
            return false;
        }
        // 单冒号不能出现在开头或结尾（只允许 ::）
        if ((body.startsWith(':') && !body.startsWith('::')) || (body.endsWith(':') && !body.endsWith('::'))) {
            return false;
        }

        const doubleColonParts = body.split('::');
        if (doubleColonParts.length > 2) {
            return false;
        }

        const hasCompression = doubleColonParts.length === 2;
        const leftRaw = doubleColonParts[0];
        const rightRaw = hasCompression ? doubleColonParts[1] : '';

        const leftGroups = leftRaw ? leftRaw.split(':') : [];
        const rightGroups = rightRaw ? rightRaw.split(':') : [];

        if (hasCompression && leftGroups.length === 0 && rightGroups.length === 0) {
            return false;
        }

        const checkHexGroup = (g) => /^[0-9a-fA-F]{1,4}$/.test(g);

        let ipv4Groups = 0;
        let hexGroupCount = 0;

        if (!hasCompression) {
            for (let i = 0; i < leftGroups.length; i++) {
                const g = leftGroups[i];
                if (i === leftGroups.length - 1 && g.includes('.')) {
                    if (!STRICT_IPV4_RE.test(g)) return false;
                    ipv4Groups = 2;
                } else {
                    if (!checkHexGroup(g)) return false;
                    hexGroupCount += 1;
                }
            }
            return hexGroupCount + ipv4Groups === 8;
        }

        for (const g of leftGroups) {
            if (!checkHexGroup(g)) return false;
            hexGroupCount += 1;
        }
        for (let i = 0; i < rightGroups.length; i++) {
            const g = rightGroups[i];
            if (i === rightGroups.length - 1 && g.includes('.')) {
                if (!STRICT_IPV4_RE.test(g)) return false;
                ipv4Groups = 2;
            } else {
                if (!checkHexGroup(g)) return false;
                hexGroupCount += 1;
            }
        }

        const totalExplicit = hexGroupCount + ipv4Groups;
        return totalExplicit >= 1 && totalExplicit <= 7;
    }

    function collectRegexMatches(text, regex, type, out) {
        const localRe = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
        let m;
        while ((m = localRe.exec(text)) !== null) {
            const matched = m[0];
            if (!matched) {
                localRe.lastIndex += 1;
                continue;
            }
            out.push({
                start: m.index,
                end: m.index + matched.length,
                type,
                match: matched,
            });
        }
    }

    function collectIPv6Matches(text, out) {
        const localRe = new RegExp(IPV6_CANDIDATE_RE.source, 'g');
        let m;
        while ((m = localRe.exec(text)) !== null) {
            let candidate = m[0];
            let end = m.index + candidate.length;
            while (candidate.endsWith('.')) {
                candidate = candidate.slice(0, -1);
                end -= 1;
            }
            if (candidate.length >= 3 && (candidate.match(/:/g) || []).length >= 2 && isValidIPv6(candidate)) {
                out.push({
                    start: m.index,
                    end,
                    type: 'ipv6',
                    match: candidate,
                });
            }
        }
    }

    function findSensitiveMatches(text, cfg = config) {
        if (!text) return [];
        const raw = [];
        if (cfg.maskIP) {
            collectRegexMatches(text, IPV4_CANDIDATE_RE, 'ipv4', raw);
            collectIPv6Matches(text, raw);
        }
        if (cfg.maskEmail) {
            collectRegexMatches(text, EMAIL_RE, 'email', raw);
        }
        if (cfg.maskPhone) {
            collectRegexMatches(text, CN_PHONE_RE, 'phone', raw);
            collectRegexMatches(text, INTL_PHONE_RE, 'phone', raw);
        }
        if (!raw.length) return [];

        raw.sort((a, b) => (a.start !== b.start ? a.start - b.start : b.end - a.end));
        const selected = [];
        let lastEnd = 0;
        for (const item of raw) {
            if (item.start >= lastEnd) {
                selected.push(item);
                lastEnd = item.end;
            }
        }
        return selected;
    }

    function maskPlainText(text, cfg = config) {
        const matches = findSensitiveMatches(text, cfg);
        if (!matches.length) return text;
        let out = '';
        let cursor = 0;
        for (const item of matches) {
            out += text.slice(cursor, item.start);
            out += '*'.repeat(item.match.length);
            cursor = item.end;
        }
        out += text.slice(cursor);
        return out;
    }

    // ============================================================================
    // 4. DOM 打码包装与安全还原（无重复眼睛、跳过可编辑区、增量扫描）
    // ============================================================================
    const EYE_OPEN_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0"/><path d="M0 8s3-5.5 8-5.5S16 8 16 8s-3 5.5-8 5.5S0 8 0 8m8 3.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7"/></svg>';
    const EYE_SLASH_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true"><path d="m10.79 12.912-1.614-1.615a3.5 3.5 0 0 1-4.474-4.474l-2.06-2.06C.938 6.278 0 8 0 8s3 5.5 8 5.5a7 7 0 0 0 2.79-.588M5.21 3.088A7 7 0 0 1 8 2.5c5 0 8 5.5 8 5.5s-.939 1.721-2.641 3.238l-2.062-2.062a3.5 3.5 0 0 0-4.474-4.474z"/><path d="M5.525 7.646a2.5 2.5 0 0 0 2.829 2.829zm4.95.708-2.829-2.83a2.5 2.5 0 0 1 2.829 2.829zm3.171 6-12-12 .708-.708 12 12z"/></svg>';

    const SKIP_TAGS = new Set([
        'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT',
        'OPTION', 'TITLE', 'SVG', 'CANVAS', 'IFRAME', 'HEAD',
    ]);

    let isApplyingMask = false;

    function isEditableElement(el) {
        if (!el || el.nodeType !== 1) return false;
        if (SKIP_TAGS.has(el.tagName)) return true;
        if (el.isContentEditable) return true;
        if (typeof el.getAttribute === 'function') {
            const ce = el.getAttribute('contenteditable');
            if (ce === '' || ce === 'true' || ce === 'plaintext-only') return true;
        }
        if (typeof el.closest === 'function') {
            if (el.closest('[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"], .CodeMirror, .cm-editor, .monaco-editor')) {
                return true;
            }
        }
        return false;
    }

    function shouldSkipElement(el) {
        if (!el || el.nodeType !== 1) return false;
        if (SKIP_TAGS.has(el.tagName)) return true;
        if (isEditableElement(el)) return true;
        if (el.id === 'ppm-config-panel' || el.id === 'ppm-toast' || el.id === 'ppm-config-backdrop') return true;
        if (typeof el.getAttribute === 'function' && el.getAttribute('data-ppm-wrapper') === 'true') return true;
        if (typeof el.closest === 'function' && el.closest('[data-ppm-wrapper="true"], #ppm-config-panel, #ppm-config-backdrop, #ppm-toast')) {
            return true;
        }
        return false;
    }

    function shouldSkipTextNode(textNode) {
        let cur = textNode ? textNode.parentNode : null;
        while (cur && cur.nodeType === 1) {
            if (shouldSkipElement(cur)) return true;
            cur = cur.parentNode;
        }
        return false;
    }

    function collectTextNodes(root) {
        const nodes = [];
        if (!root) return nodes;

        if (root.nodeType === 3) {
            if (!shouldSkipTextNode(root) && root.textContent && root.textContent.trim()) {
                nodes.push(root);
            }
            return nodes;
        }

        if (root.nodeType !== 1 && root.nodeType !== 9) return nodes;
        if (root.nodeType === 1 && shouldSkipElement(root)) return nodes;

        if (typeof document.createTreeWalker === 'function') {
            const FILTER_SHOW_TEXT = typeof NodeFilter !== 'undefined' ? NodeFilter.SHOW_TEXT : 4;
            const walker = document.createTreeWalker(root, FILTER_SHOW_TEXT);
            let cur;
            while ((cur = walker.nextNode())) {
                if (!shouldSkipTextNode(cur) && cur.textContent && cur.textContent.trim()) {
                    nodes.push(cur);
                }
            }
            return nodes;
        }

        const walk = (node) => {
            if (!node) return;
            if (node.nodeType === 3) {
                if (!shouldSkipTextNode(node) && node.textContent && node.textContent.trim()) {
                    nodes.push(node);
                }
                return;
            }
            if (node.nodeType === 1 && shouldSkipElement(node)) return;
            const children = node.childNodes || node.children || [];
            for (let i = 0; i < children.length; i++) {
                walk(children[i]);
            }
        };
        walk(root);
        return nodes;
    }

    function createMaskWrapper(originalText, source = 'auto') {
        const wrapper = document.createElement('span');
        wrapper.className = 'ppm-wrapper';
        wrapper.setAttribute('data-ppm-wrapper', 'true');
        wrapper.setAttribute('data-ppm-source', source);

        const maskedSpan = document.createElement('span');
        maskedSpan.className = 'ppm-text ppm-hidden';
        maskedSpan.setAttribute('data-ppm-masked', 'true');
        maskedSpan.setAttribute('data-ppm-original', originalText);
        maskedSpan.textContent = '*'.repeat(originalText.length);

        const eyeBtn = document.createElement('button');
        eyeBtn.type = 'button';
        eyeBtn.className = 'ppm-eye';
        eyeBtn.innerHTML = EYE_OPEN_SVG;
        eyeBtn.title = '显示原文';
        eyeBtn.setAttribute('aria-label', '显示原文');

        eyeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const isHidden = maskedSpan.classList.contains('ppm-hidden');
            if (isHidden) {
                maskedSpan.classList.remove('ppm-hidden');
                maskedSpan.textContent = maskedSpan.getAttribute('data-ppm-original') || originalText;
                eyeBtn.innerHTML = EYE_SLASH_SVG;
                eyeBtn.title = '重新打码';
                eyeBtn.setAttribute('aria-label', '重新打码');
            } else {
                maskedSpan.classList.add('ppm-hidden');
                const orig = maskedSpan.getAttribute('data-ppm-original') || originalText;
                maskedSpan.textContent = '*'.repeat(orig.length);
                eyeBtn.innerHTML = EYE_OPEN_SVG;
                eyeBtn.title = '显示原文';
                eyeBtn.setAttribute('aria-label', '显示原文');
            }
        });

        wrapper.appendChild(maskedSpan);
        wrapper.appendChild(eyeBtn);
        return wrapper;
    }

    function applyMaskToTextNode(textNode, cfg = config) {
        const text = textNode.textContent;
        if (!text || !text.trim()) return false;
        const matches = findSensitiveMatches(text, cfg);
        if (!matches.length) return false;

        const parent = textNode.parentNode;
        if (!parent) return false;

        const frag = typeof document.createDocumentFragment === 'function'
            ? document.createDocumentFragment()
            : document.createElement('span');

        let cursor = 0;
        for (const item of matches) {
            if (item.start > cursor) {
                frag.appendChild(document.createTextNode(text.slice(cursor, item.start)));
            }
            frag.appendChild(createMaskWrapper(item.match, 'auto'));
            cursor = item.end;
        }
        if (cursor < text.length) {
            frag.appendChild(document.createTextNode(text.slice(cursor)));
        }

        if (frag.nodeType === 11) {
            parent.replaceChild(frag, textNode);
        } else {
            const nodes = Array.from(frag.childNodes || frag.children || []);
            for (const child of nodes) {
                parent.insertBefore(child, textNode);
            }
            parent.removeChild(textNode);
        }
        return true;
    }

    function maskRoot(root = document.body, force = false) {
        if (!root) return 0;
        if (!force && isHostPaused()) return 0;
        const nodes = collectTextNodes(root);
        if (!nodes.length) return 0;

        let count = 0;
        isApplyingMask = true;
        try {
            for (const node of nodes) {
                if (applyMaskToTextNode(node, config)) {
                    count += 1;
                }
            }
        } finally {
            isApplyingMask = false;
        }
        return count;
    }

    function unwrapMasks(sourceFilter = 'all') {
        const selector = sourceFilter === 'auto'
            ? 'span[data-ppm-wrapper="true"][data-ppm-source="auto"]'
            : 'span[data-ppm-wrapper="true"]';
        const wrappers = Array.from(document.querySelectorAll(selector));
        if (!wrappers.length) return 0;

        isApplyingMask = true;
        try {
            const parents = new Set();
            for (const wrapper of wrappers) {
                const span = wrapper.querySelector('[data-ppm-original]');
                const original = span ? span.getAttribute('data-ppm-original') : '';
                const parent = wrapper.parentNode;
                if (parent && original !== null) {
                    parent.replaceChild(document.createTextNode(original), wrapper);
                    parents.add(parent);
                }
            }
            for (const parent of parents) {
                if (typeof parent.normalize === 'function') {
                    parent.normalize();
                }
            }
        } finally {
            isApplyingMask = false;
        }
        return wrappers.length;
    }

    function rescanAllAutoMasks() {
        unwrapMasks('auto');
        if (!isHostPaused()) {
            maskRoot(document.body, false);
        }
    }

    // ============================================================================
    // 5. 手动选中打码 & 轻量 Toast 提示
    // ============================================================================
    let toastTimer = null;

    function showToast(msg) {
        if (!document.body) return;
        const old = document.getElementById('ppm-toast');
        if (old) old.remove();
        const toast = document.createElement('div');
        toast.id = 'ppm-toast';
        toast.textContent = msg;
        document.body.appendChild(toast);
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, 2200);
    }

    function maskSelectedText() {
        const selection = window.getSelection ? window.getSelection() : null;
        if (!selection || !selection.rangeCount) {
            showToast('请先拖动选中需要打码的文字');
            return false;
        }
        const selectedText = selection.toString();
        if (!selectedText || !selectedText.trim()) {
            showToast('请先拖动选中需要打码的文字');
            return false;
        }

        const range = selection.getRangeAt(0);
        const startContainer = range.startContainer;
        const checkEl = startContainer.nodeType === 3 ? startContainer.parentNode : startContainer;
        if (checkEl && checkEl.nodeType === 1 && isEditableElement(checkEl)) {
            showToast('输入框内不支持页面打码');
            return false;
        }
        if (checkEl && typeof checkEl.closest === 'function' && checkEl.closest('[data-ppm-wrapper="true"]')) {
            showToast('该内容已在打码状态中');
            return false;
        }

        isApplyingMask = true;
        try {
            const wrapper = createMaskWrapper(selectedText, 'manual');
            if (
                range.startContainer === range.endContainer &&
                range.startContainer.nodeType === 3 &&
                range.startContainer.parentNode
            ) {
                const textNode = range.startContainer;
                const full = textNode.textContent || '';
                const before = full.slice(0, range.startOffset);
                const after = full.slice(range.endOffset);
                const parent = textNode.parentNode;
                if (before) parent.insertBefore(document.createTextNode(before), textNode);
                parent.insertBefore(wrapper, textNode);
                if (after) parent.insertBefore(document.createTextNode(after), textNode);
                parent.removeChild(textNode);
            } else {
                range.deleteContents();
                range.insertNode(wrapper);
            }
            if (typeof selection.removeAllRanges === 'function') {
                selection.removeAllRanges();
            }
            return true;
        } catch {
            showToast('当前选区跨越了复杂元素，请缩小选中范围再试');
            return false;
        } finally {
            isApplyingMask = false;
        }
    }

    // ============================================================================
    // 6. 设置面板（无监听泄漏） & 油猴菜单
    // ============================================================================
    let activePanelCleanup = null;

    function closeConfigPanel() {
        if (typeof activePanelCleanup === 'function') {
            activePanelCleanup();
            activePanelCleanup = null;
        }
        const backdrop = document.getElementById('ppm-config-backdrop');
        if (backdrop) backdrop.remove();
    }

    function showConfigPanel() {
        if (document.getElementById('ppm-config-backdrop')) {
            closeConfigPanel();
            return;
        }
        if (!document.body) return;

        const host = getCurrentHost() || '当前页面';
        const paused = isHostPaused();

        const backdrop = document.createElement('div');
        backdrop.id = 'ppm-config-backdrop';
        backdrop.className = 'ppm-backdrop';

        const panel = document.createElement('div');
        panel.id = 'ppm-config-panel';
        panel.innerHTML = `
            <h3>网页隐私打码设置</h3>
            <div class="ppm-config-items">
                <label>
                    <input type="checkbox" name="maskIP" ${config.maskIP ? 'checked' : ''}> 自动打码 IP（IPv4 / IPv6）
                </label>
                <label>
                    <input type="checkbox" name="maskEmail" ${config.maskEmail ? 'checked' : ''}> 自动打码邮箱
                </label>
                <label>
                    <input type="checkbox" name="maskPhone" ${config.maskPhone ? 'checked' : ''}> 自动打码手机号
                </label>
                <label>
                    <input type="checkbox" name="maskOnCopy" ${config.maskOnCopy ? 'checked' : ''}> 复制文本时仅将敏感词替换为星号
                </label>
            </div>
            <div class="ppm-site-note"></div>
            <div class="ppm-actions">
                <button type="button" class="ppm-btn-secondary" id="ppm-cancel-config">取消</button>
                <button type="button" class="ppm-btn-primary" id="ppm-save-config">保存并立即应用</button>
            </div>
        `;
        panel.querySelector('.ppm-site-note').textContent =
            `当前站点（${host}）：${paused ? '已暂停自动打码（可在油猴菜单恢复）' : '自动打码生效中'}`;

        backdrop.appendChild(panel);
        document.body.appendChild(backdrop);

        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                closeConfigPanel();
            }
        };
        const onBackdropClick = (e) => {
            if (e.target === backdrop) {
                closeConfigPanel();
            }
        };

        document.addEventListener('keydown', onKeyDown, true);
        backdrop.addEventListener('click', onBackdropClick);

        activePanelCleanup = () => {
            document.removeEventListener('keydown', onKeyDown, true);
            backdrop.removeEventListener('click', onBackdropClick);
        };

        panel.querySelector('#ppm-cancel-config').addEventListener('click', closeConfigPanel);
        panel.querySelector('#ppm-save-config').addEventListener('click', () => {
            config = sanitizeConfig({
                ...config,
                maskIP: panel.querySelector('[name="maskIP"]').checked,
                maskEmail: panel.querySelector('[name="maskEmail"]').checked,
                maskPhone: panel.querySelector('[name="maskPhone"]').checked,
                maskOnCopy: panel.querySelector('[name="maskOnCopy"]').checked,
            });
            saveConfig(config);
            closeConfigPanel();
            rescanAllAutoMasks();
            registerMenuCommands();
            showToast('打码设置已保存并应用');
        });
    }

    let menuIds = [];

    function registerMenuCommands() {
        if (typeof GM_registerMenuCommand !== 'function') return;
        if (typeof GM_unregisterMenuCommand === 'function') {
            for (const id of menuIds) {
                try {
                    GM_unregisterMenuCommand(id);
                } catch {
                    // 忽略移除异常
                }
            }
        }
        menuIds = [];

        const host = getCurrentHost();
        const paused = isHostPaused();
        const items = [
            { label: '⚙️ 打开打码设置', handler: showConfigPanel },
            {
                label: '🙈 立即扫描并打码当前页',
                handler: () => {
                    unwrapMasks('auto');
                    const count = maskRoot(document.body, true);
                    showToast(count > 0 ? '已完成当前页敏感信息打码' : '当前页未发现需打码的敏感信息');
                },
            },
            { label: '✂️ 手动打码选中文字 (Alt+Shift+M)', handler: maskSelectedText },
            {
                label: '👀 还原当前页全部打码',
                handler: () => {
                    const count = unwrapMasks('all');
                    showToast(count > 0 ? `已还原 ${count} 处打码` : '当前页没有已打码内容');
                },
            },
        ];

        if (host) {
            items.push({
                label: paused
                    ? `⏸️ 当前网站已暂停：${host}（点击恢复）`
                    : `✅ 当前网站已启用：${host}（点击暂停）`,
                handler: () => {
                    const nextHosts = new Set(config.pausedHosts);
                    if (nextHosts.has(host)) {
                        nextHosts.delete(host);
                        config = sanitizeConfig({ ...config, pausedHosts: Array.from(nextHosts) });
                        saveConfig(config);
                        rescanAllAutoMasks();
                        showToast(`已恢复 ${host} 自动打码`);
                    } else {
                        nextHosts.add(host);
                        config = sanitizeConfig({ ...config, pausedHosts: Array.from(nextHosts) });
                        saveConfig(config);
                        unwrapMasks('auto');
                        showToast(`已暂停 ${host} 自动打码`);
                    }
                    registerMenuCommands();
                },
            });
        }

        for (const item of items) {
            const id = GM_registerMenuCommand(item.label, item.handler);
            if (id !== undefined) menuIds.push(id);
        }
    }

    // ============================================================================
    // 7. 复制局部脱敏、快捷键 & 增量 DOM 监听
    // ============================================================================
    const BLOCK_COPY_TAGS = new Set([
        'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT',
        'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3',
        'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P',
        'PRE', 'SECTION', 'TABLE', 'TR', 'UL',
    ]);

    function getClosestElement(node) {
        if (!node) return null;
        return node.nodeType === 1 ? node : node.parentNode;
    }

    function selectionTouchesMask(range, fragmentRoot) {
        if (fragmentRoot && typeof fragmentRoot.querySelector === 'function') {
            if (fragmentRoot.querySelector('[data-ppm-wrapper="true"], [data-ppm-masked="true"]')) {
                return true;
            }
        }
        if (!range) return false;
        const startEl = getClosestElement(range.startContainer);
        const endEl = getClosestElement(range.endContainer);
        if (startEl && typeof startEl.closest === 'function' && startEl.closest('[data-ppm-wrapper="true"], [data-ppm-masked="true"]')) {
            return true;
        }
        if (endEl && typeof endEl.closest === 'function' && endEl.closest('[data-ppm-wrapper="true"], [data-ppm-masked="true"]')) {
            return true;
        }
        return false;
    }

    function serializeContainerForCopy(container) {
        const parts = [];
        const appendText = (s) => {
            if (s) parts.push(s);
        };
        const walk = (node) => {
            if (!node) return;
            if (node.nodeType === 3) {
                appendText(node.textContent || '');
                return;
            }
            if (node.nodeType !== 1) return;
            const tag = node.tagName;
            if (tag === 'SCRIPT' || tag === 'STYLE') return;
            if (node.classList && node.classList.contains('ppm-eye')) return;
            if (tag === 'BR') {
                appendText('\n');
                return;
            }
            const isBlock = BLOCK_COPY_TAGS.has(tag);
            if (isBlock && parts.length > 0 && !parts[parts.length - 1].endsWith('\n')) {
                appendText('\n');
            }
            const children = node.childNodes || [];
            for (let i = 0; i < children.length; i++) {
                walk(children[i]);
            }
            if (isBlock && parts.length > 0 && !parts[parts.length - 1].endsWith('\n')) {
                appendText('\n');
            }
        };
        walk(container);
        return parts.join('').replace(/\n+$/, '');
    }

    function serializeFragmentForCopy(frag, range, shouldMaskAll) {
        const container = document.createElement('div');
        container.appendChild(frag);

        const eyes = container.querySelectorAll('.ppm-eye');
        for (let i = 0; i < eyes.length; i++) {
            eyes[i].remove();
        }

        const startEl = range ? getClosestElement(range.startContainer) : null;
        const maskedAncestor = startEl && typeof startEl.closest === 'function'
            ? startEl.closest('[data-ppm-masked="true"]')
            : null;
        const hasNestedMasked = Boolean(container.querySelector('[data-ppm-masked="true"]'));

        if (shouldMaskAll) {
            const maskedEls = container.querySelectorAll('[data-ppm-original]');
            for (let i = 0; i < maskedEls.length; i++) {
                const el = maskedEls[i];
                const orig = el.getAttribute('data-ppm-original');
                if (orig !== null) {
                    el.textContent = '*'.repeat(orig.length);
                }
            }
            if (!hasNestedMasked && maskedAncestor) {
                return '*'.repeat(container.textContent.length);
            }
            const walkPlainText = (node) => {
                if (!node) return;
                if (node.nodeType === 3) {
                    node.textContent = maskPlainText(node.textContent || '', config);
                    return;
                }
                if (node.nodeType === 1) {
                    if (typeof node.getAttribute === 'function' && (node.getAttribute('data-ppm-wrapper') === 'true' || node.getAttribute('data-ppm-masked') === 'true')) {
                        return;
                    }
                    const children = node.childNodes || [];
                    for (let i = 0; i < children.length; i++) {
                        walkPlainText(children[i]);
                    }
                }
            };
            walkPlainText(container);
        } else if (!hasNestedMasked && maskedAncestor && maskedAncestor.classList && maskedAncestor.classList.contains('ppm-hidden')) {
            return '*'.repeat(container.textContent.length);
        }

        return serializeContainerForCopy(container);
    }

    function handleCopy(e) {
        if (!e.clipboardData || typeof e.clipboardData.setData !== 'function') return;
        if (isEditableElement(e.target) || isEditableElement(document.activeElement)) return;
        const selection = window.getSelection ? window.getSelection() : null;
        if (!selection || !selection.rangeCount) return;

        const shouldMaskAll = Boolean(config.maskOnCopy && !isHostPaused());
        const range = typeof selection.getRangeAt === 'function' ? selection.getRangeAt(0) : null;

        if (range && typeof range.cloneContents === 'function') {
            const frag = range.cloneContents();
            const probe = document.createElement('div');
            probe.appendChild(frag);
            if (selectionTouchesMask(range, probe)) {
                const serialized = serializeFragmentForCopy(probe, range, shouldMaskAll);
                e.preventDefault();
                e.clipboardData.setData('text/plain', serialized);
                return;
            }
            if (!shouldMaskAll) return;
            const plain = serializeContainerForCopy(probe);
            const masked = maskPlainText(plain, config);
            if (masked !== plain) {
                e.preventDefault();
                e.clipboardData.setData('text/plain', masked);
            }
            return;
        }

        if (!shouldMaskAll) return;
        const text = selection.toString();
        if (!text) return;
        const masked = maskPlainText(text, config);
        if (masked !== text) {
            e.preventDefault();
            e.clipboardData.setData('text/plain', masked);
        }
    }

    function handleShortcut(e) {
        if (e.isComposing || e.keyCode === 229) return;
        if (!e.altKey || !e.shiftKey || e.ctrlKey || e.metaKey) return;
        if (String(e.key || '').toLowerCase() !== 'm') return;
        if (isEditableElement(e.target) || isEditableElement(document.activeElement)) return;
        e.preventDefault();
        maskSelectedText();
    }

    const pendingRoots = new Set();
    let flushTimer = null;

    function scheduleFlushRoots() {
        if (flushTimer) return;
        flushTimer = setTimeout(() => {
            flushTimer = null;
            if (isHostPaused()) {
                pendingRoots.clear();
                return;
            }
            const roots = Array.from(pendingRoots);
            pendingRoots.clear();
            for (const root of roots) {
                if (root.nodeType === 3) {
                    if (!shouldSkipTextNode(root)) {
                        isApplyingMask = true;
                        try {
                            applyMaskToTextNode(root, config);
                        } finally {
                            isApplyingMask = false;
                        }
                    }
                } else {
                    maskRoot(root, false);
                }
            }
        }, 200);
    }

    const observer = new MutationObserver((mutations) => {
        if (isApplyingMask || isHostPaused()) return;
        let hasWork = false;
        for (const m of mutations) {
            if (m.type === 'characterData' && m.target) {
                pendingRoots.add(m.target);
                hasWork = true;
            } else if (m.addedNodes && m.addedNodes.length) {
                for (let i = 0; i < m.addedNodes.length; i++) {
                    const n = m.addedNodes[i];
                    if (n.nodeType === 1 && shouldSkipElement(n)) continue;
                    pendingRoots.add(n);
                    hasWork = true;
                }
            }
        }
        if (hasWork) scheduleFlushRoots();
    });

    function init() {
        injectStyles();
        registerMenuCommands();
        document.addEventListener('copy', handleCopy, true);
        document.addEventListener('keydown', handleShortcut, true);

        const startScan = () => {
            if (!document.body) return;
            if (!isHostPaused()) {
                maskRoot(document.body, false);
            }
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true,
            });
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', startScan, { once: true });
        } else {
            startScan();
        }
    }

    init();
})();
