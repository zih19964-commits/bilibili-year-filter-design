((global) => {
"use strict";

function evaluate(year, settings, currentYear) {
  if (!settings.enabled) {
    return { action: "show", reason: "disabled" };
  }

  if (year == null) {
    return { action: "show", reason: "unknown_year" };
  }

  if (settings.excludedYears.includes(year)) {
    return { action: settings.action, reason: "excluded_year" };
  }

  if (settings.minYear != null && year < settings.minYear) {
    return { action: settings.action, reason: "before_min_year" };
  }

  if (
    settings.recentYears != null &&
    year < currentYear - settings.recentYears + 1
  ) {
    return { action: settings.action, reason: "outside_recent_window" };
  }

  return { action: "show", reason: "allowed" };
}

global.BYF = Object.assign(global.BYF || {}, {
  FilterEngine: Object.freeze({ evaluate }),
  evaluate,
});
})(globalThis);
