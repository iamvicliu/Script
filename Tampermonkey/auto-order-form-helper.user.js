// ==UserScript==
// @name         7881购买填单自动选择助手
// @namespace    local.codex.order-form-helper
// @version      0.3.0
// @description  自动勾选买家购买协议、选择不购买安全服务、确认暂不购买提醒，并按设置自动下单或支付。
// @author       Codex
// @match        https://trade.7881.com/trade-*.html*
// @match        https://www.7881.com/payment/toPayout.action*
// @include      https://trade.7881.com/trade-*.html*
// @include      https://www.7881.com/payment/toPayout.action*
// @updateURL    https://github.com/iamvicliu/Script/raw/refs/heads/main/Tampermonkey/auto-order-form-helper.user.js
// @downloadURL  https://github.com/iamvicliu/Script/raw/refs/heads/main/Tampermonkey/auto-order-form-helper.user.js
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
    'use strict';

    const AGREEMENT_KEY = 'codex_order_helper_agreement_signature_v1';
    const AUTO_ORDER_KEY = 'codex_order_helper_auto_order_enabled_v1';
    const AUTO_PAY_KEY = 'codex_order_helper_auto_pay_enabled_v1';
    const RUN_INTERVAL_MS = 600;
    const MAX_RUNS = 40;
    const DRY_RUN_PAY = Boolean(window.__ORDER_HELPER_DRY_RUN_PAY__);

    let runs = 0;
    let noBuyClicked = false;
    let dialogNoBuyClicked = false;
    let payClicked = false;
    let payoutClicked = false;
    let observerStarted = false;

    const normalize = (text) => (text || '').replace(/\s+/g, '').trim();
    const gmGetValue = typeof GM_getValue === 'function' ? GM_getValue : null;
    const gmSetValue = typeof GM_setValue === 'function' ? GM_setValue : null;
    const gmRegisterMenuCommand = typeof GM_registerMenuCommand === 'function' ? GM_registerMenuCommand : null;

    function getSetting(key, defaultValue) {
        if (gmGetValue) {
            const value = gmGetValue(key, defaultValue);
            return typeof value === 'boolean' ? value : defaultValue;
        }

        const raw = localStorage.getItem(key);
        return raw === null ? defaultValue : raw === 'true';
    }

    function setSetting(key, value) {
        if (gmSetValue) {
            gmSetValue(key, value);
            return;
        }

        localStorage.setItem(key, String(value));
    }

    function toggleSetting(key, label, currentValue) {
        const nextValue = !currentValue;
        setSetting(key, nextValue);
        console.info(`[购买填单助手] ${label}已${nextValue ? '开启' : '关闭'}，刷新页面后菜单文案会更新。`);
    }

    const autoOrderEnabled = getSetting(AUTO_ORDER_KEY, true);
    const autoPayEnabled = getSetting(AUTO_PAY_KEY, false);

    if (gmRegisterMenuCommand) {
        gmRegisterMenuCommand(`${autoOrderEnabled ? '关闭' : '开启'}自动下单`, () => {
            toggleSetting(AUTO_ORDER_KEY, '自动下单', autoOrderEnabled);
        });
        gmRegisterMenuCommand(`${autoPayEnabled ? '关闭' : '开启'}自动支付`, () => {
            toggleSetting(AUTO_PAY_KEY, '自动支付', autoPayEnabled);
        });
    }

    function visible(el) {
        if (!el || !(el instanceof Element)) return false;
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    }

    function pageLooksLikeOrderForm() {
        const text = normalize(document.body && document.body.innerText);
        return text.includes('确认购买信息')
            && text.includes('填写下单信息')
            && text.includes('买家购买协议')
            && text.includes('安全服务');
    }

    function pageLooksLikePayout() {
        const text = normalize(document.body && document.body.innerText);
        return text.includes('收银台')
            && text.includes('立即支付')
            && text.includes('实付金额');
    }

    function dispatchInputEvents(el) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function findAgreementLink() {
        return Array.from(document.querySelectorAll('a'))
            .find((a) => normalize(a.innerText).includes('买家购买协议'));
    }

    function getAgreementSignature() {
        const link = findAgreementLink();
        if (link) {
            return `${normalize(link.innerText)}|${new URL(link.getAttribute('href') || '', location.href).href}`;
        }

        const text = normalize(document.body && document.body.innerText);
        const idx = text.indexOf('买家购买协议');
        return idx >= 0 ? text.slice(Math.max(0, idx - 30), idx + 80) : '';
    }

    function findAgreementCheckbox() {
        const direct = document.querySelector('#agreement');
        if (direct && direct.matches('input[type="checkbox"]')) return direct;

        const candidates = Array.from(document.querySelectorAll('input[type="checkbox"]'));
        return candidates.find((checkbox) => {
            const label = checkbox.closest('label');
            const parent = checkbox.parentElement;
            const block = checkbox.closest('div, p, span, li, section');
            const nearbyText = normalize([
                label && label.innerText,
                parent && parent.innerText,
                block && block.innerText,
                checkbox.nextSibling && checkbox.nextSibling.textContent,
            ].filter(Boolean).join(' '));
            return nearbyText.includes('我已阅读并同意') || nearbyText.includes('买家购买协议');
        });
    }

    function setAgreementChecked() {
        const checkbox = findAgreementCheckbox();
        if (!checkbox) return;

        const signature = getAgreementSignature();
        const savedSignature = localStorage.getItem(AGREEMENT_KEY);

        checkbox.addEventListener('change', () => {
            if (checkbox.checked && signature) {
                localStorage.setItem(AGREEMENT_KEY, signature);
            }
        }, { once: true });

        if (savedSignature && signature && savedSignature !== signature) {
            if (checkbox.checked) {
                checkbox.checked = false;
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            }
            console.warn('[购买填单助手] 买家购买协议疑似变更，已停止自动勾选。请阅读后手动勾选。');
            return;
        }

        if (!savedSignature && signature) {
            localStorage.setItem(AGREEMENT_KEY, signature);
        }

        if (!checkbox.checked) {
            checkbox.click();
            if (!checkbox.checked) {
                checkbox.checked = true;
                dispatchInputEvents(checkbox);
            }
        }
    }

    function clickableTextCandidates(text) {
        const normalizedTarget = normalize(text);
        return Array.from(document.querySelectorAll('button, a, input, label, div, span, p'))
            .filter(visible)
            .filter((el) => {
                const valueText = el instanceof HTMLInputElement ? el.value : '';
                const elText = normalize(`${el.innerText || ''}${valueText}`);
                return elText === normalizedTarget || elText.includes(normalizedTarget);
            });
    }

    function clickNoBuyCard() {
        if (noBuyClicked) return;

        const target = document.querySelector('.safe-item[extend-id="0"], .safe-item[axg-rule-id="0"]')
            || clickableTextCandidates('不购买')
                .filter((el) => !normalize(el.innerText || el.value).includes('暂不购买'))
                .map((el) => el.closest('.safe-item') || el)
                .find((el) => {
                    const blockText = normalize(el.innerText || el.value);
                    return blockText.includes('不购买') && blockText.includes('无法获得赔付');
                });
        if (!target) return;

        target.click();
        noBuyClicked = true;
    }

    function findNoBuyCard() {
        return document.querySelector('.safe-item[extend-id="0"], .safe-item[axg-rule-id="0"]');
    }

    function noBuyLooksSelected() {
        const card = findNoBuyCard();
        if (!card) return noBuyClicked;

        const className = String(card.className || '');
        if (/(active|select|selected|checked|cur)/i.test(className)) return true;

        const rect = card.getBoundingClientRect();
        const cornerX = Math.max(0, rect.right - 10);
        const cornerY = Math.max(0, rect.bottom - 10);
        const cornerEl = document.elementFromPoint(cornerX, cornerY);
        return noBuyClicked || Boolean(cornerEl && card.contains(cornerEl));
    }

    function blockingDialogVisible() {
        return Array.from(document.querySelectorAll('.wxts05, .layui-layer, .prevent-fraud-pop'))
            .some((el) => visible(el) && /安心购|暂不购买|温馨提示|不再提示/.test(normalize(el.innerText)));
    }

    function clickDialogTemporaryNoBuy() {
        if (dialogNoBuyClicked) return;

        const target = Array.from(document.querySelectorAll('.wxts05 .clepub, .layui-layer .clepub'))
            .find(visible)
            || clickableTextCandidates('暂不购买')
            .find((el) => {
                const rect = el.getBoundingClientRect();
                return rect.top > 0 && rect.left > 0;
            });

        if (!target) return;

        target.click();
        dialogNoBuyClicked = true;
    }

    function clickPayButton() {
        if (payClicked || blockingDialogVisible()) return;
        if (!autoOrderEnabled) return;

        const agreement = findAgreementCheckbox();
        if (!agreement || !agreement.checked || !noBuyLooksSelected()) return;

        const target = document.querySelector('#enable_pay.topaybtn, #enable_pay, .topaybtn')
            || clickableTextCandidates('去支付')
                .find((el) => normalize(el.innerText || el.value).includes('去支付'));
        if (!target || !visible(target)) return;

        payClicked = true;
        if (DRY_RUN_PAY) {
            target.setAttribute('data-order-helper-would-click-pay', 'true');
            console.info('[购买填单助手] dry-run: would click 去支付');
            return;
        }

        target.click();
    }

    function clickFinalPayoutButton() {
        if (payoutClicked) return;
        if (!autoPayEnabled) return;
        if (!pageLooksLikePayout()) return;

        const target = document.querySelector('a.submita, .paysubmit .submita')
            || clickableTextCandidates('立即支付')
                .find((el) => normalize(el.innerText || el.value).includes('立即支付'));
        if (!target || !visible(target)) return;

        payoutClicked = true;
        if (DRY_RUN_PAY) {
            target.setAttribute('data-order-helper-would-click-final-pay', 'true');
            console.info('[购买填单助手] dry-run: would click 立即支付');
            return;
        }

        target.click();
    }

    function runOrderForm() {
        if (!pageLooksLikeOrderForm()) return;
        setAgreementChecked();
        clickNoBuyCard();
        clickDialogTemporaryNoBuy();
        clickPayButton();
    }

    function run() {
        runOrderForm();
        clickFinalPayoutButton();
    }

    function startObserver() {
        if (observerStarted || !document.body) return;
        observerStarted = true;
        new MutationObserver(() => run()).observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
        });
    }

    const timer = setInterval(() => {
        runs += 1;
        run();
        startObserver();
        if (runs >= MAX_RUNS) clearInterval(timer);
    }, RUN_INTERVAL_MS);
})();
