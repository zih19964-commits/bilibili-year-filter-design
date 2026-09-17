((global) => {
  "use strict";

  const NEGATIVE_TTL_MS = Object.freeze({
    api_unavailable: 5 * 60 * 1000,
    rate_limited: 30 * 60 * 1000,
    invalid_response: 10 * 60 * 1000,
  });

  class MetadataResolver {
    constructor({ cache, queue, fetchImpl, now = Date.now, apiTimeoutMs = 10000 } = {}) {
      if (!cache || typeof cache.get !== "function" || typeof cache.put !== "function") {
        throw new TypeError("cache must provide get and put methods");
      }
      if (!queue || typeof queue.enqueue !== "function") {
        throw new TypeError("queue must provide enqueue(key, task)");
      }
      if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl is required");
      if (typeof now !== "function") throw new TypeError("now must be a function");

      this.cache = cache;
      this.queue = queue;
      this.now = now;
      this.apiProvider = new BilibiliApiProvider({ fetchImpl, now, timeoutMs: apiTimeoutMs });
      this.inFlight = new Map();
    }

    async resolve(card, options) {
      const [result] = await this.resolveMany([card], options);
      return result;
    }

    async resolveMany(cards, options = {}) {
      if (!Array.isArray(cards)) throw new TypeError("cards must be an array");
      if (cards.length === 0) return [];

      const batchConcurrency =
        options.batchConcurrency ?? options.concurrency ?? this.queue.batchConcurrency ?? 2;
      const batchMinDelayMs =
        options.batchMinDelayMs ?? options.minDelayMs ?? this.queue.batchMinDelayMs ?? 350;
      const backgroundRetry = options.backgroundRetry === true;
      const backgroundMaxRetries = options.backgroundMaxRetries ?? this.queue.maxRetries ?? 2;
      assertPositiveInteger(batchConcurrency, "batchConcurrency");
      assertNonNegativeInteger(batchMinDelayMs, "batchMinDelayMs");
      assertNonNegativeInteger(backgroundMaxRetries, "backgroundMaxRetries");

      const results = new Array(cards.length);
      const groups = new Map();

      cards.forEach((card, index) => {
        const bvid = isBvid(card?.bvid) ? card.bvid : null;
        if (!bvid) {
          results[index] = { status: "unknown", reason: "no_identity" };
          return;
        }

        let group = groups.get(bvid);
        if (!group) {
          group = { bvid, indices: [], domResult: null };
          groups.set(bvid, group);
        }
        group.indices.push(index);

        if (!group.domResult) {
          const parsed = global.BYF?.parseDateText?.(card?.domDateText, this.now()) ?? null;
          if (parsed) group.domResult = knownResult(bvid, parsed.year, parsed.timestampMs, "dom");
        }
      });

      const unresolved = [];
      const domWrites = [];
      for (const group of groups.values()) {
        if (!group.domResult) {
          unresolved.push(group);
          continue;
        }
        assignGroupResult(results, group, group.domResult);
        domWrites.push(
          ignoreStorageFailure(
            this.cache.put({
              bvid: group.bvid,
              pubYear: group.domResult.year,
              pubTimestampMs: group.domResult.timestampMs,
              source: "dom",
              resolvedAtMs: this.now(),
            }),
          ),
        );
      }
      await Promise.all(domWrites);

      const cacheRecords = await Promise.all(
        unresolved.map((group) => ignoreStorageFailure(this.cache.get(group.bvid), null)),
      );
      const networkGroups = [];
      unresolved.forEach((group, index) => {
        const cached = cacheRecords[index];
        if (cached?.status === "negative") {
          assignGroupResult(results, group, {
            status: "unknown",
            bvid: group.bvid,
            reason: normalizeUnknownReason(cached.reason),
          });
          return;
        }
        const cachedYear = cached?.year ?? cached?.pubYear;
        if (Number.isInteger(cachedYear)) {
          assignGroupResult(
            results,
            group,
            knownResult(
              group.bvid,
              cachedYear,
              cached.timestampMs ?? cached.pubTimestampMs,
              "cache",
            ),
          );
          return;
        }
        networkGroups.push(group);
      });

      let cursor = 0;
      const worker = async () => {
        while (cursor < networkGroups.length) {
          const group = networkGroups[cursor];
          cursor += 1;
          const result = await this._resolveFirstAttempt(group.bvid, {
            minDelayMs: batchMinDelayMs,
            backgroundRetry,
            backgroundMaxRetries,
          });
          assignGroupResult(results, group, result);
        }
      };
      await Promise.all(
        Array.from(
          { length: Math.min(batchConcurrency, networkGroups.length) },
          () => worker(),
        ),
      );

      return results;
    }

    _resolveFirstAttempt(bvid, options) {
      if (this.inFlight.has(bvid)) return this.inFlight.get(bvid);
      const operation = this._fetchAndStoreFirstAttempt(bvid, options).finally(() => {
        if (this.inFlight.get(bvid) === operation) this.inFlight.delete(bvid);
      });
      this.inFlight.set(bvid, operation);
      return operation;
    }

    async _fetchAndStoreFirstAttempt(
      bvid,
      { minDelayMs, backgroundRetry, backgroundMaxRetries },
    ) {
      const task = () => this.apiProvider.resolve(bvid);
      const queueOptions = { maxRetries: 0, minDelayMs };
      const queued = typeof this.queue.enqueueResult === "function"
        ? await this.queue.enqueueResult(bvid, task, queueOptions)
        : await enqueueAsResult(this.queue, bvid, task, queueOptions);

      if (queued.status === "rejected") {
        const reason = normalizeUnknownReason(queued.reason ?? classifyError(queued.error));
        await this._cacheNegative(bvid, reason, queued.retryAfterMs);
        if (backgroundRetry && reason !== "invalid_response" && backgroundMaxRetries > 0) {
          this._retryInBackground(bvid, { minDelayMs, maxRetries: backgroundMaxRetries });
        }
        return { status: "unknown", bvid, reason };
      }

      const result = queued.value;
      if (result.status !== "known") {
        const reason = normalizeUnknownReason(result.reason);
        await this._cacheNegative(bvid, reason);
        return { ...result, reason };
      }

      await this._storeKnown(result);
      return result;
    }

    _retryInBackground(bvid, { minDelayMs, maxRetries }) {
      const background = async () => {
        try {
          const task = () => this.apiProvider.resolve(bvid);
          const queueOptions = { minDelayMs, maxRetries };
          const result = typeof this.queue.enqueueBackground === "function"
            ? await this.queue.enqueueBackground(bvid, task, queueOptions)
            : await this.queue.enqueue(bvid, task, queueOptions);
          if (result?.status === "known") await this._storeKnown(result);
        } catch (error) {
          const reason = normalizeUnknownReason(classifyError(error));
          await this._cacheNegative(bvid, reason, error?.retryAfterMs);
        }
      };
      void background();
    }

    async _storeKnown(result) {
      await ignoreStorageFailure(
        this.cache.put({
          bvid: result.bvid,
          pubYear: result.year,
          pubTimestampMs: result.timestampMs,
          source: result.source === "dom" ? "dom" : "api",
          resolvedAtMs: this.now(),
        }),
      );
    }

    async _cacheNegative(bvid, reason, queueRetryAfterMs) {
      if (typeof this.cache.putNegative !== "function") return;
      const retryAfterMs = Math.max(
        this.now() + NEGATIVE_TTL_MS[reason],
        Number.isFinite(queueRetryAfterMs) ? queueRetryAfterMs : 0,
      );
      await ignoreStorageFailure(this.cache.putNegative(bvid, reason, retryAfterMs));
    }
  }

  class BilibiliApiProvider {
    constructor({ fetchImpl, now = Date.now, timeoutMs = 10000 } = {}) {
      if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl is required");
      this.fetchImpl = fetchImpl;
      this.now = now;
      this.timeoutMs = timeoutMs;
    }

    async resolve(bvid) {
      if (!isBvid(bvid)) return { status: "unknown", reason: "no_identity" };
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      const timeoutId = controller
        ? setTimeout(() => controller.abort(new Error("Metadata request timed out")), this.timeoutMs)
        : null;

      try {
        const response = await this.fetchImpl(BilibiliApiProvider.urlFor(bvid), {
          method: "GET",
          credentials: "omit",
          signal: controller?.signal,
        });
        if (response?.status === 429) throw providerError("rate_limited", "API rate limited", 429);
        if (!response || response.ok !== true || typeof response.json !== "function") {
          throw providerError("api_unavailable", "API request failed", response?.status);
        }

        let payload;
        try {
          payload = await response.json();
        } catch (error) {
          throw providerError("invalid_response", "API returned invalid JSON", response.status, error);
        }

        const parsed = validateApiPayload(payload, bvid);
        if (!parsed) throw providerError("invalid_response", "API response shape is invalid");
        return knownResult(bvid, parsed.year, parsed.timestampMs, "api");
      } catch (error) {
        if (error?.code) throw error;
        throw providerError("api_unavailable", error?.message || "API request failed", undefined, error);
      } finally {
        if (timeoutId !== null) clearTimeout(timeoutId);
      }
    }

    static urlFor(bvid) {
      return `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`;
    }
  }

  function validateApiPayload(payload, expectedBvid) {
    if (!payload || payload.code !== 0 || !payload.data || typeof payload.data !== "object") {
      return null;
    }
    if (payload.data.bvid !== undefined && payload.data.bvid !== expectedBvid) return null;
    const pubdate = payload.data.pubdate;
    if (!Number.isSafeInteger(pubdate) || pubdate <= 0) return null;

    const timestampMs = pubdate * 1000;
    const date = new Date(timestampMs);
    const year = date.getFullYear();
    if (!Number.isFinite(date.getTime()) || year < 1 || year > 9999) return null;
    return { year, timestampMs };
  }

  function knownResult(bvid, year, timestampMs, source) {
    const result = { status: "known", bvid, year, source };
    if (Number.isFinite(timestampMs)) result.timestampMs = timestampMs;
    return result;
  }

  async function enqueueAsResult(queue, key, task, options) {
    try {
      return { status: "fulfilled", value: await queue.enqueue(key, task, options) };
    } catch (error) {
      return { status: "rejected", error, reason: classifyError(error), retryAfterMs: error?.retryAfterMs };
    }
  }

  async function ignoreStorageFailure(promise, fallback) {
    try {
      return await promise;
    } catch {
      return fallback;
    }
  }

  function providerError(code, message, status, cause) {
    const error = new Error(message, cause ? { cause } : undefined);
    error.code = code;
    if (status !== undefined) error.status = status;
    return error;
  }

  function classifyError(error) {
    if (error?.code === "rate_limited" || error?.status === 429) return "rate_limited";
    if (error?.code === "invalid_response") return "invalid_response";
    return "api_unavailable";
  }

  function normalizeUnknownReason(reason) {
    return ["api_unavailable", "rate_limited", "invalid_response"].includes(reason)
      ? reason
      : "api_unavailable";
  }

  function isBvid(value) {
    return typeof value === "string" && /^BV[0-9A-Za-z]{10}$/.test(value);
  }

  function assignGroupResult(results, group, result) {
    for (const index of group.indices) results[index] = result;
  }

  function assertPositiveInteger(value, name) {
    if (!Number.isInteger(value) || value < 1) {
      throw new TypeError(`${name} must be a positive integer`);
    }
  }

  function assertNonNegativeInteger(value, name) {
    if (!Number.isInteger(value) || value < 0) {
      throw new TypeError(`${name} must be a non-negative integer`);
    }
  }

  global.BYF = Object.assign(global.BYF || {}, {
    MetadataResolver,
    BilibiliApiProvider,
    validateApiPayload,
  });
})(globalThis);
