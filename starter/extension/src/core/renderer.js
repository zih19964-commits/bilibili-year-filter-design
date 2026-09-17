(function initRenderer(global) {
  "use strict";

  const BYF = (global.BYF = global.BYF || {});

  const STYLE_ID = "byf-runtime-style";
  const CLASS_NAMES = ["byf-hidden", "byf-dimmed", "byf-collapsed"];

  function ensureStyle(document) {
    if (!document || document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .byf-hidden { display: none !important; }
      .byf-dimmed {
        opacity: .42 !important;
        filter: grayscale(.72) !important;
        transition: opacity .16s ease, filter .16s ease;
      }
      .byf-collapsed {
        max-height: 88px !important;
        min-height: 56px !important;
        overflow: hidden !important;
        position: relative !important;
      }
      .byf-collapsed::after {
        background: linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,.94) 42%);
        bottom: 0;
        content: "";
        height: 32px;
        pointer-events: none;
        position: absolute;
        right: 0;
        width: 38%;
      }
      .byf-year-badge {
        align-items: center;
        backdrop-filter: blur(8px);
        background: rgba(23, 32, 52, .88);
        border: 1px solid rgba(255,255,255,.28);
        border-radius: 999px;
        box-shadow: 0 4px 12px rgba(15, 23, 42, .22);
        color: #fff;
        display: inline-flex;
        font: 700 11px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        gap: 4px;
        letter-spacing: .02em;
        padding: 5px 8px;
        pointer-events: none;
        position: absolute;
        right: 8px;
        top: 8px;
        z-index: 2147483000;
      }
      .byf-collapse-label {
        align-items: center;
        background: rgba(23, 32, 52, .88);
        border-radius: 999px;
        bottom: 8px;
        color: #fff;
        display: inline-flex;
        font: 600 11px/1 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        left: 8px;
        padding: 5px 8px;
        pointer-events: none;
        position: absolute;
        z-index: 2147483000;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function ensurePositioned(element) {
    if (!element || !element.style) {
      return;
    }

    if (element.dataset.byfPositionBackup === undefined) {
      const computed = global.getComputedStyle?.(element);
      if (computed?.position === "static") {
        element.dataset.byfPositionBackup = "static";
        element.style.position = "relative";
      } else {
        element.dataset.byfPositionBackup = "unchanged";
      }
    }
  }

  function restorePosition(element) {
    if (element?.dataset?.byfPositionBackup === "static") {
      element.style.position = "";
    }
    if (element?.dataset) {
      delete element.dataset.byfPositionBackup;
    }
  }

  class Renderer {
    constructor({ document = global.document } = {}) {
      this.document = document;
      ensureStyle(document);
    }

    apply(card, decision, metadata, settings) {
      const element = card?.element;
      if (!element?.classList) {
        return;
      }

      for (const className of CLASS_NAMES) {
        element.classList.remove(className);
      }

      element.dataset.byfProcessed = "true";
      element.dataset.byfDecision = decision?.action || "show";

      if (metadata?.status === "known" && Number.isInteger(metadata.year)) {
        element.dataset.byfYear = String(metadata.year);
      } else {
        delete element.dataset.byfYear;
      }

      if (decision?.action === "hide") {
        element.classList.add("byf-hidden");
      } else if (decision?.action === "dim") {
        element.classList.add("byf-dimmed");
      } else if (decision?.action === "collapse") {
        element.classList.add("byf-collapsed");
      }

      const badge = element.querySelector?.(":scope > .byf-year-badge");
      const showBadge =
        settings?.showYearBadge && metadata?.status === "known" && Number.isInteger(metadata.year);
      if (showBadge) {
        ensurePositioned(element);
        const nextBadge = badge || this.document.createElement("span");
        nextBadge.className = "byf-year-badge";
        nextBadge.textContent = String(metadata.year);
        nextBadge.setAttribute("aria-label", `发布时间年份 ${metadata.year}`);
        if (!badge) {
          element.appendChild(nextBadge);
        }
      } else if (badge) {
        badge.remove();
      }

      const label = element.querySelector?.(":scope > .byf-collapse-label");
      if (decision?.action === "collapse") {
        ensurePositioned(element);
        const nextLabel = label || this.document.createElement("span");
        nextLabel.className = "byf-collapse-label";
        nextLabel.textContent =
          metadata?.status === "known" && Number.isInteger(metadata.year)
            ? `已过滤 · ${metadata.year}`
            : "已过滤 · 年份未知";
        nextLabel.setAttribute("aria-hidden", "true");
        if (!label) {
          element.appendChild(nextLabel);
        }
      } else if (label) {
        label.remove();
      }

      if (!showBadge && decision?.action !== "collapse") {
        restorePosition(element);
      }
    }
  }

  BYF.Renderer = Renderer;
  BYF.ensureRendererStyle = ensureStyle;
})(typeof window !== "undefined" ? window : globalThis);
