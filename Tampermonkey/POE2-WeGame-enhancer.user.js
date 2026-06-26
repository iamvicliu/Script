// ==UserScript==
// @name         POE2 WeGame增强
// @namespace    local.codex.wegame.poe2
// @version      0.1.1
// @updated      2026-06-27 05:42:11
// @description  在 WeGame 流放之路2 BD 分享页底部展示可复制的文字版技能信息
// @author       维克牛
// @license      MIT
// @match        https://www.wegame.com.cn/helper/poe2/*
// @run-at       document-idle
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
  "use strict";

  const API_BASE = "https://www.wegame.com.cn/api/v1/wegame.pallas.poe2.Profile";
  const PANEL_ID = "codex-poe2-skill-text-panel";
  const STYLE_ID = "codex-poe2-skill-text-style";
  const SCRIPT_UPDATED_AT = "2026-06-27 05:42:11";

  let lastShareCode = "";
  let lastText = "";
  let lastRows = [];
  let mountWatcherStarted = false;
  let currentFilter = "all";
  let currentSort = "original";

  function cleanText(value) {
    return String(value ?? "")
      .replace(/\[([^|\]]+)\|([^\]]+)\]/g, "$2")
      .replace(/\s+/g, " ")
      .trim();
  }

  function extractShareCode() {
    const href = location.href;
    if (href.includes("#/share/")) {
      return href.split("#/share/")[1].split("?")[0].split("&")[0].replace(/^\/+|\/+$/g, "");
    }
    const hash = location.hash || "";
    if (hash.startsWith("#/share/")) {
      return hash.slice("#/share/".length).split("?")[0].replace(/^\/+|\/+$/g, "");
    }
    return "";
  }

  function roleBody(shareCode, role) {
    const r = role || {};
    return {
      area: r.area || 0,
      openid: r.openid || "",
      role_id: String(r.role_id || ""),
      share_code: shareCode,
      from_src: "poe2_helper",
    };
  }

  async function postJson(endpoint, body) {
    const response = await fetch(`${API_BASE}/${endpoint}`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`${endpoint} HTTP ${response.status}`);
    }
    return response.json();
  }

  function propValue(item, names) {
    const wanted = new Set(names);
    for (const prop of item?.properties || []) {
      if (!wanted.has(cleanText(prop.name))) continue;
      const first = prop.values?.[0]?.[0];
      return cleanText(first);
    }
    return "";
  }

  function gemName(item) {
    return cleanText(item?.typeLine || item?.baseType || item?.name || "");
  }

  function formatQuality(value) {
    const text = cleanText(value).replace(/^Q/i, "").replace(/^\+/, "").replace(/%$/, "");
    if (!text || text === "-") return "+ 0%";
    return `+ ${text}%`;
  }

  function formatLevel(value) {
    const text = cleanText(value);
    if (!text || text === "-") return "-";
    if (text.includes("最高等级")) return text;
    const match = text.match(/\d+/);
    if (match && Number(match[0]) >= 20) return `${text}(最高等级)`;
    return text;
  }

  function isSupport(item) {
    return Boolean(item?.support) || item?.frameTypeId === "SupportGem";
  }

  function skillType(skill, tags) {
    const inventoryId = cleanText(skill?.inventoryId || "");
    if (inventoryId && !["SkillSlots", "AscendancySkills"].includes(inventoryId)) {
      return { label: "装备赋予", className: "codex-type-granted" };
    }
    if (/\b(Persistent|Aura|Herald)\b|永久性|光环|捷/.test(tags)) {
      return { label: "精魂技能", className: "codex-type-spirit" };
    }
    return { label: "主动技能", className: "codex-type-active" };
  }

  function formatSkill(skill, index) {
    const name = gemName(skill) || `技能${index + 1}`;
    const level = propValue(skill, ["等级"]) || "-";
    const quality = propValue(skill, ["品质"]) || "-";
    const sockets = Array.isArray(skill.gemSockets) ? skill.gemSockets.length : "";
    const tags = cleanText(skill.properties?.[0]?.name || "");
    const type = skillType(skill, tags);

    const supports = [];
    const nestedActives = [];
    for (const child of skill.socketedItems || []) {
      const childName = gemName(child);
      if (!childName) continue;
      if (isSupport(child)) {
        const childLevel = propValue(child, ["等级"]);
        const childQuality = propValue(child, ["品质"]);
        const suffix = [
          childLevel ? `Lv${formatLevel(childLevel)}` : "",
          childQuality && childQuality !== "-" ? `Q${formatQuality(childQuality)}` : "",
        ].filter(Boolean).join(" ");
        supports.push({
          name: childName,
          level: childLevel ? formatLevel(childLevel) : "-",
          quality: childQuality && childQuality !== "-" ? formatQuality(childQuality) : "+ 0%",
          text: suffix ? `${childName}(${suffix})` : childName,
        });
      } else {
        const childLevel = propValue(child, ["等级"]);
        const childQuality = propValue(child, ["品质"]);
        const childSockets = Array.isArray(child.gemSockets) ? child.gemSockets.length : "";
        nestedActives.push(
          `${childName}${childLevel ? ` Lv${formatLevel(childLevel)}` : ""}${childQuality ? ` Q${formatQuality(childQuality)}` : ""}${childSockets ? ` ${childSockets}孔` : ""}`
        );
      }
    }

    const displayLevel = formatLevel(level);
    const lines = [];
    lines.push(`${index + 1}. ${name} | Lv${displayLevel} | Q${formatQuality(quality)} | ${sockets || "-"}孔`);
    lines.push(`   类型: ${type.label}`);
    if (tags) lines.push(`   标签: ${tags}`);
    lines.push(`   辅助: ${supports.length ? supports.map((support) => support.text).join(" / ") : "-"}`);
    if (nestedActives.length) lines.push(`   嵌套主动: ${nestedActives.join(" / ")}`);
    return {
      name,
      originalIndex: index,
      level: displayLevel,
      quality: formatQuality(quality),
      sockets: sockets || "-",
      tags,
      skillType: type.label,
      skillTypeClass: type.className,
      supports,
      nestedActives,
      text: lines.join("\n"),
    };
  }

  function formatSkills(payload, role) {
    const skills = payload?.skills || [];
    const roleTitle = [
      cleanText(role?.name),
      role?.level ? `Lv${role.level}` : "",
      cleanText(role?.class_name || role?.class),
    ].filter(Boolean).join(" ");

    const lines = [];
    lines.push("WeGame POE2 BD 技能信息");
    if (roleTitle) lines.push(`角色: ${roleTitle}`);
    lines.push(`链接: ${location.href}`);
    lines.push(`生成时间: ${new Date().toLocaleString()}`);
    lines.push("");

    if (!skills.length) {
      lines.push("未读取到接口技能数据。");
      return { text: lines.join("\n"), rows: [] };
    }

    const rows = [];
    skills.forEach((skill, index) => {
      const row = formatSkill(skill, index);
      rows.push(row);
      lines.push(row.text);
      lines.push("");
    });
    return { text: lines.join("\n").trim(), rows };
  }

  function domFallbackText() {
    const pageText = document.body?.innerText || "";
    const marker = pageText.indexOf("技能");
    if (marker < 0) return "";
    const text = pageText.slice(marker).trim();
    const stopMarkers = ["天赋", "装备", "珠宝", "属性"];
    let end = text.length;
    for (const markerText of stopMarkers) {
      const idx = text.indexOf(`\n${markerText}\n`, 10);
      if (idx > 0) end = Math.min(end, idx);
    }
    return text.slice(0, end).trim();
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID} {
        box-sizing: border-box;
        display: block !important;
        width: min(900px, 100%);
        max-width: 100%;
        height: auto !important;
        min-height: 0 !important;
        margin: 18px 0 0;
        padding: 0 !important;
        overflow: visible !important;
        background: transparent !important;
        color: #c8d2dc;
        font-family: "Microsoft YaHei UI", "Microsoft YaHei", sans-serif;
        -webkit-user-select: text !important;
        user-select: text !important;
      }
      #${PANEL_ID} *,
      #${PANEL_ID} .codex-skill-body,
      #${PANEL_ID} .codex-skill-card,
      #${PANEL_ID} .codex-skill-line,
      #${PANEL_ID} .codex-skill-name,
      #${PANEL_ID} .codex-skill-meta {
        -webkit-user-select: text !important;
        user-select: text !important;
      }
      #${PANEL_ID}.codex-body-mounted {
        width: min(820px, calc(100vw - 760px));
        min-width: 640px;
        margin: 18px 0 56px max(260px, calc((100vw - 1280px) / 2));
      }
      #${PANEL_ID}.codex-skill-panel-mounted {
        position: relative !important;
        z-index: 1;
        width: 986px;
        max-width: 100%;
        margin: 18px 0 0 77px;
        padding: 0 !important;
        color: #b9aa88;
      }
      #${PANEL_ID} .codex-skill-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 54px;
        padding: 0 24px;
        background: #202c37;
        color: #aebcca;
        border-radius: 2px 2px 0 0;
      }
      #${PANEL_ID} .codex-skill-title {
        font-size: 20px;
        font-weight: 400;
        letter-spacing: 0;
      }
      #${PANEL_ID} .codex-skill-updated {
        margin-left: 10px;
        color: rgba(169, 157, 125, 0.72);
        font-size: 12px;
        font-weight: 400;
      }
      #${PANEL_ID} .codex-skill-actions {
        display: flex;
        gap: 8px;
      }
      #${PANEL_ID} button {
        -webkit-user-select: none !important;
        user-select: none !important;
        cursor: pointer;
        border: 1px solid rgba(159, 179, 198, 0.22);
        border-radius: 3px;
        background: #263543;
        color: #c8d2dc;
        padding: 5px 10px;
        font-size: 13px;
      }
      #${PANEL_ID} button:hover {
        background: #304252;
      }
      #${PANEL_ID} button.codex-active-control {
        border-color: currentColor;
        color: #f0d99a;
        background: rgba(150, 127, 82, 0.18);
      }
      #${PANEL_ID} .codex-skill-controls {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: start;
        gap: 8px 18px;
        padding: 10px 16px;
        border: 1px solid rgba(150, 127, 82, 0.35);
        border-top: 0;
        background: rgba(10, 10, 9, 0.84);
      }
      #${PANEL_ID} .codex-skill-summary {
        color: #d4c79d;
        font-size: 13px;
        line-height: 1.6;
      }
      #${PANEL_ID} .codex-skill-summary {
        grid-column: 1 / -1;
      }
      #${PANEL_ID} .codex-control-group {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
      }
      #${PANEL_ID} .codex-control-group.codex-sort-group {
        justify-content: flex-end;
      }
      #${PANEL_ID} .codex-control-label {
        color: #8f846a;
        font-size: 12px;
      }
      #${PANEL_ID} .codex-control-group button {
        padding: 3px 8px;
        font-size: 12px;
      }
      #${PANEL_ID} .codex-skill-body {
        box-sizing: border-box;
        padding: 16px 24px 18px;
        background: #1b2630;
        max-height: none;
        overflow: visible;
      }
      #${PANEL_ID} .codex-skill-card {
        box-sizing: border-box;
        width: 100%;
        margin: 0 0 10px;
        padding: 11px 16px 10px;
        border-radius: 4px;
        background: #24313d;
        color: #d9e1e8;
      }
      #${PANEL_ID} .codex-skill-top {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 16px;
        margin-bottom: 4px;
      }
      #${PANEL_ID} .codex-skill-name {
        font-size: 16px;
        font-weight: 600;
        color: #e0e7ed;
      }
      #${PANEL_ID} .codex-skill-name-row {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        flex-wrap: wrap;
      }
      #${PANEL_ID} .codex-skill-type {
        flex: none;
        border: 1px solid currentColor;
        border-radius: 2px;
        padding: 1px 6px;
        font-size: 12px;
        line-height: 1.4;
        color: #c8d2dc;
        background: rgba(255, 255, 255, 0.04);
      }
      #${PANEL_ID} .codex-skill-type.codex-type-active {
        color: #d9b35f;
      }
      #${PANEL_ID} .codex-skill-type.codex-type-spirit {
        color: #75c58e;
      }
      #${PANEL_ID} .codex-skill-type.codex-type-granted {
        color: #72a8df;
      }
      #${PANEL_ID} .codex-skill-meta {
        flex: none;
        color: #aab7c4;
        font-size: 13px;
        padding: 1px 8px;
        border: 1px solid rgba(159, 179, 198, 0.14);
        background: rgba(255, 255, 255, 0.035);
      }
      #${PANEL_ID} .codex-skill-line {
        margin-top: 4px;
        color: #c7d1dc;
        font-size: 13px;
        line-height: 1.45;
        word-break: break-word;
      }
      #${PANEL_ID} .codex-skill-label {
        color: #91a1b0;
        margin-right: 6px;
      }
      #${PANEL_ID} .codex-support-table {
        width: 100%;
        margin-top: 8px;
        border-collapse: collapse;
        table-layout: fixed;
        color: #c7d1dc;
        font-size: 13px;
      }
      #${PANEL_ID} .codex-support-table th,
      #${PANEL_ID} .codex-support-table td {
        border: 1px solid rgba(159, 179, 198, 0.16);
        padding: 5px 8px;
        text-align: left;
        vertical-align: middle;
        word-break: break-word;
      }
      #${PANEL_ID} .codex-support-table th {
        color: #91a1b0;
        font-weight: 400;
        background: rgba(255, 255, 255, 0.035);
      }
      #${PANEL_ID} .codex-support-index {
        width: 46px;
        text-align: center !important;
      }
      #${PANEL_ID} .codex-support-level,
      #${PANEL_ID} .codex-support-quality {
        width: 120px;
      }
      #${PANEL_ID} pre.codex-skill-plain {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font: 13px/1.55 ui-monospace, SFMono-Regular, Consolas, "Microsoft YaHei UI", monospace;
        color: #d9e4ef;
      }
      #${PANEL_ID} .codex-skill-status {
        box-sizing: border-box;
        display: none;
        padding: 0;
        color: #9fb3c6;
        font: 12px/1.4 "Microsoft YaHei UI", sans-serif;
      }
      #${PANEL_ID}.codex-skill-panel-mounted .codex-skill-header {
        min-height: 44px;
        padding: 0 16px;
        background: rgba(19, 20, 19, 0.88);
        border: 1px solid rgba(150, 127, 82, 0.35);
        border-bottom: 0;
        border-radius: 0;
        color: #b9aa88;
      }
      #${PANEL_ID}.codex-skill-panel-mounted .codex-skill-title {
        font-size: 18px;
        color: #b9aa88;
      }
      #${PANEL_ID}.codex-skill-panel-mounted button {
        border-color: rgba(150, 127, 82, 0.4);
        background: rgba(32, 30, 24, 0.9);
        color: #b9aa88;
        padding: 3px 9px;
      }
      #${PANEL_ID}.codex-skill-panel-mounted button:hover {
        background: rgba(46, 41, 30, 0.95);
      }
      #${PANEL_ID}.codex-skill-panel-mounted .codex-skill-body {
        padding: 10px 12px 2px;
        background: rgba(8, 9, 9, 0.78);
        border: 1px solid rgba(150, 127, 82, 0.35);
        border-top: 0;
        max-height: none;
        overflow: visible;
      }
      #${PANEL_ID}.codex-skill-panel-mounted .codex-skill-card {
        margin-bottom: 8px;
        padding: 9px 12px 8px;
        border: 1px solid rgba(150, 127, 82, 0.22);
        border-radius: 0;
        background: rgba(26, 26, 22, 0.82);
        color: #b9aa88;
      }
      #${PANEL_ID}.codex-skill-panel-mounted .codex-skill-card.codex-type-active {
        border-left: 4px solid #d9b35f;
      }
      #${PANEL_ID}.codex-skill-panel-mounted .codex-skill-card.codex-type-spirit {
        border-left: 4px solid #75c58e;
      }
      #${PANEL_ID}.codex-skill-panel-mounted .codex-skill-card.codex-type-granted {
        border-left: 4px solid #72a8df;
      }
      #${PANEL_ID}.codex-skill-panel-mounted .codex-skill-name {
        color: #d4c79d;
        font-size: 15px;
      }
      #${PANEL_ID}.codex-skill-panel-mounted .codex-skill-meta {
        border-color: rgba(150, 127, 82, 0.24);
        background: rgba(150, 127, 82, 0.06);
      }
      #${PANEL_ID}.codex-skill-panel-mounted .codex-support-table {
        color: #a99d7d;
      }
      #${PANEL_ID}.codex-skill-panel-mounted .codex-support-table th,
      #${PANEL_ID}.codex-skill-panel-mounted .codex-support-table td {
        border-color: rgba(150, 127, 82, 0.28);
      }
      #${PANEL_ID}.codex-skill-panel-mounted .codex-support-table th {
        color: #d4c79d;
        background: rgba(150, 127, 82, 0.08);
      }
      #${PANEL_ID}.codex-skill-panel-mounted .codex-skill-meta,
      #${PANEL_ID}.codex-skill-panel-mounted .codex-skill-line,
      #${PANEL_ID}.codex-skill-panel-mounted .codex-skill-label,
      #${PANEL_ID}.codex-skill-panel-mounted .codex-skill-status {
        color: #a99d7d;
      }
      #${PANEL_ID}.codex-skill-panel-mounted .codex-skill-status {
        display: none;
        padding: 0;
        background: rgba(8, 9, 9, 0.78);
      }
    `;
    document.head.appendChild(style);
  }

  function findInlineMountPoint() {
    const skillPanel = document.querySelector(".skill-panel");
    if (skillPanel?.parentElement) return skillPanel;

    const skillContent = document.querySelector(".skill-panel .skill-content, .skill-content");
    if (skillContent) return skillContent;

    const bdSkillBlock = [...document.querySelectorAll(".bd-content-inner, .skill-panel, .bd-section")]
      .find((element) => /(等级|最高等级|技能DPS|技能)/.test(element.innerText || ""));
    if (bdSkillBlock) return bdSkillBlock;

    return document.body;
  }

  function mountPanel(panel) {
    const mount = findInlineMountPoint();
    const isSkillPanelMount = Boolean(mount?.classList?.contains("skill-panel"));
    panel.classList.toggle("codex-skill-panel-mounted", isSkillPanelMount);
    if (!mount || mount === document.body) {
      panel.classList.remove("codex-skill-panel-mounted");
      panel.classList.add("codex-body-mounted");
      document.body.appendChild(panel);
      return;
    }
    panel.classList.remove("codex-body-mounted");
    if (isSkillPanelMount) {
      if (panel.previousElementSibling === mount) return;
      mount.insertAdjacentElement("afterend", panel);
      return;
    }
    if (panel.parentElement === mount && panel === mount.lastElementChild) return;
    mount.appendChild(panel);
  }

  function expandSkillHost(panel) {
    const skillPanel = document.querySelector(".skill-panel");
    if (!panel || !skillPanel || panel.previousElementSibling !== skillPanel) return;

    const hosts = [
      skillPanel.parentElement,
      skillPanel.closest(".bd-content-inner"),
      skillPanel.closest(".bd-content"),
      skillPanel.closest(".bd-section"),
      skillPanel.closest(".share-section"),
    ].filter(Boolean);

    for (const host of [...new Set(hosts)]) {
      if (!host.contains(panel)) continue;
      const hostRect = host.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const neededHeight = Math.ceil(panelRect.bottom - hostRect.top + 120);
      host.style.height = "auto";
      host.style.minHeight = `${Math.max(host.offsetHeight, host.scrollHeight, neededHeight)}px`;
      host.style.overflow = "visible";
    }
  }

  async function copyText(value) {
    const text = value || "";
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (_) {
        // Fall through to userscript/native textarea copy.
      }
    }

    if (typeof GM_setClipboard === "function") {
      try {
        GM_setClipboard(text, "text");
        return true;
      } catch (_) {
        // Fall through to textarea copy.
      }
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const ok = document.execCommand("copy");
    textarea.remove();
    return ok;
  }

  function summarizeRows(rows) {
    return rows.reduce((summary, row) => {
      summary.total += 1;
      summary.supports += row.supports?.length || 0;
      if (row.skillType === "主动技能") summary.active += 1;
      if (row.skillType === "精魂技能") summary.spirit += 1;
      return summary;
    }, { total: 0, active: 0, spirit: 0, supports: 0 });
  }

  function filterRows(rows) {
    if (currentFilter === "active") return rows.filter((row) => row.skillType === "主动技能");
    if (currentFilter === "spirit") return rows.filter((row) => row.skillType === "精魂技能");
    if (currentFilter === "linked") return rows.filter((row) => (row.supports?.length || 0) > 0);
    if (currentFilter === "empty") return rows.filter((row) => (row.supports?.length || 0) === 0);
    return [...rows];
  }

  function sortedRows(rows) {
    const result = [...rows];
    if (currentSort === "type") {
      const order = { "主动技能": 0, "精魂技能": 1, "装备赋予": 2 };
      result.sort((a, b) => (order[a.skillType] ?? 9) - (order[b.skillType] ?? 9) || a.originalIndex - b.originalIndex);
    }
    return result;
  }

  function visibleRows(rows) {
    if (!["all", "active", "spirit", "linked", "empty"].includes(currentFilter)) currentFilter = "all";
    if (!["original", "type"].includes(currentSort)) currentSort = "original";
    return sortedRows(filterRows(rows));
  }

  function updateControls(panel, rows, shownRows) {
    const summary = summarizeRows(rows);
    const summaryEl = panel.querySelector(".codex-skill-summary");
    if (summaryEl) {
      summaryEl.textContent = `总技能 ${summary.total} | 主动 ${summary.active} | 精魂 ${summary.spirit} | 总辅助石 ${summary.supports} | 当前显示 ${shownRows.length}`;
    }
    panel.querySelectorAll("[data-filter]").forEach((button) => {
      button.classList.toggle("codex-active-control", button.dataset.filter === currentFilter);
    });
    panel.querySelectorAll("[data-sort]").forEach((button) => {
      button.classList.toggle("codex-active-control", button.dataset.sort === currentSort);
    });
  }

  function startMountWatcher() {
    if (mountWatcherStarted) return;
    mountWatcherStarted = true;
    setInterval(() => {
      const panel = document.getElementById(PANEL_ID);
      const skillPanel = document.querySelector(".skill-panel");
      if (panel && skillPanel && panel.previousElementSibling !== skillPanel) {
        mountPanel(panel);
      }
    }, 1500);
  }

  function renderPanel(result, status) {
    ensureStyle();
    if (typeof result === "string") {
      lastText = result || "";
      lastRows = [];
    } else {
      lastText = result?.text || "";
      lastRows = result?.rows || [];
    }

    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement("div");
      panel.id = PANEL_ID;
      panel.innerHTML = `
        <div class="codex-skill-header">
          <div class="codex-skill-title">技能文字信息 <span class="codex-skill-updated">${SCRIPT_UPDATED_AT}</span></div>
          <div class="codex-skill-actions">
            <button type="button" data-action="refresh">刷新</button>
            <button type="button" data-action="copy">复制</button>
          </div>
        </div>
        <div class="codex-skill-controls">
          <div class="codex-skill-summary"></div>
          <div class="codex-control-group">
            <span class="codex-control-label">筛选</span>
            <button type="button" data-filter="all">全部</button>
            <button type="button" data-filter="active">主动</button>
            <button type="button" data-filter="spirit">精魂</button>
            <button type="button" data-filter="linked">有辅助</button>
            <button type="button" data-filter="empty">无辅助</button>
          </div>
          <div class="codex-control-group codex-sort-group">
            <span class="codex-control-label">排序</span>
            <button type="button" data-sort="original">原序</button>
            <button type="button" data-sort="type">类型</button>
          </div>
        </div>
        <div class="codex-skill-body"></div>
        <div class="codex-skill-status"></div>
      `;
      panel.addEventListener("click", async (event) => {
        const button = event.target.closest("button");
        if (!button) return;
        if (button.dataset.filter) {
          currentFilter = button.dataset.filter;
          renderPanel({ text: lastText, rows: lastRows }, "");
          return;
        }
        if (button.dataset.sort) {
          currentSort = button.dataset.sort;
          renderPanel({ text: lastText, rows: lastRows }, "");
          return;
        }
        if (button.dataset.action === "refresh") {
          refresh();
        }
        if (button.dataset.action === "copy") {
          const value = lastText;
          const ok = await copyText(value);
          button.textContent = ok ? "已复制" : "复制失败";
          setTimeout(() => {
            button.textContent = "复制";
          }, 1200);
        }
      });
    }
    mountPanel(panel);

    const body = panel.querySelector(".codex-skill-body");
    body.innerHTML = "";
    const rowsToRender = visibleRows(lastRows);
    updateControls(panel, lastRows, rowsToRender);
    if (lastRows.length) {
      if (!rowsToRender.length) {
        const card = document.createElement("div");
        card.className = "codex-skill-card";
        card.textContent = "当前筛选没有匹配技能。";
        body.appendChild(card);
      }
      for (const row of rowsToRender) {
        const card = document.createElement("div");
        card.className = `codex-skill-card ${row.skillTypeClass || ""}`.trim();
        card.innerHTML = `
          <div class="codex-skill-top">
            <div class="codex-skill-name-row">
              <span class="codex-skill-type"></span>
              <div class="codex-skill-name"></div>
            </div>
            <div class="codex-skill-meta"></div>
          </div>
          <div class="codex-skill-line codex-skill-tags"></div>
          <div class="codex-skill-line codex-skill-supports"></div>
          <div class="codex-skill-line codex-skill-nested"></div>
        `;
        const typeBadge = card.querySelector(".codex-skill-type");
        typeBadge.textContent = row.skillType || "主动技能";
        if (row.skillTypeClass) typeBadge.classList.add(row.skillTypeClass);
        card.querySelector(".codex-skill-name").textContent = row.name;
        card.querySelector(".codex-skill-meta").textContent = `Lv${row.level} / Q${row.quality} / ${row.sockets}孔`;
        const tags = card.querySelector(".codex-skill-tags");
        tags.innerHTML = `<span class="codex-skill-label">标签</span>${row.tags || "-"}`;
        const supports = card.querySelector(".codex-skill-supports");
        supports.innerHTML = `<span class="codex-skill-label">辅助</span>${row.supports.length} 个`;
        if (row.supports.length) {
          const table = document.createElement("table");
          table.className = "codex-support-table";
          table.innerHTML = `
            <thead>
              <tr>
                <th class="codex-support-index">#</th>
                <th>辅助石</th>
                <th class="codex-support-level">等级</th>
                <th class="codex-support-quality">品质</th>
              </tr>
            </thead>
            <tbody></tbody>
          `;
          const tbody = table.querySelector("tbody");
          row.supports.forEach((support, supportIndex) => {
            const tr = document.createElement("tr");
            const indexTd = document.createElement("td");
            indexTd.className = "codex-support-index";
            indexTd.textContent = String(supportIndex + 1);
            const nameTd = document.createElement("td");
            nameTd.textContent = support.name || "-";
            const levelTd = document.createElement("td");
            levelTd.className = "codex-support-level";
            levelTd.textContent = support.level && support.level !== "-" ? `Lv${support.level}` : "-";
            const qualityTd = document.createElement("td");
            qualityTd.className = "codex-support-quality";
            qualityTd.textContent = `Q${support.quality || "+ 0%"}`;
            tr.append(indexTd, nameTd, levelTd, qualityTd);
            tbody.appendChild(tr);
          });
          supports.appendChild(table);
        }
        const nested = card.querySelector(".codex-skill-nested");
        if (row.nestedActives.length) {
          nested.innerHTML = `<span class="codex-skill-label">嵌套主动</span>${row.nestedActives.join(" / ")}`;
        } else {
          nested.remove();
        }
        body.appendChild(card);
      }
    } else {
      const card = document.createElement("div");
      card.className = "codex-skill-card";
      const pre = document.createElement("pre");
      pre.className = "codex-skill-plain";
      pre.textContent = lastText || "";
      card.appendChild(pre);
      body.appendChild(card);
    }
    panel.querySelector(".codex-skill-status").textContent = "";
    requestAnimationFrame(() => expandSkillHost(panel));
  }

  async function refresh() {
    const shareCode = extractShareCode();
    lastShareCode = shareCode;
    if (!shareCode) {
      const fallback = domFallbackText();
      renderPanel(fallback || "未识别到分享码。请确认当前 URL 是 #/share/... 页面。", "未识别分享码，使用页面文本兜底。");
      return;
    }

    renderPanel(lastText || "正在读取技能接口...", "读取中");

    try {
      const roleInfo = await postJson("GetRoleInfo", roleBody(shareCode));
      const role = roleInfo?.role || {};
      const skills = await postJson("GetSkills", roleBody(shareCode, role));
      renderPanel(formatSkills(skills, role), "接口数据已更新");
    } catch (error) {
      const fallback = domFallbackText();
      renderPanel(
        fallback || `接口读取失败：${error?.message || error}`,
        fallback ? `接口读取失败，已使用页面文本兜底：${error?.message || error}` : "接口读取失败"
      );
    }
  }

  function watchRoute() {
    let lastHref = location.href;
    setInterval(() => {
      if (location.href === lastHref) return;
      lastHref = location.href;
      const currentShareCode = extractShareCode();
      if (currentShareCode && currentShareCode !== lastShareCode) {
        refresh();
      }
    }, 1000);
  }

  refresh();
  startMountWatcher();
  watchRoute();
})();
