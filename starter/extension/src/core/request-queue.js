((global) => {
"use strict";

class RequestQueue {
  constructor({
    concurrency = 2,
    minDelayMs = 350,
    batchConcurrency = concurrency,
    batchMinDelayMs = minDelayMs,
    maxRetries = 2,
    retryDelaysMs = [1000, 3000],
    jitterRatio = 0.2,
    failureThreshold = 10,
    circuitCooldownMs = 5 * 60 * 1000,
    now = Date.now,
    sleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
    random = Math.random,
    isRetryable = defaultIsRetryable,
  } = {}) {
    assertNonNegativeInteger(concurrency, "concurrency", false);
    assertNonNegativeInteger(minDelayMs, "minDelayMs");
    assertNonNegativeInteger(maxRetries, "maxRetries");
    assertNonNegativeInteger(failureThreshold, "failureThreshold", false);
    assertNonNegativeInteger(batchConcurrency, "batchConcurrency", false);
    assertNonNegativeInteger(batchMinDelayMs, "batchMinDelayMs");

    this.concurrency = concurrency;
    this.minDelayMs = minDelayMs;
    this.batchConcurrency = batchConcurrency;
    this.batchMinDelayMs = batchMinDelayMs;
    this.maxRetries = maxRetries;
    this.retryDelaysMs = retryDelaysMs;
    this.jitterRatio = jitterRatio;
    this.failureThreshold = failureThreshold;
    this.circuitCooldownMs = circuitCooldownMs;
    this.now = now;
    this.sleep = sleep;
    this.random = random;
    this.isRetryable = isRetryable;

    this.inFlight = new Map();
    this.backgroundInFlight = new Map();
    this.pending = [];
    this.activeCount = 0;
    this.lastStartAtMs = Number.NEGATIVE_INFINITY;
    this.startGate = Promise.resolve();
    this.consecutiveFailures = 0;
    this.circuitOpenUntilMs = 0;
  }

  enqueue(key, task, options = {}) {
    if (typeof task !== "function") {
      return Promise.reject(new TypeError("task must be a function"));
    }

    if (this.inFlight.has(key)) {
      return this.inFlight.get(key);
    }

    if (this._isCircuitOpen()) {
      return Promise.reject(
        new RequestQueueError("Request circuit is open", "circuit_open", {
          retryAfterMs: this.circuitOpenUntilMs,
        }),
      );
    }

    const jobOptions = normalizeJobOptions(options, this);

    let resolvePromise;
    let rejectPromise;
    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    this.inFlight.set(key, promise);
    this.pending.push({
      key,
      task,
      resolve: resolvePromise,
      reject: rejectPromise,
      ...jobOptions,
    });
    this._drain();
    return promise;
  }

  /** Returns a non-throwing result that a fail-open resolver can map to UNKNOWN. */
  async enqueueResult(key, task, options = {}) {
    try {
      return { status: "fulfilled", value: await this.enqueue(key, task, options) };
    } catch (error) {
      return {
        status: "rejected",
        error,
        reason: classifyRequestError(error),
        retryAfterMs: error?.retryAfterMs,
      };
    }
  }

  /** Schedules retry attempts after backoff without extending the caller's foreground wait. */
  enqueueBackground(key, task, options = {}) {
    if (typeof task !== "function") {
      return Promise.reject(new TypeError("task must be a function"));
    }
    if (this.backgroundInFlight.has(key)) return this.backgroundInFlight.get(key);

    const jobOptions = normalizeJobOptions(options, this);
    if (jobOptions.maxRetries < 1) {
      return Promise.reject(new TypeError("background maxRetries must be at least 1"));
    }

    const operation = (async () => {
      await this.sleep(this._retryDelay(0, jobOptions));
      return this.enqueue(key, task, {
        ...jobOptions,
        maxRetries: jobOptions.maxRetries - 1,
        retryDelaysMs: jobOptions.retryDelaysMs.slice(1),
      });
    })().finally(() => {
      if (this.backgroundInFlight.get(key) === operation) {
        this.backgroundInFlight.delete(key);
      }
    });
    this.backgroundInFlight.set(key, operation);
    return operation;
  }

  /**
   * Runs each distinct key once and expands the settled result back to input order.
   * Per-batch limits may be stricter than the queue-wide safety limits.
   */
  async enqueueBatch(
    items,
    {
      concurrency = this.batchConcurrency,
      minDelayMs = this.batchMinDelayMs,
      maxRetries = this.maxRetries,
      retryDelaysMs = this.retryDelaysMs,
      jitterRatio = this.jitterRatio,
    } = {},
  ) {
    if (!Array.isArray(items)) throw new TypeError("items must be an array");
    assertNonNegativeInteger(concurrency, "batch concurrency", false);
    assertNonNegativeInteger(minDelayMs, "batch minDelayMs");
    assertNonNegativeInteger(maxRetries, "batch maxRetries");

    const unique = [];
    const byKey = new Map();
    items.forEach((item, index) => {
      if (!item || typeof item.task !== "function") {
        throw new TypeError(`items[${index}].task must be a function`);
      }
      const existing = byKey.get(item.key);
      if (existing) {
        existing.indices.push(index);
      } else {
        const entry = { key: item.key, task: item.task, indices: [index] };
        byKey.set(item.key, entry);
        unique.push(entry);
      }
    });

    const results = new Array(items.length);
    let cursor = 0;
    const worker = async () => {
      while (cursor < unique.length) {
        const entry = unique[cursor];
        cursor += 1;
        const result = await this.enqueueResult(entry.key, entry.task, {
          minDelayMs,
          maxRetries,
          retryDelaysMs,
          jitterRatio,
        });
        for (const index of entry.indices) results[index] = result;
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, unique.length) }, () => worker()),
    );
    return results;
  }

  getStats() {
    return {
      active: this.activeCount,
      pending: this.pending.length,
      inFlight: this.inFlight.size,
      backgroundInFlight: this.backgroundInFlight.size,
      consecutiveFailures: this.consecutiveFailures,
      circuitOpenUntilMs: this.circuitOpenUntilMs,
    };
  }

  _drain() {
    while (this.activeCount < this.concurrency && this.pending.length > 0) {
      const job = this.pending.shift();
      if (this._isCircuitOpen()) {
        this.inFlight.delete(job.key);
        job.reject(
          new RequestQueueError("Request circuit is open", "circuit_open", {
            retryAfterMs: this.circuitOpenUntilMs,
          }),
        );
        continue;
      }

      this.activeCount += 1;
      this._run(job);
    }
  }

  async _run(job) {
    let lastError;
    for (let attempt = 0; attempt <= job.maxRetries; attempt += 1) {
      try {
        if (attempt > 0) {
          await this.sleep(this._retryDelay(attempt - 1, job));
        }
        await this._waitForStartSlot(job.minDelayMs);
        const value = await job.task({ attempt, signal: undefined });
        this.consecutiveFailures = 0;
        this.circuitOpenUntilMs = 0;
        this._finishJob(job, value, null);
        return;
      } catch (error) {
        lastError = error;
        if (attempt >= job.maxRetries || !this.isRetryable(error)) {
          break;
        }
      }
    }

    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.circuitOpenUntilMs = this.now() + this.circuitCooldownMs;
    }
    this._finishJob(job, null, normalizeQueueError(lastError));
  }

  _finishJob(job, value, error) {
    this.inFlight.delete(job.key);
    if (this.activeCount > 0) {
      this.activeCount -= 1;
    }
    if (error) {
      job.reject(error);
    } else {
      job.resolve(value);
    }
    this._drain();
  }

  _waitForStartSlot(requestedMinDelayMs = this.minDelayMs) {
    const wait = async () => {
      const effectiveMinDelayMs = Math.max(this.minDelayMs, requestedMinDelayMs);
      const delayMs = Math.max(0, this.lastStartAtMs + effectiveMinDelayMs - this.now());
      if (delayMs > 0) {
        await this.sleep(delayMs);
      }
      this.lastStartAtMs = this.now();
    };
    const turn = this.startGate.then(wait, wait);
    this.startGate = turn.catch(() => {});
    return turn;
  }

  _retryDelay(index, job) {
    const configured = job.retryDelaysMs[index];
    const base = Number.isFinite(configured) ? configured : 1000 * 3 ** index;
    return Math.max(0, Math.round(base * (1 + this.random() * job.jitterRatio)));
  }

  _isCircuitOpen() {
    if (this.circuitOpenUntilMs <= this.now()) {
      this.circuitOpenUntilMs = 0;
      return false;
    }
    return true;
  }
}

class RequestQueueError extends Error {
  constructor(message, code = "api_unavailable", options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "RequestQueueError";
    this.code = code;
    this.retryAfterMs = options.retryAfterMs;
  }
}

function classifyRequestError(error) {
  if (error?.code === "rate_limited" || error?.status === 429) {
    return "rate_limited";
  }
  if (error?.code === "invalid_response") {
    return "invalid_response";
  }
  return "api_unavailable";
}

function normalizeQueueError(error) {
  if (error instanceof RequestQueueError) {
    return error;
  }
  return new RequestQueueError(error?.message || "Request failed", classifyRequestError(error), {
    cause: error,
    retryAfterMs: error?.retryAfterMs,
  });
}

function defaultIsRetryable(error) {
  return error?.code !== "invalid_response";
}

function normalizeJobOptions(options, queue) {
  const maxRetries = options.maxRetries ?? queue.maxRetries;
  const minDelayMs = options.minDelayMs ?? queue.minDelayMs;
  const retryDelaysMs = options.retryDelaysMs ?? queue.retryDelaysMs;
  const jitterRatio = options.jitterRatio ?? queue.jitterRatio;
  assertNonNegativeInteger(maxRetries, "maxRetries");
  assertNonNegativeInteger(minDelayMs, "minDelayMs");
  if (!Array.isArray(retryDelaysMs)) throw new TypeError("retryDelaysMs must be an array");
  if (!Number.isFinite(jitterRatio) || jitterRatio < 0) {
    throw new TypeError("jitterRatio must be a non-negative number");
  }
  return { maxRetries, minDelayMs, retryDelaysMs, jitterRatio };
}

function assertNonNegativeInteger(value, name, allowZero = true) {
  if (!Number.isInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new TypeError(`${name} must be ${allowZero ? "a non-negative" : "a positive"} integer`);
  }
}

global.BYF = Object.assign(global.BYF || {}, {
  RequestQueue,
  RequestQueueError,
  classifyRequestError,
});
})(globalThis);
