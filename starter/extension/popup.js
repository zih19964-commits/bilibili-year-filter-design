(function initPopup() {
  "use strict";

  const KEY = "byf:settings:v1";
  const DEFAULTS = {
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

  function normalise(value) {
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
        ? [...new Set(source.blockedMarkerGroups)].filter((group) => ["entertainment", "anime", "classroom"].includes(group))
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

  async function read() {
    const result = await chrome.storage.local.get(KEY);
    return normalise(result?.[KEY]);
  }

  function sync(settings) {
    document.querySelector("#enabled").checked = settings.enabled;
    document.querySelector("#excludedYears").value = settings.excludedYears.join(", ");
    document.querySelector("#minYear").value = settings.minYear ?? "";
    document.querySelector("#recentYears").value = settings.recentYears ?? "";
    document.querySelector("#action").value = settings.action;
    document.querySelector("#showYearBadge").checked = settings.showYearBadge;
    document.querySelectorAll("input[data-marker-group]").forEach((node) => {
      node.checked = settings.blockedMarkerGroups.includes(node.dataset.markerGroup);
    });
  }

  async function save() {
    const settings = normalise({
      enabled: document.querySelector("#enabled").checked,
      excludedYears: document.querySelector("#excludedYears").value.split(/[\s,，、]+/).map(Number),
      blockedMarkerGroups: [...document.querySelectorAll("input[data-marker-group]:checked")].map(
        (node) => node.dataset.markerGroup,
      ),
      minYear: Number(document.querySelector("#minYear").value) || null,
      recentYears: Number(document.querySelector("#recentYears").value) || null,
      action: document.querySelector("#action").value,
      showYearBadge: document.querySelector("#showYearBadge").checked,
    });
    await chrome.storage.local.set({ [KEY]: settings });
    document.querySelector("#status").textContent = "已保存。打开 B 站后可用右下角按钮继续调整。";
  }

  async function start() {
    sync(await read());
    document.querySelector("#save").addEventListener("click", () => void save());
    document.querySelector("#reset").addEventListener("click", async () => {
      sync(DEFAULTS);
      await chrome.storage.local.set({ [KEY]: DEFAULTS });
      document.querySelector("#status").textContent = "已恢复默认设置。";
    });
  }

  void start();
})();
