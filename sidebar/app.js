"use strict";

const STORAGE_KEY = "youtubeSubscriptionOrganizer";
const ALL = "__all__";
const WITH_NEW = "__with_new_videos__";
const UNCATEGORIZED = "__uncategorized__";

let data = { channels: [], categories: [], assignments: {}, recentVideos: {}, youtubeNewChannels: {} };
let presentation = data;
let filter = ALL;
let query = "";
let draggedCategoryId = null;
const avatarPromises = new Map();
const avatarQueue = [];
const pendingAvatarUpdates = new Map();
let activeAvatarJobs = 0;
let avatarSaveTimer = null;
let subscriptionScanTabId = null;
let subscriptionScanStartedHere = false;
let delegatedScan = false;
let scanSyncBaseline = null;
let scanBusy = false;

const elements = {
  count: document.querySelector("#result-count"),
  search: document.querySelector("#search"),
  filters: document.querySelector("#filters"),
  list: document.querySelector("#channel-list"),
  close: document.querySelector("#close-sidebar"),
  refresh: document.querySelector("#refresh-channels"),
  refreshStatus: document.querySelector("#refresh-status"),
  version: document.querySelector("#extension-version")
};

const extensionVersion = browser.runtime.getManifest?.().version;
elements.version.textContent = extensionVersion ? `نسخه ${extensionVersion}` : "";

function normalize(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    ...source,
    channels: Array.isArray(source.channels) ? source.channels : [],
    categories: Array.isArray(source.categories) ? source.categories : [],
    assignments: source.assignments && typeof source.assignments === "object" ? source.assignments : {},
    recentVideos: source.recentVideos && typeof source.recentVideos === "object" ? source.recentVideos : {},
    youtubeNewChannels: source.youtubeNewChannels && typeof source.youtubeNewChannels === "object"
      ? source.youtubeNewChannels
      : {}
  };
}

function hasYouTubeNewMarker(channel) {
  const directKeys = [channel.key];
  try {
    directKeys.push(new URL(channel.url).pathname.replace(/\/$/, "").toLocaleLowerCase());
  } catch {
    // Keep the stored key as the only identity.
  }
  if (directKeys.some((key) => key && presentation.youtubeNewChannels[key])) return true;

  const title = String(channel.title || "").trim().toLocaleLowerCase();
  if (!title) return false;
  return Object.values(presentation.youtubeNewChannels).some((status) =>
    String(status?.title || "").trim().toLocaleLowerCase() === title
  );
}

function hasNewVideo(channel) {
  return Boolean(presentation.recentVideos[channel.key]?.length) || hasYouTubeNewMarker(channel);
}

function assignmentIdsFor(channel) {
  const keys = new Set([
    channel.key,
    ...(Array.isArray(channel.aliases) ? channel.aliases : [])
  ].filter(Boolean).map((key) => String(key).replace(/\/$/, "").toLocaleLowerCase()));
  try {
    keys.add(new URL(channel.url).pathname.replace(/\/$/, "").toLocaleLowerCase());
  } catch {
    // The stored key and aliases still remain usable.
  }
  const ids = [];
  for (const [key, assigned] of Object.entries(presentation.assignments)) {
    if (!keys.has(String(key).replace(/\/$/, "").toLocaleLowerCase()) || !Array.isArray(assigned)) continue;
    ids.push(...assigned);
  }
  return [...new Set(ids)];
}

function faNumber(value) {
  return new Intl.NumberFormat("fa-IR").format(value);
}

function channelHandle(channel) {
  try {
    const part = new URL(channel.url).pathname.split("/").filter(Boolean)[0] || "";
    if (!part.startsWith("@")) return "";
    const title = String(channel.title || "").trim().replace(/^@/, "").toLocaleLowerCase();
    return title === part.slice(1).toLocaleLowerCase() ? "" : part;
  } catch {
    return "";
  }
}

function decodeYouTubeUrl(value) {
  return String(value || "")
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&");
}

function avatarFromChannelHtml(html) {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const meta = parsed.querySelector('meta[property="og:image"]')?.content ||
    parsed.querySelector('link[itemprop="thumbnailUrl"]')?.href || "";
  if (/^https?:\/\//i.test(meta)) return meta;
  const patterns = [
    /"avatar"\s*:\s*\{\s*"thumbnails"\s*:\s*\[\s*\{\s*"url"\s*:\s*"([^"]+)"/,
    /"channelThumbnail"\s*:\s*\{\s*"thumbnails"\s*:\s*\[\s*\{\s*"url"\s*:\s*"([^"]+)"/
  ];
  for (const pattern of patterns) {
    const candidate = decodeYouTubeUrl(html.match(pattern)?.[1]);
    if (/^https?:\/\//i.test(candidate)) return candidate;
  }
  return "";
}

function pumpAvatarQueue() {
  while (activeAvatarJobs < 4 && avatarQueue.length) {
    const job = avatarQueue.shift();
    activeAvatarJobs += 1;
    Promise.resolve()
      .then(job.task)
      .then(job.resolve, job.reject)
      .finally(() => {
        activeAvatarJobs -= 1;
        pumpAvatarQueue();
      });
  }
}

function enqueueAvatarTask(task) {
  return new Promise((resolve, reject) => {
    avatarQueue.push({ task, resolve, reject });
    pumpAvatarQueue();
  });
}

async function flushAvatarUpdates() {
  avatarSaveTimer = null;
  if (!pendingAvatarUpdates.size) return;
  const updates = new Map(pendingAvatarUpdates);
  pendingAvatarUpdates.clear();
  const stored = await browser.storage.local.get(STORAGE_KEY);
  const source = stored[STORAGE_KEY] && typeof stored[STORAGE_KEY] === "object" ? stored[STORAGE_KEY] : {};
  if (!Array.isArray(source.channels)) return;
  let changed = false;
  for (const channel of source.channels) {
    const avatar = updates.get(channel.key);
    if (avatar && channel.avatar !== avatar) {
      channel.avatar = avatar;
      changed = true;
    }
  }
  if (changed) await browser.storage.local.set({ [STORAGE_KEY]: source });
}

function rememberAvatar(channel, avatar) {
  channel.avatar = avatar;
  pendingAvatarUpdates.set(channel.key, avatar);
  if (avatarSaveTimer !== null) return;
  avatarSaveTimer = window.setTimeout(() => void flushAvatarUpdates(), 500);
}

async function findChannelAvatar(channel) {
  if (channel.avatar) return channel.avatar;
  if (typeof fetch !== "function") return "";
  try {
    const response = await fetch(channel.url, {
      cache: "force-cache",
      credentials: "include"
    });
    if (!response.ok) return "";
    const avatar = avatarFromChannelHtml(await response.text());
    if (avatar) rememberAvatar(channel, avatar);
    return avatar;
  } catch {
    return "";
  }
}

function resolvedAvatarFor(channel) {
  if (!avatarPromises.has(channel.key)) {
    avatarPromises.set(channel.key, enqueueAvatarTask(async () => {
      const source = await findChannelAvatar(channel);
      if (!source) return "";
      return globalThis.YSOAvatarCache?.resolve(source) || source;
    }));
  }
  return avatarPromises.get(channel.key);
}

function countFor(id) {
  if (id === ALL) return presentation.channels.length;
  if (id === WITH_NEW) return presentation.channels.filter(hasNewVideo).length;
  if (id === UNCATEGORIZED) return presentation.channels.filter((channel) => assignmentIdsFor(channel).length === 0).length;
  return presentation.channels.filter((channel) => assignmentIdsFor(channel).includes(id)).length;
}

function filteredChannels() {
  const text = query.trim().toLocaleLowerCase();
  return presentation.channels
    .filter((channel) => {
      const assignments = assignmentIdsFor(channel);
      const matchesFilter = filter === ALL ||
        (filter === WITH_NEW && hasNewVideo(channel)) ||
        (filter === UNCATEGORIZED && assignments.length === 0) ||
        assignments.includes(filter);
      const identity = `${channel.title || ""} ${channelHandle(channel)}`.toLocaleLowerCase();
      return matchesFilter && (!text || identity.includes(text));
    })
    .sort((left, right) => {
      const newDifference = Number(hasNewVideo(right)) - Number(hasNewVideo(left));
      return newDifference || String(left.title).localeCompare(String(right.title), "fa");
    });
}

async function reorderCategories(draggedId, targetId, placeAfter) {
  if (!draggedId || draggedId === targetId) return;
  const ordered = [...data.categories];
  const fromIndex = ordered.findIndex((category) => category.id === draggedId);
  if (fromIndex < 0) return;
  const [moved] = ordered.splice(fromIndex, 1);
  const targetIndex = ordered.findIndex((category) => category.id === targetId);
  if (targetIndex < 0) return;
  ordered.splice(targetIndex + (placeAfter ? 1 : 0), 0, moved);

  const stored = await browser.storage.local.get(STORAGE_KEY);
  const source = stored[STORAGE_KEY] && typeof stored[STORAGE_KEY] === "object"
    ? stored[STORAGE_KEY]
    : {};
  source.categories = ordered;
  await browser.storage.local.set({ [STORAGE_KEY]: source });
  data = normalize(source);
  render();
}

function clearDropTargets() {
  for (const button of elements.filters.querySelectorAll(".filter.drop-target")) {
    button.classList.remove("drop-target");
  }
}

function createFilter(id, label, color, reorderable = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `filter${filter === id ? " active" : ""}`;
  button.style.setProperty("--filter-color", color);
  button.dataset.filter = id;
  if (reorderable) {
    button.draggable = true;
    button.classList.add("reorderable");
    button.title = "برای تغییر ترتیب بکشید";
    button.addEventListener("dragstart", (event) => {
      draggedCategoryId = id;
      button.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", id);
    });
    button.addEventListener("dragover", (event) => {
      if (!draggedCategoryId || draggedCategoryId === id) return;
      event.preventDefault();
      clearDropTargets();
      button.classList.add("drop-target");
      event.dataTransfer.dropEffect = "move";
    });
    button.addEventListener("drop", (event) => {
      event.preventDefault();
      const rectangle = button.getBoundingClientRect();
      const placeAfter = event.clientX < rectangle.left + rectangle.width / 2;
      clearDropTargets();
      void reorderCategories(draggedCategoryId, id, placeAfter);
    });
    button.addEventListener("dragend", () => {
      draggedCategoryId = null;
      button.classList.remove("dragging");
      clearDropTargets();
    });
  }
  const name = document.createElement("span");
  name.textContent = label;
  const count = document.createElement("span");
  count.className = "filter-count";
  count.textContent = faNumber(countFor(id));
  button.append(name, count);
  button.addEventListener("click", () => {
    filter = id;
    render();
  });
  return button;
}

function createAvatar(channel) {
  const avatar = document.createElement("span");
  avatar.className = "avatar";
  avatar.textContent = String(channel.title || "؟").trim().charAt(0) || "؟";
  const image = document.createElement("img");
  image.alt = "";
  image.referrerPolicy = "no-referrer";
  image.addEventListener("error", () => image.remove(), { once: true });
  avatar.append(image);
  void resolvedAvatarFor(channel).then((url) => {
    if (url && image.isConnected) image.src = url;
    else if (!url) image.remove();
  });
  return avatar;
}

async function openInActiveTab(url) {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  if (/^https?:\/\/(?:www\.)?youtube\.com\//i.test(tab.url || "")) {
    try {
      const results = await browser.scripting.executeScript({
        target: { tabId: tab.id },
        world: "MAIN",
        args: [url],
        func: async (channelUrl) => {
          const target = new URL(channelUrl, location.origin);
          if (target.origin !== location.origin) return { navigated: false };
          const targetPath = target.pathname.replace(/\/$/, "");
          if (!targetPath) return { navigated: false };
          if (location.pathname.replace(/\/$/, "") === targetPath) return { navigated: true };

          function findBrowseEndpoint(value, depth = 0, visited = new WeakSet()) {
            if (!value || typeof value !== "object" || depth > 12 || visited.has(value)) return null;
            visited.add(value);
            const endpoint = value.navigationEndpoint || value.endpoint || value;
            const browse = endpoint?.browseEndpoint;
            const metadata = endpoint?.commandMetadata?.webCommandMetadata;
            if (browse?.browseId &&
                (browse.canonicalBaseUrl === targetPath || metadata?.url === targetPath)) {
              return endpoint;
            }
            for (const child of Object.values(value)) {
              const found = findBrowseEndpoint(child, depth + 1, visited);
              if (found) return found;
            }
            return null;
          }

          let endpoint = null;
          const nativeLink = [...document.querySelectorAll("a[href]")].find((link) => {
            try {
              const candidate = new URL(link.href, location.origin);
              return candidate.origin === location.origin &&
                candidate.pathname.replace(/\/$/, "") === targetPath;
            } catch {
              return false;
            }
          });
          for (let node = nativeLink; node && node !== document; node = node.parentElement) {
            endpoint = findBrowseEndpoint(node.data) ||
              findBrowseEndpoint(node.__data?.data) ||
              findBrowseEndpoint(node.__data);
            if (endpoint) break;
          }

          if (!endpoint) {
            const config = window.ytcfg;
            const apiKey = config?.get?.("INNERTUBE_API_KEY");
            const context = config?.get?.("INNERTUBE_CONTEXT");
            if (!apiKey || !context) return { navigated: false };
            const response = await fetch(
              `/youtubei/v1/navigation/resolve_url?key=${encodeURIComponent(apiKey)}&prettyPrint=false`,
              {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ context, url: target.href })
              }
            );
            if (!response.ok) return { navigated: false };
            const resolved = await response.json();
            endpoint = resolved.endpoint || resolved.command || null;
          }

          if (!endpoint?.browseEndpoint?.browseId) return { navigated: false };
          const webCommandMetadata = endpoint.commandMetadata?.webCommandMetadata || {};
          const navigationEndpoint = {
            ...endpoint,
            commandMetadata: {
              ...endpoint.commandMetadata,
              webCommandMetadata: {
                ...webCommandMetadata,
                url: targetPath,
                webPageType: "WEB_PAGE_TYPE_CHANNEL",
                apiUrl: "/youtubei/v1/browse",
                rootVe: webCommandMetadata.rootVe || 3611
              }
            },
            browseEndpoint: {
              ...endpoint.browseEndpoint,
              canonicalBaseUrl: endpoint.browseEndpoint.canonicalBaseUrl || targetPath
            }
          };
          const app = document.querySelector("ytd-app");
          if (!app) return { navigated: false };
          app.dispatchEvent(new CustomEvent("yt-navigate", {
            bubbles: true,
            composed: true,
            detail: { endpoint: navigationEndpoint }
          }));
          return { navigated: true };
        }
      });
      if (results?.some((entry) => entry.result?.navigated)) return;
    } catch {
      // Keep the active YouTube page in place if SPA navigation is unavailable.
    }
    return;
  }

  await browser.tabs.update(tab.id, { url });
}

function normalizedChannelIdentity(value) {
  try {
    return new URL(value, "https://www.youtube.com").pathname.replace(/\/$/, "").toLocaleLowerCase();
  } catch {
    return String(value || "").replace(/\/$/, "").toLocaleLowerCase();
  }
}

async function markChannelSeen(channel) {
  const identities = new Set([
    channel.key,
    channel.url,
    ...(Array.isArray(channel.aliases) ? channel.aliases : [])
  ].map(normalizedChannelIdentity).filter(Boolean));
  const title = String(channel.title || "").trim().toLocaleLowerCase();
  const recentVideos = Object.fromEntries(
    Object.entries(data.recentVideos).filter(([key]) => !identities.has(normalizedChannelIdentity(key)))
  );
  const youtubeNewChannels = Object.fromEntries(
    Object.entries(data.youtubeNewChannels).filter(([key, status]) => {
      if (identities.has(normalizedChannelIdentity(key))) return false;
      return !title || String(status?.title || "").trim().toLocaleLowerCase() !== title;
    })
  );
  if (Object.keys(recentVideos).length === Object.keys(data.recentVideos).length &&
      Object.keys(youtubeNewChannels).length === Object.keys(data.youtubeNewChannels).length) return;

  data = { ...data, recentVideos, youtubeNewChannels };
  await browser.storage.local.set({ [STORAGE_KEY]: data });
}

async function openChannel(channel) {
  try {
    await markChannelSeen(channel);
  } catch {
    // Opening the channel should still work if the local seen-state cannot be saved.
  }
  await openInActiveTab(channel.url);
}

function createChannel(channel) {
  const row = document.createElement("article");
  row.className = "channel";
  const link = document.createElement("a");
  link.className = "channel-link";
  link.href = channel.url;
  link.append(createAvatar(channel));
  link.addEventListener("click", (event) => {
    event.preventDefault();
    void openChannel(channel);
  });

  const identity = document.createElement("span");
  identity.className = "identity";
  const name = document.createElement("strong");
  name.textContent = channel.title || "کانال بدون نام";
  identity.append(name);
  const handle = channelHandle(channel);
  if (handle) {
    const small = document.createElement("small");
    small.textContent = handle;
    identity.append(small);
  }
  link.append(identity);
  row.append(link);

  const videos = presentation.recentVideos[channel.key] || [];
  if (videos.length || hasYouTubeNewMarker(channel)) {
    const dot = document.createElement("span");
    dot.className = "new-video-dot";
    dot.title = videos.length ? `${faNumber(videos.length)} ویدیوی جدید` : "ویدیوی جدید در YouTube";
    dot.setAttribute("aria-label", dot.title);
    row.append(dot);
  }
  return row;
}

function render() {
  // Reconciliation is deliberately presentation-only. Never write this view
  // back to storage: a heuristic match must not delete or rename user data.
  presentation = globalThis.YSOChannelData?.reconcile(data) || data;
  elements.filters.replaceChildren(
    createFilter(ALL, "همه", "#d9233f"),
    createFilter(WITH_NEW, "ویدئوی جدید", "#16a36a"),
    createFilter(UNCATEGORIZED, "بدون دسته", "#77717b"),
    ...presentation.categories.map((category) => createFilter(category.id, category.name, category.color, true))
  );
  const channels = filteredChannels();
  elements.count.textContent = `${faNumber(channels.length)} کانال`;
  if (channels.length) {
    elements.list.replaceChildren(...channels.map(createChannel));
  } else {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = presentation.channels.length ? "کانالی با این فیلتر پیدا نشد." : "ابتدا در داشبورد کامل، فهرست اشتراک‌ها را دریافت کنید.";
    elements.list.replaceChildren(empty);
  }
}

async function load() {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  data = normalize(stored[STORAGE_KEY]);
  render();
}

elements.search.addEventListener("input", () => {
  query = elements.search.value;
  render();
});
elements.filters.addEventListener("wheel", (event) => {
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
  event.preventDefault();
  elements.filters.scrollBy({ left: -event.deltaY, behavior: "auto" });
}, { passive: false });
elements.close.addEventListener("click", () => browser.sidebarAction.close());
function validScannedChannel(channel) {
  return Boolean(channel && typeof channel.key === "string" && typeof channel.title === "string" &&
    typeof channel.url === "string" && /^https:\/\/www\.youtube\.com\//.test(channel.url));
}

function pruneAssignments() {
  const channelKeys = new Set(data.channels.map((channel) => channel.key));
  const categoryIds = new Set(data.categories.map((category) => category.id));
  const clean = {};
  for (const [key, ids] of Object.entries(data.assignments)) {
    if (!channelKeys.has(key) || !Array.isArray(ids)) continue;
    const validIds = [...new Set(ids.filter((id) => categoryIds.has(id)))];
    if (validIds.length) clean[key] = validIds;
  }
  data.assignments = clean;
}

function pruneRecentVideos() {
  const channelKeys = new Set(data.channels.map((channel) => channel.key));
  data.recentVideos = Object.fromEntries(
    Object.entries(data.recentVideos).filter(([key, videos]) =>
      channelKeys.has(key) && Array.isArray(videos) && videos.length
    )
  );
}

function setScanBusy(busy, message = "") {
  scanBusy = busy;
  elements.refresh.disabled = busy;
  elements.refresh.textContent = busy ? "در حال رفرش…" : "رفرش کانال‌ها";
  elements.refreshStatus.textContent = message;
}

function waitForTabComplete(tabId, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      reject(new Error("بارگذاری صفحهٔ YouTube بیش از حد طول کشید."));
    }, timeout);
    function listener(updatedTabId, changeInfo) {
      if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
      window.clearTimeout(timer);
      browser.tabs.onUpdated.removeListener(listener);
      resolve();
    }
    browser.tabs.onUpdated.addListener(listener);
  });
}

async function findOrOpenSubscriptionsTab() {
  const tab = await browser.tabs.create({ url: "https://www.youtube.com/feed/channels", active: false });
  try {
    await waitForTabComplete(tab.id);
    return tab.id;
  } catch (error) {
    try {
      await browser.tabs.remove(tab.id);
    } catch {
      // The tab may already have been closed.
    }
    throw error;
  }
}

async function closeSubscriptionScanTab() {
  const tabId = subscriptionScanTabId;
  subscriptionScanTabId = null;
  if (tabId === null) return;
  try {
    await browser.tabs.remove(tabId);
  } catch {
    // The tab may already have been closed.
  }
}

async function startSubscriptionScan() {
  if (scanBusy) return;
  subscriptionScanStartedHere = false;
  delegatedScan = false;
  scanSyncBaseline = data.lastSync;
  setScanBusy(true, "در حال بازکردن فهرست اشتراک‌های YouTube…");
  try {
    const dashboardUrl = browser.runtime.getURL("dashboard/index.html");
    const dashboards = await browser.tabs.query({ url: dashboardUrl });
    if (dashboards.length) {
      delegatedScan = true;
      const response = await browser.runtime.sendMessage({ type: "start-subscription-scan-from-sidebar" });
      if (response?.reason === "already-running") {
        delegatedScan = false;
        setScanBusy(false, "اسکن کانال‌ها از قبل در حال اجراست؛ فهرست پس از ذخیره به‌روز می‌شود.");
        return;
      }
      if (!response?.started) throw new Error("داشبورد نتوانست اسکن کانال‌ها را شروع کند.");
      setScanBusy(true, "داشبورد در حال دریافت کانال‌هاست؛ تا پایان اسکن باز بماند.");
      return;
    }

    subscriptionScanTabId = await findOrOpenSubscriptionsTab();
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    let response;
    try {
      response = await browser.tabs.sendMessage(subscriptionScanTabId, { type: "start-subscription-scan" });
    } catch {
      const reloaded = waitForTabComplete(subscriptionScanTabId);
      await browser.tabs.reload(subscriptionScanTabId);
      await reloaded;
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      response = await browser.tabs.sendMessage(subscriptionScanTabId, { type: "start-subscription-scan" });
    }
    if (response?.reason === "already-running") {
      setScanBusy(false, "اسکن کانال‌ها از قبل در حال اجراست؛ فهرست پس از ذخیره به‌روز می‌شود.");
      await closeSubscriptionScanTab();
      return;
    }
    if (!response?.started) throw new Error("اسکنر در صفحهٔ YouTube شروع نشد.");
    subscriptionScanStartedHere = true;
    setScanBusy(true, "در حال خواندن کانال‌ها در پس‌زمینه…");
  } catch (error) {
    await closeSubscriptionScanTab();
    delegatedScan = false;
    setScanBusy(false, error instanceof Error ? error.message : String(error));
  }
}

async function handleSubscriptionScanMessage(message) {
  if (delegatedScan && message?.type?.startsWith("subscription-scan-")) {
    if (message.type === "subscription-scan-progress") {
      setScanBusy(true, `${faNumber(message.count || 0)} کانال پیدا شد؛ در حال پیمایش فهرست…`);
    } else if (message.type === "subscription-scan-error") {
      delegatedScan = false;
      setScanBusy(false, message.message || "دریافت فهرست ناموفق بود.");
    } else if (message.type === "subscription-scan-cancelled") {
      delegatedScan = false;
      setScanBusy(false, "رفرش کانال‌ها لغو شد.");
    } else if (message.type === "subscription-scan-complete") {
      setScanBusy(true, "اسکن تمام شد؛ در حال ذخیرهٔ فهرست…");
    }
    return;
  }
  if (!subscriptionScanStartedHere || !message?.type?.startsWith("subscription-scan-")) return;
  if (message.type === "subscription-scan-progress") {
    setScanBusy(true, `${faNumber(message.count || 0)} کانال پیدا شد؛ در حال پیمایش فهرست…`);
    return;
  }
  if (message.type === "subscription-scan-error") {
    subscriptionScanStartedHere = false;
    await closeSubscriptionScanTab();
    setScanBusy(false, message.message || "دریافت فهرست ناموفق بود.");
    return;
  }
  if (message.type === "subscription-scan-cancelled") {
    subscriptionScanStartedHere = false;
    await closeSubscriptionScanTab();
    setScanBusy(false, "رفرش کانال‌ها لغو شد.");
    return;
  }
  if (message.type !== "subscription-scan-complete") return;

  try {
    // Reload the latest snapshot so category edits made while scanning are retained.
    const stored = await browser.storage.local.get(STORAGE_KEY);
    data = normalize(stored[STORAGE_KEY]);
    const channels = Array.isArray(message.channels) ? message.channels.filter(validScannedChannel) : [];
    const previousChannels = data.channels;
    if (data.lastSync && previousChannels.length >= 10 && channels.length < previousChannels.length * 0.6) {
      setScanBusy(false, `اسکن ناقص بود (${faNumber(channels.length)} از ${faNumber(previousChannels.length)} کانال)؛ فهرست قبلی حفظ شد.`);
      return;
    }
    const scannedAt = message.scannedAt || new Date().toISOString();
    const removed = data.lastSync
      ? previousChannels.filter((oldChannel) => !channels.some((channel) =>
        globalThis.YSOChannelData?.sameChannel(oldChannel, channel) || oldChannel.key === channel.key
      )).map((channel) => ({ ...channel, detectedAt: scannedAt }))
      : [];
    data = normalize(globalThis.YSOChannelData?.replaceChannels(data, channels) || { ...data, channels });
    data.lastSync = scannedAt;
    if (removed.length) data.removedChannels = [...removed, ...data.removedChannels].slice(0, 1000);
    pruneAssignments();
    pruneRecentVideos();
    await browser.storage.local.set({ [STORAGE_KEY]: data });
    setScanBusy(false, removed.length
      ? `${faNumber(channels.length)} کانال دریافت شد و حذف ${faNumber(removed.length)} کانال ثبت شد.`
      : `${faNumber(channels.length)} کانال با موفقیت رفرش شد.`);
    if (removed.length) {
      const names = removed.slice(0, 3).map((channel) => channel.title).join("، ");
      const extra = removed.length > 3 ? ` و ${faNumber(removed.length - 3)} کانال دیگر` : "";
      try {
        await browser.notifications.create(`removed-channels-${Date.now()}`, {
          type: "basic",
          iconUrl: browser.runtime.getURL("icons/icon.svg"),
          title: removed.length === 1 ? "یک اشتراک حذف شده است" : `${faNumber(removed.length)} اشتراک حذف شده‌اند`,
          message: `${names}${extra}`
        });
      } catch {
        // Keep the removal notice in the sidebar if system notifications are unavailable.
      }
    }
  } catch (error) {
    setScanBusy(false, error instanceof Error ? error.message : "ذخیرهٔ فهرست ناموفق بود.");
  } finally {
    subscriptionScanStartedHere = false;
    await closeSubscriptionScanTab();
  }
}

elements.refresh.addEventListener("click", () => void startSubscriptionScan());
browser.runtime.onMessage.addListener((message) => {
  void handleSubscriptionScanMessage(message);
});
browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[STORAGE_KEY]) return;
  data = normalize(changes[STORAGE_KEY].newValue);
  render();
  if (delegatedScan && data.lastSync && data.lastSync !== scanSyncBaseline) {
    delegatedScan = false;
    setScanBusy(false, `${faNumber(data.channels.length)} کانال با موفقیت رفرش شد.`);
  }
});

void load();

