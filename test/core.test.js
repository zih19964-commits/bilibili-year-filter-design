const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");

const core = path.resolve(__dirname, "../starter/extension/src/core");
for (const file of [
  "settings.js",
  "filter-engine.js",
  "date-parser.js",
  "storage.js",
  "metadata-cache.js",
  "request-queue.js",
  "metadata-resolver.js",
]) {
  require(path.join(core, file));
}
require(path.resolve(__dirname, "../starter/extension/src/adapters/bilibili-adapter.js"));
require(path.resolve(__dirname, "../starter/extension/src/adapters/generic-card-adapter.js"));

const {
  BYF,
} = globalThis;
const BVID = "BV1xx411c7mD";

test("FilterEngine preserves rule priority and fail-open semantics", () => {
  const settings = BYF.normalizeSettings({
    excludedYears: [2024],
    minYear: 2022,
    recentYears: 3,
    action: "dim",
  });
  assert.deepEqual(BYF.FilterEngine.evaluate(null, settings, 2026), { action: "show", reason: "unknown_year" });
  assert.deepEqual(BYF.FilterEngine.evaluate(2024, settings, 2026), { action: "dim", reason: "excluded_year" });
  assert.deepEqual(BYF.FilterEngine.evaluate(2021, settings, 2026), { action: "dim", reason: "before_min_year" });
  assert.deepEqual(BYF.FilterEngine.evaluate(2025, settings, 2026), { action: "show", reason: "allowed" });
  assert.equal(BYF.normalizeSettings({ unknownPolicy: "hide" }).unknownPolicy, "show");
  assert.deepEqual(
    BYF.normalizeSettings({ blockedMarkerGroups: ["classroom", "ad", "classroom", "invalid"] }).blockedMarkerGroups,
    ["classroom", "ad"],
  );
});

test("advertisement cards are a special marker and do not use title keywords", () => {
  assert.equal(BYF.adapters.markerGroupForLabel("广告"), "ad");
  assert.equal(BYF.adapters.markerGroupForLabel("标题含广告"), null);
  assert.equal(BYF.adapters.isAdvertisementHref("//cm.bilibili.com/cm/api/fees/pc/sync"), true);
  assert.equal(BYF.adapters.isAdvertisementHref("https://www.bilibili.com/video/BV1xx411c7mD"), false);

  const adMarker = { textContent: "广告" };
  const bilibiliAdCard = {
    matches: () => false,
    querySelector: () => null,
    querySelectorAll: (selector) =>
      selector.includes("bili-video-card__stats--text") ? [adMarker] : [],
  };
  assert.deepEqual(BYF.adapters.readSpecialMarker(bilibiliAdCard), { label: "广告", group: "ad" });

  const generic = new BYF.GenericCardAdapter();
  const adAnchor = {
    matches: (selector) => selector === "a[href]" || selector.includes("cm.bilibili.com"),
    getAttribute: () => "//cm.bilibili.com/cm/api/fees/pc/sync",
    querySelector: () => null,
    textContent: "广告",
    closest: () => null,
  };
  const root = {
    querySelectorAll: () => [adAnchor],
    matches: () => false,
  };
  const [card] = generic.discover(root);
  assert.deepEqual(card.specialMarker, { label: "广告", group: "ad" });
});

test("date parser handles absolute dates and cross-year relative dates", () => {
  const now = new Date(2026, 0, 1, 1, 0, 0).getTime();
  assert.equal(BYF.parseDateText("2025-12-31", now).year, 2025);
  assert.equal(BYF.parseDateText("2025年12月31日", now).year, 2025);
  assert.equal(BYF.parseDateText("昨天", now).year, 2025);
  assert.equal(BYF.parseDateText("23小时前", now).year, 2025);
  assert.equal(BYF.parseDateText("12-31", now), null);
  assert.equal(BYF.parseDateText("2025-02-30", now), null);
});

test("MetadataCache keeps positive records and expires negative records", async () => {
  let now = 1_800_000_000_000;
  const storage = new BYF.MemoryStorageAdapter();
  const cache = new BYF.MetadataCache({ storage, maxEntries: 2, now: () => now });
  await cache.put({ bvid: BVID, pubYear: 2024, pubTimestampMs: now, source: "api" });
  assert.equal((await cache.get(BVID)).year, 2024);
  await cache.putNegative("BV1xx411c7mE", "api_unavailable", now + 1000);
  assert.equal((await cache.get("BV1xx411c7mE")).status, "negative");
  now += 1001;
  assert.equal(await cache.get("BV1xx411c7mE"), null);
});

test("RequestQueue deduplicates concurrent requests by BVID", async () => {
  let calls = 0;
  const queue = new BYF.RequestQueue({ concurrency: 2, minDelayMs: 0, sleep: async () => {} });
  const task = () => {
    calls += 1;
    return Promise.resolve("ok");
  };
  const results = await Promise.all(Array.from({ length: 10 }, () => queue.enqueue("same", task)));
  assert.equal(calls, 1);
  assert.deepEqual(results, Array(10).fill("ok"));
});

test("MetadataResolver uses cache before API and fails open on invalid API", async () => {
  const storage = new BYF.MemoryStorageAdapter();
  const cache = new BYF.MetadataCache({ storage });
  const queue = new BYF.RequestQueue({ concurrency: 2, minDelayMs: 0, sleep: async () => {} });
  let calls = 0;
  const resolver = new BYF.MetadataResolver({
    cache,
    queue,
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => ({ code: -1 }) };
    },
  });
  await cache.put({ bvid: BVID, pubYear: 2023, pubTimestampMs: Date.now(), source: "api" });
  const cached = await resolver.resolve({ bvid: BVID, domDateText: null });
  assert.equal(cached.status, "known");
  assert.equal(calls, 0);
  const unknown = await resolver.resolve({ bvid: "BV1xx411c7mE", domDateText: null });
  assert.equal(unknown.status, "unknown");
  assert.equal(unknown.reason, "invalid_response");
});

test("MetadataResolver resolves a page batch together and deduplicates repeated BVIDs", async () => {
  const storage = new BYF.MemoryStorageAdapter();
  const cache = new BYF.MetadataCache({ storage });
  const queue = new BYF.RequestQueue({
    concurrency: 3,
    minDelayMs: 0,
    batchConcurrency: 3,
    batchMinDelayMs: 0,
    sleep: async () => {},
  });
  const BVID2 = "BV1xx411c7mE";
  let calls = 0;
  const resolver = new BYF.MetadataResolver({
    cache,
    queue,
    fetchImpl: async (url) => {
      calls += 1;
      const bvid = new URL(url).searchParams.get("bvid");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          code: 0,
          data: { bvid, pubdate: Math.floor(new Date("2024-01-02T00:00:00Z").getTime() / 1000) },
        }),
      };
    },
  });

  const results = await resolver.resolveMany([
    { bvid: BVID },
    { bvid: BVID2 },
    { bvid: BVID },
    { bvid: null },
  ], { batchConcurrency: 3, batchMinDelayMs: 0 });

  assert.equal(calls, 2);
  assert.equal(results[0].status, "known");
  assert.equal(results[0].year, 2024);
  assert.deepEqual(results[0], results[2]);
  assert.deepEqual(results[3], { status: "unknown", reason: "no_identity" });
});
