// ==UserScript==
// @name         Bilibili Year Filter
// @namespace    local.byf
// @version      1.0.0
// @description  Filter Bilibili web video cards by the actual publication year.
// @match        https://www.bilibili.com/*
// @match        https://search.bilibili.com/*
// @match        https://space.bilibili.com/*
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  const SETTINGS_KEY = "byf:settings:v1";
  const CACHE_KEY = "byf:meta:records:v1";
  const DEFAULTS = Object.freeze({
    schemaVersion: 1,
    enabled: true,
    excludedYears: [],
    blockedMarkerGroups: [],
    minYear: null,
    recentYears: null,
    action: "hide",
    unknownPolicy: "show",
    showYearBadge: false,
  });
  const BVID_PATTERN = /BV[0-9A-Za-z]{10}/;

  function normalizeSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    return {
      ...DEFAULTS,
      ...source,
      schemaVersion: 1,
      enabled: source.enabled !== false,
      excludedYears: Array.isArray(source.excludedYears)
        ? [...new Set(source.excludedYears.map(Number).filter(Number.isInteger))].sort((a, b) => b - a)
        : [],
      blockedMarkerGroups: Array.isArray(source.blockedMarkerGroups)
        ? [...new Set(source.blockedMarkerGroups)].filter((group) => ["entertainment", "anime", "classroom", "ad"].includes(group))
        : [],
      minYear:
        source.minYear == null || (typeof source.minYear === "string" && source.minYear.trim() === "")
          ? null
          : Number.isInteger(Number(source.minYear))
            ? Number(source.minYear)
            : null,
      recentYears: [1, 3, 5, 10].includes(Number(source.recentYears)) ? Number(source.recentYears) : null,
      action: ["hide", "dim", "collapse"].includes(source.action) ? source.action : "hide",
      unknownPolicy: "show",
      showYearBadge: source.showYearBadge === true,
    };
  }

  function evaluate(year, settings, currentYear) {
    if (!settings.enabled) return { action: "show", reason: "disabled" };
    if (year == null) return { action: "show", reason: "unknown_year" };
    if (settings.excludedYears.includes(year)) return { action: settings.action, reason: "excluded_year" };
    if (settings.minYear != null && year < settings.minYear) return { action: settings.action, reason: "before_min_year" };
    if (settings.recentYears != null && year < currentYear - settings.recentYears + 1) {
      return { action: settings.action, reason: "outside_recent_window" };
    }
    return { action: "show", reason: "allowed" };
  }

  const MARKER_GROUP_BY_LABEL = Object.freeze({
    综艺: "entertainment",
    电影: "entertainment",
    电视剧: "entertainment",
    纪录片: "entertainment",
    国创: "entertainment",
    直播: "entertainment",
    直播中: "entertainment",
    番剧: "anime",
    漫画: "anime",
    课堂: "classroom",
    广告: "ad",
  });

  function isAdvertisementHref(href) {
    return typeof href === "string" && /^(?:https?:)?\/\/cm\.bilibili\.com(?:\/|$)/i.test(href.trim());
  }

  function readSpecialMarker(card) {
    const nodes = [
      card.matches?.(
        ".bili-video-card__info--ad, .bili-video-card__info--ad-text, [data-ad-label], [data-label='广告'], [aria-label='广告']",
      )
        ? card
        : null,
      card.querySelector?.(":scope .floor-card-inner .cover-container a .badge span"),
      card.querySelector?.(":scope .floor-single-card .badge span"),
      card.querySelector?.(":scope .bili-video-card__info--living__text"),
      card.querySelector?.(":scope .bili-video-card__info--ad"),
      card.querySelector?.(":scope .bili-video-card__info--ad-text"),
      card.querySelector?.(":scope [data-ad-label]"),
      card.querySelector?.(":scope [data-label='广告']"),
      card.querySelector?.(":scope [aria-label='广告']"),
      ...(card.querySelectorAll?.(":scope .bili-video-card__stats--text") || []),
    ].filter(Boolean);
    for (const node of nodes) {
      const label = node.textContent?.trim();
      const group = MARKER_GROUP_BY_LABEL[label];
      if (group) return { label, group };
    }

    const adLink = [
      ...(card.matches?.("a[href]") ? [card] : []),
      ...(card.querySelectorAll?.("a[href]") || []),
    ].find(
      (anchor) =>
        isAdvertisementHref(anchor.getAttribute("href")) &&
        anchor.textContent?.trim() === "广告",
    );
    if (adLink) return { label: "广告", group: "ad" };

    return null;
  }

  function markerDecision(card, settings) {
    const group = card.specialMarker?.group;
    return settings.enabled && group && settings.blockedMarkerGroups.includes(group)
      ? { action: settings.action, reason: "blocked_marker" }
      : null;
  }

  function parseDateText(text, nowInput = Date.now()) {
    if (typeof text !== "string" || !text.trim()) return null;
    const value = text.trim();
    const now = new Date(nowInput);
    if (!Number.isFinite(now.getTime())) return null;
    const absolute = value.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (absolute) {
      const date = new Date(Number(absolute[1]), Number(absolute[2]) - 1, Number(absolute[3]), Number(absolute[4] || 0), Number(absolute[5] || 0), Number(absolute[6] || 0));
      if (date.getFullYear() !== Number(absolute[1]) || date.getMonth() !== Number(absolute[2]) - 1 || date.getDate() !== Number(absolute[3])) return null;
      return { year: date.getFullYear(), timestampMs: date.getTime() };
    }
    if (/^昨天/.test(value)) {
      const date = new Date(now);
      date.setDate(date.getDate() - 1);
      return { year: date.getFullYear(), timestampMs: date.getTime() };
    }
    const relative = value.match(/^(\d+)\s*(秒钟?|分钟?|小时|天)前$/);
    if (relative) {
      const unitMs = { 秒: 1000, 秒钟: 1000, 分: 60000, 分钟: 60000, 小时: 3600000, 天: 86400000 }[relative[2]];
      const date = new Date(now.getTime() - Number(relative[1]) * unitMs);
      return { year: date.getFullYear(), timestampMs: date.getTime() };
    }
    if (value === "刚刚") return { year: now.getFullYear(), timestampMs: now.getTime() };
    return null;
  }

  function safeRead(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function safeWrite(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_error) { /* fail open */ }
  }

  class Cache {
    constructor() {
      this.records = safeRead(CACHE_KEY, {});
    }

    get(bvid) {
      const record = this.records[bvid];
      if (!record) return null;
      if (record.status === "negative" && record.retryAfterMs <= Date.now()) {
        delete this.records[bvid];
        safeWrite(CACHE_KEY, this.records);
        return null;
      }
      record.lastAccessAtMs = Date.now();
      safeWrite(CACHE_KEY, this.records);
      return { ...record };
    }

    put(record) {
      this.records[record.bvid] = {
        status: "positive",
        bvid: record.bvid,
        year: record.year,
        timestampMs: record.timestampMs || null,
        source: record.source,
        resolvedAtMs: Date.now(),
        lastAccessAtMs: Date.now(),
      };
      this.trim();
      safeWrite(CACHE_KEY, this.records);
    }

    putNegative(bvid, reason, ttlMs) {
      this.records[bvid] = { status: "negative", bvid, reason, retryAfterMs: Date.now() + ttlMs, lastAccessAtMs: Date.now() };
      this.trim();
      safeWrite(CACHE_KEY, this.records);
    }

    trim() {
      const keys = Object.keys(this.records);
      if (keys.length <= 20000) return;
      keys.sort((a, b) => (this.records[a].lastAccessAtMs || 0) - (this.records[b].lastAccessAtMs || 0));
      for (const key of keys.slice(0, keys.length - 20000)) delete this.records[key];
    }
  }

  class Queue {
    constructor({ concurrency = 6, minDelayMs = 80, maxRetries = 1 } = {}) {
      this.concurrency = concurrency;
      this.minDelayMs = minDelayMs;
      this.maxRetries = maxRetries;
      this.pending = [];
      this.active = 0;
      this.inFlight = new Map();
      this.lastStart = 0;
    }

    enqueue(key, task) {
      if (this.inFlight.has(key)) return this.inFlight.get(key);
      const promise = new Promise((resolve, reject) => {
        this.pending.push({ key, task, resolve, reject, attempt: 0 });
        this.drain();
      });
      this.inFlight.set(key, promise);
      return promise;
    }

    drain() {
      while (this.active < this.concurrency && this.pending.length) {
        const job = this.pending.shift();
        this.active += 1;
        this.run(job).finally(() => {
          this.active -= 1;
          this.inFlight.delete(job.key);
          this.drain();
        });
      }
    }

    async run(job) {
      for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
        try {
          const delay = Math.max(0, this.lastStart + this.minDelayMs - Date.now());
          if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
          this.lastStart = Date.now();
          const result = await job.task();
          job.resolve(result);
          return;
        } catch (error) {
          if (attempt === this.maxRetries || error?.code === "invalid_response") {
            job.reject(error);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, (attempt === 0 ? 1000 : 3000) + Math.random() * 250));
        }
      }
    }
  }

  function cardRoot(anchor) {
    for (const selector of [
      ".floor-single-card",
      ".feed-card",
      ".bili-feed-card",
      ".video-list-item",
      ".small-item",
      ".video-page-card-small",
      ".rank-item",
      "article",
      "li",
    ]) {
      const layoutRoot = anchor.closest?.(selector);
      if (layoutRoot) return layoutRoot;
    }
    return anchor.closest?.(".bili-video-card__wrap, .bili-video-card, .video-card") || anchor;
  }

  function extractBvid(href) {
    return typeof href === "string" ? href.match(BVID_PATTERN)?.[0] || null : null;
  }

  function readDateText(card) {
    for (const selector of ["[data-pubdate]", "[data-date]", "time[datetime]", "[class*='date']", "[class*='pubdate']", ".bili-video-card__subtitle", ".video-desc"]) {
      const node = card.matches?.(selector) ? card : card.querySelector(selector);
      if (!node) continue;
      const value = node.getAttribute("data-pubdate") || node.getAttribute("data-date") || node.getAttribute("datetime") || node.textContent;
      if (value?.trim()) return value.trim();
    }
    return null;
  }

  function discover(root) {
    if (!root?.querySelectorAll) return [];
    const anchors = [];
    if (root.matches?.("a[href*='/video/BV'], a[href*='cm.bilibili.com'], [data-bvid]")) anchors.push(root);
    anchors.push(...root.querySelectorAll("a[href*='/video/BV'], a[href*='cm.bilibili.com'], [data-bvid]"));
    if (root.matches?.(".floor-single-card")) anchors.push(root);
    anchors.push(...root.querySelectorAll(".floor-single-card"));
    const cards = new Set();
    for (const node of anchors) {
      cards.add(node.matches?.(".floor-single-card") ? node : node.hasAttribute?.("data-bvid") ? node : cardRoot(node));
    }
    return [...cards].map((element) => {
      const href = element.matches?.("a[href]") ? element.getAttribute("href") : element.querySelector("a[href]")?.getAttribute("href");
      return { element, bvid: element.getAttribute?.("data-bvid") || extractBvid(href), surface: location.hostname, specialMarker: readSpecialMarker(element) };
    }).map((card) => ({ ...card, domDateText: readDateText(card.element) }));
  }

  async function apiResolve(bvid) {
    const response = await fetch("https://api.bilibili.com/x/web-interface/view?bvid=" + encodeURIComponent(bvid), { credentials: "omit" });
    if (response.status === 429) { const error = new Error("rate limited"); error.code = "rate_limited"; throw error; }
    if (!response.ok) throw new Error("api unavailable");
    const payload = await response.json();
    if (payload?.code !== 0 || payload.data?.bvid && payload.data.bvid !== bvid || !Number.isSafeInteger(payload.data?.pubdate) || payload.data.pubdate <= 0) {
      const error = new Error("invalid response"); error.code = "invalid_response"; throw error;
    }
    const date = new Date(payload.data.pubdate * 1000);
    return { status: "known", bvid, year: date.getFullYear(), timestampMs: date.getTime(), source: "api" };
  }

  function createResolver() {
    const cache = new Cache();
    const queue = new Queue();
    return async (card) => {
      const parsed = parseDateText(card.domDateText);
      if (parsed && card.bvid) {
        cache.put({ bvid: card.bvid, year: parsed.year, timestampMs: parsed.timestampMs, source: "dom" });
        return { status: "known", bvid: card.bvid, ...parsed, source: "dom" };
      }
      if (!card.bvid) return { status: "unknown", reason: "no_identity" };
      const cached = cache.get(card.bvid);
      if (cached?.status === "positive") return { status: "known", bvid: card.bvid, year: cached.year, timestampMs: cached.timestampMs, source: "cache" };
      if (cached?.status === "negative") return { status: "unknown", bvid: card.bvid, reason: cached.reason };
      try {
        const result = await queue.enqueue(card.bvid, () => apiResolve(card.bvid));
        cache.put(result);
        return result;
      } catch (error) {
        const reason = error?.code === "rate_limited" ? "rate_limited" : error?.code === "invalid_response" ? "invalid_response" : "api_unavailable";
        cache.putNegative(card.bvid, reason, reason === "rate_limited" ? 30 * 60 * 1000 : reason === "invalid_response" ? 10 * 60 * 1000 : 5 * 60 * 1000);
        return { status: "unknown", bvid: card.bvid, reason };
      }
    };
  }

  function ensureStyle() {
    if (document.getElementById("byf-userscript-style")) return;
    const style = document.createElement("style");
    style.id = "byf-userscript-style";
    style.textContent = ".byf-hidden{display:none!important}.byf-dimmed{opacity:.42!important;filter:grayscale(.72)!important}.byf-collapsed{max-height:88px!important;overflow:hidden!important;position:relative!important}.byf-year-badge,.byf-collapse-label{background:rgba(23,32,52,.88);border-radius:999px;color:#fff;font:700 11px/1 system-ui;padding:5px 8px;pointer-events:none;position:absolute;z-index:2147483000}.byf-year-badge{right:8px;top:8px}.byf-collapse-label{bottom:8px;left:8px}";
    (document.head || document.documentElement).appendChild(style);
  }

  function render(card, result, settings) {
    const element = card.element;
    for (const className of ["byf-hidden", "byf-dimmed", "byf-collapsed"]) element.classList.remove(className);
    const decision = markerDecision(card, settings) || evaluate(result.status === "known" ? result.year : null, settings, new Date().getFullYear());
    const actionClass = { hide: "byf-hidden", dim: "byf-dimmed", collapse: "byf-collapsed" }[decision.action];
    if (actionClass) element.classList.add(actionClass);
    element.dataset.byfProcessed = "true";
    element.dataset.byfDecision = decision.action;
    if (result.status === "known") element.dataset.byfYear = String(result.year); else delete element.dataset.byfYear;
    element.querySelector(":scope > .byf-year-badge")?.remove();
    element.querySelector(":scope > .byf-collapse-label")?.remove();
    if (settings.showYearBadge && result.status === "known") {
      const badge = document.createElement("span");
      badge.className = "byf-year-badge";
      badge.textContent = String(result.year);
      element.appendChild(badge);
    }
    if (decision.action === "collapse") {
      const label = document.createElement("span");
      label.className = "byf-collapse-label";
      label.textContent = result.status === "known" ? "已过滤 · " + result.year : "已过滤 · 年份未知";
      element.appendChild(label);
    }
  }

  function loadSettings() { return normalizeSettings(safeRead(SETTINGS_KEY, DEFAULTS)); }

  function addPanel(runtime) {
    ensureStyle();
    const style = document.createElement("style");
    style.id = "byf-userscript-panel-style";
    style.textContent = "#byf-user-toggle{background:#fb7299;border:0;border-radius:99px;bottom:24px;box-shadow:0 10px 24px #fb729955;color:#fff;cursor:pointer;font-size:18px;height:46px;position:fixed;right:24px;width:46px;z-index:2147483000}#byf-user-panel{background:#fff;border:1px solid #e5e7eb;border-radius:16px;bottom:80px;box-shadow:0 20px 50px #17203433;color:#1f2937;display:none;font:13px/1.5 system-ui;padding:16px;position:fixed;right:24px;width:282px;z-index:2147483000}#byf-user-panel.open{display:block}#byf-user-panel label{display:block;font-weight:650;margin:10px 0 5px}#byf-user-panel input,#byf-user-panel select{border:1px solid #dbe2ed;border-radius:8px;box-sizing:border-box;padding:8px;width:100%}#byf-user-panel button{background:#fff0f4;border:0;border-radius:8px;color:#d74773;cursor:pointer;margin-top:10px;padding:8px;width:100%}.byf-user-marker{background:#fff7f9;border:1px solid #f6d9e2;border-radius:8px;display:flex;gap:7px;padding:7px}.byf-user-marker input{margin-top:2px;width:auto!important}.byf-user-marker label{margin:0!important}.byf-user-marker small{color:#8a6471;display:block;font-size:10px;font-weight:500;margin-top:2px}";
    document.head.appendChild(style);
    const toggle = document.createElement("button");
    toggle.id = "byf-user-toggle";
    toggle.type = "button";
    toggle.textContent = "◷";
    toggle.setAttribute("aria-label", "打开 B站年份过滤器");
    const panel = document.createElement("aside");
    panel.id = "byf-user-panel";
    panel.innerHTML = "<strong>B站年份过滤器</strong><label>启用 <input id='byf-user-enabled' type='checkbox'></label><label>精确屏蔽年份<input id='byf-user-excluded' placeholder='2019, 2020'></label><label>隐藏某年份以前<input id='byf-user-min' type='number' placeholder='不限制'></label><label>最近 N 年<select id='byf-user-recent'><option value=''>不限制</option><option value='1'>最近 1 年</option><option value='3'>最近 3 年</option><option value='5'>最近 5 年</option><option value='10'>最近 10 年</option></select></label><label>处理方式<select id='byf-user-action'><option value='hide'>隐藏</option><option value='dim'>灰化</option><option value='collapse'>折叠</option></select></label><label>显示年份 <input id='byf-user-badge' type='checkbox'></label><label>特殊内容</label><div class='byf-user-marker'><input id='byf-user-marker-entertainment' data-user-marker-group='entertainment' type='checkbox'><label for='byf-user-marker-entertainment'>娱乐类<small>综艺、电影、电视剧、纪录片、国创、直播</small></label></div><div class='byf-user-marker'><input id='byf-user-marker-anime' data-user-marker-group='anime' type='checkbox'><label for='byf-user-marker-anime'>番剧 / 漫画</label></div><div class='byf-user-marker'><input id='byf-user-marker-classroom' data-user-marker-group='classroom' type='checkbox'><label for='byf-user-marker-classroom'>课堂</label></div><button id='byf-user-save' type='button'>保存并立即应用</button><button id='byf-user-reset' type='button'>恢复默认</button><div id='byf-user-status' style='color:#7b879b;font-size:11px;margin-top:9px'></div>";
    document.body.append(toggle, panel);
    toggle.addEventListener("click", () => panel.classList.toggle("open"));
    const sync = () => {
      const settings = runtime.settings;
      panel.querySelector("#byf-user-enabled").checked = settings.enabled;
      panel.querySelector("#byf-user-excluded").value = settings.excludedYears.join(", ");
      panel.querySelector("#byf-user-min").value = settings.minYear ?? "";
      panel.querySelector("#byf-user-recent").value = settings.recentYears ?? "";
      panel.querySelector("#byf-user-action").value = settings.action;
      panel.querySelector("#byf-user-badge").checked = settings.showYearBadge;
      panel.querySelectorAll("input[data-user-marker-group]").forEach((node) => {
        node.checked = settings.blockedMarkerGroups.includes(node.dataset.userMarkerGroup);
      });
      panel.querySelector("#byf-user-status").textContent = runtime.cards.size + " 张卡片 · 修改规则后立即重算";
    };
    const read = () => {
      runtime.settings = normalizeSettings({
        enabled: panel.querySelector("#byf-user-enabled").checked,
        excludedYears: panel.querySelector("#byf-user-excluded").value.split(/[\s,，、]+/).map(Number),
        blockedMarkerGroups: [...panel.querySelectorAll("input[data-user-marker-group]:checked")].map(
          (node) => node.dataset.userMarkerGroup,
        ),
        minYear: Number(panel.querySelector("#byf-user-min").value) || null,
        recentYears: Number(panel.querySelector("#byf-user-recent").value) || null,
        action: panel.querySelector("#byf-user-action").value,
        showYearBadge: panel.querySelector("#byf-user-badge").checked,
      });
      safeWrite(SETTINGS_KEY, runtime.settings);
      runtime.reevaluate();
      sync();
    };
    panel.querySelector("#byf-user-save").addEventListener("click", read);
    panel.querySelector("#byf-user-reset").addEventListener("click", () => {
      runtime.settings = normalizeSettings(DEFAULTS);
      safeWrite(SETTINGS_KEY, runtime.settings);
      runtime.reevaluate();
      sync();
    });
    sync();
  }

  function start() {
    if (window.__BYF_USER_STARTED__ || !document.body) return;
    window.__BYF_USER_STARTED__ = true;
    const runtime = {
      settings: loadSettings(),
      cards: new Map(),
      resolver: createResolver(),
      adapterUrl: location.href,
      pendingBatch: new Set(),
      batchScheduled: false,
      renderQueue: new Set(),
      renderScheduled: false,
      scheduleRender(states) {
        for (const state of states) {
          if (this.cards.get(state.card.element) === state) this.renderQueue.add(state);
        }
        if (this.renderScheduled || this.renderQueue.size === 0) return;
        this.renderScheduled = true;
        const flush = () => {
          this.renderScheduled = false;
          const pending = [...this.renderQueue];
          this.renderQueue.clear();
          for (const state of pending) {
            if (this.cards.get(state.card.element) === state && state.result) {
              render(state.card, state.result, this.settings);
            }
          }
        };
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(flush);
        else setTimeout(flush, 0);
      },
      reevaluate() { this.scheduleRender([...this.cards.values()].filter((state) => state.result)); },
      scheduleBatch() {
        if (this.batchScheduled) return;
        this.batchScheduled = true;
        queueMicrotask(() => void this.flushBatch());
      },
      async flushBatch() {
        this.batchScheduled = false;
        const states = [...this.pendingBatch].filter((state) => this.cards.get(state.card.element) === state);
        this.pendingBatch.clear();
        if (!states.length) return;
        try {
          const results = await Promise.all(states.map((state) => this.resolver(state.card)));
          results.forEach((result, index) => { states[index].result = result; });
        } catch (_error) {
          for (const state of states) {
            state.result = { status: "unknown", bvid: state.card.bvid || undefined, reason: "api_unavailable" };
          }
        }
        this.scheduleRender(states);
      },
      process(root) {
        const fresh = [];
        for (const card of discover(root)) {
          if (this.cards.has(card.element)) continue;
          const state = { card, result: null };
          this.cards.set(card.element, state);
          this.pendingBatch.add(state);
          fresh.push(state);
        }
        if (fresh.length) {
          this.scheduleRender(fresh);
          this.scheduleBatch();
        }
      },
    };
    addPanel(runtime);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) runtime.process(node);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const checkUrl = () => {
      if (runtime.adapterUrl === location.href) return;
      runtime.adapterUrl = location.href;
      runtime.cards.clear();
      runtime.process(document.body);
    };
    addEventListener("popstate", checkUrl);
    setInterval(checkUrl, 1000);
    setInterval(() => runtime.process(document.body), 8000);
    runtime.process(document.body);
    console.info("[BYF] userscript runtime ready");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
