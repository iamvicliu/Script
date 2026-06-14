// ==UserScript==
// @name         购买填单自动选择助手
// @namespace    local.codex.order-form-helper
// @version      0.1.0
// @description  自动勾选买家购买协议、选择不购买安全服务，并在提醒弹窗中选择暂不购买。
// @author       Codex
// @match        https://trade.7881.com/trade-*.html*
// @include      https://trade.7881.com/trade-*.html*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const AGREEMENT_KEY = 'codex_order_helper_agreement_signature_v1';
    const RUN_INTERVAL_MS = 600;
    const MAX_RUNS = 40;

    let runs = 0;
    let noBuyClicked = false;
    let dialogNoBuyClicked = false;
    let observerStarted = false;

    const normalize = (text) => (text || '').replace(/\s+/g, '').trim();

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

    function run() {
        if (!pageLooksLikeOrderForm()) return;
        setAgreementChecked();
        clickNoBuyCard();
        clickDialogTemporaryNoBuy();
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
