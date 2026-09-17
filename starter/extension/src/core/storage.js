((global) => {
"use strict";

/** A tiny async adapter useful for tests and non-extension integrations. */
class MemoryStorageAdapter {
  constructor(initialValues = {}) {
    this.values = new Map(Object.entries(initialValues));
  }

  async get(key) {
    return this.values.has(key) ? clone(this.values.get(key)) : null;
  }

  async set(key, value) {
    this.values.set(key, clone(value));
  }

  async remove(key) {
    this.values.delete(key);
  }
}

/** Wraps chrome.storage.local/browser.storage.local behind the same async API. */
class BrowserStorageAdapter {
  constructor(storageArea) {
    if (!storageArea) {
      throw new TypeError("storageArea is required");
    }
    this.storageArea = storageArea;
  }

  async get(key) {
    const result = await callStorage(this.storageArea, "get", key);
    return result?.[key] ?? null;
  }

  async set(key, value) {
    await callStorage(this.storageArea, "set", { [key]: value });
  }

  async remove(key) {
    await callStorage(this.storageArea, "remove", key);
  }
}

function callStorage(area, method, argument) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const callback = (result) => {
      if (settled) return;
      settled = true;
      const runtimeError = global.chrome?.runtime?.lastError;
      runtimeError ? reject(new Error(runtimeError.message)) : resolve(result);
    };

    try {
      const returned = area[method](argument, callback);
      if (returned && typeof returned.then === "function") {
        returned.then(
          (result) => {
            if (!settled) {
              settled = true;
              resolve(result);
            }
          },
          (error) => {
            if (!settled) {
              settled = true;
              reject(error);
            }
          },
        );
      }
    } catch (error) {
      reject(error);
    }
  });
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

global.BYF = Object.assign(global.BYF || {}, {
  MemoryStorageAdapter,
  BrowserStorageAdapter,
});
})(globalThis);
