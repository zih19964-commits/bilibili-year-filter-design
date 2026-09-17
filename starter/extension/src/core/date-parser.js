((global) => {
  "use strict";

  function parseDateText(text, nowInput = Date.now()) {
    if (typeof text !== "string") return null;
    const value = text.trim();
    if (!value) return null;

    const now = toValidDate(nowInput);
    if (!now) return null;

    const absolute = value.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (absolute) {
      return buildLocalResult(
        Number(absolute[1]),
        Number(absolute[2]),
        Number(absolute[3]),
        Number(absolute[4] ?? 0),
        Number(absolute[5] ?? 0),
        Number(absolute[6] ?? 0),
      );
    }

    const yesterday = value.match(/^昨天(?:\s*(\d{1,2}):(\d{2}))?$/);
    if (yesterday) {
      const result = new Date(now.getTime());
      result.setDate(result.getDate() - 1);
      if (yesterday[1] !== undefined) {
        result.setHours(Number(yesterday[1]), Number(yesterday[2]), 0, 0);
      }
      return validDateResult(result);
    }

    const relative = value.match(/^(\d+)\s*(秒钟?|分钟?|小时|天)前$/);
    if (relative) {
      const amount = Number(relative[1]);
      const unitMs = { 秒: 1000, 秒钟: 1000, 分: 60000, 分钟: 60000, 小时: 3600000, 天: 86400000 }[relative[2]];
      return validDateResult(new Date(now.getTime() - amount * unitMs));
    }

    if (value === "刚刚") return validDateResult(now);
    // “12-31”之类没有年份证据，必须保持 UNKNOWN。
    return null;
  }

  function buildLocalResult(year, month, day, hour, minute, second) {
    if (hour > 23 || minute > 59 || second > 59) return null;
    const date = new Date(year, month - 1, day, hour, minute, second, 0);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day ||
      date.getHours() !== hour ||
      date.getMinutes() !== minute ||
      date.getSeconds() !== second
    ) return null;
    return validDateResult(date);
  }

  function validDateResult(date) {
    const timestampMs = date.getTime();
    return Number.isFinite(timestampMs) ? { year: date.getFullYear(), timestampMs } : null;
  }

  function toValidDate(value) {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  global.BYF = Object.assign(global.BYF || {}, {
    parseDateText,
    parsePublicationDate: parseDateText,
  });
})(globalThis);
