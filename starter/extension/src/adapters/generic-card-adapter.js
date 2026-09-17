(function initGenericCardAdapter(global) {
  "use strict";

  const BYF = (global.BYF = global.BYF || {});
  const BVID_PATTERN = /BV[0-9A-Za-z]{10}/;

  function isAdvertisementHref(href) {
    return typeof href === "string" && /^(?:https?:)?\/\/cm\.bilibili\.com(?:\/|$)/i.test(href.trim());
  }

  function extractBvidFromHref(href) {
    return typeof href === "string" ? href.match(BVID_PATTERN)?.[0] || null : null;
  }

  class GenericCardAdapter {
    matches(_url) {
      return true;
    }

    discover(root) {
      if (!root?.querySelectorAll) {
        return [];
      }

      const candidates = [];
      if (root.matches?.("a[href*='/video/BV'], a[href*='cm.bilibili.com']")) {
        candidates.push(root);
      }
      candidates.push(...root.querySelectorAll("a[href*='/video/BV'], a[href*='cm.bilibili.com']"));

      const cards = new Set();
      for (const anchor of candidates) {
        const element =
          anchor.closest?.(
            ".feed-card, .video-list-item, .small-item, .video-page-card-small, article, li, [data-bvid], .video-card, .bili-video-card",
          ) || anchor;
        cards.add(element);
      }

      return [...cards].map((element) => this.toVideoCard(element)).filter(Boolean);
    }

    toVideoCard(element) {
      const href = element.matches?.("a[href]")
        ? element.getAttribute("href")
        : element.querySelector("a[href]")?.getAttribute("href");
      return {
        element,
        bvid: element.getAttribute?.("data-bvid") || extractBvidFromHref(href),
        surface: "generic",
        domDateText: null,
        specialMarker:
          isAdvertisementHref(href) && element.textContent?.trim() === "广告"
            ? { label: "广告", group: "ad" }
            : null,
      };
    }
  }

  BYF.GenericCardAdapter = GenericCardAdapter;
  BYF.extractBvidFromHref = BYF.extractBvidFromHref || extractBvidFromHref;
})(typeof window !== "undefined" ? window : globalThis);
