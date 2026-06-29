// ==UserScript==
// @name         POE2 NinjaBD增强
// @namespace    local.codex.ninja.poe2
// @version      0.1.6
// @updated      2026-06-29 14:52:30
// @description  在 poe.ninja POE2 BD 页面底部展示可复制的技能表格，并支持技能名称语言切换
// @author       维克牛
// @license      MIT
// @match        *://*/*
// @run-at       document-idle
// @grant        GM_setClipboard
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      poe.ninja
// @connect      poe2db.tw
// @connect      cdn.poe2db.tw
// ==/UserScript==

(function () {
  "use strict";

  const INSTANCE_KEY = "__POE2_NINJABD_ENHANCER_ACTIVE__";
  if (window[INSTANCE_KEY]) {
    console.info("POE2 NinjaBD增强已运行，跳过重复实例。");
    return;
  }
  window[INSTANCE_KEY] = true;

  const API_ROOT = "https://poe.ninja/poe2/api/profile/characters";
  const PANEL_ID = "codex-poe2-ninja-skill-panel";
  const STYLE_ID = "codex-poe2-ninja-skill-style";
  const SCRIPT_UPDATED_AT = "2026-06-29 14:52:30";
  const DEFAULT_HOSTS = ["poe.ninja", "www.poe.ninja", "poe.show", "www.poe.show", "ninja.710421059.xyz"];
  const MIRROR_HOSTS_KEY = "codex_poe2_ninja_mirror_hosts";
  const NAME_LANGS = ["us", "cn", "tw"];
  const NAME_LANG_LABELS = { us: "EN", cn: "简体", tw: "繁体" };

  let currentNameLang = "us";
  let currentSort = "original";
  let currentFilter = "all";
  let lastRows = [];
  let lastText = "";
  let currentModel = null;
  let currentRoute = null;
  let nameLangState = "ready";
  let nameLangMessage = "";
  let poe2dbNameMaps = null;
  let poe2dbNameMapsPromise = null;

  function cleanText(value) {
    return String(value ?? "")
      .replace(/\[([^|\]]+)\|([^\]]+)\]/g, "$2")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeNameKey(value) {
    return cleanText(value)
      .replace(/[（）]/g, (char) => (char === "（" ? "(" : ")"))
      .toLowerCase();
  }

  function cleanPoe2dbLabel(value) {
    return cleanText(value).replace(/<[^>]+>/g, "").trim();
  }

  function simplifiedToTraditionalFallback(value) {
    const map = {
      "战":"戰","飞":"飛","级":"級","灵":"靈","体":"體","击":"擊","发":"發","触":"觸","电":"電","净":"淨","虚":"虛","冲":"衝","践":"踐","护":"護","报":"報","复":"復","从":"從","军":"軍","扩":"擴","范":"範","围":"圍","过":"過","载":"載","罗":"羅","纳":"納","狙":"狙","记":"記","义":"義","惧":"懼","赠":"贈","猎":"獵","弹":"彈","回":"迴","斩":"斬","区":"區","间":"間","鱼":"魚","鸟":"鳥","龙":"龍","风":"風","云":"雲","会":"會","转":"轉","伤":"傷","强":"強","袭":"襲","双":"雙","释":"釋","压":"壓","绝":"絕","对":"對","应":"應","导":"導","连":"連","锁":"鎖","链":"鏈","扫":"掃","荡":"盪","圣":"聖","锤":"錘","锻":"鍛","炼":"煉","术":"術","师":"師","药":"藥","剂":"劑"
    };
    return cleanText(value).replace(/[\u4e00-\u9fff]/g, (char) => map[char] || char);
  }

  function gmGet(key, fallback) {
    try {
      if (typeof GM_getValue === "function") return GM_getValue(key, fallback);
    } catch (_) {}
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function gmSet(key, value) {
    try {
      if (typeof GM_setValue === "function") {
        GM_setValue(key, value);
        return;
      }
    } catch (_) {}
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {}
  }

  function mirrorHosts() {
    const saved = gmGet(MIRROR_HOSTS_KEY, []);
    const list = Array.isArray(saved) ? saved : [];
    return [...new Set([...DEFAULT_HOSTS, ...list].map(normalizeHost).filter(Boolean))];
  }

  function customMirrorHosts() {
    const saved = gmGet(MIRROR_HOSTS_KEY, []);
    return (Array.isArray(saved) ? saved : []).map(normalizeHost).filter(Boolean);
  }

  function saveCustomMirrorHosts(hosts) {
    gmSet(MIRROR_HOSTS_KEY, [...new Set(hosts.map(normalizeHost).filter(Boolean))]);
  }

  function normalizeHost(value) {
    const text = cleanText(value);
    if (!text) return "";
    try {
      return new URL(text.includes("://") ? text : `https://${text}`).hostname.toLowerCase();
    } catch (_) {
      return text.replace(/^https?:\/\//, "").split("/")[0].toLowerCase();
    }
  }

  function openMirrorSettings() {
    const currentHost = normalizeHost(location.hostname || "");
    const custom = customMirrorHosts();
    const existingText = custom.join("\n");
    const hint = [
      "每行一个镜像站域名或地址。",
      "默认已支持 poe.ninja、poe.show、ninja.710421059.xyz。",
      currentHost && !mirrorHosts().includes(currentHost) ? `当前域名：${currentHost}` : "",
    ].filter(Boolean).join("\n");
    const input = prompt(`${hint}\n\n自定义镜像站：`, existingText || currentHost);
    if (input == null) return;
    const hosts = input.split(/\r?\n|,/).map(normalizeHost).filter(Boolean);
    saveCustomMirrorHosts(hosts);
    alert(`POE2 NinjaBD增强：已保存 ${hosts.length} 个自定义镜像站。刷新页面后生效。`);
  }

  function registerMenuCommands() {
    if (typeof GM_registerMenuCommand !== "function") return;
    GM_registerMenuCommand("设置 NinjaBD 镜像站", openMirrorSettings);
  }

  function requestText(url, responseType = "text") {
    const gmRequest = typeof GM_xmlhttpRequest === "function"
      ? GM_xmlhttpRequest
      : (typeof GM === "object" && typeof GM.xmlHttpRequest === "function" ? GM.xmlHttpRequest : null);
    if (gmRequest) {
      return new Promise((resolve, reject) => {
        gmRequest({
          method: "GET",
          url,
          responseType,
          headers: { "Accept": responseType === "json" ? "application/json" : "text/plain", "Referer": "https://poe.ninja/" },
          onload: (response) => {
            if (response.status >= 200 && response.status < 300) {
              resolve(responseType === "json" ? response.response : response.responseText);
            } else {
              reject(new Error(`${url} HTTP ${response.status}`));
            }
          },
          onerror: () => reject(new Error(`请求失败：${url}`)),
        });
      });
    }
    return fetch(url, { credentials: "omit" }).then(async (response) => {
      if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
      return responseType === "json" ? response.json() : response.text();
    });
  }

  async function requestJson(url) {
    const value = await requestText(url, "json");
    return typeof value === "string" ? JSON.parse(value) : value;
  }

  function decodePart(value) {
    return decodeURIComponent(String(value || "")).replace(/^\/+|\/+$/g, "");
  }

  function parseCharacterLink(value) {
    const parsed = new URL(value, location.href);
    const parts = parsed.pathname.split("/").map(decodePart).filter(Boolean);
    if (parts.length >= 6 && parts[0] === "poe2" && parts[1] === "profile" && parts[4] === "character") {
      return { account: parts[2], league: parts[3], character: parts[5] };
    }
    if (parts.length >= 6 && parts[0] === "poe2" && parts[1] === "builds" && parts[3] === "character") {
      return { account: parts[4], league: parts[2], character: parts[5] };
    }
    for (const candidate of [parsed.search, parsed.hash, value]) {
      const unquoted = decodeURIComponent(candidate || "");
      let match = unquoted.match(/\/poe2\/profile\/([^/?#]+)\/([^/?#]+)\/character\/([^/?#]+)/);
      if (match) return { account: decodePart(match[1]), league: decodePart(match[2]), character: decodePart(match[3]) };
      match = unquoted.match(/\/poe2\/builds\/([^/?#]+)\/character\/([^/?#]+)\/([^/?#]+)/);
      if (match) return { account: decodePart(match[2]), league: decodePart(match[1]), character: decodePart(match[3]) };
    }
    return null;
  }

  function shouldActivate() {
    const route = parseCharacterLink(location.href);
    if (route) {
      currentRoute = route;
      return true;
    }
    const host = location.hostname.toLowerCase();
    return mirrorHosts().includes(host) && /poe2/i.test(location.href);
  }

  function modelUrl(route, version) {
    const parts = [route.account, route.league, route.character].map((part) => encodeURIComponent(part));
    return `${API_ROOT}/${parts[0]}/${parts[1]}/${parts[2]}/model/${version}`;
  }

  function modelChar(data) {
    return data?.type === "found" ? data.charModel : (data?.charModel || data);
  }

  async function fetchLatestModel(route) {
    const candidates = [...Array.from({ length: 20 }, (_, index) => index + 1), 0];
    let bestData = null;
    let bestVersion = null;
    let bestUpdated = "";
    for (const version of candidates) {
      try {
        const data = await requestJson(modelUrl(route, version));
        const char = modelChar(data);
        if (!char?.skills) continue;
        const updated = String(char.updatedUtc || char.lastCheckedUtc || "");
        if (!bestData || updated > bestUpdated) {
          bestData = data;
          bestVersion = version;
          bestUpdated = updated;
        }
      } catch (error) {
        console.warn("poe.ninja model fetch failed", version, error);
      }
    }
    if (!bestData) throw new Error("未读取到 poe.ninja 角色数据");
    currentModel = { data: bestData, version: bestVersion };
    return bestData;
  }

  async function loadPoe2dbNameMaps(force = false) {
    if (!force && poe2dbNameMaps) return poe2dbNameMaps;
    if (!force && poe2dbNameMapsPromise) return poe2dbNameMapsPromise;
    if (force) poe2dbNameMapsPromise = null;

    poe2dbNameMapsPromise = (async () => {
      const html = await requestText("https://poe2db.tw/cn/");
      const headerMatch = html.match(/https:\/\/cdn\.poe2db\.tw\/js\/poedb_header\.[a-f0-9]+\.js/);
      if (!headerMatch) throw new Error("未找到 POE2DB header 脚本");
      const headerJs = await requestText(headerMatch[0]);
      const files = {};
      for (const lang of NAME_LANGS) {
        const match = headerJs.match(new RegExp(`autocompletecb_${lang}\\.[a-z0-9]+\\.json`, "i"));
        if (match) files[lang] = `https://cdn.poe2db.tw/json/${match[0]}`;
      }

      const byValue = { ...(poe2dbNameMaps?.byValue || {}) };
      const byEnName = new Map(poe2dbNameMaps?.byEnName || []);
      await Promise.allSettled(NAME_LANGS.map(async (lang) => {
        if (!files[lang]) return;
        const list = JSON.parse(await requestText(files[lang]));
        byValue[lang] = new Map();
        for (const item of Array.isArray(list) ? list : []) {
          const value = cleanText(item.value || "");
          const label = cleanPoe2dbLabel(item.label || "");
          if (!value || !label) continue;
          byValue[lang].set(value, label);
          if (lang === "us") {
            byEnName.set(label, value);
            byEnName.set(normalizeNameKey(label), value);
          }
        }
      }));
      poe2dbNameMaps = { byValue, byEnName };
      return poe2dbNameMaps;
    })();
    return poe2dbNameMapsPromise;
  }

  function localizedName(name) {
    const cleanName = cleanText(name);
    if (!cleanName || currentNameLang === "us" || !poe2dbNameMaps) return cleanName;
    const value = poe2dbNameMaps.byEnName.get(cleanName) || poe2dbNameMaps.byEnName.get(normalizeNameKey(cleanName));
    if (!value) return currentNameLang === "tw" ? simplifiedToTraditionalFallback(cleanName) : cleanName;
    return poe2dbNameMaps.byValue[currentNameLang]?.get(value) || (currentNameLang === "tw" ? simplifiedToTraditionalFallback(cleanName) : cleanName);
  }

  async function ensureNameLanguageLoaded() {
    if (currentNameLang === "us") {
      nameLangState = "ready";
      nameLangMessage = "";
      updateRenderedLanguage();
      return true;
    }
    nameLangState = "loading";
    nameLangMessage = `${NAME_LANG_LABELS[currentNameLang]} 名称加载中`;
    updateControls();
    try {
      await loadPoe2dbNameMaps(Boolean(poe2dbNameMaps));
      nameLangState = "ready";
      nameLangMessage = "";
      updateRenderedLanguage();
      return true;
    } catch (error) {
      nameLangState = "error";
      nameLangMessage = "POE2DB 名称加载失败";
      console.warn("POE2DB 技能名称加载失败", error);
      updateControls();
      return false;
    }
  }

  function propValue(item, names) {
    const wanted = new Set(names.map((name) => name.toLowerCase()));
    for (const prop of item?.properties || []) {
      const propName = cleanText(prop.name).toLowerCase();
      if (!wanted.has(propName)) continue;
      return cleanText(prop.values?.[0]?.[0]);
    }
    return "";
  }

  function fieldValueText(field) {
    if (typeof field === "string") return cleanText(field);
    const values = field?.values;
    if (Array.isArray(values)) {
      const parts = values.map((value) => Array.isArray(value) ? value[0] : value).map(cleanText).filter(Boolean);
      if (parts.length) return parts.join(" ");
    }
    return cleanText(field?.value ?? field?.displayValue ?? field?.text ?? "");
  }

  function formatRequirementName(name) {
    return cleanText(name)
      .replace(/^\+?\d+\s*/, "")
      .replace(/\((\d+)\)/g, "$1")
      .replace("Strength", "Str")
      .replace("Dexterity", "Dex")
      .replace("Intelligence", "Int");
  }

  function formatRequirements(item) {
    const rows = [...(item?.requirements || []), ...(item?.supportGemRequirements || []), ...(item?.weaponRequirements || [])];
    const seen = new Set();
    const parts = [];
    for (const row of rows) {
      if (typeof row === "string") {
        const text = cleanText(row);
        if (text && !seen.has(text)) {
          seen.add(text);
          parts.push(text);
        }
        continue;
      }
      const rawName = cleanText(row?.name || row?.type || row?.id || "");
      const value = fieldValueText(row).replace(/[()]/g, "");
      let text = "";
      if (/^\+\d+/.test(rawName)) {
        text = rawName.replace(/\[(Strength|Dexterity|Intelligence)\|([^\]]+)\]/g, "$2").replace(/\s+/g, " ");
      } else {
        const name = formatRequirementName(rawName);
        text = name && value ? `${name} ${value}` : (name || value);
      }
      text = cleanText(text);
      if (text && !seen.has(text)) {
        seen.add(text);
        parts.push(text);
      }
    }
    return parts.join(" / ");
  }

  function gemItem(gem) {
    return gem?.itemData || gem || {};
  }

  function gemName(gem) {
    const item = gemItem(gem);
    return cleanText(gem?.name || item.typeLine || item.baseType || item.name || "");
  }

  function gemLevel(gem) {
    const item = gemItem(gem);
    return cleanText(gem?.level || propValue(item, ["Level", "等级"]) || "");
  }

  function gemQuality(gem) {
    const item = gemItem(gem);
    const value = gem?.quality ?? item.qualityProperty ?? propValue(item, ["Quality", "[Quality]", "品质"]);
    const text = cleanText(value).replace(/^\+/, "").replace(/%$/, "");
    if (!text || text === "-") return "";
    return `品质${text}%`;
  }

  function gemSockets(gem) {
    const item = gemItem(gem);
    if (Array.isArray(item.gemSockets)) return item.gemSockets.length;
    if (Array.isArray(item.sockets)) return item.sockets.filter((socket) => socket?.type === "gem").length;
    return "";
  }

  function gemTags(gem) {
    const item = gemItem(gem);
    const prop = item.properties?.[0]?.name || "";
    return cleanText(prop);
  }

  function isLineageSupport(gem) {
    const item = gemItem(gem);
    const fields = [
      ...(item.properties || []),
      ...(item.gemTabs || []),
      ...(item.explicitMods || []),
    ];
    return fields.some((field) => /LineageSupports|Lineage|血脉|血脈/i.test(cleanText(`${field?.name || ""} ${JSON.stringify(field?.values || "")}`)));
  }

  function hasSpiritReservation(gem) {
    const item = gemItem(gem);
    const fields = [...(item.properties || []), ...(item.requirements || []), ...(item.explicitMods || [])];
    return fields.some((field) => /(Spirit|精魂).{0,16}(Reservation|Reserve|Cost|保留|消耗)|(?:Reservation|Reserve|Cost|保留|消耗).{0,16}(Spirit|精魂)/i.test(cleanText(`${field?.name || ""} ${JSON.stringify(field?.values || "")}`)));
  }

  function skillType(gem) {
    const item = gemItem(gem);
    if (hasSpiritReservation(gem)) return { label: "精魂技能", className: "codex-type-spirit" };
    const tags = gemTags(gem);
    if (/\b(Persistent|Aura|Herald|Buff)\b|永久性|光环|捷/.test(tags)) return { label: "被动技能", className: "codex-type-passive" };
    if (item.inventoryId && item.inventoryId !== "SkillSlots") return { label: "装备赋予", className: "codex-type-granted" };
    return { label: "主动技能", className: "codex-type-active" };
  }

  function normalizeSkillGroup(group, index) {
    const gems = group?.allGems || [];
    let active = gems.find((gem) => !gemItem(gem).support) || gems[0] || {};
    const activeItem = gemItem(active);
    const inserted = [];

    const socketedItems = activeItem.socketedItems?.length
      ? activeItem.socketedItems.map((item) => ({ itemData: item, name: item.typeLine || item.baseType }))
      : gems.filter((gem) => gem !== active);

    for (const gem of socketedItems) {
      const item = gemItem(gem);
      const rowType = item.support ? (isLineageSupport(gem) ? "血脉" : "被动") : "主动";
      const isActiveLike = rowType === "主动";
      const quality = gemQuality(gem);
      const level = gemLevel(gem);
      inserted.push({
        name: gemName(gem),
        rowType,
        level: level || "-",
        quality: quality || (isActiveLike ? "品质0%" : "-"),
        sockets: isActiveLike ? (gemSockets(gem) || "-") : "-",
        requirements: formatRequirements(item) || "-",
      });
    }

    const type = skillType(active);
    const level = gemLevel(active);
    const quality = gemQuality(active);
    const dpsRows = (group?.dps || []).filter((row) => row?.dps != null || row?.dotDps != null);
    return {
      originalIndex: index,
      name: gemName(active) || `Skill ${index + 1}`,
      level: level || "-",
      quality: quality || "品质0%",
      sockets: gemSockets(active) || gems.length || "-",
      tags: gemTags(active),
      requirements: formatRequirements(activeItem),
      skillType: type.label,
      skillTypeClass: type.className,
      inserted,
      dpsRows: dpsRows.map((row) => ({ name: cleanText(row.name), dps: row.dps, dotDps: row.dotDps })),
    };
  }

  function formatNumber(value) {
    if (value == null || value === "") return "";
    const num = Number(value);
    if (!Number.isFinite(num)) return cleanText(value);
    return num >= 1000 ? Math.round(num).toLocaleString("en-US") : String(num);
  }

  function formatRowText(row, index) {
    const lines = [];
    lines.push(`${index + 1}. ${localizedName(row.name)} | Lv${row.level} | ${row.quality} | ${row.sockets}孔`);
    lines.push(`   类型: ${row.skillType}`);
    if (row.tags) lines.push(`   标签: ${row.tags}`);
    if (row.requirements) lines.push(`   需求: ${row.requirements}`);
    if (row.dpsRows.length) lines.push(`   DPS: ${row.dpsRows.map((dps) => `${dps.name}: ${formatNumber(dps.dps || dps.dotDps)}`).join(" / ")}`);
    lines.push(`   已插入技能: ${row.inserted.length ? row.inserted.map((item) => `${item.rowType}:${localizedName(item.name)}${item.level !== "-" ? ` Lv${item.level}` : ""} ${item.quality}`).join(" / ") : "-"}`);
    return lines.join("\n");
  }

  function currentCopyText() {
    return visibleRows(lastRows).map((row, index) => formatRowText(row, index)).join("\n\n");
  }

  function summarizeRows(rows) {
    return rows.reduce((summary, row) => {
      summary.total += 1;
      if (row.skillType === "主动技能") summary.active += 1;
      if (row.skillType === "被动技能") summary.passive += 1;
      if (row.skillType === "精魂技能") summary.spirit += 1;
      return summary;
    }, { total: 0, active: 0, passive: 0, spirit: 0 });
  }

  function visibleRows(rows) {
    let result = [...rows];
    if (currentFilter === "active") result = result.filter((row) => row.skillType === "主动技能");
    if (currentFilter === "passive") result = result.filter((row) => row.skillType === "被动技能");
    if (currentFilter === "spirit") result = result.filter((row) => row.skillType === "精魂技能");
    if (currentSort === "type") {
      const order = { "主动技能": 0, "被动技能": 1, "精魂技能": 2, "装备赋予": 3 };
      result.sort((a, b) => (order[a.skillType] ?? 9) - (order[b.skillType] ?? 9) || a.originalIndex - b.originalIndex);
    }
    return result;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID} {
        box-sizing: border-box;
        width: min(1180px, calc(100vw - 32px));
        margin: 28px auto;
        color: #d7dde6;
        font-family: Inter, "Microsoft YaHei UI", "Microsoft YaHei", sans-serif;
        -webkit-user-select: text !important;
        user-select: text !important;
      }
      #${PANEL_ID} *, #${PANEL_ID} table, #${PANEL_ID} td, #${PANEL_ID} th {
        box-sizing: border-box;
      }
      #${PANEL_ID} button {
        cursor: pointer;
        border: 1px solid #374151;
        border-radius: 4px;
        background: #111827;
        color: #d7dde6;
        padding: 5px 10px;
        font-size: 13px;
      }
      #${PANEL_ID} button:hover { background: #1f2937; }
      #${PANEL_ID} button.codex-active-control {
        border-color: #f5c76a;
        color: #f8d98a;
        background: rgba(245, 199, 106, 0.13);
      }
      #${PANEL_ID} button:disabled { opacity: 0.55; cursor: default; }
      #${PANEL_ID} .codex-panel-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 46px;
        padding: 0 16px;
        border: 1px solid #303846;
        border-bottom: 0;
        background: #111827;
      }
      #${PANEL_ID} .codex-title { font-size: 18px; font-weight: 650; }
      #${PANEL_ID} .codex-updated { margin-left: 10px; color: #8b95a7; font-size: 12px; font-weight: 400; }
      #${PANEL_ID} .codex-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
      #${PANEL_ID} .codex-controls {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 8px 18px;
        padding: 12px 16px;
        border: 1px solid #303846;
        background: #0b1018;
      }
      #${PANEL_ID} .codex-summary { grid-column: 1 / -1; color: #c8d2e1; }
      #${PANEL_ID} .codex-control-group { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
      #${PANEL_ID} .codex-sort-group { justify-content: flex-end; }
      #${PANEL_ID} .codex-label { color: #8b95a7; font-size: 12px; margin-right: 2px; }
      #${PANEL_ID} .codex-body {
        padding: 12px;
        border: 1px solid #303846;
        border-top: 0;
        background: #0f1722;
      }
      #${PANEL_ID} .codex-skill-card {
        margin-bottom: 10px;
        padding: 11px 14px;
        border: 1px solid #2a3341;
        border-left-width: 4px;
        background: #111827;
      }
      #${PANEL_ID} .codex-type-active { border-left-color: #f5c76a; }
      #${PANEL_ID} .codex-type-passive, #${PANEL_ID} .codex-type-spirit { border-left-color: #76d191; }
      #${PANEL_ID} .codex-type-granted { border-left-color: #7bb6f0; }
      #${PANEL_ID} .codex-top {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        margin-bottom: 5px;
      }
      #${PANEL_ID} .codex-type-badge {
        border: 1px solid currentColor;
        border-radius: 3px;
        padding: 1px 6px;
        font-size: 12px;
      }
      #${PANEL_ID} .codex-type-badge.codex-type-active { color: #f5c76a; }
      #${PANEL_ID} .codex-type-badge.codex-type-passive, #${PANEL_ID} .codex-type-badge.codex-type-spirit { color: #76d191; }
      #${PANEL_ID} .codex-type-badge.codex-type-granted { color: #7bb6f0; }
      #${PANEL_ID} .codex-name { font-size: 16px; font-weight: 650; color: #f2f4f7; }
      #${PANEL_ID} .codex-meta {
        color: #c8d2e1;
        border: 1px solid #263244;
        background: rgba(255,255,255,0.03);
        padding: 1px 8px;
        font-size: 13px;
      }
      #${PANEL_ID} .codex-line { margin-top: 4px; color: #aeb8c8; font-size: 13px; line-height: 1.45; word-break: break-word; }
      #${PANEL_ID} .codex-line-label { color: #7f8ba0; margin-right: 6px; }
      #${PANEL_ID} table {
        width: 100%;
        margin-top: 8px;
        border-collapse: collapse;
        table-layout: fixed;
        font-size: 13px;
      }
      #${PANEL_ID} th, #${PANEL_ID} td {
        border: 1px solid #2a3341;
        padding: 5px 8px;
        text-align: left;
        vertical-align: middle;
        word-break: break-word;
      }
      #${PANEL_ID} th { color: #9aa6b8; font-weight: 500; background: rgba(255,255,255,0.03); }
      #${PANEL_ID} .codex-index { width: 46px; text-align: center; }
      #${PANEL_ID} .codex-insert-type { width: 72px; text-align: center; font-weight: 700; }
      #${PANEL_ID} .codex-insert-type-active { color: #f5c76a; }
      #${PANEL_ID} .codex-insert-type-passive { color: #76d191; }
      #${PANEL_ID} .codex-insert-type-lineage { color: #c99cff; }
      #${PANEL_ID} .codex-level, #${PANEL_ID} .codex-quality, #${PANEL_ID} .codex-sockets { width: 96px; }
      #${PANEL_ID} .codex-requirements { width: 190px; }
      @media (max-width: 760px) {
        #${PANEL_ID} { width: calc(100vw - 16px); margin: 16px 8px; }
        #${PANEL_ID} .codex-controls { grid-template-columns: 1fr; }
        #${PANEL_ID} .codex-sort-group { justify-content: flex-start; }
      }
    `;
    document.head.appendChild(style);
  }

  function panel() {
    return document.getElementById(PANEL_ID);
  }

  function mountPanel() {
    ensureStyle();
    let root = panel();
    if (!root) {
      root = document.createElement("section");
      root.id = PANEL_ID;
      root.innerHTML = `
        <div class="codex-panel-head">
          <div class="codex-title">技能 <span class="codex-updated">脚本更新：${SCRIPT_UPDATED_AT}</span></div>
          <div class="codex-actions">
            <button type="button" data-action="refresh">刷新</button>
            <button type="button" data-action="copy">复制</button>
          </div>
        </div>
        <div class="codex-controls">
          <div class="codex-summary"></div>
          <div class="codex-control-group">
            <span class="codex-label">语言</span>
            <button type="button" data-lang="us">EN</button>
            <button type="button" data-lang="cn">简体</button>
            <button type="button" data-lang="tw">繁体</button>
          </div>
          <div class="codex-control-group codex-sort-group">
            <span class="codex-label">筛选</span>
            <button type="button" data-filter="all">全部</button>
            <button type="button" data-filter="active">主动</button>
            <button type="button" data-filter="passive">被动</button>
            <span class="codex-label" style="margin-left:8px;">排序</span>
            <button type="button" data-sort="original">原序</button>
            <button type="button" data-sort="type">类型</button>
          </div>
        </div>
        <div class="codex-body"></div>
      `;
      root.addEventListener("click", onPanelClick);
    }
    const main = document.querySelector("main") || document.querySelector("#__next") || document.body;
    main.appendChild(root);
    return root;
  }

  function updateControls() {
    const root = panel();
    if (!root) return;
    const summary = summarizeRows(lastRows);
    const char = currentModel ? modelChar(currentModel.data) : null;
    const info = char ? ` | ${cleanText(char.name)} Lv${char.level || "-"} ${cleanText(char.class || "")}` : "";
    root.querySelector(".codex-summary").textContent = `总技能 ${summary.total} | 主动 ${summary.active} | 被动 ${summary.passive}${summary.spirit ? ` | 精魂 ${summary.spirit}` : ""}${info}`;
    root.querySelectorAll("[data-lang]").forEach((button) => {
      button.classList.toggle("codex-active-control", button.dataset.lang === currentNameLang);
      button.disabled = nameLangState === "loading";
      button.textContent = nameLangState === "loading" && button.dataset.lang === currentNameLang
        ? `${NAME_LANG_LABELS[button.dataset.lang]}...`
        : NAME_LANG_LABELS[button.dataset.lang];
    });
    root.querySelectorAll("[data-filter]").forEach((button) => button.classList.toggle("codex-active-control", button.dataset.filter === currentFilter));
    root.querySelectorAll("[data-sort]").forEach((button) => button.classList.toggle("codex-active-control", button.dataset.sort === currentSort));
    root.title = nameLangMessage;
  }

  function renderRows() {
    const root = mountPanel();
    const body = root.querySelector(".codex-body");
    body.innerHTML = "";
    updateControls();
    const rows = visibleRows(lastRows);
    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = "codex-skill-card";
      empty.textContent = "没有读取到技能数据。";
      body.appendChild(empty);
      return;
    }
    for (const row of rows) {
      const card = document.createElement("article");
      card.className = `codex-skill-card ${row.skillTypeClass || ""}`.trim();
      card.dataset.index = String(row.originalIndex);
      card.innerHTML = `
        <div class="codex-top">
          <span class="codex-type-badge ${row.skillTypeClass || ""}">${row.skillType}</span>
          <span class="codex-name"></span>
          <span class="codex-meta">Lv${row.level} / ${row.quality} / ${row.sockets}孔</span>
        </div>
        <div class="codex-line codex-tags"><span class="codex-line-label">标签</span>${row.tags || "-"}</div>
        ${row.requirements ? `<div class="codex-line codex-req"><span class="codex-line-label">需求</span>${row.requirements}</div>` : ""}
        ${row.dpsRows.length ? `<div class="codex-line"><span class="codex-line-label">DPS</span>${row.dpsRows.map((dps) => `${cleanText(dps.name)} ${formatNumber(dps.dps || dps.dotDps)}`).join(" / ")}</div>` : ""}
        <div class="codex-line"><span class="codex-line-label">已插入技能</span>${row.inserted.length} 个</div>
      `;
      card.querySelector(".codex-name").textContent = localizedName(row.name);
      if (row.inserted.length) {
        const table = document.createElement("table");
        table.innerHTML = `
          <thead>
            <tr>
              <th class="codex-index">#</th>
              <th class="codex-insert-type">类型</th>
              <th>技能石</th>
              <th class="codex-level">等级</th>
              <th class="codex-quality">品质</th>
              <th class="codex-sockets">孔数</th>
              <th class="codex-requirements">需求</th>
            </tr>
          </thead>
          <tbody></tbody>
        `;
        const tbody = table.querySelector("tbody");
        row.inserted.forEach((item, index) => {
          const typeClass = item.rowType === "主动" ? "active" : item.rowType === "血脉" ? "lineage" : "passive";
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td class="codex-index">${index + 1}</td>
            <td class="codex-insert-type codex-insert-type-${typeClass}">${item.rowType}</td>
            <td class="codex-insert-name"></td>
            <td class="codex-level">${item.level !== "-" ? `Lv${item.level}` : "-"}</td>
            <td class="codex-quality">${item.quality || "-"}</td>
            <td class="codex-sockets">${item.sockets || "-"}</td>
            <td class="codex-requirements">${item.requirements || "-"}</td>
          `;
          tr.querySelector(".codex-insert-name").textContent = localizedName(item.name);
          tbody.appendChild(tr);
        });
        card.appendChild(table);
      }
      body.appendChild(card);
    }
  }

  function updateRenderedLanguage() {
    const root = panel();
    if (!root) return;
    const rowsByIndex = new Map(lastRows.map((row) => [String(row.originalIndex), row]));
    root.querySelectorAll(".codex-skill-card[data-index]").forEach((card) => {
      const row = rowsByIndex.get(card.dataset.index);
      if (!row) return;
      const name = card.querySelector(".codex-name");
      if (name) name.textContent = localizedName(row.name);
      card.querySelectorAll(".codex-insert-name").forEach((cell, index) => {
        cell.textContent = localizedName(row.inserted[index]?.name || "-");
      });
    });
    updateControls();
  }

  async function copyText(value) {
    if (!value) return false;
    try {
      if (typeof GM_setClipboard === "function") {
        GM_setClipboard(value);
        return true;
      }
      await navigator.clipboard.writeText(value);
      return true;
    } catch (_) {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      textarea.remove();
      return ok;
    }
  }

  async function refresh({ showLoading = Boolean(panel()) } = {}) {
    const existingPanel = panel();
    if (showLoading && existingPanel) {
      existingPanel.querySelector(".codex-body").innerHTML = `<div class="codex-skill-card">正在读取 poe.ninja 技能数据...</div>`;
    }
    const route = currentRoute || parseCharacterLink(location.href);
    if (!route) {
      const root = mountPanel();
      const body = root.querySelector(".codex-body");
      body.innerHTML = `<div class="codex-skill-card">当前页面没有识别到 poe.ninja POE2 角色链接。可在 Tampermonkey 菜单里设置 NinjaBD 镜像站。</div>`;
      return;
    }
    currentRoute = route;
    const data = await fetchLatestModel(route);
    const char = modelChar(data);
    lastRows = (char.skills || []).map(normalizeSkillGroup).filter((row) => row.name);
    lastText = currentCopyText();
    renderRows();
  }

  async function onPanelClick(event) {
    const button = event.target.closest("button");
    if (!button) return;
    event.preventDefault();
    if (button.dataset.lang) {
      currentNameLang = button.dataset.lang;
      await ensureNameLanguageLoaded();
      return;
    }
    if (button.dataset.filter) {
      currentFilter = button.dataset.filter;
      renderRows();
      return;
    }
    if (button.dataset.sort) {
      currentSort = button.dataset.sort;
      renderRows();
      return;
    }
    if (button.dataset.action === "refresh") {
      await refresh();
      return;
    }
    if (button.dataset.action === "copy") {
      const ok = await copyText(currentCopyText());
      button.textContent = ok ? "已复制" : "复制失败";
      setTimeout(() => { button.textContent = "复制"; }, 1200);
    }
  }

  function start() {
    registerMenuCommands();
    if (!shouldActivate()) return;
    refresh({ showLoading: false }).catch((error) => {
      console.warn("POE2 NinjaBD增强读取失败", error);
      const root = mountPanel();
      root.querySelector(".codex-body").innerHTML = `<div class="codex-skill-card">读取失败：${cleanText(error?.message || error)}</div>`;
    });
    let lastHref = location.href;
    setInterval(() => {
      if (location.href === lastHref) return;
      lastHref = location.href;
      currentRoute = parseCharacterLink(location.href);
      if (shouldActivate()) refresh().catch(console.warn);
    }, 1200);
  }

  start();
})();
