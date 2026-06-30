// ==UserScript==
// @name         POE2 NinjaBD增强
// @namespace    local.codex.ninja.poe2
// @version      1.0
// @updated      2026-07-01 00:47:53
// @description  在 poe.ninja POE2 BD 页面底部展示可复制的技能表格，并支持技能名称语言切换
// @author       维克牛
// @license      MIT
// @match        *://*/poe2/builds/*
// @match        *://*/poe2/profile/*/*/character/*
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

  const SCRIPT_VERSION = "1.0";
  const INSTANCE_KEY = "__POE2_NINJABD_ENHANCER_ACTIVE__";
  const PANEL_ID = "codex-poe2-ninja-skill-panel";
  const existingInstance = window[INSTANCE_KEY];
  if (existingInstance && (document.getElementById(PANEL_ID) || (existingInstance.version === SCRIPT_VERSION && Date.now() - existingInstance.startedAt < 5000))) {
    console.info("POE2 NinjaBD增强已运行，跳过重复实例。");
    return;
  }
  window[INSTANCE_KEY] = { version: SCRIPT_VERSION, startedAt: Date.now() };

  const API_ROOT = "https://poe.ninja/poe2/api/profile/characters";
  const STYLE_ID = "codex-poe2-ninja-skill-style";
  const SCRIPT_UPDATED_AT = "2026-07-01 00:47:53";
  const DEFAULT_HOSTS = ["poe.ninja", "www.poe.ninja", "poe.show", "www.poe.show", "ninja.710421059.xyz"];
  const MIRROR_HOSTS_KEY = "codex_poe2_ninja_mirror_hosts";
  const NAME_MAP_CACHE_KEY = "codex_poe2_ninja_name_maps_v1";
  const DIRECT_NAME_CACHE_KEY = "codex_poe2_ninja_direct_names_v1";
  const NAME_MAP_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const NAME_LANGS = ["us", "cn", "tw"];
  const NAME_LANG_LABELS = { us: "EN", cn: "简体", tw: "繁体" };

  let currentNameLang = "us";
  let currentSort = "original";
  let currentFilter = "all";
  let lastRows = [];
  let lastEquipment = [];
  let lastJewels = [];
  let lastText = "";
  let currentModel = null;
  let currentRoute = null;
  let nameLangState = "ready";
  let nameLangMessage = "";
  let poe2dbNameMaps = null;
  let poe2dbNameMapsPromise = null;
  let directNameMaps = null;

  function cleanText(value) {
    return String(value ?? "")
      .replace(/\[([^|\]]+)\|([^\]]+)\]/g, "$2")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    })[char]);
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

  function requestText(url, responseType = "text", timeoutMs = 15000) {
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
          timeout: timeoutMs,
          onload: (response) => {
            if (response.status >= 200 && response.status < 300) {
              resolve(responseType === "json" ? response.response : response.responseText);
            } else {
              reject(new Error(`${url} HTTP ${response.status}`));
            }
          },
          onerror: () => reject(new Error(`请求失败：${url}`)),
          ontimeout: () => reject(new Error(`请求超时：${url}`)),
        });
      });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { credentials: "omit", signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error(`${url} HTTP ${response.status}`);
      return responseType === "json" ? response.json() : response.text();
    }).finally(() => {
      clearTimeout(timer);
    });
  }

  async function requestJson(url) {
    const value = await requestText(url, "json");
    return typeof value === "string" ? JSON.parse(value) : value;
  }

  function packNameMaps(maps) {
    const byValue = {};
    for (const lang of NAME_LANGS) byValue[lang] = Array.from(maps.byValue?.[lang]?.entries?.() || []);
    return {
      createdAt: Date.now(),
      byValue,
      byEnName: Array.from(maps.byEnName?.entries?.() || []),
    };
  }

  function unpackNameMaps(cache) {
    if (!cache || Date.now() - Number(cache.createdAt || 0) > NAME_MAP_CACHE_TTL_MS) return null;
    const byValue = {};
    for (const lang of NAME_LANGS) byValue[lang] = new Map(Array.isArray(cache.byValue?.[lang]) ? cache.byValue[lang] : []);
    const byEnName = new Map(Array.isArray(cache.byEnName) ? cache.byEnName : []);
    if (!byEnName.size || !byValue.cn?.size || !byValue.tw?.size) return null;
    return { byValue, byEnName };
  }

  function loadCachedNameMaps() {
    if (poe2dbNameMaps) return poe2dbNameMaps;
    const cached = unpackNameMaps(gmGet(NAME_MAP_CACHE_KEY, null));
    if (cached) poe2dbNameMaps = cached;
    return poe2dbNameMaps;
  }

  function saveCachedNameMaps(maps) {
    try {
      gmSet(NAME_MAP_CACHE_KEY, packNameMaps(maps));
    } catch (error) {
      console.warn("POE2DB 名称缓存保存失败", error);
    }
  }

  function unpackDirectNameMaps(cache) {
    const maps = { cn: new Map(), tw: new Map(), failed: new Map() };
    if (!cache || Date.now() - Number(cache.createdAt || 0) > NAME_MAP_CACHE_TTL_MS) return maps;
    maps.cn = new Map(Array.isArray(cache.cn) ? cache.cn : []);
    maps.tw = new Map(Array.isArray(cache.tw) ? cache.tw : []);
    maps.failed = new Map(Array.isArray(cache.failed) ? cache.failed : []);
    return maps;
  }

  function loadDirectNameMaps() {
    if (!directNameMaps) directNameMaps = unpackDirectNameMaps(gmGet(DIRECT_NAME_CACHE_KEY, null));
    return directNameMaps;
  }

  function saveDirectNameMaps() {
    if (!directNameMaps) return;
    try {
      gmSet(DIRECT_NAME_CACHE_KEY, {
        createdAt: Date.now(),
        cn: Array.from(directNameMaps.cn.entries()),
        tw: Array.from(directNameMaps.tw.entries()),
        failed: Array.from(directNameMaps.failed.entries()),
      });
    } catch (error) {
      console.warn("POE2DB 按需名称缓存保存失败", error);
    }
  }

  function poe2dbSlugFromName(name) {
    return cleanText(name)
      .replace(/\s*\([^)]*\)\s*$/g, "")
      .replace(/[’']/g, "")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function localizedTitleFromPoe2dbHtml(html) {
    const raw = String(html || "");
    const metaTitle = raw.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
      || raw.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
    const title = metaTitle?.[1] || raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
    return cleanText(title)
      .replace(/\s*-\s*(PoE2DB|流亡2编年史|流亡編年史|Path of Exile 2).*/i, "")
      .replace(/\s*-\s*Path of Exile 2 Wiki.*/i, "")
      .trim();
  }

  function collectTranslatableNames() {
    const names = [];
    for (const row of lastRows) {
      names.push(row.name);
      row.inserted.forEach((item) => names.push(item.name));
      row.dpsRows.forEach((dps) => names.push(dps.name));
    }
    for (const row of [...lastEquipment, ...lastJewels]) {
      names.push(row.name, row.baseType);
      row.socketed.forEach((name) => names.push(name));
    }
    return [...new Set(names.map(cleanText).filter((name) => name && name !== "-" && /[A-Za-z]/.test(name)))];
  }

  async function loadDirectTranslationsForCurrent(lang) {
    if (lang === "us") return;
    const maps = loadDirectNameMaps();
    const target = maps[lang] || (maps[lang] = new Map());
    const names = collectTranslatableNames().filter((name) => {
      const key = normalizeNameKey(name);
      return !target.has(key) && !maps.failed.has(`${lang}:${key}`);
    });
    if (!names.length) return;

    let changed = false;
    const queue = names.slice(0, 80);
    const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
      while (queue.length) {
        const name = queue.shift();
        const key = normalizeNameKey(name);
        const slug = poe2dbSlugFromName(name);
        if (!slug) continue;
        try {
          const html = await requestText(`https://poe2db.tw/${lang}/${encodeURIComponent(slug)}`, "text", 6000);
          const translated = localizedTitleFromPoe2dbHtml(html);
          if (translated && normalizeNameKey(translated) !== key && !/^PoE2DB/i.test(translated)) {
            target.set(key, translated);
          } else {
            maps.failed.set(`${lang}:${key}`, Date.now());
          }
          changed = true;
        } catch (_) {
          maps.failed.set(`${lang}:${key}`, Date.now());
          changed = true;
        }
      }
    });
    await Promise.allSettled(workers);
    if (changed) saveDirectNameMaps();
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
    return false;
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
    if (!force) {
      const cached = loadCachedNameMaps();
      if (cached) return cached;
    }
    if (!force && poe2dbNameMapsPromise) return poe2dbNameMapsPromise;
    if (force) poe2dbNameMapsPromise = null;

    poe2dbNameMapsPromise = (async () => {
      const html = await requestText("https://poe2db.tw/cn/", "text", 8000);
      const headerMatch = html.match(/https:\/\/cdn\.poe2db\.tw\/js\/poedb_header\.[a-f0-9]+\.js/);
      if (!headerMatch) throw new Error("未找到 POE2DB header 脚本");
      const headerJs = await requestText(headerMatch[0], "text", 8000);
      const files = {};
      for (const lang of NAME_LANGS) {
        const match = headerJs.match(new RegExp(`autocompletecb_${lang}\\.[a-z0-9]+\\.json`, "i"));
        if (match) files[lang] = `https://cdn.poe2db.tw/json/${match[0]}`;
      }

      const byValue = { ...(poe2dbNameMaps?.byValue || {}) };
      const byEnName = new Map(poe2dbNameMaps?.byEnName || []);
      await Promise.allSettled(NAME_LANGS.map(async (lang) => {
        if (!files[lang]) return;
        const list = JSON.parse(await requestText(files[lang], "text", 8000));
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
      if (!byEnName.size || !byValue.cn?.size || !byValue.tw?.size) {
        throw new Error("POE2DB 全量名称表为空");
      }
      poe2dbNameMaps = { byValue, byEnName };
      saveCachedNameMaps(poe2dbNameMaps);
      return poe2dbNameMaps;
    })();
    return poe2dbNameMapsPromise;
  }

  function localizedName(name) {
    const cleanName = cleanText(name);
    if (!cleanName || currentNameLang === "us") return cleanName;
    const key = normalizeNameKey(cleanName);
    const direct = loadDirectNameMaps()?.[currentNameLang]?.get(key);
    if (direct) return currentNameLang === "tw" ? simplifiedToTraditionalFallback(direct) : direct;
    if (poe2dbNameMaps) {
      const value = poe2dbNameMaps.byEnName.get(cleanName) || poe2dbNameMaps.byEnName.get(key);
      if (value) {
        const translated = poe2dbNameMaps.byValue[currentNameLang]?.get(value);
        if (translated) return currentNameLang === "tw" ? simplifiedToTraditionalFallback(translated) : translated;
      }
    }
    return currentNameLang === "tw" ? simplifiedToTraditionalFallback(cleanName) : cleanName;
  }

  async function ensureNameLanguageLoaded() {
    if (currentNameLang === "us") {
      nameLangState = "ready";
      nameLangMessage = "";
      await renderRows();
      return true;
    }
    nameLangState = "loading";
    nameLangMessage = `${NAME_LANG_LABELS[currentNameLang]} 名称加载中`;
    updateControls();
    try {
      await loadDirectTranslationsForCurrent(currentNameLang);
      loadPoe2dbNameMaps(false)
        .then(() => currentNameLang !== "us" ? renderRows() : null)
        .catch((error) => console.warn("POE2DB 全量名称表后台加载失败", error));
      nameLangState = "ready";
      nameLangMessage = "";
      await renderRows();
      return true;
    } catch (error) {
      nameLangState = "error";
      nameLangMessage = "POE2DB 名称加载失败";
      console.warn("POE2DB 技能名称加载失败", error);
      updateControls();
      return false;
    }
  }

  function preloadNameMaps() {
    if (poe2dbNameMaps || poe2dbNameMapsPromise) return;
    setTimeout(() => {
      loadPoe2dbNameMaps(false).catch((error) => console.warn("POE2DB 名称预加载失败", error));
    }, 500);
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

  function fieldText(field) {
    if (typeof field === "string") return cleanText(field);
    const name = cleanText(field?.name);
    const values = Array.isArray(field?.values)
      ? field.values.map((value) => Array.isArray(value) ? value[0] : value).map(cleanText).filter(Boolean)
      : [];
    if (name && values.length && /\{\d+\}/.test(name)) {
      return cleanText(name.replace(/\{(\d+)\}/g, (_, index) => values[Number(index)] ?? ""));
    }
    const value = values.length ? values.join(" ") : fieldValueText(field);
    return cleanText(name && value ? `${name} ${value}` : (name || value));
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

  function itemData(entry) {
    return entry?.itemData || entry || {};
  }

  function itemName(entry) {
    const item = itemData(entry);
    return cleanText([item.name, item.typeLine || item.baseType].filter(Boolean).join(" ")) || cleanText(item.typeLine || item.baseType || item.name || "-");
  }

  function itemBaseType(entry) {
    const item = itemData(entry);
    return cleanText(item.typeLine || item.baseType || "");
  }

  function itemRarity(entry) {
    const item = itemData(entry);
    if (item.frameTypeId) return cleanText(item.frameTypeId);
    const map = { 0: "Normal", 1: "Magic", 2: "Rare", 3: "Unique", 4: "Gem", 5: "Currency", 6: "Divination", 9: "Relic" };
    return map[item.frameType] || cleanText(item.rarity || "-");
  }

  function localizedRarity(rarity) {
    const clean = cleanText(rarity);
    if (currentNameLang === "us" || !clean || clean === "-") return clean || "-";
    const map = {
      Normal: "普通",
      Magic: "魔法",
      Rare: "稀有",
      Unique: "传奇",
      Gem: "宝石",
      Currency: "通货",
      Divination: "命运卡",
      Relic: "遗物",
      RunicUnique: "符文传奇",
      RunicRare: "符文稀有",
      RunicMagic: "符文魔法",
      RunicNormal: "符文普通",
    };
    const translated = map[clean] || clean;
    return currentNameLang === "tw" ? simplifiedToTraditionalFallback(translated) : translated;
  }

  function itemSlot(entry, index) {
    const item = itemData(entry);
    const raw = cleanText(item.inventoryId || entry?.inventoryId || entry?.itemSlot || "");
    const map = {
      BodyArmour: "胸甲",
      Helm: "头盔",
      Gloves: "手套",
      Boots: "鞋子",
      Belt: "腰带",
      Amulet: "项链",
      Ring: "戒指",
      Ring2: "戒指2",
      Ring3: "戒指3",
      Weapon: "武器",
      Weapon2: "武器2",
      Offhand: "副手",
      Offhand2: "副手2",
      LifeFlask: "生命药剂",
      ManaFlask: "魔力药剂",
      Flask: "药剂",
      Charm: "咒符",
      Charms: "咒符",
      PassiveJewels: "珠宝",
    };
    return map[raw] || raw || `#${index + 1}`;
  }

  function itemProperties(entry) {
    const item = itemData(entry);
    return (item.properties || [])
      .map(fieldText)
      .filter(Boolean)
      .filter((text) => !/Stack Size|Limited to/i.test(text))
      .join(" / ");
  }

  function itemMods(entry) {
    const item = itemData(entry);
    const groups = [
      ["隐式", item.implicitMods],
      ["附魔/涂油", item.enchantMods],
      ["显式", item.explicitMods],
      ["破裂", item.fracturedMods],
      ["工艺", item.craftedMods],
      ["符文/镶嵌", item.runeMods],
      ["污化", item.desecratedMods],
      ["绑定", item.bondedMods],
    ];
    return groups.map(([label, mods]) => ({
      label,
      lines: (mods || []).map(cleanText).filter(Boolean),
    })).filter((group) => group.lines.length);
  }

  function equipmentSortValue(row) {
    const order = {
      Weapon: 10,
      Weapon2: 11,
      Offhand: 20,
      Offhand2: 21,
      Helm: 30,
      BodyArmour: 40,
      Gloves: 50,
      Boots: 60,
      Amulet: 70,
      Ring: 80,
      Ring2: 81,
      Ring3: 82,
      Belt: 90,
      LifeFlask: 100,
      ManaFlask: 101,
      Flask: 102,
      Charm: 110,
      Charms: 110,
    };
    return order[row.inventoryId] ?? 999;
  }

  function socketedItemNames(entry) {
    const item = itemData(entry);
    return (item.socketedItems || []).map((socketed) => cleanText(socketed.typeLine || socketed.baseType || socketed.name || "")).filter(Boolean);
  }

  function normalizeItem(entry, index, kind) {
    const item = itemData(entry);
    const properties = itemProperties(entry);
    const requirements = formatRequirements(item);
    return {
      originalIndex: index,
      kind,
      slot: itemSlot(entry, index),
      inventoryId: cleanText(item.inventoryId || entry?.inventoryId || ""),
      name: itemName(entry),
      baseType: itemBaseType(entry),
      rarity: itemRarity(entry),
      properties: [properties, requirements ? `需求 ${requirements}` : ""].filter(Boolean).join(" / ") || "-",
      mods: itemMods(entry),
      socketed: socketedItemNames(entry),
      corrupted: Boolean(item.corrupted),
      ilvl: item.ilvl || "",
      position: [item.x != null ? `x${item.x}` : "", item.y != null ? `y${item.y}` : ""].filter(Boolean).join(" / "),
    };
  }

  function normalizeEquipment(char) {
    const equipment = (char.items || []).map((entry, index) => normalizeItem(entry, index, "装备"));
    const flasks = (char.flasks || []).map((entry, index) => normalizeItem(entry, index, "药剂"));
    return [...equipment, ...flasks]
      .filter((item) => item.name && item.name !== "-")
      .sort((a, b) => equipmentSortValue(a) - equipmentSortValue(b) || a.originalIndex - b.originalIndex);
  }

  function normalizeJewels(char) {
    return (char.jewels || []).map((entry, index) => normalizeItem(entry, index, "珠宝")).filter((item) => item.name && item.name !== "-");
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
    if (row.tags) lines.push(`   标签: ${localizedModText(row.tags)}`);
    if (row.requirements) lines.push(`   需求: ${localizedModText(row.requirements)}`);
    if (row.dpsRows.length) lines.push(`   DPS: ${row.dpsRows.map((dps) => `${localizedName(dps.name)}: ${formatNumber(dps.dps || dps.dotDps)}`).join(" / ")}`);
    lines.push(`   已插入技能: ${row.inserted.length ? row.inserted.map((item) => `${item.rowType}:${localizedName(item.name)}${item.level !== "-" ? ` Lv${item.level}` : ""} ${item.quality}`).join(" / ") : "-"}`);
    return lines.join("\n");
  }

  function splitListText(text) {
    const clean = cleanText(text);
    if (!clean || clean === "-") return [];
    return clean.split(/\s+\/\s+/).map((part) => cleanText(part)).filter(Boolean);
  }

  function itemStatusText(row) {
    const parts = [];
    if (row.corrupted) parts.push(currentNameLang === "us" ? "corrupted" : "已腐化");
    if (row.ilvl) parts.push(`${currentNameLang === "us" ? "ilvl" : "物品等级"} ${row.ilvl}`);
    const text = parts.join(" / ");
    return currentNameLang === "tw" ? simplifiedToTraditionalFallback(text) : text;
  }

  function formatItemText(row, index) {
    const lines = [];
    const status = itemStatusText(row);
    lines.push(`${index + 1}. [${row.kind}] ${row.slot} | ${localizedItemName(row)} | ${localizedRarity(row.rarity)}${status ? ` | ${status}` : ""}`);
    const props = splitListText(row.properties).map(localizedModText);
    if (props.length) {
      lines.push("   属性/需求:");
      props.forEach((prop) => lines.push(`     - ${prop}`));
    }
    if (row.position) lines.push(`   位置: ${row.position}`);
    if (row.socketed.length) {
      lines.push("   插槽:");
      row.socketed.forEach((name) => lines.push(`     - ${localizedItemLabel(name)}`));
    }
    for (const group of row.mods) {
      lines.push(`   ${group.label}:`);
      group.lines.forEach((mod, modIndex) => lines.push(`     ${modIndex + 1}. ${localizedModText(mod)}`));
    }
    return lines.join("\n");
  }

  function currentCopyText() {
    const parts = [];
    if (lastEquipment.length) parts.push("【装备/药剂】\n" + lastEquipment.map(formatItemText).join("\n\n"));
    if (lastJewels.length) parts.push("【珠宝】\n" + lastJewels.map(formatItemText).join("\n\n"));
    parts.push("【技能】\n" + visibleRows(lastRows).map((row, index) => formatRowText(row, index)).join("\n\n"));
    return parts.filter(Boolean).join("\n\n");
  }

  function localizedItemName(row) {
    if (currentNameLang === "us") return row.name;
    const rarity = String(row.rarity || "");
    const translatedFull = localizedName(row.name);
    if (translatedFull && translatedFull !== row.name) return translatedFull;
    const translatedBase = row.baseType ? localizedName(row.baseType) : "";
    if (translatedBase && translatedBase !== row.baseType) {
      if (/Rare|Magic/i.test(rarity) && row.name.endsWith(row.baseType)) {
        return `${row.name.slice(0, -row.baseType.length).trim()} ${translatedBase}`.trim();
      }
      return translatedBase;
    }
    return localizedItemLabel(row.name);
  }

  function localizedItemLabel(text) {
    const clean = cleanText(text);
    if (!clean || clean === "-" || currentNameLang === "us") return clean || "-";
    const translated = clean
      .replace(/\bTranscendent Mana Flask\b/g, "超凡魔力药剂")
      .replace(/\bGargantuan Life Flask\b/g, "巨型生命药剂")
      .replace(/\bMana Flask\b/g, "魔力药剂")
      .replace(/\bLife Flask\b/g, "生命药剂")
      .replace(/\bFlask\b/g, "药剂")
      .replace(/\bCharm\b/g, "咒符")
      .replace(/\bVaal Ring\b/g, "瓦尔戒指")
      .replace(/\bRing\b/g, "戒指")
      .replace(/\bBelt\b/g, "腰带")
      .replace(/\bAmulet\b/g, "项链")
      .replace(/\bWand\b/g, "法杖")
      .replace(/\bShield\b/g, "盾")
      .replace(/\bHelmet\b/g, "头盔")
      .replace(/\bBody Armour\b/g, "胸甲")
      .replace(/\bBody Armor\b/g, "胸甲")
      .replace(/\bGloves\b/g, "手套")
      .replace(/\bBoots\b/g, "鞋子")
      .replace(/\bJewel\b/g, "珠宝");
    return currentNameLang === "tw" ? simplifiedToTraditionalFallback(translated) : translated;
  }

  function localizedModText(text) {
    const clean = cleanText(text);
    if (!clean || clean === "-" || currentNameLang === "us") return clean || "-";
    let translated = clean
      .replace(/\bArmoured Shield\b/g, "护甲盾")
      .replace(/\bLevel\b/g, "等级")
      .replace(/\bStr\b/g, "力量")
      .replace(/\bDex\b/g, "敏捷")
      .replace(/\bInt\b/g, "智慧")
      .replace(/\bAoE\b/g, "范围")
      .replace(/\bBuff\b/g, "增益")
      .replace(/\bPersistent\b/g, "永久")
      .replace(/\bTrigger\b/g, "触发")
      .replace(/\bMeta\b/g, "元技能")
      .replace(/\bMinion\b/g, "召唤生物")
      .replace(/\bCompanion\b/g, "伙伴")
      .replace(/\bSustained\b/g, "持续吟唱")
      .replace(/\bChannelling\b/g, "吟唱")
      .replace(/\bPhysical\b/g, "物理")
      .replace(/\bCold\b/g, "冰霜")
      .replace(/\bFire\b/g, "火焰")
      .replace(/\bLightning\b/g, "闪电")
      .replace(/\bChaos\b/g, "混沌")
      .replace(/\bDurationSkill\b/g, "持续时间")
      .replace(/\bDuration\b/g, "持续时间")
      .replace(/\bRemnant\b/g, "残片")
      .replace(/\bRepeatable\b/g, "可重复")
      .replace(/\bJewel\b/g, "珠宝")
      .replace(/\bRadius\b/g, "半径")
      .replace(/\bSmall\b/g, "小")
      .replace(/\bVery Large\b/g, "非常大")
      .replace(/\bLarge\b/g, "大")
      .replace(/\bVariable\b/g, "可变")
      .replace(/\bCaster Modifiers\b/g, "施法词缀")
      .replace(/\bLasts ([0-9.]+) Seconds?\b/g, "持续 $1 秒")
      .replace(/\bRecovers ([0-9.]+) Life over ([0-9.]+) Seconds?\b/g, "回复 $1 生命，持续 $2 秒")
      .replace(/\bRecovers ([0-9.]+) Mana every ([0-9.]+) Seconds?\b/g, "每 $2 秒回复 $1 魔力")
      .replace(/\bConsumes ([0-9.]+) of ([0-9.]+) Charges on use\b/g, "使用时消耗 $1/$2 充能")
      .replace(/\bCurrently has ([0-9.]+) Charges\b/g, "当前拥有 $1 充能")
      .replace(/\bAttack\b/g, "攻击")
      .replace(/\bMelee\b/g, "近战")
      .replace(/\bSpell\b/g, "法术")
      .replace(/\bProjectile\b/g, "投射物")
      .replace(/^Only Runes can be Socketed in this item$/g, "此物品只能镶嵌符文")
      .replace(/^(\d+)% increased effect of Socketed Runes$/g, "已镶嵌符文效果提高 $1%")
      .replace(/^Gain (\d+)% of maximum Life as Extra maximum Runic Ward$/g, "获得最大生命 $1% 的额外最大符文护盾")
      .replace(/^(\d+)% less maximum Life$/g, "最大生命更少 $1%")
      .replace(/^Gain (\d+)% of Damage as Extra Damage of all Elements$/g, "获得伤害的 $1% 作为所有元素的额外伤害")
      .replace(/^(\d+)% chance for Spell Skills to fire (\d+) additional Projectiles$/g, "法术技能有 $1% 几率额外发射 $2 个投射物")
      .replace(/^Bonded: (.+)$/g, "绑定：$1")
      .replace(/^Recover (\d+) Runic Ward when you Block$/g, "格挡时回复 $1 点符文护盾")
      .replace(/^(\d+) Life gained when you Block$/g, "格挡时获得 $1 点生命")
      .replace(/^(\d+) Mana gained when you Block$/g, "格挡时获得 $1 点魔力")
      .replace(/^(\d+)% increased Block chance$/g, "格挡率提高 $1%")
      .replace(/^Chance to Block Damage is Lucky$/g, "格挡伤害的几率特别幸运")
      .replace(/^Allocates (.+)$/g, "配置 $1")
      .replace(/^Can have 1 additional Crafted Modifier$/g, "可拥有 1 条额外工艺词缀")
      .replace(/^Raven-Touched$/g, "鸦触")
      .replace(/^(\d+)% increased Runic Ward$/g, "符文护盾提高 $1%")
      .replace(/^(\d+)% increased Mana Cost Efficiency$/g, "魔力消耗效率提高 $1%")
      .replace(/^(\d+)% increased Energy Shield Recharge Rate$/g, "能量护盾充能速度提高 $1%")
      .replace(/^All Damage taken from Hits Contributes to Magnitude of Chill inflicted on you$/g, "所有来自击中的伤害都会影响你身上冰缓的幅度")
      .replace(/^The Effect of Chill on you is reversed$/g, "你身上的冰缓效果反转")
      .replace(/^Effect is not removed when Unreserved Life is Filled$/g, "未保留生命回满时效果不会移除")
      .replace(/^No Inherent loss of Rage during effect$/g, "效果期间怒火不会自然流失")
      .replace(/^Cannot be Stunned$/g, "不会被眩晕")
      .replace(/^Grants Immunity to Freeze$/g, "获得冻结免疫")
      .replace(/^Used when you become Frozen$/g, "冻结时自动使用")
      .replace(/^Used when you become Stunned$/g, "被眩晕时自动使用")
      .replace(/^Used when you take Cold damage from a Hit$/g, "受到冰霜击中伤害时自动使用")
      .replace(/^Used when you take Fire damage from a Hit$/g, "受到火焰击中伤害时自动使用")
      .replace(/^Used when you take Lightning damage from a Hit$/g, "受到闪电击中伤害时自动使用")
      .replace(/^Grants a Power Charge on use$/g, "使用时获得一个暴击球")
      .replace(/^(\+?\d+) to maximum Energy Shield$/g, "$1 最大能量护盾")
      .replace(/^(\+?\d+) to maximum Life$/g, "$1 最大生命")
      .replace(/^(\+?\d+) to maximum Mana$/g, "$1 最大魔力")
      .replace(/^(\+?\d+) to Strength$/g, "$1 力量")
      .replace(/^(\+?\d+) to Dexterity$/g, "$1 敏捷")
      .replace(/^(\+?\d+) to Intelligence$/g, "$1 智慧")
      .replace(/^(\+?\d+)% to Fire Resistance$/g, "$1% 火焰抗性")
      .replace(/^(\+?\d+)% to Cold Resistance$/g, "$1% 冰霜抗性")
      .replace(/^(\+?\d+)% to Lightning Resistance$/g, "$1% 闪电抗性")
      .replace(/^(\+?\d+)% to Chaos Resistance$/g, "$1% 混沌抗性")
      .replace(/^(\d+)% increased Energy Shield$/g, "$1% 提高能量护盾")
      .replace(/^(\d+)% increased maximum Energy Shield$/g, "$1% 提高最大能量护盾")
      .replace(/^(\d+)% increased maximum Life$/g, "$1% 提高最大生命")
      .replace(/^(\d+)% increased maximum Mana$/g, "$1% 提高最大魔力")
      .replace(/^(\d+)% increased Movement Speed$/g, "$1% 提高移动速度")
      .replace(/^(\d+)% increased Cast Speed$/g, "$1% 提高施法速度")
      .replace(/^(\d+)% increased Attack Speed$/g, "$1% 提高攻击速度")
      .replace(/^(\d+)% increased Spell Damage$/g, "$1% 提高法术伤害")
      .replace(/^(\d+)% increased Elemental Damage$/g, "$1% 提高元素伤害")
      .replace(/^(\d+)% increased Projectile Damage$/g, "$1% 提高投射物伤害")
      .replace(/^(\d+)% increased Duration$/g, "$1% 提高持续时间")
      .replace(/^(\d+)% reduced Charges per use$/g, "$1% 降低每次使用消耗充能")
      .replace(/\bmaximum Energy Shield\b/g, "最大能量护盾")
      .replace(/\bmaximum Runic Ward\b/g, "最大符文护盾")
      .replace(/\bRunic Ward\b/g, "符文护盾")
      .replace(/\bRunes\b/g, "符文")
      .replace(/\bRune\b/g, "符文")
      .replace(/\bEnergy Shield\b/g, "能量护盾")
      .replace(/\bRecharge Rate\b/g, "充能速度")
      .replace(/\bCost Efficiency\b/g, "消耗效率")
      .replace(/\bmaximum Life\b/g, "最大生命")
      .replace(/\bLife\b/g, "生命")
      .replace(/\bmaximum Mana\b/g, "最大魔力")
      .replace(/\bMana\b/g, "魔力")
      .replace(/\bEvasion Rating\b/g, "闪避值")
      .replace(/\bArmour\b/g, "护甲")
      .replace(/\bEvasion\b/g, "闪避")
      .replace(/\bFire Resistance\b/g, "火焰抗性")
      .replace(/\bCold Resistance\b/g, "冰霜抗性")
      .replace(/\bLightning Resistance\b/g, "闪电抗性")
      .replace(/\bChaos Resistance\b/g, "混沌抗性")
      .replace(/\ball Elemental Resistances\b/g, "所有元素抗性")
      .replace(/\bElemental Resistances\b/g, "元素抗性")
      .replace(/\bResistances\b/g, "抗性")
      .replace(/\bStrength\b/g, "力量")
      .replace(/\bDexterity\b/g, "敏捷")
      .replace(/\bIntelligence\b/g, "智慧")
      .replace(/\bSpirit\b/g, "精魂")
      .replace(/\bMovement Speed\b/g, "移动速度")
      .replace(/\bCast Speed\b/g, "施法速度")
      .replace(/\bAttack Speed\b/g, "攻击速度")
      .replace(/\bCritical Hit Chance\b/g, "暴击率")
      .replace(/\bCritical Damage Bonus\b/g, "暴击伤害加成")
      .replace(/\bProjectile Speed\b/g, "投射物速度")
      .replace(/\bProjectile Damage\b/g, "投射物伤害")
      .replace(/\bSpell Damage\b/g, "法术伤害")
      .replace(/\bElemental Damage\b/g, "元素伤害")
      .replace(/\bPhysical Damage\b/g, "物理伤害")
      .replace(/\bLightning damage\b/g, "闪电伤害")
      .replace(/\bCold damage\b/g, "冰霜伤害")
      .replace(/\bFire damage\b/g, "火焰伤害")
      .replace(/\bAttack Damage\b/g, "攻击伤害")
      .replace(/\bDamage\b/g, "伤害")
      .replace(/\bCharges per use\b/g, "每次使用消耗充能")
      .replace(/\bCharges gained\b/g, "获得的充能")
      .replace(/\bCharges\b/g, "充能")
      .replace(/\bDuration\b/g, "持续时间")
      .replace(/\bRecovery\b/g, "回复")
      .replace(/\bRarity of Items found\b/g, "物品稀有度")
      .replace(/\bRage\b/g, "怒火")
      .replace(/\bPower Charge\b/g, "暴击球")
      .replace(/\bFrenzy Charge\b/g, "狂怒球")
      .replace(/\bEndurance Charge\b/g, "耐力球")
      .replace(/\bFreeze\b/g, "冻结")
      .replace(/\bFrozen\b/g, "冻结")
      .replace(/\bChill\b/g, "冰缓")
      .replace(/\bShock\b/g, "感电")
      .replace(/\bIgnite\b/g, "点燃")
      .replace(/\bStun\b/g, "眩晕")
      .replace(/\bStunned\b/g, "被眩晕")
      .replace(/\bCurse\b/g, "诅咒")
      .replace(/\bFlasks\b/g, "药剂")
      .replace(/\bFlask\b/g, "药剂")
      .replace(/\bCharm\b/g, "咒符")
      .replace(/\bSockets\b/g, "插槽")
      .replace(/\bSocketed\b/g, "已镶嵌")
      .replace(/\bSocket\b/g, "插槽")
      .replace(/\bGrants\b/g, "获得")
      .replace(/\bGain\b/g, "获得")
      .replace(/\bUsed when you become\b/g, "当你变为以下状态时使用：")
      .replace(/\bUsed when you take\b/g, "当你受到以下伤害时使用：")
      .replace(/\bfrom a Hit\b/g, "来自击中")
      .replace(/\bwhen Hit by an Enemy\b/g, "被敌人击中时")
      .replace(/\bduring effect\b/g, "效果期间")
      .replace(/\bon use\b/g, "使用时")
      .replace(/\bper use\b/g, "每次使用")
      .replace(/\bas Life\b/g, "为生命")
      .replace(/\bas Mana\b/g, "为魔力")
      .replace(/\bto maximum\b/g, "最大")
      .replace(/\bto\b/g, "至")
      .replace(/\bof\b/g, "的")
      .replace(/\bincreased\b/g, "提高")
      .replace(/\breduced\b/g, "降低")
      .replace(/\bmore\b/g, "更多")
      .replace(/\bless\b/g, "更少")
      .replace(/\bAdds\b/g, "附加")
      .replace(/\bAdded\b/g, "附加")
      .replace(/\bExtra\b/g, "额外")
      .replace(/\bCannot be\b/g, "不能被")
      .replace(/\bImmunity to\b/g, "免疫")
      .replace(/\bEffect is not removed when Unreserved Life is Filled\b/g, "未保留生命回满时效果不会移除")
      .replace(/\bNo Inherent loss of\b/g, "不会自然失去")
      .replace(/\bRecouped\b/g, "补偿")
      .replace(/\bLeech\b/g, "偷取")
      .replace(/\bEnemies\b/g, "敌人")
      .replace(/\bEnemy\b/g, "敌人")
      .replace(/\bAttack\b/g, "攻击")
      .replace(/\bAttacks\b/g, "攻击")
      .replace(/\bSpell\b/g, "法术")
      .replace(/\bSpells\b/g, "法术")
      .replace(/\bProjectile\b/g, "投射物")
      .replace(/\bProjectiles\b/g, "投射物")
      .replace(/\bTriggered\b/g, "触发")
      .replace(/\bMagnitude\b/g, "幅度")
      .replace(/\bBuff\b/g, "增益")
      .replace(/\bLow Mana\b/g, "低魔力")
      .replace(/\bUnreserved\b/g, "未保留");
    translated = translated
      .replace(/\bQuality\b/g, "品质")
      .replace(/\bLevel\b/g, "等级")
      .replace(/\bStr\b/g, "力量")
      .replace(/\bDex\b/g, "敏捷")
      .replace(/\bInt\b/g, "智慧")
      .replace(/\bWand\b/g, "法杖")
      .replace(/\bShield\b/g, "盾")
      .replace(/\bHelmet\b/g, "头盔")
      .replace(/\bBody Armour\b/g, "胸甲")
      .replace(/\bBody Armor\b/g, "胸甲")
      .replace(/\bGloves\b/g, "手套")
      .replace(/\bBoots\b/g, "鞋子")
      .replace(/\bAmulet\b/g, "项链")
      .replace(/\bRing\b/g, "戒指")
      .replace(/\bBelt\b/g, "腰带")
      .replace(/\bBlock chance\b/g, "格挡率")
      .replace(/\bBlock\b/g, "格挡")
      .replace(/\bLucky\b/g, "幸运")
      .replace(/\bUnlucky\b/g, "不幸运")
      .replace(/\bElemental Infusion\b/g, "元素灌注")
      .replace(/\bElements\b/g, "元素")
      .replace(/\ball\b/g, "所有")
      .replace(/\bSkills\b/g, "技能")
      .replace(/\bSkill\b/g, "技能")
      .replace(/\bfire\b/g, "发射")
      .replace(/\badditional\b/g, "额外")
      .replace(/\bchance\b/g, "几率")
      .replace(/\bwhile on full\b/g, "满")
      .replace(/\bwhen collecting\b/g, "拾取时")
      .replace(/\bsame type\b/g, "同类型")
      .replace(/\brecovery period expires\b/g, "回复周期结束")
      .replace(/\bfaster\b/g, "更快")
      .replace(/\bBreak\b/g, "破坏")
      .replace(/\bdealt\b/g, "造成")
      .replace(/\bLeeches\b/g, "偷取")
      .replace(/\bCast\b/g, "施放")
      .replace(/\bEvery\b/g, "每个")
      .replace(/\balso\b/g, "也");
    translated = translated
      .replace(/\bBody 护甲\b/g, "胸甲")
      .replace(/\bBody 护甲\b/g, "胸甲")
      .replace(/\b闪避 Rating\b/g, "闪避值")
      .replace(/\b格挡 几率\b/g, "格挡率")
      .replace(/\bVaal 戒指\b/g, "瓦尔戒指")
      .replace(/\[([^\]]+)\]/g, "$1");
    translated = translated.replace(/\s+/g, " ").trim();
    return currentNameLang === "tw" ? simplifiedToTraditionalFallback(translated) : translated;
  }

  function renderModGroups(groups) {
    if (!groups.length) return "-";
    return groups.map((group) => `
      <div class="codex-mod-group">
        <div class="codex-mod-label">${escapeHtml(group.label)}</div>
        <div class="codex-mod-list">
          ${group.lines.map((line, index) => `
            <div class="codex-list-row">
              <span class="codex-list-marker">${index + 1}.</span>
              <span>${escapeHtml(localizedModText(line))}</span>
            </div>
          `).join("")}
        </div>
      </div>
    `).join("");
  }

  function renderCellList(items, ordered = false) {
    const lines = items.map((item) => cleanText(item)).filter(Boolean);
    if (!lines.length) return "-";
    return `<div class="codex-cell-list">${lines.map((line, index) => `
      <div class="codex-list-row">
        <span class="codex-list-marker">${ordered ? `${index + 1}.` : "•"}</span>
        <span>${escapeHtml(line)}</span>
      </div>
    `).join("")}</div>`;
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
        color: var(--color-coolgrey-100, #d7dde6);
        font-family: Inter, "Microsoft YaHei UI", "Microsoft YaHei", sans-serif;
        -webkit-user-select: text !important;
        user-select: text !important;
      }
      #${PANEL_ID} *, #${PANEL_ID} table, #${PANEL_ID} td, #${PANEL_ID} th {
        box-sizing: border-box;
      }
      #${PANEL_ID} button {
        cursor: pointer;
        border: 1px solid var(--color-coolgrey-700, #374151);
        border-radius: 4px;
        background: var(--color-coolgrey-850, #111827);
        color: var(--color-coolgrey-100, #d7dde6);
        padding: 5px 10px;
        font-size: 13px;
      }
      #${PANEL_ID} button:hover { background: var(--color-coolgrey-800, #1f2937); }
      #${PANEL_ID} button.codex-active-control {
        border-color: var(--color-emerald-400, #10d9a3);
        color: var(--color-emerald-300, #33e0b5);
        background: rgba(16, 217, 163, 0.12);
      }
      #${PANEL_ID} button:disabled { opacity: 0.55; cursor: default; }
      #${PANEL_ID} .codex-panel-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        min-height: 46px;
        padding: 0 16px;
        border: 1px solid var(--color-coolgrey-700, #303846);
        border-bottom: 0;
        background: var(--color-coolgrey-850, #111827);
      }
      #${PANEL_ID} .codex-title { font-size: 18px; font-weight: 650; }
      #${PANEL_ID} .codex-updated { margin-left: 10px; color: var(--color-coolgrey-400, #8b95a7); font-size: 12px; font-weight: 400; }
      #${PANEL_ID} .codex-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
      #${PANEL_ID} .codex-controls {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 8px 18px;
        padding: 12px 16px;
        border: 1px solid var(--color-coolgrey-700, #303846);
        background: var(--color-coolgrey-900, #0b1018);
      }
      #${PANEL_ID} .codex-summary { color: var(--color-coolgrey-200, #c8d2e1); }
      #${PANEL_ID} .codex-control-group { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
      #${PANEL_ID} .codex-label { color: var(--color-coolgrey-400, #8b95a7); font-size: 12px; margin-right: 2px; }
      #${PANEL_ID} .codex-body {
        padding: 12px;
        border: 1px solid var(--color-coolgrey-700, #303846);
        border-top: 0;
        background: rgba(8, 13, 20, 0.82);
      }
      #${PANEL_ID} .codex-section {
        margin-bottom: 18px;
      }
      #${PANEL_ID} .codex-section-title {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin: 4px 0 10px;
        color: var(--color-coolgrey-100, #f2f4f7);
        font-size: 16px;
        font-weight: 650;
      }
      #${PANEL_ID} .codex-section-title span {
        color: var(--color-coolgrey-400, #8b95a7);
        font-size: 12px;
        font-weight: 400;
      }
      #${PANEL_ID} .codex-skill-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        margin: -2px 0 10px;
        padding: 8px 10px;
        border: 1px solid var(--color-coolgrey-700, #2a3341);
        background: rgba(255,255,255,0.02);
      }
      #${PANEL_ID} .codex-skill-summary {
        color: var(--color-coolgrey-400, #8b95a7);
        font-size: 12px;
        font-weight: 400;
      }
      #${PANEL_ID} .codex-skill-controls {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 6px;
        flex-wrap: wrap;
      }
      #${PANEL_ID} .codex-skill-card {
        margin-bottom: 10px;
        padding: 11px 14px;
        border: 1px solid var(--color-coolgrey-700, #2a3341);
        border-left-width: 4px;
        background: rgba(255,255,255,0.02);
      }
      #${PANEL_ID} .codex-type-active { border-left-color: #f5c76a; }
      #${PANEL_ID} .codex-type-passive, #${PANEL_ID} .codex-type-spirit { border-left-color: var(--color-emerald-400, #10d9a3); }
      #${PANEL_ID} .codex-type-granted { border-left-color: var(--color-emerald-400, #10d9a3); }
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
      #${PANEL_ID} .codex-type-badge.codex-type-passive, #${PANEL_ID} .codex-type-badge.codex-type-spirit { color: var(--color-emerald-300, #33e0b5); }
      #${PANEL_ID} .codex-type-badge.codex-type-granted { color: #7bb6f0; }
      #${PANEL_ID} .codex-name { font-size: 16px; font-weight: 650; color: #f2f4f7; }
      #${PANEL_ID} .codex-meta {
        color: #c8d2e1;
        border: 1px solid var(--color-coolgrey-700, #263244);
        background: rgba(255,255,255,0.03);
        padding: 1px 8px;
        font-size: 13px;
      }
      #${PANEL_ID} .codex-line { margin-top: 4px; color: var(--color-coolgrey-300, #aeb8c8); font-size: 13px; line-height: 1.45; word-break: break-word; }
      #${PANEL_ID} .codex-line-label { color: var(--color-coolgrey-500, #7f8ba0); margin-right: 6px; }
      #${PANEL_ID} table {
        width: 100%;
        margin-top: 8px;
        border-collapse: collapse;
        table-layout: fixed;
        font-size: 13px;
      }
      #${PANEL_ID} th, #${PANEL_ID} td {
        border: 1px solid var(--color-coolgrey-700, #2a3341);
        padding: 5px 8px;
        text-align: left;
        vertical-align: middle;
        word-break: break-word;
      }
      #${PANEL_ID} th { color: var(--color-coolgrey-300, #9aa6b8); font-weight: 500; background: rgba(255,255,255,0.03); }
      #${PANEL_ID} .codex-index { width: 46px; text-align: center; }
      #${PANEL_ID} .codex-insert-type { width: 72px; text-align: center; font-weight: 700; }
      #${PANEL_ID} .codex-insert-type-active { color: #f5c76a; }
      #${PANEL_ID} .codex-insert-type-passive { color: #76d191; }
      #${PANEL_ID} .codex-insert-type-lineage { color: #c99cff; }
      #${PANEL_ID} .codex-level, #${PANEL_ID} .codex-quality, #${PANEL_ID} .codex-sockets { width: 96px; }
      #${PANEL_ID} .codex-requirements { width: 190px; }
      #${PANEL_ID} .codex-item-slot { width: 86px; }
      #${PANEL_ID} .codex-item-rarity { width: 82px; }
      #${PANEL_ID} .codex-item-props { width: 180px; }
      #${PANEL_ID} .codex-item-socketed { width: 170px; }
      #${PANEL_ID} .codex-item-mods { color: var(--color-coolgrey-200, #c8d2e1); }
      #${PANEL_ID} .codex-item-name { color: var(--color-coolgrey-100, #f2f4f7); font-weight: 600; }
      #${PANEL_ID} .codex-mod-group + .codex-mod-group {
        margin-top: 6px;
        padding-top: 6px;
        border-top: 1px solid var(--color-coolgrey-700, #263244);
      }
      #${PANEL_ID} .codex-mod-label {
        margin-bottom: 2px;
        color: var(--color-amber-300, #f5c76a);
        font-size: 12px;
      }
      #${PANEL_ID} .codex-mod-list {
        margin: 2px 0 0 0;
        padding-left: 0;
      }
      #${PANEL_ID} .codex-cell-list {
        margin: 0;
        padding-left: 0;
      }
      #${PANEL_ID} .codex-list-row {
        display: grid;
        grid-template-columns: 24px minmax(0, 1fr);
        column-gap: 6px;
        margin: 2px 0;
        line-height: 1.42;
      }
      #${PANEL_ID} .codex-list-marker {
        color: var(--color-coolgrey-300, #9aa6b8);
        text-align: right;
        user-select: text;
      }
      @media (max-width: 760px) {
        #${PANEL_ID} { width: calc(100vw - 16px); margin: 16px 8px; }
        #${PANEL_ID} .codex-skill-toolbar { align-items: flex-start; }
        #${PANEL_ID} .codex-skill-controls { justify-content: flex-start; }
      }
    `;
    document.head.appendChild(style);
  }

  function panel() {
    return document.getElementById(PANEL_ID);
  }

  function panelMountTarget() {
    return document.querySelector("main") || document.querySelector("article");
  }

  function waitForPanelMountTarget(timeoutMs = 6000) {
    const existing = panelMountTarget();
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      const timer = setInterval(() => {
        const target = panelMountTarget();
        if (target) {
          clearInterval(timer);
          resolve(target);
          return;
        }
        if (Date.now() - startedAt > timeoutMs) {
          clearInterval(timer);
          reject(new Error("页面主体尚未加载完成"));
        }
      }, 100);
    });
  }

  function mountPanel(target = panelMountTarget()) {
    if (!target) return null;
    ensureStyle();
    let root = panel();
    if (!root) {
      root = document.createElement("section");
      root.id = PANEL_ID;
      root.innerHTML = `
        <div class="codex-panel-head">
          <div class="codex-title">BD信息 <span class="codex-updated">更新：${SCRIPT_UPDATED_AT}</span></div>
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
        </div>
        <div class="codex-body"></div>
      `;
      root.addEventListener("click", onPanelClick);
    }
    target.appendChild(root);
    return root;
  }

  async function ensurePanel() {
    return mountPanel(await waitForPanelMountTarget());
  }

  function updateControls() {
    const root = panel();
    if (!root) return;
    const char = currentModel ? modelChar(currentModel.data) : null;
    root.querySelector(".codex-summary").textContent = char ? `${cleanText(char.name)} Lv${char.level || "-"} ${cleanText(char.class || "")}` : "";
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

  async function renderRows() {
    const root = await ensurePanel();
    const body = root.querySelector(".codex-body");
    body.innerHTML = "";
    updateControls();
    renderItemSection(body, "装备/药剂", lastEquipment, false);
    renderItemSection(body, "珠宝", lastJewels, true);
    const skillSection = document.createElement("section");
    skillSection.className = "codex-section";
    const summary = summarizeRows(lastRows);
    skillSection.innerHTML = `
      <div class="codex-section-title">技能 <span>${visibleRows(lastRows).length} 个</span></div>
      <div class="codex-skill-toolbar">
        <div class="codex-skill-summary">总技能 ${summary.total} | 主动 ${summary.active} | 被动 ${summary.passive}${summary.spirit ? ` | 精魂 ${summary.spirit}` : ""}</div>
        <div class="codex-skill-controls">
          <span class="codex-label">筛选</span>
          <button type="button" data-filter="all">全部</button>
          <button type="button" data-filter="active">主动</button>
          <button type="button" data-filter="passive">被动</button>
          <span class="codex-label" style="margin-left:8px;">排序</span>
          <button type="button" data-sort="original">原序</button>
          <button type="button" data-sort="type">类型</button>
        </div>
      </div>
    `;
    body.appendChild(skillSection);
    updateControls();
    const rows = visibleRows(lastRows);
    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = "codex-skill-card";
      empty.textContent = "没有读取到技能数据。";
      skillSection.appendChild(empty);
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
        <div class="codex-line codex-tags"><span class="codex-line-label">标签</span>${escapeHtml(localizedModText(row.tags || "-"))}</div>
        ${row.requirements ? `<div class="codex-line codex-req"><span class="codex-line-label">需求</span>${escapeHtml(localizedModText(row.requirements))}</div>` : ""}
        ${row.dpsRows.length ? `<div class="codex-line"><span class="codex-line-label">DPS</span>${escapeHtml(row.dpsRows.map((dps) => `${localizedName(dps.name)} ${formatNumber(dps.dps || dps.dotDps)}`).join(" / "))}</div>` : ""}
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
            <td class="codex-requirements">${escapeHtml(localizedModText(item.requirements || "-"))}</td>
          `;
          tr.querySelector(".codex-insert-name").textContent = localizedName(item.name);
          tbody.appendChild(tr);
        });
        card.appendChild(table);
      }
      skillSection.appendChild(card);
    }
  }

  function renderItemSection(body, title, rows, isJewel) {
    if (!rows.length) return;
    const section = document.createElement("section");
    section.className = "codex-section";
    section.innerHTML = `<div class="codex-section-title">${title} <span>${rows.length} 个</span></div>`;
    const table = document.createElement("table");
    table.innerHTML = `
      <thead>
        <tr>
          <th class="codex-index">#</th>
          <th class="codex-item-slot">${isJewel ? "位置" : "部位"}</th>
          <th>名称</th>
          <th class="codex-item-rarity">稀有度</th>
          <th class="codex-item-props">属性/需求</th>
          <th class="codex-item-socketed">插槽物</th>
          <th>词缀</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector("tbody");
    rows.forEach((row, index) => {
      const tr = document.createElement("tr");
      const slot = isJewel ? (row.position || row.slot || "-") : row.slot;
      const propertyItems = splitListText(row.properties).map(localizedModText);
      const socketedHtml = renderCellList(row.socketed.map(localizedItemLabel), false);
      tr.innerHTML = `
        <td class="codex-index">${index + 1}</td>
        <td class="codex-item-slot">${escapeHtml(slot)}</td>
        <td class="codex-item-name"></td>
        <td class="codex-item-rarity">${escapeHtml(localizedRarity(row.rarity))}</td>
        <td class="codex-item-props">${renderCellList(propertyItems, false)}</td>
        <td class="codex-item-socketed">${socketedHtml}</td>
        <td class="codex-item-mods">${renderModGroups(row.mods)}</td>
      `;
      const status = itemStatusText(row);
      tr.querySelector(".codex-item-name").textContent = `${localizedItemName(row)}${status ? ` (${status})` : ""}`;
      tbody.appendChild(tr);
    });
    section.appendChild(table);
    body.appendChild(section);
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
    let existingPanel = panel();
    if (showLoading) {
      existingPanel = existingPanel || await ensurePanel();
      existingPanel.querySelector(".codex-body").innerHTML = `<div class="codex-skill-card">正在读取 poe.ninja BD 数据...</div>`;
    }
    const route = currentRoute || parseCharacterLink(location.href);
    if (!route) {
      const root = await ensurePanel();
      const body = root.querySelector(".codex-body");
      body.innerHTML = `<div class="codex-skill-card">当前页面没有识别到 poe.ninja POE2 角色链接。可在 Tampermonkey 菜单里设置 NinjaBD 镜像站。</div>`;
      return;
    }
    currentRoute = route;
    const data = await fetchLatestModel(route);
    const char = modelChar(data);
    lastRows = (char.skills || []).map(normalizeSkillGroup).filter((row) => row.name);
    lastEquipment = normalizeEquipment(char);
    lastJewels = normalizeJewels(char);
    lastText = currentCopyText();
    await renderRows();
    preloadNameMaps();
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
      await renderRows();
      return;
    }
    if (button.dataset.sort) {
      currentSort = button.dataset.sort;
      await renderRows();
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
    refresh({ showLoading: true }).catch((error) => {
      console.warn("POE2 NinjaBD增强读取失败", error);
      ensurePanel().then((root) => {
        root.querySelector(".codex-body").innerHTML = `<div class="codex-skill-card">读取失败：${cleanText(error?.message || error)}</div>`;
      }).catch(console.warn);
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

