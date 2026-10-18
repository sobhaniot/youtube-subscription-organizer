"use strict";

(() => {
  const YSO_STORAGE_KEY = "youtubeSubscriptionOrganizer";
  let storedDataCache = null;

  function normalizeStoredData(source) {
    const safe = source && typeof source === "object" ? source : {};
    const data = {
      version: 3,
      channels: Array.isArray(safe.channels) ? safe.channels : [],
      categories: Array.isArray(safe.categories) ? safe.categories : [],
      assignments: safe.assignments && typeof safe.assignments === "object" ? safe.assignments : {},
      lastSync: typeof safe.lastSync === "string" ? safe.lastSync : null,
      recentVideos: safe.recentVideos && typeof safe.recentVideos === "object" ? safe.recentVideos : {},
      youtubeNewChannels: safe.youtubeNewChannels && typeof safe.youtubeNewChannels === "object"
        ? safe.youtubeNewChannels
        : {},
      knownVideoIds: Array.isArray(safe.knownVideoIds) ? safe.knownVideoIds : [],
      lastVideoCheck: typeof safe.lastVideoCheck === "string" ? safe.lastVideoCheck : null,
      removedChannels: Array.isArray(safe.removedChannels) ? safe.removedChannels : []
    };
    return globalThis.YSOChannelData?.reconcile(data) || data;
  }

  function currentChannelUrl() {
    const headerHandleLink = document.querySelector(
      'yt-page-header-view-model a[href^="/@"], yt-page-header-renderer a[href^="/@"], ytd-c4-tabbed-header-renderer a[href^="/@"]'
    );
    if (headerHandleLink) {
      const handle = new URL(headerHandleLink.getAttribute("href"), location.origin)
        .pathname.split("/").filter(Boolean)[0];
      if (handle?.startsWith("@")) return `${location.origin}/${handle}`;
    }

    const canonical = document.querySelector('link[rel="canonical"]')?.href ||
      document.querySelector('meta[property="og:url"]')?.content || "";
    if (canonical) {
      try {
        const canonicalUrl = new URL(canonical, location.origin);
        if (/^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)$/.test(canonicalUrl.pathname.replace(/\/$/, ""))) {
          return `${location.origin}${canonicalUrl.pathname.replace(/\/$/, "")}`;
        }
      } catch {
        // Continue with the visible URL.
      }
    }

    const parts = location.pathname.split("/").filter(Boolean);
    if (parts[0]?.startsWith("@")) return `${location.origin}/${parts[0]}`;
    if (["channel", "c", "user"].includes(parts[0]) && parts[1]) {
      return `${location.origin}/${parts[0]}/${parts[1]}`;
    }
    const reserved = new Set([
      "account", "feed", "gaming", "playlist", "premium", "results", "shorts", "watch", "youtubei"
    ]);
    if (parts.length === 1 && parts[0] && !reserved.has(parts[0].toLocaleLowerCase())) {
      return `${location.origin}/${parts[0]}`;
    }
    return null;
  }

  function currentChannelInfo() {
    const url = currentChannelUrl();
    if (!url) return null;

    const titleSelectors = [
      "ytd-channel-name #text",
      "#channel-name #text",
      "ytd-c4-tabbed-header-renderer #channel-name",
      "yt-page-header-view-model h1",
      "h1.dynamic-text-view-model-wiz__h1"
    ];
    let title = "";
    for (const selector of titleSelectors) {
      title = document.querySelector(selector)?.textContent?.trim() || "";
      if (title) break;
    }
    if (!title) title = document.title.replace(/\s*-\s*YouTube\s*$/i, "").trim() || "کانال یوتیوب";

    const avatarSelectors = [
      "ytd-c4-tabbed-header-renderer #avatar img",
      "yt-page-header-renderer img",
      "yt-decorated-avatar-view-model img",
      "#channel-header-container #avatar img"
    ];
    let avatar = "";
    for (const selector of avatarSelectors) {
      avatar = imageUrlFrom(document.querySelector(selector));
      if (avatar) break;
    }

    const path = new URL(url).pathname;
    const idMatch = path.match(/^\/channel\/([^/]+)/i);
    return {
      key: channelKey(url),
      channelId: idMatch?.[1] || null,
      title,
      url,
      avatar,
      scannedAt: new Date().toISOString()
    };
  }

  function categoryButtonPlacement() {
    const selectors = [
      "yt-flexible-actions-view-model #subscribe-button",
      "yt-flexible-actions-view-model yt-subscribe-button-view-model",
      "yt-page-header-renderer yt-subscribe-button-view-model",
      "yt-page-header-renderer ytd-subscribe-button-renderer",
      "ytd-c4-tabbed-header-renderer #subscribe-button",
      "ytd-c4-tabbed-header-renderer ytd-subscribe-button-renderer",
      "#channel-header-container #subscribe-button",
      "#channel-header-container yt-subscribe-button-view-model"
    ];
    for (const selector of selectors) {
      const target = document.querySelector(selector);
      if (!target) continue;

      const flexibleActions = target.closest("yt-flexible-actions-view-model");
      if (flexibleActions) {
        let reference = target;
        while (reference.parentElement && reference.parentElement !== flexibleActions) {
          reference = reference.parentElement;
        }
        if (reference.parentElement === flexibleActions) {
          return { container: flexibleActions, reference, useActionWrapper: true };
        }
      }

      const reference = target.closest("yt-subscribe-button-view-model, ytd-subscribe-button-renderer") || target;
      if (reference.parentElement) return { container: reference.parentElement, reference, useActionWrapper: false };
    }
    return null;
  }

  async function getStoredData() {
    if (storedDataCache) return storedDataCache;
    const stored = await browser.storage.local.get(YSO_STORAGE_KEY);
    const source = stored[YSO_STORAGE_KEY] && typeof stored[YSO_STORAGE_KEY] === "object"
      ? stored[YSO_STORAGE_KEY]
      : {};
    storedDataCache = normalizeStoredData(source);
    return storedDataCache;
  }

  async function saveStoredData(data) {
    storedDataCache = data;
    await browser.storage.local.set({ [YSO_STORAGE_KEY]: data });
  }

  function normalizedGuideChannelKey(href) {
    if (!href) return "";
    try {
      const path = new URL(href, location.origin).pathname.replace(/\/$/, "");
      if (!/^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)$/i.test(path)) return "";
      return path.toLocaleLowerCase();
    } catch {
      return "";
    }
  }

  function guideEntryHasNewVideo(entry) {
    const explicitBadge = entry.querySelector([
      "#newness-dot",
      "#guide-entry-badge",
      "[class*='newness-dot']",
      "[class*='new-content-dot']",
      "[data-is-new='true']",
      "[aria-label*='new video' i]",
      "[aria-label*='new content' i]",
      "[aria-label*='ویدیوی جدید']"
    ].join(","));
    return Boolean(explicitBadge);
  }

  let guideSyncRunning = false;
  async function syncYouTubeNewChannels() {
    if (guideSyncRunning) return;
    const entries = document.querySelectorAll(
      "ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer, yt-guide-entry-renderer"
    );
    const observed = new Map();
    for (const entry of entries) {
      const link = entry.querySelector(
        'a[href^="/@"], a[href^="/channel/"], a[href^="/c/"], a[href^="/user/"]'
      );
      const key = normalizedGuideChannelKey(link?.getAttribute("href"));
      if (!key) continue;
      observed.set(key, {
        hasNew: guideEntryHasNewVideo(entry),
        title: link.getAttribute("title")?.trim() ||
          entry.querySelector("#endpoint, #label, yt-formatted-string")?.textContent?.trim() || ""
      });
    }
    if (!observed.size) return;

    guideSyncRunning = true;
    try {
      const data = await getStoredData();
      const next = { ...data.youtubeNewChannels };
      let changed = false;
      for (const [key, status] of observed) {
        if (status.hasNew) {
          const previous = next[key];
          if (!previous || previous.title !== status.title) {
            next[key] = { title: status.title, detectedAt: new Date().toISOString() };
            changed = true;
          }
        } else if (Object.hasOwn(next, key)) {
          delete next[key];
          changed = true;
        }
      }
      if (changed) {
        data.youtubeNewChannels = next;
        await saveStoredData(data);
      }
    } finally {
      guideSyncRunning = false;
    }
  }

  function ensureCurrentChannel(data, channel) {
    const index = data.channels.findIndex((item) =>
      item.key === channel.key || globalThis.YSOChannelData?.sameChannel(item, channel)
    );
    if (index >= 0) {
      const existing = data.channels[index];
      data.channels[index] = {
        ...existing,
        ...channel,
        key: existing.key,
        url: existing.url,
        avatar: channel.avatar || existing.avatar || ""
      };
    } else {
      data.channels.push(channel);
    }
    return index >= 0 ? data.channels[index].key : channel.key;
  }

  function storedChannelKey(data, channel) {
    return data.channels.find((item) =>
      item.key === channel.key || globalThis.YSOChannelData?.sameChannel(item, channel)
    )?.key || channel.key;
  }

  async function updateCategoryButton() {
    const button = document.querySelector(".yso-category-button");
    const channel = currentChannelInfo();
    if (!button || !channel) return;
    const data = await getStoredData();
    const count = data.assignments[storedChannelKey(data, channel)]?.length || 0;
    const label = count > 0 ? `دسته‌بندی (${count.toLocaleString("fa-IR")})` : "دسته‌بندی";
    if (button.textContent !== label) button.textContent = label;
    button.dataset.assigned = String(count > 0);
  }

  function closeCategoryDialog() {
    document.querySelector(".yso-overlay")?.remove();
  }

  async function openCategoryDialog() {
    closeCategoryDialog();
    const channel = currentChannelInfo();
    if (!channel) return;
    const data = await getStoredData();
    let assignmentKey = storedChannelKey(data, channel);
    const assigned = new Set(data.assignments[assignmentKey] || []);

    const overlay = document.createElement("div");
    overlay.className = "yso-overlay";
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeCategoryDialog();
    });

    const dialog = document.createElement("section");
    dialog.className = "yso-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", `دسته‌بندی ${channel.title}`);

    const header = document.createElement("div");
    header.className = "yso-dialog-header";
    const heading = document.createElement("strong");
    heading.textContent = `دسته‌بندی «${channel.title}»`;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "yso-close";
    close.textContent = "×";
    close.setAttribute("aria-label", "بستن");
    close.addEventListener("click", closeCategoryDialog);
    header.append(heading, close);

    const options = document.createElement("div");
    options.className = "yso-category-options";
    if (data.categories.length === 0) {
      const message = document.createElement("p");
      message.className = "yso-empty-message";
      message.textContent = "هنوز دسته‌ای نساخته‌اید. از فرم پایین اولین دسته را بسازید.";
      options.append(message);
    }

    for (const category of data.categories) {
      const label = document.createElement("label");
      label.className = "yso-option";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = assigned.has(category.id);
      const dot = document.createElement("span");
      dot.className = "yso-color-dot";
      dot.style.setProperty("--yso-color", category.color);
      const name = document.createElement("span");
      name.textContent = category.name;
      label.append(checkbox, dot, name);
      checkbox.addEventListener("change", async () => {
        if (checkbox.checked) assigned.add(category.id);
        else assigned.delete(category.id);
        assignmentKey = ensureCurrentChannel(data, channel);
        if (assigned.size) data.assignments[assignmentKey] = [...assigned];
        else delete data.assignments[assignmentKey];
        await saveStoredData(data);
        await updateCategoryButton();
      });
      options.append(label);
    }

    const form = document.createElement("form");
    form.className = "yso-new-category";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.maxLength = 32;
    nameInput.required = true;
    nameInput.placeholder = "دستهٔ جدید";
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = "#d9233f";
    colorInput.setAttribute("aria-label", "رنگ دسته");
    const addButton = document.createElement("button");
    addButton.type = "submit";
    addButton.textContent = "افزودن";
    form.append(nameInput, colorInput, addButton);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const name = nameInput.value.trim();
      if (!name) return;
      const category = {
        id: crypto.randomUUID(),
        name: name.slice(0, 32),
        color: colorInput.value,
        createdAt: new Date().toISOString()
      };
      data.categories.push(category);
      assigned.add(category.id);
      assignmentKey = ensureCurrentChannel(data, channel);
      data.assignments[assignmentKey] = [...assigned];
      await saveStoredData(data);
      closeCategoryDialog();
      await updateCategoryButton();
      await openCategoryDialog();
    });

    dialog.append(header, options, form);
    overlay.append(dialog);
    document.body.append(overlay);
    close.focus();
  }

  async function ensureCategoryButton() {
    if (!currentChannelUrl()) {
      closeCategoryDialog();
      document.querySelector(".yso-category-action")?.remove();
      document.querySelector(".yso-category-button")?.remove();
      return true;
    }
    const placement = categoryButtonPlacement();
    if (!placement) return false;

    let button = document.querySelector(".yso-category-button");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "yso-category-button";
      button.textContent = "دسته‌بندی";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void openCategoryDialog();
      });
    }
    if (placement.useActionWrapper) {
      let action = button.closest(".yso-category-action");
      if (!action) {
        action = document.createElement("div");
        action.className = "ytFlexibleActionsViewModelAction yso-category-action";
        action.append(button);
      }
      if (action.parentElement !== placement.container || action.previousElementSibling !== placement.reference) {
        placement.reference.insertAdjacentElement("afterend", action);
      }
    } else {
      const action = button.closest(".yso-category-action");
      if (action) action.replaceWith(button);
      if (button.parentElement !== placement.container || button.previousElementSibling !== placement.reference) {
        placement.reference.insertAdjacentElement("afterend", button);
      }
    }
    await updateCategoryButton();
    return true;
  }

  let buttonRefreshTimer = null;
  let categoryRetryCount = 0;
  function scheduleCategoryButton(resetRetries = false) {
    if (resetRetries) categoryRetryCount = 0;
    if (buttonRefreshTimer !== null) return;
    buttonRefreshTimer = window.setTimeout(() => {
      buttonRefreshTimer = null;
      void ensureCategoryButton().then((ready) => {
        if (!ready && categoryRetryCount < 12) {
          categoryRetryCount += 1;
          scheduleCategoryButton();
        }
      });
    }, 250);
  }

  let guideSyncTimer = null;
  let guideObserver = null;
  let lastGuideSyncAt = 0;
  const GUIDE_SYNC_INTERVAL = 10000;

  function scheduleGuideSync(initial = false) {
    if (guideSyncTimer !== null || (document.hidden && !initial)) return;
    const elapsed = Date.now() - lastGuideSyncAt;
    const delay = initial ? 250 : Math.max(1500, GUIDE_SYNC_INTERVAL - elapsed);
    guideSyncTimer = window.setTimeout(() => {
      guideSyncTimer = null;
      const run = () => {
        lastGuideSyncAt = Date.now();
        void syncYouTubeNewChannels();
      };
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(run, { timeout: 1500 });
      } else {
        run();
      }
    }, delay);
  }

  function observeYouTubeGuide() {
    guideObserver?.disconnect();
    guideObserver = null;
    const guide = document.querySelector("ytd-guide-renderer, #guide-content, tp-yt-app-drawer #contentContainer");
    if (!guide) return;
    guideObserver = new MutationObserver(() => scheduleGuideSync());
    guideObserver.observe(guide, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-label", "class", "hidden", "style", "title"]
    });
  }

  function refreshForNavigation() {
    scheduleCategoryButton(true);
    scheduleGuideSync(true);
    window.setTimeout(observeYouTubeGuide, 1000);
    window.setTimeout(observeChannelHeader, 1000);
  }

  let headerObserver = null;
  function observeChannelHeader() {
    headerObserver?.disconnect();
    headerObserver = null;
    const header = document.querySelector(
      "yt-page-header-renderer, yt-page-header-view-model, ytd-c4-tabbed-header-renderer, #channel-header-container"
    );
    if (!header) return;
    headerObserver = new MutationObserver(() => scheduleCategoryButton(true));
    headerObserver.observe(header, { childList: true, subtree: true });
  }

  document.addEventListener("yt-navigate-finish", refreshForNavigation);
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local" || !changes[YSO_STORAGE_KEY]) return;
    storedDataCache = normalizeStoredData(changes[YSO_STORAGE_KEY].newValue);
    void updateCategoryButton();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      scheduleCategoryButton(true);
      scheduleGuideSync(true);
    }
  });
  refreshForNavigation();
})();
