((global) => {
  "use strict";

  const CACHE_SCHEMA_VERSION = 1;

  class MetadataCache {
    constructor(options = {}) {
      const directAdapter = ["get", "set", "remove"].every(
        (name) => typeof options?.[name] === "function",
      );
      const {
        storage,
        maxEntries = 20000,
        now = Date.now,
        keyPrefix = "byf:meta:v1:",
        touchIntervalMs = 60 * 60 * 1000,
      } = directAdapter ? { storage: options } : options;
      if (!storage || !["get", "set", "remove"].every((name) => typeof storage[name] === "function")) {
        throw new TypeError("storage must provide async get, set and remove methods");
      }
      if (!Number.isInteger(maxEntries) || maxEntries < 1) {
        throw new TypeError("maxEntries must be a positive integer");
      }

      this.storage = storage;
      this.maxEntries = maxEntries;
      this.now = now;
      this.keyPrefix = keyPrefix;
      this.indexKey = `${keyPrefix}index`;
      this.touchIntervalMs = touchIntervalMs;
      this.writeChain = Promise.resolve();
    }

    async get(bvid) {
      if (!isBvid(bvid)) return null;
      return this._serialize(async () => {
        const key = this._key(bvid);
        const record = await this.storage.get(key);
        if (!record) return null;

        if (!isValidCacheRecord(record, bvid)) {
          await this._removeRecord(bvid);
          return null;
        }

        const nowMs = this.now();
        if (record.status === "negative" && record.retryAfterMs <= nowMs) {
          await this._removeRecord(bvid);
          return null;
        }

        if (nowMs - record.lastAccessAtMs >= this.touchIntervalMs) {
          record.lastAccessAtMs = nowMs;
          await this.storage.set(key, record);
          await this._setIndexAccess(bvid, nowMs);
        }
        return { ...record };
      });
    }

    async put(record) {
      if (!record || !isBvid(record.bvid)) throw new TypeError("record.bvid is invalid");
      const year = record.pubYear ?? record.year;
      const timestampMs = record.pubTimestampMs ?? record.timestampMs;
      if (!Number.isInteger(year) || year < 1 || year > 9999) {
        throw new TypeError("record year is invalid");
      }
      if (timestampMs != null && (!Number.isFinite(timestampMs) || timestampMs <= 0)) {
        throw new TypeError("record timestamp is invalid");
      }

      return this._serialize(async () => {
        const nowMs = this.now();
        const stored = {
          schemaVersion: CACHE_SCHEMA_VERSION,
          status: "positive",
          bvid: record.bvid,
          year,
          timestampMs: timestampMs ?? null,
          resolvedAtMs: Number.isFinite(record.resolvedAtMs) ? record.resolvedAtMs : nowMs,
          source: record.source === "dom" ? "dom" : "api",
          lastAccessAtMs: nowMs,
        };
        await this.storage.set(this._key(record.bvid), stored);
        await this._setIndexAccess(record.bvid, nowMs);
        await this._evictOverflow();
        return { ...stored };
      });
    }

    async putNegative(bvid, reason, retryAfterMs) {
      if (!isBvid(bvid)) throw new TypeError("bvid is invalid");
      if (!Number.isFinite(retryAfterMs) || retryAfterMs <= this.now()) {
        throw new TypeError("retryAfterMs must be a future timestamp");
      }

      return this._serialize(async () => {
        const nowMs = this.now();
        const stored = {
          schemaVersion: CACHE_SCHEMA_VERSION,
          status: "negative",
          bvid,
          reason: normalizeUnknownReason(reason),
          retryAfterMs,
          lastAccessAtMs: nowMs,
        };
        await this.storage.set(this._key(bvid), stored);
        await this._setIndexAccess(bvid, nowMs);
        await this._evictOverflow();
        return { ...stored };
      });
    }

    _serialize(operation) {
      const result = this.writeChain.then(operation, operation);
      this.writeChain = result.catch(() => {});
      return result;
    }

    _key(bvid) {
      return `${this.keyPrefix}${bvid}`;
    }

    async _loadIndex() {
      const value = await this.storage.get(this.indexKey);
      return value?.schemaVersion === CACHE_SCHEMA_VERSION && value.entries && typeof value.entries === "object"
        ? { ...value.entries }
        : {};
    }

    async _setIndexAccess(bvid, accessAtMs) {
      const entries = await this._loadIndex();
      entries[bvid] = accessAtMs;
      await this.storage.set(this.indexKey, { schemaVersion: CACHE_SCHEMA_VERSION, entries });
    }

    async _removeRecord(bvid) {
      await this.storage.remove(this._key(bvid));
      const entries = await this._loadIndex();
      if (Object.prototype.hasOwnProperty.call(entries, bvid)) {
        delete entries[bvid];
        await this.storage.set(this.indexKey, { schemaVersion: CACHE_SCHEMA_VERSION, entries });
      }
    }

    async _evictOverflow() {
      const entries = await this._loadIndex();
      const ordered = Object.entries(entries).sort((left, right) => left[1] - right[1]);
      const overflow = ordered.length - this.maxEntries;
      if (overflow <= 0) return;

      const victims = ordered.slice(0, overflow);
      await Promise.all(victims.map(([bvid]) => this.storage.remove(this._key(bvid))));
      for (const [bvid] of victims) delete entries[bvid];
      await this.storage.set(this.indexKey, { schemaVersion: CACHE_SCHEMA_VERSION, entries });
    }
  }

  function isValidCacheRecord(record, bvid) {
    if (record.schemaVersion !== CACHE_SCHEMA_VERSION || record.bvid !== bvid) return false;
    if (!Number.isFinite(record.lastAccessAtMs)) return false;
    if (record.status === "negative") {
      return typeof record.reason === "string" && Number.isFinite(record.retryAfterMs);
    }
    return (
      record.status === "positive" &&
      Number.isInteger(record.year) &&
      record.year >= 1 &&
      record.year <= 9999 &&
      (record.timestampMs === null || (Number.isFinite(record.timestampMs) && record.timestampMs > 0))
    );
  }

  function isBvid(value) {
    return typeof value === "string" && /^BV[0-9A-Za-z]{10}$/.test(value);
  }

  function normalizeUnknownReason(reason) {
    return ["api_unavailable", "rate_limited", "invalid_response"].includes(reason)
      ? reason
      : "api_unavailable";
  }

  global.BYF = Object.assign(global.BYF || {}, {
    MetadataCache,
    CACHE_SCHEMA_VERSION,
  });
})(globalThis);
