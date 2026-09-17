(function initBilibiliAdapters(global) {
  "use strict";

  const BYF = (global.BYF = global.BYF || {});
  const BVID_PATTERN = /BV[0-9A-Za-z]{10}/;
  const SPECIAL_MARKER_GROUPS = Object.freeze({
    entertainment: Object.freeze(["综艺", "电影", "电视剧", "纪录片", "国创", "直播"]),
    anime: Object.freeze(["番剧", "漫画"]),
    classroom: Object.freeze(["课堂"]),
    ad: Object.freeze(["广告"]),
  });
  const MARKER_GROUP_BY_LABEL = Object.freeze(
    Object.fromEntries(
      Object.entries(SPECIAL_MARKER_GROUPS).flatMap(([group, labels]) =>
        labels.map((label) => [label, group]),
      ),
    ),
  );

  function markerGroupForLabel(label) {
    const normalized = typeof label === "string" ? label.trim() : "";
    if (normalized === "直播中") return "entertainment";
    return MARKER_GROUP_BY_LABEL[normalized] || null;
  }

  function isAdvertisementHref(href) {
    return typeof href === "string" && /^(?:https?:)?\/\/cm\.bilibili\.com(?:\/|$)/i.test(href.trim());
  }

  function readSpecialMarker(card) {
    if (!card?.querySelector) return null;

    const markerNodes = [
      card.matches?.(
        ".bili-video-card__info--ad, .bili-video-card__info--ad-text, [data-ad-label], [data-label='广告'], [aria-label='广告']",
      )
        ? card
        : null,
      card.querySelector(":scope .floor-card-inner .cover-container a .badge span"),
      card.querySelector(":scope .floor-single-card .badge span"),
      card.querySelector(":scope .bili-video-card__info--living__text"),
      card.querySelector(":scope .bili-video-card__info--ad"),
      card.querySelector(":scope .bili-video-card__info--ad-text"),
      card.querySelector(":scope [data-ad-label]"),
      card.querySelector(":scope [data-label='广告']"),
      card.querySelector(":scope [aria-label='广告']"),
      ...card.querySelectorAll(":scope .bili-video-card__stats--text"),
    ].filter(Boolean);

    for (const node of markerNodes) {
      const label = node.textContent?.trim();
      const group = markerGroupForLabel(label);
      if (group) return { label, group };
    }

    const adLink = [
      ...(card.matches?.("a[href]") ? [card] : []),
      ...card.querySelectorAll("a[href]"),
    ].find(
      (anchor) =>
        isAdvertisementHref(anchor.getAttribute("href")) &&
        anchor.textContent?.trim() === "广告",
    );
    if (adLink) return { label: "广告", group: "ad" };

    return null;
  }

  function extractBvidFromHref(href) {
    if (typeof href !== "string") {
      return null;
    }

    return href.match(BVID_PATTERN)?.[0] || null;
  }

  function normaliseRoot(root) {
    if (root && typeof root.querySelectorAll === "function") {
      return root;
    }
    return null;
  }

  function safeClosest(element, selector) {
    if (!element || typeof element.closest !== "function") {
      return null;
    }

    try {
      return element.closest(selector);
    } catch (_error) {
      return null;
    }
  }

  function getCardRoot(anchor) {
    // B站首页的 .bili-video-card__wrap 是 .feed-card 的内层内容，
    // 隐藏内层会让外层网格项继续占位。优先返回真正参与布局的根节点。
    const layoutRootSelectors = [
      ".floor-single-card",
      ".feed-card",
      ".bili-feed-card",
      ".video-list-item",
      ".small-item",
      ".video-page-card-small",
      ".rank-item",
      "article[data-bvid]",
      "li[data-bvid]",
    ];

    for (const selector of layoutRootSelectors) {
      const layoutRoot = safeClosest(anchor, selector);
      if (layoutRoot) {
        return layoutRoot;
      }
    }

    const contentRoot = safeClosest(
      anchor,
      [".bili-video-card__wrap", ".bili-video-card", ".video-card"].join(", "),
    );
    if (contentRoot) {
      return contentRoot;
    }

    let node = anchor;
    for (let depth = 0; node && depth < 6; depth += 1) {
      if (
        node !== anchor &&
        (node.matches?.("article, li") || node.hasAttribute?.("data-bvid"))
      ) {
        return node;
      }
      node = node.parentElement;
    }

    return anchor;
  }

  function readAttributeDate(card) {
    const selectors = [
      "[data-pubdate]",
      "[data-publish-time]",
      "[data-date]",
      "time[datetime]",
    ];

    for (const selector of selectors) {
      const node = card.matches?.(selector) ? card : card.querySelector(selector);
      if (!node) {
        continue;
      }

      const value =
        node.getAttribute("data-pubdate") ||
        node.getAttribute("data-publish-time") ||
        node.getAttribute("data-date") ||
        node.getAttribute("datetime") ||
        node.textContent;

      if (value?.trim()) {
        return value.trim();
      }
    }

    return null;
  }

  function readDateText(card) {
    const attributeDate = readAttributeDate(card);
    if (attributeDate) {
      return attributeDate;
    }

    const dateLikeSelectors = [
      "time",
      "[class*='date']",
      "[class*='pubdate']",
      "[class*='publish']",
      ".bili-video-card__subtitle",
      ".video-desc",
      ".video-card__info--date",
    ];

    for (const selector of dateLikeSelectors) {
      const nodes = card.querySelectorAll(selector);
      for (const node of nodes) {
        const text = node.textContent?.trim();
        if (text) {
          return text;
        }
      }
    }

    return null;
  }

  function getHref(card) {
    if (card.matches?.("a[href]")) {
      return card.getAttribute("href");
    }
    return card.querySelector("a[href]")?.getAttribute("href") || null;
  }

  class BilibiliSurfaceAdapter {
    constructor({ id, matches, selectors = [] }) {
      this.id = id;
      this._matches = matches;
      this.selectors = selectors;
    }

    matches(url) {
      return this._matches(url);
    }

    discover(root) {
      const parent = normaliseRoot(root);
      if (!parent) {
        return [];
      }

      const candidates = new Set();
      const anchors = [];

      if (parent.matches?.("a[href], [data-bvid]")) {
        anchors.push(parent);
      }

      for (const selector of this.selectors) {
        parent.querySelectorAll(selector).forEach((node) => candidates.add(node));
      }

      parent.querySelectorAll(".floor-single-card").forEach((node) => candidates.add(node));

      parent
        .querySelectorAll("a[href*='/video/BV'], a[href*='bvid=BV'], a[href*='cm.bilibili.com'], [data-bvid]")
        .forEach((node) => anchors.push(node));

      for (const candidate of candidates) {
        if (candidate.matches?.(".floor-single-card")) {
          anchors.push(candidate);
        }
        const anchor = candidate.matches?.("a[href]")
          ? candidate
          : candidate.querySelector("a[href*='/video/BV'], a[href*='bvid=BV'], a[href]");
        if (anchor) {
          anchors.push(anchor);
        }
        if (candidate.hasAttribute?.("data-bvid")) {
          anchors.push(candidate);
        }
      }

      const cards = new Set();
      for (const anchor of anchors) {
        const card = anchor.matches?.("[data-bvid]")
          ? anchor
          : getCardRoot(anchor);
        if (card) {
          cards.add(card);
        }
      }

      return [...cards]
        .map((element) => this.toVideoCard(element))
        .filter(Boolean);
    }

    toVideoCard(element) {
      if (!element || typeof element.querySelector !== "function") {
        return null;
      }

      const bvid =
        element.getAttribute?.("data-bvid") ||
        extractBvidFromHref(getHref(element));
      const specialMarker = readSpecialMarker(element);

      return {
        element,
        bvid: bvid && BVID_PATTERN.test(bvid) ? bvid : null,
        surface: this.id,
        domDateText: readDateText(element),
        specialMarker,
      };
    }
  }

  const knownAdapters = [
    new BilibiliSurfaceAdapter({
      id: "search",
      matches: (url) => url.hostname === "search.bilibili.com",
      selectors: [".video-list-item", ".video-list .video-card", ".search-page .video-item"],
    }),
    new BilibiliSurfaceAdapter({
      id: "space",
      matches: (url) => url.hostname === "space.bilibili.com",
      selectors: [".small-item", ".video-list-item", ".be-card"],
    }),
    new BilibiliSurfaceAdapter({
      id: "popular",
      matches: (url) =>
        url.hostname === "www.bilibili.com" &&
        (/^\/v\/popular/.test(url.pathname) || /^\/ranking/.test(url.pathname)),
      selectors: [".video-card", ".bili-video-card", ".rank-item"],
    }),
    new BilibiliSurfaceAdapter({
      id: "related",
      matches: (url) =>
        url.hostname === "www.bilibili.com" && /^\/video\//.test(url.pathname),
      selectors: [".video-page-card-small", ".rec-list .video-card", ".相关推荐"],
    }),
    new BilibiliSurfaceAdapter({
      id: "home",
      matches: (url) => url.hostname === "www.bilibili.com",
      selectors: [".bili-video-card", ".feed-card", ".video-card", ".floor-single-card"],
    }),
  ];

  const fallbackAdapter = new BilibiliSurfaceAdapter({
    id: "generic",
    matches: (url) =>
      url.hostname === "www.bilibili.com" ||
      url.hostname === "search.bilibili.com" ||
      url.hostname === "space.bilibili.com",
    selectors: [],
  });

  const api = {
    BilibiliSurfaceAdapter,
    adapters: knownAdapters,
    fallbackAdapter,
    extractBvidFromHref,
    isAdvertisementHref,
    readSpecialMarker,
    SPECIAL_MARKER_GROUPS,
    markerGroupForLabel,
    selectAdapter(url) {
      const target = url instanceof URL ? url : new URL(url, global.location?.href);
      return knownAdapters.find((adapter) => adapter.matches(target)) || fallbackAdapter;
    },
  };

  BYF.adapters = api;
  BYF.extractBvidFromHref = extractBvidFromHref;
})(typeof window !== "undefined" ? window : globalThis);
