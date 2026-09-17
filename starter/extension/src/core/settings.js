((global) => {
  "use strict";

  const SETTINGS_SCHEMA_VERSION = 1;
  const SETTINGS_STORAGE_KEY = "byf:settings:v1";
  const VALID_ACTIONS = new Set(["hide", "dim", "collapse"]);
  const VALID_BLOCKED_MARKER_GROUPS = new Set(["entertainment", "anime", "classroom", "ad"]);
  const DEFAULT_SETTINGS = Object.freeze({
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    enabled: true,
    excludedYears: Object.freeze([]),
    minYear: null,
    recentYears: null,
    action: "hide",
    unknownPolicy: "show",
    showYearBadge: false,
    blockedMarkerGroups: Object.freeze([]),
  });

  function normalizeSettings(value) {
    const input = value && typeof value === "object" ? value : {};
    const excludedYears = Array.isArray(input.excludedYears)
      ? [...new Set(input.excludedYears.map(normalizeYear).filter((year) => year !== null))].sort(
          (left, right) => left - right,
        )
      : [];
    const blockedMarkerGroups = Array.isArray(input.blockedMarkerGroups)
      ? [...new Set(input.blockedMarkerGroups.filter((group) => VALID_BLOCKED_MARKER_GROUPS.has(group)))]
      : [];

    return {
      schemaVersion: SETTINGS_SCHEMA_VERSION,
      enabled: typeof input.enabled === "boolean" ? input.enabled : DEFAULT_SETTINGS.enabled,
      excludedYears,
      minYear: input.minYear == null ? null : normalizeYear(input.minYear),
      recentYears:
        input.recentYears == null ? null : normalizePositiveInteger(input.recentYears),
      action: VALID_ACTIONS.has(input.action) ? input.action : DEFAULT_SETTINGS.action,
      // MVP 的 UNKNOWN 策略固定为 SHOW，持久化数据不能覆盖它。
      unknownPolicy: "show",
      showYearBadge:
        typeof input.showYearBadge === "boolean"
          ? input.showYearBadge
          : DEFAULT_SETTINGS.showYearBadge,
      blockedMarkerGroups,
    };
  }

  function createSettingsStore(storage, { key = SETTINGS_STORAGE_KEY } = {}) {
    if (!storage || typeof storage.get !== "function" || typeof storage.set !== "function") {
      throw new TypeError("storage must provide async get(key) and set(key, value)");
    }

    let current = normalizeSettings();
    const listeners = new Set();
    const notify = () => {
      const snapshot = cloneSettings(current);
      for (const listener of listeners) listener(snapshot);
    };

    const setValue = async (value) => {
      const normalized = normalizeSettings(value);
      await storage.set(key, cloneSettings(normalized));
      current = normalized;
      notify();
      return cloneSettings(current);
    };

    return Object.freeze({
      get: () => cloneSettings(current),
      async load() {
        current = normalizeSettings(await storage.get(key));
        notify();
        return cloneSettings(current);
      },
      set: setValue,
      async update(patchOrUpdater) {
        const patch =
          typeof patchOrUpdater === "function"
            ? patchOrUpdater(cloneSettings(current))
            : patchOrUpdater;
        return setValue({ ...current, ...(patch && typeof patch === "object" ? patch : {}) });
      },
      subscribe(listener) {
        if (typeof listener !== "function") throw new TypeError("listener must be a function");
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    });
  }

  function normalizeYear(value) {
    const year = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
    return Number.isInteger(year) && year >= 1 && year <= 9999 ? year : null;
  }

  function normalizePositiveInteger(value) {
    const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
    return Number.isInteger(number) && number > 0 ? number : null;
  }

  function cloneSettings(settings) {
    return {
      ...settings,
      excludedYears: [...settings.excludedYears],
      blockedMarkerGroups: [...settings.blockedMarkerGroups],
    };
  }

  global.BYF = Object.assign(global.BYF || {}, {
    DEFAULT_SETTINGS,
    SETTINGS_SCHEMA_VERSION,
    SETTINGS_STORAGE_KEY,
    normalizeSettings,
    createSettingsStore,
    Settings: Object.freeze({ DEFAULT_SETTINGS, normalizeSettings, createSettingsStore }),
  });
})(globalThis);
