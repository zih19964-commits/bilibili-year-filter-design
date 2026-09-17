(function initContentRuntime(global) {
  "use strict";

  const BYF = (global.BYF = global.BYF || {});
  const SETTINGS_KEY = "byf:settings:v1";
  const PANEL_ID = "byf-settings-panel";
  const TOGGLE_ID = "byf-floating-toggle";

  const FALLBACK_DEFAULTS = {
    schemaVersion: 1,
    enabled: true,
    excludedYears: [],
    blockedMarkerGroups: [],
    minYear: null,
    recentYears: null,
    action: "hide",
    unknownPolicy: "show",
    showYearBadge: false,
  };

  function normaliseSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    const defaults = BYF.DEFAULT_SETTINGS || FALLBACK_DEFAULTS;
    const excludedYears = Array.isArray(source.excludedYears)
      ? [...new Set(source.excludedYears.map(Number).filter(Number.isInteger))].sort(
          (a, b) => b - a,
        )
      : [...defaults.excludedYears];
    const action = ["hide", "dim", "collapse"].includes(source.action)
      ? source.action
      : defaults.action;
    const blockedMarkerGroups = Array.isArray(source.blockedMarkerGroups)
      ? [...new Set(source.blockedMarkerGroups)].filter((group) =>
          ["entertainment", "anime", "classroom", "ad"].includes(group),
        )
      : [...(defaults.blockedMarkerGroups || [])];
    const minYear =
      source.minYear == null || (typeof source.minYear === "string" && source.minYear.trim() === "")
        ? null
        : Number.isInteger(Number(source.minYear))
          ? Number(source.minYear)
          : null;
    const recentYears = [1, 3, 5, 10].includes(Number(source.recentYears))
      ? Number(source.recentYears)
      : null;

    return {
      ...defaults,
      ...source,
      schemaVersion: 1,
      enabled: source.enabled !== false,
      excludedYears,
      blockedMarkerGroups,
      minYear,
      recentYears,
      action,
      unknownPolicy: "show",
      showYearBadge: source.showYearBadge === true,
    };
  }

  function getStorage() {
    const extensionStorage = global.chrome?.storage?.local;
    if (extensionStorage) {
      return {
        async get(key) {
          const result = await extensionStorage.get(key);
          return result?.[key] ?? null;
        },
        async set(key, value) {
          await extensionStorage.set({ [key]: value });
        },
        async remove(key) {
          await extensionStorage.remove(key);
        },
      };
    }

    return {
      async get(key) {
        try {
          const raw = global.localStorage?.getItem(key);
          return raw ? JSON.parse(raw) : null;
        } catch (_error) {
          return null;
        }
      },
      async set(key, value) {
        try {
          global.localStorage?.setItem(key, JSON.stringify(value));
        } catch (_error) {
          // Storage failure must not break browsing.
        }
      },
      async remove(key) {
        try {
          global.localStorage?.removeItem(key);
        } catch (_error) {
          // Storage failure must not break browsing.
        }
      },
    };
  }

  function evaluate(year, settings, currentYear) {
    if (BYF.FilterEngine?.evaluate) {
      return BYF.FilterEngine.evaluate(year, settings, currentYear);
    }

    if (!settings.enabled || year == null) {
      return {
        action: "show",
        reason: settings.enabled ? "unknown_year" : "disabled",
      };
    }
    if (settings.excludedYears.includes(year)) {
      return { action: settings.action, reason: "excluded_year" };
    }
    if (settings.minYear != null && year < settings.minYear) {
      return { action: settings.action, reason: "before_min_year" };
    }
    if (settings.recentYears != null && year < currentYear - settings.recentYears + 1) {
      return { action: settings.action, reason: "outside_recent_window" };
    }
    return { action: "show", reason: "allowed" };
  }

  function evaluateSpecialMarker(card, settings) {
    const group = card?.specialMarker?.group;
    if (
      !settings.enabled ||
      !group ||
      !settings.blockedMarkerGroups?.includes(group)
    ) {
      return null;
    }
    return { action: settings.action, reason: "blocked_marker" };
  }

  function getCurrentYear() {
    return new Date().getFullYear();
  }

  function loadSavedValue(value) {
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch (_error) {
        return null;
      }
    }
    return value;
  }

  function createResolver(storage) {
    if (!BYF.MetadataCache || !BYF.MetadataResolver || !BYF.RequestQueue) {
      return null;
    }

    const cache = new BYF.MetadataCache({ storage, maxEntries: 20000 });
    const queue = new BYF.RequestQueue({
      // 页面首轮解析使用受控 burst；熔断和负缓存仍负责保护 API。
      concurrency: 6,
      minDelayMs: 80,
      batchConcurrency: 6,
      batchMinDelayMs: 80,
      maxRetries: 1,
    });
    return new BYF.MetadataResolver({
      cache,
      queue,
      fetchImpl: global.fetch?.bind(global),
    });
  }

  function appendStyle() {
    if (document.getElementById("byf-panel-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "byf-panel-style";
    style.textContent = `
      #${TOGGLE_ID} {
        align-items: center;
        background: linear-gradient(135deg, #fb7299, #ff9eb9);
        border: 0;
        border-radius: 999px;
        bottom: 24px;
        box-shadow: 0 12px 28px rgba(251, 114, 153, .36);
        color: #fff;
        cursor: pointer;
        display: flex;
        font: 700 18px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        height: 46px;
        justify-content: center;
        position: fixed;
        right: 24px;
        width: 46px;
        z-index: 2147483000;
      }
      #${TOGGLE_ID}[data-disabled="true"] { filter: grayscale(.82); opacity: .74; }
      #${PANEL_ID} {
        background: rgba(255, 255, 255, .98);
        border: 1px solid rgba(32, 43, 67, .1);
        border-radius: 18px;
        bottom: 80px;
        box-shadow: 0 20px 60px rgba(25, 32, 56, .22);
        color: #1f2937;
        display: none;
        font: 13px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        padding: 16px;
        position: fixed;
        right: 24px;
        width: 294px;
        z-index: 2147483000;
      }
      #${PANEL_ID}[data-open="true"] { display: block; }
      #${PANEL_ID} .byf-panel-head { align-items: center; display: flex; justify-content: space-between; margin-bottom: 13px; }
      #${PANEL_ID} .byf-panel-title { color: #16213a; font-size: 16px; font-weight: 760; }
      #${PANEL_ID} .byf-panel-subtitle { color: #8590a6; font-size: 11px; margin-top: 2px; }
      #${PANEL_ID} .byf-row { margin: 12px 0; }
      #${PANEL_ID} label { color: #4b5563; display: block; font-weight: 650; margin-bottom: 6px; }
      #${PANEL_ID} input[type="number"], #${PANEL_ID} input[type="text"], #${PANEL_ID} select {
        background: #f8fafc;
        border: 1px solid #dbe2ed;
        border-radius: 9px;
        box-sizing: border-box;
        color: #1f2937;
        font: inherit;
        outline: none;
        padding: 8px 9px;
        width: 100%;
      }
      #${PANEL_ID} input:focus, #${PANEL_ID} select:focus { border-color: #fb7299; box-shadow: 0 0 0 3px rgba(251,114,153,.13); }
      #${PANEL_ID} .byf-inline { align-items: center; display: flex; gap: 8px; }
      #${PANEL_ID} .byf-inline > * { flex: 1; }
      #${PANEL_ID} .byf-check { align-items: center; display: flex; gap: 8px; }
      #${PANEL_ID} .byf-check label { color: #1f2937; margin: 0; }
      #${PANEL_ID} input[type="checkbox"] { accent-color: #fb7299; }
      #${PANEL_ID} .byf-years { color: #69758a; font-size: 11px; margin-top: 5px; }
      #${PANEL_ID} .byf-actions { display: grid; gap: 7px; grid-template-columns: repeat(3, 1fr); }
      #${PANEL_ID} button { border: 0; border-radius: 9px; cursor: pointer; font: 650 12px/1.2 inherit; padding: 8px 9px; }
      #${PANEL_ID} .byf-preset { background: #fff0f4; color: #d74773; }
      #${PANEL_ID} .byf-reset { background: #eef2f7; color: #536078; margin-top: 7px; width: 100%; }
      #${PANEL_ID} .byf-status { background: #f7f8fb; border-radius: 9px; color: #758096; font-size: 11px; margin-top: 12px; padding: 8px 9px; }
      #${PANEL_ID} .byf-radio-grid { display: grid; gap: 6px; grid-template-columns: repeat(3, 1fr); }
      #${PANEL_ID} .byf-radio { align-items: center; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; display: flex; gap: 4px; padding: 6px; }
      #${PANEL_ID} .byf-radio label { font-size: 11px; margin: 0; }
      #${PANEL_ID} .byf-marker-box { display: grid; gap: 7px; }
      #${PANEL_ID} .byf-marker-option { align-items: flex-start; background: #fff7f9; border: 1px solid #f6d9e2; border-radius: 9px; display: flex; gap: 7px; padding: 8px; }
      #${PANEL_ID} .byf-marker-option label { color: #1f2937; margin: 0; }
      #${PANEL_ID} .byf-marker-option small { color: #8a6471; display: block; font-size: 10px; font-weight: 500; margin-top: 2px; }
      @media (max-width: 520px) { #${PANEL_ID} { bottom: 70px; right: 12px; } #${TOGGLE_ID} { bottom: 14px; right: 14px; } }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  class SettingsPanel {
    constructor({ settings, onChange, getStatus }) {
      this.settings = normaliseSettings(settings);
      this.onChange = onChange;
      this.getStatus = getStatus;
      this.open = false;
      appendStyle();
      this.renderShell();
      this.syncControls();
    }

    renderShell() {
      let toggle = document.getElementById(TOGGLE_ID);
      if (!toggle) {
        toggle = document.createElement("button");
        toggle.id = TOGGLE_ID;
        toggle.type = "button";
        toggle.title = "打开 B 站年份过滤器";
        toggle.setAttribute("aria-label", "打开 B 站年份过滤器");
        toggle.textContent = "◷";
        document.body.appendChild(toggle);
      }
      toggle.addEventListener("click", () => this.toggle());
      this.toggleButton = toggle;

      let panel = document.getElementById(PANEL_ID);
      if (!panel) {
        panel = document.createElement("aside");
        panel.id = PANEL_ID;
        panel.setAttribute("aria-label", "B站年份过滤器设置");
        panel.innerHTML = `
          <div class="byf-panel-head">
            <div>
              <div class="byf-panel-title">B站年份过滤器</div>
              <div class="byf-panel-subtitle">按实际发布时间筛选视频</div>
            </div>
            <div class="byf-check"><input id="byf-enabled" type="checkbox"><label for="byf-enabled">启用</label></div>
          </div>
          <div class="byf-row">
            <label for="byf-excluded-years">精确屏蔽年份</label>
            <input id="byf-excluded-years" type="text" placeholder="例如：2019, 2020, 2021">
            <div class="byf-years">多个年份用逗号或空格分隔</div>
          </div>
          <div class="byf-row">
            <label for="byf-min-year">年份范围</label>
            <div class="byf-inline"><input id="byf-min-year" type="number" min="1900" max="2200" placeholder="不限制"><span>年以前隐藏</span></div>
          </div>
          <div class="byf-row">
            <label>快捷规则</label>
            <div class="byf-actions">
              <button class="byf-preset" data-recent="1" type="button">近1年</button>
              <button class="byf-preset" data-recent="3" type="button">近3年</button>
              <button class="byf-preset" data-recent="5" type="button">近5年</button>
            </div>
          </div>
          <div class="byf-row">
            <label for="byf-recent-years">最近 N 年</label>
            <select id="byf-recent-years"><option value="">不限制</option><option value="1">最近 1 年</option><option value="3">最近 3 年</option><option value="5">最近 5 年</option><option value="10">最近 10 年</option></select>
          </div>
          <div class="byf-row">
            <label>处理方式</label>
            <div class="byf-radio-grid">
              <div class="byf-radio"><input id="byf-action-hide" name="byf-action" type="radio" value="hide"><label for="byf-action-hide">隐藏</label></div>
              <div class="byf-radio"><input id="byf-action-dim" name="byf-action" type="radio" value="dim"><label for="byf-action-dim">灰化</label></div>
              <div class="byf-radio"><input id="byf-action-collapse" name="byf-action" type="radio" value="collapse"><label for="byf-action-collapse">折叠</label></div>
            </div>
          </div>
          <div class="byf-row byf-check"><input id="byf-show-year" type="checkbox"><label for="byf-show-year">在卡片显示年份</label></div>
          <div class="byf-row">
            <label>特殊内容</label>
            <div class="byf-marker-box">
              <div class="byf-marker-option"><input id="byf-marker-entertainment" data-byf-marker-group="entertainment" type="checkbox"><label for="byf-marker-entertainment">娱乐类<small>综艺、电影、电视剧、纪录片、国创、直播</small></label></div>
              <div class="byf-marker-option"><input id="byf-marker-anime" data-byf-marker-group="anime" type="checkbox"><label for="byf-marker-anime">番剧 / 漫画</label></div>
              <div class="byf-marker-option"><input id="byf-marker-classroom" data-byf-marker-group="classroom" type="checkbox"><label for="byf-marker-classroom">课堂</label></div>
              <div class="byf-marker-option"><input id="byf-marker-ad" data-byf-marker-group="ad" type="checkbox"><label for="byf-marker-ad">广告</label></div>
            </div>
          </div>
          <div id="byf-status" class="byf-status">正在准备过滤器…</div>
          <button id="byf-reset" class="byf-reset" type="button">恢复默认</button>
        `;
        document.body.appendChild(panel);
      }

      this.panel = panel;
      this.bindEvents();
    }

    bindEvents() {
      const update = () => this.readAndCommit();
      this.panel.querySelector("#byf-enabled").addEventListener("change", update);
      this.panel.querySelector("#byf-excluded-years").addEventListener("change", update);
      this.panel.querySelector("#byf-min-year").addEventListener("change", update);
      this.panel.querySelector("#byf-recent-years").addEventListener("change", update);
      this.panel.querySelectorAll("input[name='byf-action']").forEach((node) => {
        node.addEventListener("change", update);
      });
      this.panel.querySelector("#byf-show-year").addEventListener("change", update);
      this.panel.querySelectorAll("input[data-byf-marker-group]").forEach((node) => {
        node.addEventListener("change", update);
      });
      this.panel.querySelectorAll(".byf-preset").forEach((button) => {
        button.addEventListener("click", () => {
          this.panel.querySelector("#byf-recent-years").value = button.dataset.recent;
          this.readAndCommit();
        });
      });
      this.panel.querySelector("#byf-reset").addEventListener("click", () => {
        this.settings = normaliseSettings(BYF.DEFAULT_SETTINGS || FALLBACK_DEFAULTS);
        this.syncControls();
        this.onChange(this.settings);
      });
    }

    readAndCommit() {
      const excludedYears = this.panel
        .querySelector("#byf-excluded-years")
        .value.split(/[\s,，、]+/)
        .map((value) => Number(value))
        .filter((year) => Number.isInteger(year) && year >= 1900 && year <= 2200);
      const minText = this.panel.querySelector("#byf-min-year").value.trim();
      const minValue = minText === "" ? null : Number(minText);
      const recentValue = Number(this.panel.querySelector("#byf-recent-years").value);
      const action = this.panel.querySelector("input[name='byf-action']:checked")?.value;
      const blockedMarkerGroups = [...this.panel.querySelectorAll("input[data-byf-marker-group]:checked")]
        .map((node) => node.dataset.byfMarkerGroup);
      this.settings = normaliseSettings({
        ...this.settings,
        enabled: this.panel.querySelector("#byf-enabled").checked,
        excludedYears,
        blockedMarkerGroups,
        minYear: Number.isInteger(minValue) ? minValue : null,
        recentYears: [1, 3, 5, 10].includes(recentValue) ? recentValue : null,
        action,
        showYearBadge: this.panel.querySelector("#byf-show-year").checked,
      });
      this.syncControls();
      this.onChange(this.settings);
    }

    syncControls() {
      if (!this.panel) {
        return;
      }
      this.panel.querySelector("#byf-enabled").checked = this.settings.enabled;
      this.panel.querySelector("#byf-excluded-years").value = this.settings.excludedYears.join(", ");
      this.panel.querySelector("#byf-min-year").value = this.settings.minYear ?? "";
      this.panel.querySelector("#byf-recent-years").value = this.settings.recentYears ?? "";
      this.panel.querySelectorAll("input[name='byf-action']").forEach((node) => {
        node.checked = node.value === this.settings.action;
      });
      this.panel.querySelector("#byf-show-year").checked = this.settings.showYearBadge;
      this.panel.querySelectorAll("input[data-byf-marker-group]").forEach((node) => {
        node.checked = this.settings.blockedMarkerGroups.includes(node.dataset.byfMarkerGroup);
      });
      this.toggleButton.dataset.disabled = String(!this.settings.enabled);
      this.updateStatus();
    }

    updateStatus() {
      const status = this.panel?.querySelector("#byf-status");
      if (status && this.getStatus) {
        status.textContent = this.getStatus();
      }
    }

    setSettings(settings) {
      this.settings = normaliseSettings(settings);
      this.syncControls();
    }

    toggle() {
      this.open = !this.open;
      this.panel.dataset.open = String(this.open);
      this.toggleButton.setAttribute("aria-expanded", String(this.open));
    }
  }

  async function start() {
    if (!global.document?.body || global.__BYF_RUNTIME__) {
      return;
    }

    const adapterApi = BYF.adapters;
    if (!adapterApi?.selectAdapter) {
      console.warn("[BYF] adapter runtime is unavailable; keeping page untouched");
      return;
    }

    global.__BYF_RUNTIME__ = true;
    const storage = getStorage();
    const saved = loadSavedValue(await storage.get(SETTINGS_KEY));
    let settings = normaliseSettings(saved);
    const stateByElement = new WeakMap();
    const cards = new Set();
    let currentUrl = global.location.href;
    let currentAdapter = adapterApi.selectAdapter(new URL(currentUrl));
    let pageGeneration = 0;
    let resolver = createResolver(storage);
    const renderer = BYF.Renderer ? new BYF.Renderer() : null;

    const getStatus = () => {
      let known = 0;
      let unknown = 0;
      for (const element of cards) {
        const state = stateByElement.get(element);
        if (!state) continue;
        if (state.result?.status === "known") known += 1;
        if (state.result?.status === "unknown") unknown += 1;
      }
      return `${cards.size} 张卡片 · ${known} 个年份已确认 · ${unknown} 个未知（未知默认显示）`;
    };

    const panel = new SettingsPanel({
      settings,
      getStatus,
      onChange: async (nextSettings) => {
        settings = normaliseSettings(nextSettings);
        await storage.set(SETTINGS_KEY, settings);
        reEvaluate();
        panel.updateStatus();
      },
    });

    function renderState(state) {
      if (!renderer) return;
      const year = state.result?.status === "known" ? state.result.year : null;
      const decision =
        evaluateSpecialMarker(state.card, settings) ||
        evaluate(year, settings, getCurrentYear());
      renderer.apply(state.card, decision, state.result, settings);
      state.decision = decision;
    }

    const renderQueue = new Set();
    let renderScheduled = false;

    function scheduleRender(states) {
      for (const state of states) {
        if (state?.generation === pageGeneration) {
          renderQueue.add(state);
        }
      }
      if (renderScheduled || renderQueue.size === 0) {
        return;
      }

      renderScheduled = true;
      const flush = () => {
        renderScheduled = false;
        const pending = [...renderQueue];
        renderQueue.clear();
        // 同一批次集中写 DOM，避免每张卡片完成后触发一次布局重排。
        for (const state of pending) {
          if (state.generation === pageGeneration) {
            renderState(state);
          }
        }
      };

      if (typeof global.requestAnimationFrame === "function") {
        global.requestAnimationFrame(flush);
      } else {
        global.setTimeout(flush, 0);
      }
    }

    function reEvaluate() {
      const states = [];
      const statesToResolve = [];
      for (const element of cards) {
        const state = stateByElement.get(element);
        if (state?.generation !== pageGeneration) continue;

        const markerDecision = evaluateSpecialMarker(state.card, settings);
        if (markerDecision) {
          state.markerBlocked = true;
          states.push(state);
        } else if (state.markerBlocked) {
          state.markerBlocked = false;
          if (state.result) {
            states.push(state);
          } else {
            pendingCards.add(state);
            statesToResolve.push(state);
          }
        } else if (state.result) {
          states.push(state);
        }
      }
      scheduleRender(states);
      if (statesToResolve.length) scheduleCardBatch();
    }

    const pendingCards = new Set();
    let batchFlushScheduled = false;

    function resultForCard(results, card, index) {
      if (Array.isArray(results)) return results[index] || null;
      if (results instanceof Map) return results.get(card) || results.get(card.element) || results.get(card.bvid) || null;
      if (results && typeof results === "object") {
        return results[card.bvid] || results[card.element] || null;
      }
      return null;
    }

    async function flushCardBatch() {
      batchFlushScheduled = false;
      const states = [...pendingCards].filter((state) => state.generation === pageGeneration);
      pendingCards.clear();
      if (states.length === 0) return;

      const markerBlockedStates = states.filter((state) =>
        Boolean(evaluateSpecialMarker(state.card, settings)),
      );
      const statesToResolve = states.filter((state) => !markerBlockedStates.includes(state));
      for (const state of markerBlockedStates) state.markerBlocked = true;

      if (!resolver) {
        for (const state of statesToResolve) {
          state.result = { status: "unknown", bvid: state.card.bvid || undefined, reason: "api_unavailable" };
        }
        scheduleRender(states);
        panel.updateStatus();
        return;
      }

      const cardsForResolve = statesToResolve.map((state) => state.card);
      try {
        const results = cardsForResolve.length === 0
          ? []
          : typeof resolver.resolveMany === "function"
            ? await resolver.resolveMany(cardsForResolve)
            : await Promise.all(cardsForResolve.map((card) => resolver.resolve(card)));
        statesToResolve.forEach((state, index) => {
          state.result = resultForCard(results, state.card, index) || {
            status: "unknown",
            bvid: state.card.bvid || undefined,
            reason: "api_unavailable",
          };
        });
      } catch (error) {
        for (const state of statesToResolve) {
          state.result = {
            status: "unknown",
            bvid: state.card.bvid || undefined,
            reason: "api_unavailable",
          };
        }
        if (settings.debug) console.debug("[BYF] page batch resolver failed", error);
      }

      scheduleRender(states);
      panel.updateStatus();
    }

    function scheduleCardBatch() {
      if (batchFlushScheduled) return;
      batchFlushScheduled = true;
      queueMicrotask(() => void flushCardBatch());
    }

    function processRoot(root) {
      if (!root || !currentAdapter) return;
      const freshStates = [];
      for (const card of currentAdapter.discover(root)) {
        if (!card?.element || stateByElement.has(card.element)) continue;
        const state = {
          card,
          generation: pageGeneration,
          result: null,
          markerBlocked: false,
          decision: { action: "show", reason: "unknown_year" },
        };
        stateByElement.set(card.element, state);
        cards.add(card.element);
        pendingCards.add(state);
        freshStates.push(state);
      }
      if (freshStates.length === 0) return;
      scheduleRender(freshStates);
      scheduleCardBatch();
    }

    function pruneCards() {
      for (const element of cards) {
        if (!element.isConnected) {
          cards.delete(element);
        }
      }
    }

    function switchPageIfNeeded() {
      if (global.location.href === currentUrl) {
        return;
      }
      currentUrl = global.location.href;
      currentAdapter = adapterApi.selectAdapter(new URL(currentUrl));
      pageGeneration += 1;
      cards.clear();
      resolver = createResolver(storage);
      processRoot(document.body);
    }

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
            processRoot(node);
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    for (const method of ["pushState", "replaceState"]) {
      const original = global.history[method];
      global.history[method] = function wrappedHistoryMethod(...args) {
        const result = original.apply(this, args);
        queueMicrotask(switchPageIfNeeded);
        return result;
      };
    }
    global.addEventListener("popstate", switchPageIfNeeded);
    global.setInterval(switchPageIfNeeded, 1000);
    global.setInterval(() => {
      pruneCards();
      processRoot(document.body);
      panel.updateStatus();
    }, 8000);

    processRoot(document.body);
    console.info("[BYF] content runtime ready", { adapter: currentAdapter.id });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void start(), { once: true });
  } else {
    void start();
  }
})(typeof window !== "undefined" ? window : globalThis);
