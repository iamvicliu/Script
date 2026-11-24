// ==UserScript==
// @name         Discourse 论坛用户注册信息辅助
// @namespace    https://github.com/iamvicliu/Script/tree/main/Tampermonkey/Discourse-user-info-helper
// @version      1.4.0
// @updated      2026-11-24
// @description  在 linux.do、idcflare.com 等 Discourse 论坛帖子页的用户名旁展示注册天数、发帖数、回帖数与信任级别：自动展示楼主信息，楼下回复按需点查，并附可拖拽悬浮条一键批量查看。
// @author       维克牛
// @license      MIT
// @homepageURL  https://github.com/iamvicliu/Script/tree/main/Tampermonkey/Discourse-user-info-helper
// @updateURL    https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/Discourse-user-info-helper/Discourse-user-info-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/iamvicliu/Script/main/Tampermonkey/Discourse-user-info-helper/Discourse-user-info-helper.user.js
// @match        https://linux.do/*
// @match        https://idcflare.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const LOG_PREFIX = '[Discourse 用户注册信息辅助]';

    function getSiteOrigin() {
        const origin = window.location && window.location.origin;
        if (origin && origin !== 'null') {
            return origin.replace(/\/+$/, '');
        }
        return `${window.location.protocol}//${window.location.host}`;
    }

    const PROFILE_API_BUILDERS = [
        (slug) => `${getSiteOrigin()}/u/${encodeURIComponent(slug)}.json`,
        (slug) => `${getSiteOrigin()}/users/${encodeURIComponent(slug)}.json`,
    ];

    const SUMMARY_API_BUILDERS = [
        (slug) => `${getSiteOrigin()}/u/${encodeURIComponent(slug)}/summary.json`,
        (slug) => `${getSiteOrigin()}/users/${encodeURIComponent(slug)}/summary.json`,
    ];

    const TRUST_LEVEL_LABELS = {
        0: 'Lv0 新手',
        1: 'Lv1 入门',
        2: 'Lv2 成员',
        3: 'Lv3 常驻',
        4: 'Lv4 领袖',
    };

    const TRUST_LEVEL_ALIAS = {
        newuser: 0,
        basic: 1,
        member: 2,
        regular: 3,
        leader: 4,
    };

    const userInfoCache = new Map();
    const pendingRequests = new Map();

    const MARKER_CLASS = 'tm-register-days';
    const BUTTON_CLASS = 'tm-register-days-button';
    const PAGE_TOGGLE_CONTAINER_ID = 'tm-register-days-toggle-container';
    const PAGE_TOGGLE_ID = 'tm-register-days-toggle';
    const PAGE_TOGGLE_HIDE_ID = 'tm-register-days-toggle-hide';
    const DATA_ATTR_USER = 'data-tm-user';
    const DATA_ATTR_ORIGINAL_USER = 'data-tm-original-user';
    const DAY_IN_MS = 24 * 60 * 60 * 1000;
    const COLLAPSE_STATE_STORAGE_KEY = 'tm-register-days-toggle-collapsed';
    const CONTAINER_TOP_STORAGE_KEY = 'tm-register-days-toggle-top';
    const CONTAINER_VERTICAL_MARGIN = 20;
    const DRAG_ACTIVATION_THRESHOLD_PX = 4;
    const BATCH_REQUEST_DELAY_MS = 120;

    let enhanceScheduled = false;
    let revealInProgress = false;
    let observerStarted = false;
    let pageToggleCollapsed = loadInitialCollapseState();
    let storedContainerTop = loadInitialContainerTop();
    let containerDragState = null;
    let suppressClickAfterDrag = false;

    const globalObserver = new MutationObserver(() => {
        scheduleEnhance();
    });

    function escapeAttrValue(value) {
        const str = String(value);
        if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
            return CSS.escape(str);
        }
        return str.replace(/["\\]/g, '\\$&');
    }

    function delay(ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }

    function scheduleEnhance() {
        if (enhanceScheduled) {
            return;
        }
        enhanceScheduled = true;
        requestAnimationFrame(() => {
            enhanceScheduled = false;
            enhanceTopicPage();
        });
    }

    function isTopicPage() {
        return window.location.pathname.startsWith('/t/');
    }

    function loadInitialCollapseState() {
        // 从本地存储恢复开关的隐藏状态，避免用户每次刷新后重置
        if (!supportsLocalStorage()) {
            return false;
        }
        try {
            return window.localStorage.getItem(COLLAPSE_STATE_STORAGE_KEY) === '1';
        } catch (error) {
            console.debug(`${LOG_PREFIX} 读取按钮隐藏状态失败：`, error);
            return false;
        }
    }

    function loadInitialContainerTop() {
        // 从本地存储读取按钮纵向位置，保证拖动后刷新仍保留
        if (!supportsLocalStorage()) {
            return null;
        }
        try {
            const rawValue = window.localStorage.getItem(CONTAINER_TOP_STORAGE_KEY);
            if (rawValue === null) {
                return null;
            }

            const parsed = Number.parseFloat(rawValue);
            return Number.isFinite(parsed) ? parsed : null;
        } catch (error) {
            console.debug(`${LOG_PREFIX} 读取按钮位置失败：`, error);
            return null;
        }
    }

    function supportsLocalStorage() {
        // 兼容部分隐私模式或禁用存储的浏览器环境
        try {
            return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
        } catch (error) {
            return false;
        }
    }

    function persistCollapseState(collapsed) {
        // 将隐藏状态写入本地存储，方便用户下次访问保持一致
        if (!supportsLocalStorage()) {
            return;
        }
        try {
            window.localStorage.setItem(COLLAPSE_STATE_STORAGE_KEY, collapsed ? '1' : '0');
        } catch (error) {
            console.debug(`${LOG_PREFIX} 保存按钮隐藏状态失败：`, error);
        }
    }

    function persistContainerTop(position) {
        // 持久化按钮的纵向位置，避免拖动后刷新失效
        if (!supportsLocalStorage()) {
            return;
        }
        try {
            window.localStorage.setItem(CONTAINER_TOP_STORAGE_KEY, String(position));
        } catch (error) {
            console.debug(`${LOG_PREFIX} 保存按钮位置失败：`, error);
        }
    }

    function clampContainerTop(container, targetTop) {
        // 避免按钮拖出屏幕之外，限定在顶部与底部之间
        if (!(container instanceof HTMLElement)) {
            return targetTop;
        }

        const docElement = document.documentElement;
        const docClientHeight = docElement ? docElement.clientHeight : 0;
        const viewportHeight = Math.max(window.innerHeight || 0, docClientHeight || 0);
        const containerHeight = container.offsetHeight || 0;
        if (viewportHeight <= 0) {
            return targetTop;
        }

        const maxTop = Math.max(CONTAINER_VERTICAL_MARGIN, viewportHeight - containerHeight - CONTAINER_VERTICAL_MARGIN);
        const bounded = Math.min(Math.max(targetTop, CONTAINER_VERTICAL_MARGIN), maxTop);
        return Number.isFinite(bounded) ? bounded : targetTop;
    }

    function applyStoredContainerPosition(container) {
        // 根据当前存储的 top 值更新容器位置
        if (!(container instanceof HTMLElement)) {
            return;
        }

        if (typeof storedContainerTop === 'number') {
            const clamped = clampContainerTop(container, storedContainerTop);
            storedContainerTop = clamped;
            container.style.top = `${clamped}px`;
            container.style.bottom = 'auto';
        } else {
            container.style.top = 'auto';
            container.style.bottom = `${CONTAINER_VERTICAL_MARGIN}px`;
        }
    }

    function handleViewportResize() {
        // 浏览器窗口尺寸变化时重新修正按钮位置
        const container = document.getElementById(PAGE_TOGGLE_CONTAINER_ID);
        if (!(container instanceof HTMLElement)) {
            return;
        }

        if (typeof storedContainerTop === 'number') {
            const clamped = clampContainerTop(container, storedContainerTop);
            storedContainerTop = clamped;
            container.style.top = `${clamped}px`;
            container.style.bottom = 'auto';
        }
    }

    function attachContainerDragHandlers(container) {
        // 仅在首次创建容器时挂载拖动相关事件
        if (!(container instanceof HTMLElement)) {
            return;
        }

        if (container.dataset.tmDragAttached === '1') {
            return;
        }

        container.dataset.tmDragAttached = '1';
        container.addEventListener('pointerdown', handleContainerPointerDown);
        container.addEventListener('pointermove', handleContainerPointerMove);
        container.addEventListener('pointerup', handleContainerPointerUp);
        container.addEventListener('pointercancel', handleContainerPointerCancel);
        container.addEventListener('click', handleContainerClickCapture, true);
    }

    function handleContainerPointerDown(event) {
        // 记录指针初始位置，为拖动做好准备
        if (typeof PointerEvent !== 'undefined' && !(event instanceof PointerEvent)) {
            return;
        }

        if (event.pointerType === 'mouse' && event.button !== 0) {
            return;
        }

        const container = document.getElementById(PAGE_TOGGLE_CONTAINER_ID);
        if (!(container instanceof HTMLElement)) {
            return;
        }

        const rect = container.getBoundingClientRect();
        const initialTop = typeof storedContainerTop === 'number' ? storedContainerTop : rect.top;

        containerDragState = {
            pointerId: event.pointerId,
            startClientY: event.clientY,
            initialTop,
            container,
            isDragging: false,
            originalTransition: container.style.transition,
        };
    }

    function handleContainerPointerMove(event) {
        // 拖动过程中更新按钮展示位置
        if (!containerDragState || event.pointerId !== containerDragState.pointerId) {
            return;
        }

        const deltaY = event.clientY - containerDragState.startClientY;
        if (!containerDragState.isDragging) {
            if (Math.abs(deltaY) < DRAG_ACTIVATION_THRESHOLD_PX) {
                return;
            }

            containerDragState.isDragging = true;
            containerDragState.container.style.transition = 'none';
            containerDragState.container.style.bottom = 'auto';
            const currentRect = containerDragState.container.getBoundingClientRect();
            const currentTop = currentRect.top;
            containerDragState.container.style.top = `${currentTop}px`;
            containerDragState.initialTop = currentTop;
            storedContainerTop = currentTop;
            try {
                containerDragState.container.setPointerCapture(event.pointerId);
            } catch (error) {
                // 某些环境不支持 setPointerCapture，忽略即可
            }
        }

        event.preventDefault();
        const nextTop = clampContainerTop(containerDragState.container, containerDragState.initialTop + deltaY);
        storedContainerTop = nextTop;
        containerDragState.container.style.top = `${nextTop}px`;
    }

    function finishContainerDrag(cancelled) {
        // 在指针结束或被取消时收尾拖动逻辑
        if (!containerDragState) {
            return;
        }

        const { container, pointerId, isDragging, originalTransition } = containerDragState;

        if (typeof originalTransition === 'string') {
            container.style.transition = originalTransition;
        } else {
            container.style.transition = '';
        }

        if (isDragging) {
            const rect = container.getBoundingClientRect();
            const clamped = clampContainerTop(container, rect.top);
            storedContainerTop = clamped;
            container.style.top = `${clamped}px`;
            container.style.bottom = 'auto';

            if (!cancelled) {
                persistContainerTop(clamped);
                suppressClickAfterDrag = true;
            }
        }

        try {
            if (typeof container.hasPointerCapture === 'function' && container.hasPointerCapture(pointerId)) {
                container.releasePointerCapture(pointerId);
            }
        } catch (error) {
            // Safari 等浏览器可能抛出异常，忽略即可
        }

        containerDragState = null;
    }

    function handleContainerPointerUp(event) {
        // 指针抬起时结束拖动
        if (!containerDragState || event.pointerId !== containerDragState.pointerId) {
            return;
        }

        const wasDragging = containerDragState.isDragging;
        finishContainerDrag(false);
        if (wasDragging) {
            event.preventDefault();
        }
    }

    function handleContainerPointerCancel(event) {
        // 指针被取消时归位状态
        if (!containerDragState || event.pointerId !== containerDragState.pointerId) {
            return;
        }

        finishContainerDrag(true);
    }

    function handleContainerClickCapture(event) {
        // 拖动后立即触发的点击需要被抑制，防止误触按钮
        if (!suppressClickAfterDrag) {
            return;
        }

        suppressClickAfterDrag = false;
        event.stopPropagation();
        event.preventDefault();
    }

    function setPageToggleCollapsed(nextState) {
        // 切换隐藏状态并立即刷新界面样式
        pageToggleCollapsed = Boolean(nextState);
        persistCollapseState(pageToggleCollapsed);
        applyCollapseState();
    }

    function handleCollapseToggleClick(event) {
        // 点击隐藏/展开开关时切换主按钮的可见性
        event.preventDefault();
        setPageToggleCollapsed(!pageToggleCollapsed);
    }

    function stylePageToggleContainer(container) {
        // 固定位置的外层容器，负责放置主按钮与隐藏开关
        container.style.position = 'fixed';
        container.style.right = '20px';
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.gap = '8px';
        container.style.zIndex = '9999';
        container.style.transition = 'right 0.2s ease, top 0.2s ease';
        container.style.bottom = `${CONTAINER_VERTICAL_MARGIN}px`;
    }

    function applyAdaptiveGlassSurface(button) {
        // 优先使用 Discourse 原生 CSS 变量自适应浅色/深色主题，保留半透明降级值
        button.style.border = '1px solid var(--primary-low-mid, rgba(148, 163, 184, 0.45))';
        button.style.background = 'rgba(255, 255, 255, 0.72)';
        button.style.background = 'color-mix(in srgb, var(--secondary, #ffffff) 78%, transparent)';
        button.style.backdropFilter = 'blur(20px) saturate(160%)';
        button.style.webkitBackdropFilter = 'blur(20px) saturate(160%)';
        button.style.boxShadow = '0 8px 24px rgba(15, 23, 42, 0.25)';
        button.style.color = 'var(--primary, #0f172a)';
    }

    function styleCollapseToggle(button) {
        // 隐藏/展开的小开关保持与主按钮一致的玻璃风格
        button.style.padding = '10px 14px';
        button.style.borderRadius = '18px';
        applyAdaptiveGlassSurface(button);
        button.style.fontSize = '12px';
        button.style.fontWeight = '600';
        button.style.cursor = 'pointer';
        button.style.display = 'flex';
        button.style.alignItems = 'center';
        button.style.justifyContent = 'center';
        button.style.minWidth = '56px';
        button.style.height = '36px';
        button.style.letterSpacing = '0.4px';
        button.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';
        button.title = '隐藏或展开“展示已加载用户信息”按钮';

        button.addEventListener('mouseenter', () => {
            button.style.transform = 'translateY(-2px)';
            button.style.boxShadow = '0 12px 28px rgba(15, 23, 42, 0.25)';
        });

        button.addEventListener('mouseleave', () => {
            button.style.transform = 'none';
            button.style.boxShadow = '0 8px 24px rgba(15, 23, 42, 0.25)';
        });
    }

    function applyCollapseState() {
        // 根据隐藏状态调整主按钮与开关的位置与文案
        const container = document.getElementById(PAGE_TOGGLE_CONTAINER_ID);
        const mainButton = document.getElementById(PAGE_TOGGLE_ID);
        const collapseToggle = document.getElementById(PAGE_TOGGLE_HIDE_ID);

        if (!(container instanceof HTMLElement) || !(collapseToggle instanceof HTMLButtonElement)) {
            return;
        }

        if (pageToggleCollapsed) {
            if (mainButton instanceof HTMLButtonElement) {
                mainButton.style.display = 'none';
            }
            container.style.right = '-6px';
            container.style.gap = '0';
            collapseToggle.textContent = '展开';
            collapseToggle.setAttribute('aria-label', '展开“展示已加载用户信息”按钮');
            collapseToggle.style.borderRadius = '18px 0 0 18px';
            collapseToggle.style.padding = '10px 18px';
        } else {
            if (mainButton instanceof HTMLButtonElement) {
                mainButton.style.display = 'flex';
            }
            container.style.right = '20px';
            container.style.gap = '8px';
            collapseToggle.textContent = '隐藏';
            collapseToggle.setAttribute('aria-label', '隐藏“展示已加载用户信息”按钮');
            collapseToggle.style.borderRadius = '18px';
            collapseToggle.style.padding = '10px 14px';
        }

        collapseToggle.style.display = 'flex';
    }

    function ensurePageToggle() {
        // 在页面右下角创建玻璃感主按钮及其隐藏开关
        if (!isTopicPage()) {
            removePageToggle();
            return;
        }

        if (!document.body) {
            return;
        }

        let container = document.getElementById(PAGE_TOGGLE_CONTAINER_ID);
        if (!(container instanceof HTMLElement)) {
            container = document.createElement('div');
            container.id = PAGE_TOGGLE_CONTAINER_ID;
            stylePageToggleContainer(container);
            document.body.appendChild(container);
        }

        attachContainerDragHandlers(container);

        let button = document.getElementById(PAGE_TOGGLE_ID);
        if (!(button instanceof HTMLButtonElement)) {
            button = document.createElement('button');
            button.id = PAGE_TOGGLE_ID;
            button.type = 'button';
            stylePageToggle(button);
            button.addEventListener('click', handlePageToggleClick);
            container.appendChild(button);
        } else if (button.parentElement !== container) {
            container.appendChild(button);
        }

        let collapseToggle = document.getElementById(PAGE_TOGGLE_HIDE_ID);
        if (!(collapseToggle instanceof HTMLButtonElement)) {
            collapseToggle = document.createElement('button');
            collapseToggle.id = PAGE_TOGGLE_HIDE_ID;
            collapseToggle.type = 'button';
            styleCollapseToggle(collapseToggle);
            collapseToggle.addEventListener('click', handleCollapseToggleClick);
            container.appendChild(collapseToggle);
        } else if (collapseToggle.parentElement !== container) {
            container.appendChild(collapseToggle);
        }

        updatePageToggle();
        applyStoredContainerPosition(container);
    }

    function removePageToggle() {
        // 在离开帖子详情页时移除容器，避免在其他页面残留
        const container = document.getElementById(PAGE_TOGGLE_CONTAINER_ID);
        if (container) {
            container.remove();
        }
    }

    function stylePageToggle(button) {
        // 主按钮保留玻璃风格外观，布局交由容器负责
        button.style.padding = '12px 18px';
        button.style.borderRadius = '18px';
        applyAdaptiveGlassSurface(button);
        button.style.fontSize = '14px';
        button.style.fontWeight = '600';
        button.style.cursor = 'pointer';
        button.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';
        button.style.letterSpacing = '0.4px';
        button.style.display = 'flex';
        button.style.alignItems = 'center';
        button.style.gap = '8px';
        button.style.flexShrink = '0';
        button.title = '仅针对当前已加载的回复展示用户信息';

        button.addEventListener('mouseenter', () => {
            button.style.transform = 'translateY(-2px)';
            button.style.boxShadow = '0 12px 28px rgba(15, 23, 42, 0.25)';
        });

        button.addEventListener('mouseleave', () => {
            button.style.transform = 'none';
            button.style.boxShadow = '0 8px 24px rgba(15, 23, 42, 0.25)';
        });
    }

    function updatePageToggle() {
        const container = document.getElementById(PAGE_TOGGLE_CONTAINER_ID);
        const button = document.getElementById(PAGE_TOGGLE_ID);
        if (!(container instanceof HTMLElement) || !(button instanceof HTMLButtonElement)) {
            return;
        }

        if (!isTopicPage()) {
            if (container.style.display !== 'none') {
                container.style.display = 'none';
            }
            return;
        }

        if (container.style.display !== 'flex') {
            container.style.display = 'flex';
        }

        const nextText = revealInProgress ? '加载中...' : '展示已加载用户信息';
        const nextDisabled = revealInProgress;
        const nextAriaBusy = revealInProgress ? 'true' : 'false';

        if (button.textContent !== nextText) {
            // 仅在状态改变时更新文案，避免滚动触发的重绘闪烁
            button.textContent = nextText;
        }

        if (button.disabled !== nextDisabled) {
            button.disabled = nextDisabled;
        }

        if (button.getAttribute('aria-busy') !== nextAriaBusy) {
            button.setAttribute('aria-busy', nextAriaBusy);
        }

        applyCollapseState();
    }

    async function handlePageToggleClick(event) {
        event.preventDefault();
        if (revealInProgress) {
            return;
        }

        revealInProgress = true;
        updatePageToggle();

        try {
            await revealVisibleReplies();
        } catch (error) {
            console.debug(`${LOG_PREFIX} 展示用户信息失败：`, error);
        } finally {
            revealInProgress = false;
            updatePageToggle();
        }
    }

    async function revealVisibleReplies() {
        // 依次展示当前已加载的回复用户信息，未命中缓存时节流请求避免触发限流
        const articles = document.querySelectorAll('.topic-post article');

        for (let index = 0; index < articles.length; index += 1) {
            if (!isTopicPage()) {
                break;
            }

            const article = articles[index];
            if (isOriginalArticle(article, index)) {
                continue;
            }

            const anchor = article.querySelector('.names a[data-user-card]');
            if (!(anchor instanceof HTMLElement)) {
                continue;
            }

            const slug = anchor.getAttribute('data-user-card');
            if (!slug) {
                continue;
            }

            const normalizedSlug = slug.trim().toLowerCase();
            if (!normalizedSlug) {
                continue;
            }

            const escapedUser = escapeAttrValue(normalizedSlug);
            const alreadyDisplayed = article.querySelector(
                `.${MARKER_CLASS}[${DATA_ATTR_USER}="${escapedUser}"]`,
            );
            if (alreadyDisplayed) {
                removeInfoButton(anchor, normalizedSlug);
                continue;
            }

            const wasCached = userInfoCache.has(normalizedSlug);
            const success = await loadUserInfoForAnchor(anchor, slug, normalizedSlug);
            if (success) {
                removeInfoButton(anchor, normalizedSlug);
            }

            if (!wasCached && index < articles.length - 1 && isTopicPage()) {
                await delay(BATCH_REQUEST_DELAY_MS);
            }
        }
    }

    async function loadUserInfoForAnchor(anchor, slug, normalizedSlug) {
        const normalized = normalizedSlug || (slug || '').trim().toLowerCase();
        if (!normalized) {
            return false;
        }

        const escapedUser = escapeAttrValue(normalized);
        const article = anchor.closest('.topic-post article');
        if (article && article.querySelector(`.${MARKER_CLASS}[${DATA_ATTR_USER}="${escapedUser}"]`)) {
            return true;
        }

        if (anchor.dataset.tmRegisterDaysLoading === '1') {
            return false;
        }

        anchor.dataset.tmRegisterDaysLoading = '1';
        try {
            const info = await fetchUserInfo(slug);
            if (!info) {
                return false;
            }

            // 异步返回后再次确认 DOM 仍未插入，防止并发渲染重复节点
            if (article && article.querySelector(`.${MARKER_CLASS}[${DATA_ATTR_USER}="${escapedUser}"]`)) {
                return true;
            }

            const infoNode = buildInlineInfoNode(info);
            if (!infoNode) {
                return false;
            }

            anchor.insertAdjacentElement('afterend', infoNode);
            return true;
        } finally {
            delete anchor.dataset.tmRegisterDaysLoading;
        }
    }

    function isOriginalArticle(article, index) {
        const postWrapper = article.closest('.topic-post');
        if (postWrapper) {
            const postNumber = postWrapper.getAttribute('data-post-number');
            if (postNumber !== null && postNumber !== '') {
                return postNumber === '1' || postWrapper.classList.contains('topic-owner');
            }
            if (postWrapper.classList.contains('topic-owner')) {
                return true;
            }
        }
        return index === 0;
    }

    async function enhanceTopicPage() {
        if (!isTopicPage()) {
            removePageToggle();
            return;
        }

        ensurePageToggle();

        document
            .querySelectorAll(`.topic-post .${MARKER_CLASS}`)
            .forEach((node) => {
                if (!node.closest('.names')) {
                    node.remove();
                }
            });

        const articles = document.querySelectorAll('.topic-post article');
        for (let articleIndex = 0; articleIndex < articles.length; articleIndex += 1) {
            if (!isTopicPage()) {
                break;
            }

            const article = articles[articleIndex];
            const anchor = article.querySelector('.names a[data-user-card]');
            if (!(anchor instanceof HTMLElement)) {
                continue;
            }

            const slug = anchor.getAttribute('data-user-card');
            if (!slug) {
                continue;
            }

            const normalizedSlug = slug.trim().toLowerCase();
            if (!normalizedSlug) {
                continue;
            }

            const isOriginalPost = isOriginalArticle(article, articleIndex);
            const escapedUser = escapeAttrValue(normalizedSlug);

            if (article.querySelector(`.${MARKER_CLASS}[${DATA_ATTR_USER}="${escapedUser}"]`)) {
                removeInfoButton(anchor, normalizedSlug);
                continue;
            }

            if (anchor.dataset.tmRegisterDaysLoading === '1') {
                continue;
            }

            if (isOriginalPost || userInfoCache.has(normalizedSlug)) {
                const loaded = await loadUserInfoForAnchor(anchor, slug, normalizedSlug);
                if (loaded) {
                    removeInfoButton(anchor, normalizedSlug);
                } else if (!isOriginalPost) {
                    ensureInfoButton(anchor, normalizedSlug, slug);
                }
                continue;
            }

            ensureInfoButton(anchor, normalizedSlug, slug);
        }
    }

    function ensureInfoButton(anchor, normalizedSlug, rawSlug) {
        // 为回复用户创建按需查询按钮，避免首次就触发接口请求
        const namesContainer = anchor.closest('.names');
        if (!namesContainer) {
            return;
        }

        const escapedUser = escapeAttrValue(normalizedSlug);
        if (namesContainer.querySelector(`.${BUTTON_CLASS}[${DATA_ATTR_USER}="${escapedUser}"]`)) {
            return;
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.className = BUTTON_CLASS;
        button.setAttribute(DATA_ATTR_USER, normalizedSlug);
        button.setAttribute(DATA_ATTR_ORIGINAL_USER, rawSlug);
        button.textContent = '查看用户信息';
        button.style.marginLeft = '6px';
        button.style.fontSize = '12px';
        button.style.color = 'var(--tertiary, #1a4c7c)';
        button.style.cursor = 'pointer';
        button.style.background = 'none';
        button.style.border = 'none';
        button.style.padding = '0';

        button.addEventListener('click', handleInfoButtonClick);
        anchor.insertAdjacentElement('afterend', button);
    }

    function removeInfoButton(anchor, normalizedSlug) {
        // 在信息已展示后移除触发按钮
        const namesContainer = anchor.closest('.names');
        if (!namesContainer) {
            return;
        }

        const escapedUser = escapeAttrValue(normalizedSlug);
        const button = namesContainer.querySelector(`.${BUTTON_CLASS}[${DATA_ATTR_USER}="${escapedUser}"]`);
        if (button) {
            button.remove();
        }
    }

    async function handleInfoButtonClick(event) {
        // 点击按钮时拉取用户数据，并在成功后移除按钮
        const button = event.currentTarget;
        if (!(button instanceof HTMLButtonElement)) {
            return;
        }

        if (button.dataset.tmRegisterDaysLoading === '1') {
            return;
        }

        const rawSlug = button.getAttribute(DATA_ATTR_ORIGINAL_USER);
        const normalizedSlug = button.getAttribute(DATA_ATTR_USER);
        if (!rawSlug || !normalizedSlug) {
            return;
        }

        button.dataset.tmRegisterDaysLoading = '1';
        button.textContent = '加载中...';
        button.disabled = true;

        try {
            const anchor = identifyAnchorForButton(button);
            if (!anchor) {
                button.remove();
                return;
            }

            const loaded = await loadUserInfoForAnchor(anchor, rawSlug, normalizedSlug);
            if (!loaded) {
                button.textContent = '重试';
                button.disabled = false;
                return;
            }

            removeInfoButton(anchor, normalizedSlug);
        } catch (error) {
            console.debug(`${LOG_PREFIX} 按钮查询失败：`, rawSlug, error);
            button.textContent = '重试';
            button.disabled = false;
        } finally {
            delete button.dataset.tmRegisterDaysLoading;
        }
    }

    function identifyAnchorForButton(button) {
        // 通过按钮位置回溯到用户链接，确保信息节点插入位置正确
        const previous = button.previousElementSibling;
        if (previous instanceof HTMLElement && previous.matches('.names a[data-user-card]')) {
            return previous;
        }

        const namesContainer = button.closest('.names');
        if (!namesContainer) {
            return null;
        }

        const anchor = namesContainer.querySelector('a[data-user-card]');
        return anchor instanceof HTMLElement ? anchor : null;
    }

    async function fetchUserInfo(slug) {
        const normalized = (slug || '').trim().toLowerCase();
        if (!normalized) {
            return null;
        }

        if (userInfoCache.has(normalized)) {
            return userInfoCache.get(normalized);
        }

        if (pendingRequests.has(normalized)) {
            return pendingRequests.get(normalized);
        }

        const requestPromise = (async () => {
            const [profileRes, summaryRes] = await Promise.all([
                fetchFirstAvailable(PROFILE_API_BUILDERS, slug),
                fetchFirstAvailable(SUMMARY_API_BUILDERS, slug),
            ]);

            if (profileRes.rateLimited || summaryRes.rateLimited) {
                return null;
            }

            const profileData = profileRes.data;
            const summaryData = summaryRes.data;

            if (!profileData && !summaryData) {
                return null;
            }

            const user = profileData && (profileData.user || profileData);
            const summary = summaryData && (summaryData.user_summary || summaryData.summary || summaryData);

            const createdAt = pickCreatedAt(user) || (summary && pickCreatedAt(summary));
            if (!createdAt) {
                return null;
            }

            const topicCount = pickFirstNumber(
                user && (user.topic_count ?? user.topicCount),
                summary && (summary.topic_count ?? summary.topics_count),
            );

            const totalPostCount = pickFirstNumber(
                user && (user.post_count ?? user.postCount),
                summary && (summary.post_count ?? summary.posts_count),
            );

            let repliesCount = pickFirstNumber(
                summary && (summary.replies_count ?? summary.reply_count),
            );
            if (repliesCount === null && totalPostCount !== null && topicCount !== null) {
                repliesCount = Math.max(0, totalPostCount - topicCount);
            }

            const trustLevelRaw = pickFirstValue(
                user && (user.trust_level ?? user.trustLevel),
                summary && (summary.trust_level ?? summary.trustLevel),
            );
            const trustLevel = normalizeTrustLevel(trustLevelRaw);

            return {
                slug: normalized,
                createdAt,
                days: calcDays(createdAt),
                topicCount: isNumber(topicCount) ? topicCount : undefined,
                repliesCount: isNumber(repliesCount) ? repliesCount : undefined,
                trustLevel,
            };
        })();

        pendingRequests.set(normalized, requestPromise);

        try {
            const info = await requestPromise;
            if (info) {
                userInfoCache.set(normalized, info);
            }
            return info;
        } finally {
            pendingRequests.delete(normalized);
        }
    }

    async function fetchFirstAvailable(builders, slug) {
        // 按顺序尝试候选接口，遇到 429 限流或拿到可用结果立即停止
        for (const builder of builders) {
            const url = builder(slug);
            const result = await safeFetchJson(url);
            if (result.rateLimited) {
                return { data: null, rateLimited: true };
            }
            if (result.ok && result.data) {
                return { data: result.data, rateLimited: false };
            }
        }
        return { data: null, rateLimited: false };
    }

    async function safeFetchJson(url) {
        try {
            const response = await fetch(url, { credentials: 'include' });
            if (response.status === 429) {
                return { ok: false, status: 429, rateLimited: true, data: null };
            }
            if (!response.ok) {
                return { ok: false, status: response.status, rateLimited: false, data: null };
            }
            const data = await response.json();
            return { ok: true, status: response.status, rateLimited: false, data };
        } catch (error) {
            console.debug(`${LOG_PREFIX} 请求失败：`, url, error);
            return { ok: false, status: 0, rateLimited: false, data: null };
        }
    }

    function pickFirstNumber(...values) {
        for (const value of values) {
            if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
                continue;
            }
            const numberValue = Number(value);
            if (Number.isFinite(numberValue)) {
                return numberValue;
            }
        }
        return null;
    }

    function pickFirstValue(...values) {
        for (const value of values) {
            if (value !== undefined && value !== null) {
                return value;
            }
        }
        return null;
    }

    function normalizeTrustLevel(raw) {
        if (raw === undefined || raw === null || raw === '' || typeof raw === 'boolean') {
            return undefined;
        }

        if (typeof raw === 'number' && Number.isFinite(raw)) {
            return raw;
        }

        if (typeof raw === 'string') {
            const trimmed = raw.trim();
            if (!trimmed) {
                return undefined;
            }
            const alias = TRUST_LEVEL_ALIAS[trimmed.toLowerCase()];
            if (alias !== undefined) {
                return alias;
            }
            const numeric = Number(trimmed);
            if (Number.isFinite(numeric)) {
                return numeric;
            }
        }

        return undefined;
    }

    function pickCreatedAt(source) {
        if (!source) {
            return null;
        }
        return (
            source.created_at ||
            source.createdAt ||
            source.registration_date ||
            source.registrationDate ||
            source.joined ||
            source.joinedAt ||
            null
        );
    }

    function calcDays(createdAt) {
        const createdTime = new Date(createdAt).getTime();
        if (Number.isNaN(createdTime)) {
            return 0;
        }

        const diff = Date.now() - createdTime;
        return Math.max(0, Math.floor(diff / DAY_IN_MS));
    }

    function buildInlineInfoNode(profileInfo) {
        const segments = [`注册 ${formatNumber(profileInfo.days)} 天`];

        if (isNumber(profileInfo.topicCount)) {
            segments.push(`发帖 ${formatNumber(profileInfo.topicCount)}`);
        }

        if (isNumber(profileInfo.repliesCount)) {
            segments.push(`回帖 ${formatNumber(profileInfo.repliesCount)}`);
        }

        if (isNumber(profileInfo.trustLevel)) {
            const label = TRUST_LEVEL_LABELS[profileInfo.trustLevel];
            segments.push(label || `信任级别 Lv${profileInfo.trustLevel}`);
        }

        if (!segments.length) {
            return null;
        }

        const span = document.createElement('span');
        span.className = MARKER_CLASS;
        span.setAttribute(DATA_ATTR_USER, profileInfo.slug);
        span.textContent = ` · ${segments.join(' · ')}`;
        span.style.marginLeft = '6px';
        span.style.fontSize = '12px';
        span.style.color = 'var(--tertiary, #1a4c7c)';
        return span;
    }

    function isNumber(value) {
        return typeof value === 'number' && Number.isFinite(value);
    }

    function formatNumber(value) {
        return Number(value).toLocaleString('zh-CN');
    }

    function startObserver() {
        if (!observerStarted && document.body) {
            observerStarted = true;
            globalObserver.observe(document.body, { childList: true, subtree: true });
        }
    }

    window.addEventListener('resize', handleViewportResize);
    window.addEventListener('popstate', scheduleEnhance);
    window.addEventListener('hashchange', scheduleEnhance);

    scheduleEnhance();
    startObserver();

    document.addEventListener('readystatechange', () => {
        if (document.readyState === 'interactive' || document.readyState === 'complete') {
            startObserver();
            scheduleEnhance();
        }
    });

    window.__tmDiscourseUserInfoCache = {
        cache: userInfoCache,
        pending: pendingRequests,
    };
})();
