"use strict";

const STORAGE_KEY = "youtubeSubscriptionOrganizer";
const UNCATEGORIZED = "__uncategorized__";
const ALL = "__all__";
const WITH_NEW_VIDEOS = "__with_new_videos__";
const REMOVED_CHANNELS = "__removed_channels__";

const initialState = {
  version: 3,
  channels: [],
  categories: [],
  assignments: {},
  lastSync: null,
  recentVideos: {},
  youtubeNewChannels: {},
  knownVideoIds: [],
  lastVideoCheck: null,
  removedChannels: []
};

const state = {
  data: structuredClone(initialState),
  filter: ALL,
  query: "",
  sort: "title-asc",
  scanning: false,
  scanTabId: null,
  videoScanning: false,
  videoScanTabId: null
};

const avatarRepairFailed = new Set();
let avatarRepairTimer = null;

const elements = {
  categoryList: document.querySelector("#category-list"),
  categoryForm: document.querySelector("#category-form"),
  categoryName: document.querySelector("#category-name"),
  categoryColor: document.querySelector("#category-color"),
  syncButton: document.querySelector("#sync-button"),
  videoSyncButton: document.querySelector("#video-sync-button"),
  emptySyncButton: document.querySelector("#empty-sync-button"),
  cancelScan: document.querySelector("#cancel-scan"),
  scanPanel: document.querySelector("#scan-panel"),
  scanTitle: document.querySelector("#scan-title"),
  scanDetail: document.querySelector("#scan-detail"),
  syncMeta: document.querySelector("#sync-meta"),
  totalCount: document.querySelector("#total-count"),
  categorizedCount: document.querySelector("#categorized-count"),
  uncategorizedCount: document.querySelector("#uncategorized-count"),
  newVideoChannelCount: document.querySelector("#new-video-channel-count"),
  searchInput: document.querySelector("#search-input"),
  sortSelect: document.querySelector("#sort-select"),
  emptyState: document.querySelector("#empty-state"),
  channelGrid: document.querySelector("#channel-grid"),
  notice: document.querySelector("#notice"),
  exportData: document.querySelector("#export-data"),
  importData: document.querySelector("#import-data"),
  clearAllNew: document.querySelector("#clear-all-new")
};

function faNumber(value) {
  return new Intl.NumberFormat("fa-IR").format(value);
}

function normalizeData(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    version: 3,
    channels: Array.isArray(source.channels) ? source.channels.filter(isValidChannel) : [],
    categories: Array.isArray(source.categories) ? source.categories.filter(isValidCategory) : [],
    assignments: source.assignments && typeof source.assignments === "object" ? source.assignments : {},
    lastSync: typeof source.lastSync === "string" ? source.lastSync : null,
    recentVideos: source.recentVideos && typeof source.recentVideos === "object" ? source.recentVideos : {},
    youtubeNewChannels: source.youtubeNewChannels && typeof source.youtubeNewChannels === "object"
      ? source.youtubeNewChannels
      : {},
    knownVideoIds: Array.isArray(source.knownVideoIds) ? source.knownVideoIds.filter((id) => typeof id === "string") : [],
    lastVideoCheck: typeof source.lastVideoCheck === "string" ? source.lastVideoCheck : null,
    removedChannels: Array.isArray(source.removedChannels)
      ? source.removedChannels.filter((channel) => isValidChannel(channel) && typeof channel.detectedAt === "string")
      : []
  };
}

function isValidChannel(channel) {
  return Boolean(
    channel &&
    typeof channel.key === "string" &&
    typeof channel.title === "string" &&
    typeof channel.url === "string" &&
    /^https:\/\/www\.youtube\.com\//.test(channel.url)
  );
}

function isValidCategory(category) {
  return Boolean(
    category &&
    typeof category.id === "string" &&
    typeof category.name === "string" &&
    /^#[0-9a-f]{6}$/i.test(category.color)
  );
}

async function loadData() {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  const normalized = normalizeData(stored[STORAGE_KEY]);
  state.data = normalizeData(globalThis.YSOChannelData?.reconcile(normalized) || normalized);
  state.data.removedChannels = state.data.removedChannels.slice(0, 1000);
  if (JSON.stringify(state.data) !== JSON.stringify(normalized)) await saveData();
  render();
  void repairMissingAvatars();
}

async function saveData() {
  await browser.storage.local.set({ [STORAGE_KEY]: state.data });
}

function pruneAssignments() {
  const categoryIds = new Set(state.data.categories.map((category) => category.id));
  const channelKeys = new Set(state.data.channels.map((channel) => channel.key));
  const clean = {};

  for (const [key, ids] of Object.entries(state.data.assignments)) {
    if (!channelKeys.has(key) || !Array.isArray(ids)) continue;
    const validIds = [...new Set(ids.filter((id) => categoryIds.has(id)))];
    if (validIds.length > 0) clean[key] = validIds;
  }
  state.data.assignments = clean;
}

function isValidVideo(video) {
  return Boolean(
    video &&
    typeof video.videoId === "string" &&
    typeof video.title === "string" &&
    typeof video.url === "string" &&
    typeof video.channelKey === "string" &&
    typeof video.channelUrl === "string" &&
    /^https:\/\/www\.youtube\.com\/watch\?v=/.test(video.url)
  );
}

function pruneRecentVideos() {
  const channelKeys = new Set(state.data.channels.map((channel) => channel.key));
  const clean = {};
  for (const [key, videos] of Object.entries(state.data.recentVideos)) {
    if (!channelKeys.has(key) || !Array.isArray(videos)) continue;
    const unique = [];
    const ids = new Set();
    for (const video of videos) {
      if (!isValidVideo(video) || ids.has(video.videoId)) continue;
      ids.add(video.videoId);
      unique.push(video);
    }
    if (unique.length) clean[key] = unique.slice(0, 12);
  }
  state.data.recentVideos = clean;
  state.data.knownVideoIds = [...new Set(state.data.knownVideoIds)].slice(-5000);
}

function categoryCount(categoryId) {
  if (categoryId === ALL) return state.data.channels.length;
  if (categoryId === WITH_NEW_VIDEOS) return Object.keys(state.data.recentVideos).length;
  if (categoryId === REMOVED_CHANNELS) return state.data.removedChannels.length;
  if (categoryId === UNCATEGORIZED) {
    return state.data.channels.filter((channel) => !(state.data.assignments[channel.key]?.length)).length;
  }
  return state.data.channels.filter((channel) => state.data.assignments[channel.key]?.includes(categoryId)).length;
}

function createCategoryRow(id, name, color, editable = false) {
  const row = document.createElement("div");
  row.className = "category-row";

  const button = document.createElement("button");
  button.type = "button";
  button.className = `category-filter${state.filter === id ? " active" : ""}`;
  button.dataset.filter = id;

  const dot = document.createElement("span");
  dot.className = "category-dot";
  dot.style.color = color;

  const label = document.createElement("span");
  label.textContent = name;

  const count = document.createElement("span");
  count.className = "count";
  count.textContent = faNumber(categoryCount(id));

  button.append(dot, label, count);
  button.addEventListener("click", () => {
    state.filter = id;
    render();
  });
  row.append(button);

  if (editable) {
    const menu = document.createElement("button");
    menu.type = "button";
    menu.className = "category-menu-button";
    menu.textContent = "•••";
    menu.title = "ویرایش یا حذف دسته";
    menu.addEventListener("click", () => editCategory(id));
    row.append(menu);
  }

  return row;
}

function renderCategories() {
  elements.categoryList.replaceChildren(
    createCategoryRow(ALL, "همهٔ کانال‌ها", "#d9233f"),
    createCategoryRow(WITH_NEW_VIDEOS, "ویدئوی جدید", "#18a05e"),
    createCategoryRow(REMOVED_CHANNELS, "حذف‌شده‌ها", "#f08a24"),
    createCategoryRow(UNCATEGORIZED, "بدون دسته", "#8d8693"),
    ...state.data.categories.map((category) =>
      createCategoryRow(category.id, category.name, category.color, true)
    )
  );
}

function getFilteredChannels() {
  const query = state.query.trim().toLocaleLowerCase("fa");
  let channels = state.data.channels.filter((channel) => {
    const assignments = state.data.assignments[channel.key] || [];
    const matchesFilter =
      state.filter === ALL ||
      (state.filter === WITH_NEW_VIDEOS && Boolean(state.data.recentVideos[channel.key]?.length)) ||
      (state.filter === UNCATEGORIZED ? assignments.length === 0 : assignments.includes(state.filter));
    const matchesQuery = !query || channel.title.toLocaleLowerCase("fa").includes(query);
    return matchesFilter && matchesQuery;
  });

  const collator = new Intl.Collator("fa", { sensitivity: "base", numeric: true });
  channels = [...channels].sort((left, right) => {
    if (state.sort === "title-desc") return collator.compare(right.title, left.title);
    if (state.sort === "category") {
      const difference = (state.data.assignments[right.key]?.length || 0) - (state.data.assignments[left.key]?.length || 0);
      return difference || collator.compare(left.title, right.title);
    }
    return collator.compare(left.title, right.title);
  });
  return channels;
}

function channelHandle(channel) {
  try {
    const parts = new URL(channel.url).pathname.split("/").filter(Boolean);
    let identity = "";
    if (parts[0]?.startsWith("@")) identity = decodeURIComponent(parts[0]);
    else if (channel.channelId) identity = channel.channelId;
    else if (parts.length > 1) identity = decodeURIComponent(parts.at(-1));

    const normalize = (value) => value
      .replace(/^@/, "")
      .replace(/[\s_.-]+/g, "")
      .toLocaleLowerCase("fa");
    return normalize(identity) === normalize(channel.title) ? "" : identity;
  } catch {
    return "";
  }
}

function decodeYouTubeUrl(value) {
  if (!value) return "";
  return value
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&");
}

function avatarFromChannelHtml(html) {
  const documentFromHtml = new DOMParser().parseFromString(html, "text/html");
  const metaAvatar =
    documentFromHtml.querySelector('meta[property="og:image"]')?.content ||
    documentFromHtml.querySelector('link[itemprop="thumbnailUrl"]')?.href ||
    "";
  if (/^https?:\/\//i.test(metaAvatar)) return metaAvatar;

  const patterns = [
    /"avatar"\s*:\s*\{\s*"thumbnails"\s*:\s*\[\s*\{\s*"url"\s*:\s*"([^"]+)"/,
    /"channelThumbnail"\s*:\s*\{\s*"thumbnails"\s*:\s*\[\s*\{\s*"url"\s*:\s*"([^"]+)"/
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    const candidate = decodeYouTubeUrl(match?.[1]);
    if (/^https?:\/\//i.test(candidate)) return candidate;
  }
  return "";
}

async function fetchChannelAvatar(url) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      credentials: "include",
      signal: controller.signal
    });
    if (!response.ok) return "";
    return avatarFromChannelHtml(await response.text());
  } catch {
    return "";
  } finally {
    window.clearTimeout(timer);
  }
}

async function repairMissingAvatars() {
  const queue = state.data.channels.filter((channel) => !channel.avatar);
  if (queue.length === 0) return;
  let cursor = 0;
  let changed = false;

  async function worker() {
    while (cursor < queue.length) {
      const channel = queue[cursor];
      cursor += 1;
      if (avatarRepairFailed.has(channel.key)) continue;
      const avatar = await fetchChannelAvatar(channel.url);
      if (avatar) {
        const current = state.data.channels.find((item) => item.key === channel.key);
        if (current) {
          current.avatar = avatar;
          changed = true;
        }
      } else {
        avatarRepairFailed.add(channel.key);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
  await saveData();
  if (changed) renderChannels();
}

function scheduleAvatarRepairs() {
  if (avatarRepairTimer !== null) return;
  avatarRepairTimer = window.setTimeout(() => {
    avatarRepairTimer = null;
    void repairMissingAvatars();
  }, 300);
}

function loadCachedAvatar(image, source, onError) {
  image.alt = "";
  image.referrerPolicy = "no-referrer";
  image.loading = "lazy";
  image.decoding = "async";
  image.addEventListener("error", onError, { once: true });
  const resolved = globalThis.YSOAvatarCache?.resolve(source) || Promise.resolve(source);
  void resolved.then((url) => {
    if (url && image.isConnected) image.src = url;
    else if (!url) onError();
  });
}

function createChannelCard(channel) {
  const card = document.createElement("article");
  card.className = "channel-card";

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = channel.title.trim().charAt(0) || "؟";
  if (channel.avatar) {
    const image = document.createElement("img");
    loadCachedAvatar(image, channel.avatar, () => {
      image.remove();
      channel.avatar = "";
      avatarRepairFailed.delete(channel.key);
      scheduleAvatarRepairs();
    });
    avatar.append(image);
  }

  const body = document.createElement("div");
  body.className = "channel-body";
  const link = document.createElement("a");
  link.className = "channel-link";
  link.href = channel.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = channel.title;
  link.title = channel.title;

  body.append(link);
  const identity = channelHandle(channel);
  if (identity) {
    const handle = document.createElement("span");
    handle.className = "channel-handle";
    handle.textContent = identity;
    body.append(handle);
  }

  const chips = document.createElement("div");
  chips.className = "chips";
  const assigned = new Set(state.data.assignments[channel.key] || []);

  if (state.data.categories.length === 0) {
    const message = document.createElement("span");
    message.className = "no-category";
    message.textContent = "ابتدا یک دسته بسازید";
    chips.append(message);
  } else {
    for (const category of state.data.categories) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `chip${assigned.has(category.id) ? " selected" : ""}`;
      chip.style.setProperty("--chip-color", category.color);
      chip.textContent = category.name;
      chip.setAttribute("aria-pressed", String(assigned.has(category.id)));
      chip.addEventListener("click", () => toggleAssignment(channel.key, category.id));
      chips.append(chip);
    }
  }

  card.append(avatar, body, chips);

  const newVideos = state.data.recentVideos[channel.key] || [];
  if (newVideos.length > 0) {
    const panel = document.createElement("section");
    panel.className = "new-videos-panel";
    const header = document.createElement("div");
    header.className = "new-videos-header";
    const count = document.createElement("strong");
    count.textContent = `${faNumber(newVideos.length)} ویدیوی جدید`;
    const seenButton = document.createElement("button");
    seenButton.type = "button";
    seenButton.className = "mark-seen-button";
    seenButton.textContent = "همه دیده شدند";
    seenButton.addEventListener("click", () => markChannelVideosSeen(channel.key));
    header.append(count, seenButton);

    const list = document.createElement("div");
    list.className = "new-video-items";
    for (const video of newVideos.slice(0, 3)) {
      const videoLink = document.createElement("a");
      videoLink.className = "new-video-item";
      videoLink.href = video.url;
      videoLink.target = "_blank";
      videoLink.rel = "noopener noreferrer";

      const thumbnail = document.createElement("div");
      thumbnail.className = "new-video-thumbnail";
      if (video.thumbnail) {
        const image = document.createElement("img");
        image.src = video.thumbnail;
        image.alt = "";
        image.loading = "lazy";
        image.referrerPolicy = "no-referrer";
        image.addEventListener("error", () => image.remove(), { once: true });
        thumbnail.append(image);
      }

      const text = document.createElement("span");
      text.className = "new-video-text";
      const title = document.createElement("strong");
      title.textContent = video.title;
      title.title = video.title;
      text.append(title);
      if (video.publishedText) {
        const published = document.createElement("small");
        published.textContent = video.publishedText;
        text.append(published);
      }
      videoLink.append(thumbnail, text);
      list.append(videoLink);
    }

    if (newVideos.length > 3) {
      const more = document.createElement("small");
      more.className = "new-video-more";
      more.textContent = `${faNumber(newVideos.length - 3)} ویدیوی دیگر`;
      list.append(more);
    }
    panel.append(header, list);
    card.append(panel);
  }

  return card;
}

function createRemovedChannelCard(channel) {
  const card = document.createElement("article");
  card.className = "channel-card removed-card";

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = channel.title.trim().charAt(0) || "؟";
  if (channel.avatar) {
    const image = document.createElement("img");
    loadCachedAvatar(image, channel.avatar, () => image.remove());
    avatar.append(image);
  }

  const body = document.createElement("div");
  body.className = "channel-body";
  const link = document.createElement("a");
  link.className = "channel-link";
  link.href = channel.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = channel.title;

  const detected = new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(channel.detectedAt));
  const info = document.createElement("span");
  info.className = "removed-info";
  info.textContent = `حذف از اشتراک‌ها: ${detected}`;
  body.append(link, info);
  card.append(avatar, body);
  return card;
}

function renderChannels() {
  if (state.filter === REMOVED_CHANNELS) {
    const query = state.query.trim().toLocaleLowerCase("fa");
    const removed = state.data.removedChannels
      .filter((channel) => !query || channel.title.toLocaleLowerCase("fa").includes(query))
      .sort((left, right) => new Date(right.detectedAt) - new Date(left.detectedAt));
    elements.emptyState.hidden = true;
    if (removed.length === 0) {
      const message = document.createElement("p");
      message.className = "no-results";
      message.textContent = "هنوز کانال حذف‌شده‌ای ثبت نشده است.";
      elements.channelGrid.replaceChildren(message);
    } else {
      elements.channelGrid.replaceChildren(...removed.map(createRemovedChannelCard));
    }
    return;
  }

  const channels = getFilteredChannels();
  elements.emptyState.hidden = state.data.channels.length > 0;

  if (state.data.channels.length === 0) {
    elements.channelGrid.replaceChildren();
    return;
  }

  if (channels.length === 0) {
    const message = document.createElement("p");
    message.className = "no-results";
    message.textContent = "کانالی با این فیلتر پیدا نشد.";
    elements.channelGrid.replaceChildren(message);
    return;
  }

  elements.channelGrid.replaceChildren(...channels.map(createChannelCard));
}

function renderStats() {
  const categorized = state.data.channels.filter((channel) => state.data.assignments[channel.key]?.length).length;
  elements.totalCount.textContent = faNumber(state.data.channels.length);
  elements.categorizedCount.textContent = faNumber(categorized);
  elements.uncategorizedCount.textContent = faNumber(state.data.channels.length - categorized);
  const channelsWithNew = Object.keys(state.data.recentVideos).length;
  elements.newVideoChannelCount.textContent = faNumber(channelsWithNew);
  elements.clearAllNew.hidden = channelsWithNew === 0;

  const formatter = new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "medium",
      timeStyle: "short"
  });
  const meta = [];
  if (state.data.lastSync) meta.push(`دریافت کانال‌ها: ${formatter.format(new Date(state.data.lastSync))}`);
  if (state.data.lastVideoCheck) meta.push(`بررسی ویدئوها: ${formatter.format(new Date(state.data.lastVideoCheck))}`);
  if (meta.length > 0) {
    elements.syncMeta.textContent = meta.join(" • ");
  } else {
    elements.syncMeta.textContent = "هنوز اطلاعاتی از یوتیوب دریافت نشده است.";
  }
}

function render() {
  renderCategories();
  renderStats();
  renderChannels();
}

async function toggleAssignment(channelKey, categoryId) {
  const assigned = new Set(state.data.assignments[channelKey] || []);
  if (assigned.has(categoryId)) assigned.delete(categoryId);
  else assigned.add(categoryId);

  if (assigned.size > 0) state.data.assignments[channelKey] = [...assigned];
  else delete state.data.assignments[channelKey];

  await saveData();
  render();
}

async function markChannelVideosSeen(channelKey) {
  delete state.data.recentVideos[channelKey];
  await saveData();
  render();
}

async function markAllVideosSeen() {
  state.data.recentVideos = {};
  await saveData();
  if (state.filter === WITH_NEW_VIDEOS) state.filter = ALL;
  render();
  showNotice("همهٔ ویدئوهای جدید به‌عنوان دیده‌شده علامت خوردند.");
}

async function editCategory(categoryId) {
  const category = state.data.categories.find((item) => item.id === categoryId);
  if (!category) return;

  const action = window.prompt(
    `برای تغییر نام، نام جدید را بنویسید. برای حذف کامل دسته، عبارت «حذف» را وارد کنید.\n\nنام فعلی: ${category.name}`,
    category.name
  );
  if (action === null) return;

  const value = action.trim();
  if (value === "حذف") {
    state.data.categories = state.data.categories.filter((item) => item.id !== categoryId);
    for (const [key, ids] of Object.entries(state.data.assignments)) {
      const remaining = ids.filter((id) => id !== categoryId);
      if (remaining.length) state.data.assignments[key] = remaining;
      else delete state.data.assignments[key];
    }
    if (state.filter === categoryId) state.filter = ALL;
  } else if (value) {
    category.name = value.slice(0, 32);
  }

  await saveData();
  render();
}

function showNotice(message, isError = false) {
  elements.notice.textContent = message;
  elements.notice.className = `notice${isError ? " error" : ""}`;
  elements.notice.hidden = false;
  window.setTimeout(() => {
    if (elements.notice.textContent === message) elements.notice.hidden = true;
  }, 7000);
}

async function notifyRemovedChannels(channels) {
  if (channels.length === 0) return;
  const firstNames = channels.slice(0, 3).map((channel) => channel.title).join("، ");
  const extra = channels.length > 3 ? ` و ${faNumber(channels.length - 3)} کانال دیگر` : "";
  try {
    await browser.notifications.create(`removed-channels-${Date.now()}`, {
      type: "basic",
      iconUrl: browser.runtime.getURL("icons/icon.svg"),
      title: channels.length === 1 ? "یک اشتراک حذف شده است" : `${faNumber(channels.length)} اشتراک حذف شده‌اند`,
      message: `${firstNames}${extra}`
    });
  } catch {
    // The in-dashboard warning remains available if system notifications are disabled.
  }
}

function setScanning(scanning) {
  state.scanning = scanning;
  const busy = state.scanning || state.videoScanning;
  elements.scanPanel.hidden = !busy;
  elements.syncButton.disabled = busy;
  elements.videoSyncButton.disabled = busy;
  elements.emptySyncButton.disabled = busy;
}

function setVideoScanning(scanning) {
  state.videoScanning = scanning;
  const busy = state.scanning || state.videoScanning;
  elements.scanPanel.hidden = !busy;
  elements.syncButton.disabled = busy;
  elements.videoSyncButton.disabled = busy;
  elements.emptySyncButton.disabled = busy;
}

function waitForTabComplete(tabId, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      reject(new Error("بارگذاری صفحهٔ YouTube بیش از حد طول کشید."));
    }, timeout);

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        window.clearTimeout(timer);
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    browser.tabs.onUpdated.addListener(listener);
  });
}

async function findOrOpenSubscriptionsTab() {
  const tabs = await browser.tabs.query({ url: "*://www.youtube.com/feed/channels*" });
  if (tabs.length > 0) {
    const tab = tabs[0];
    await browser.tabs.update(tab.id, { active: true });
    if (tab.windowId) await browser.windows.update(tab.windowId, { focused: true });
    const reloaded = waitForTabComplete(tab.id);
    await browser.tabs.reload(tab.id);
    await reloaded;
    return tab.id;
  }

  const tab = await browser.tabs.create({
    url: "https://www.youtube.com/feed/channels",
    active: true
  });
  await waitForTabComplete(tab.id);
  return tab.id;
}

async function findOrOpenVideoFeedTab() {
  const tabs = await browser.tabs.query({ url: "*://www.youtube.com/feed/subscriptions*" });
  if (tabs.length > 0) {
    const tab = tabs[0];
    await browser.tabs.update(tab.id, { active: true });
    if (tab.windowId) await browser.windows.update(tab.windowId, { focused: true });
    return tab.id;
  }

  const tab = await browser.tabs.create({
    url: "https://www.youtube.com/feed/subscriptions",
    active: true
  });
  await waitForTabComplete(tab.id);
  return tab.id;
}

async function startScan() {
  if (state.scanning || state.videoScanning) return;
  setScanning(true);
  elements.scanTitle.textContent = "در حال بازکردن فهرست اشتراک‌ها…";
  elements.scanDetail.textContent = "تب YouTube را تا پایان دریافت باز نگه دارید.";

  try {
    const tabId = await findOrOpenSubscriptionsTab();
    state.scanTabId = tabId;
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    let response;
    try {
      response = await browser.tabs.sendMessage(tabId, { type: "start-subscription-scan" });
    } catch {
      // A tab that was already open before this add-on was loaded may not have
      // the declared content script yet. Reloading injects it normally.
      const reloaded = waitForTabComplete(tabId);
      await browser.tabs.reload(tabId);
      await reloaded;
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      response = await browser.tabs.sendMessage(tabId, { type: "start-subscription-scan" });
    }
    if (!response?.started && response?.reason !== "already-running") {
      throw new Error("اسکنر در صفحهٔ YouTube شروع نشد.");
    }
    elements.scanTitle.textContent = "در حال خواندن کانال‌ها…";
  } catch (error) {
    setScanning(false);
    state.scanTabId = null;
    showNotice(error instanceof Error ? error.message : String(error), true);
  }
}

async function startVideoScan() {
  if (state.scanning || state.videoScanning) return;
  setVideoScanning(true);
  elements.scanTitle.textContent = "در حال بازکردن فید اشتراک‌ها…";
  elements.scanDetail.textContent = "جدیدترین ویدئوهای کانال‌های دنبال‌شده بررسی می‌شوند.";

  try {
    const tabId = await findOrOpenVideoFeedTab();
    state.videoScanTabId = tabId;
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    let response;
    try {
      response = await browser.tabs.sendMessage(tabId, { type: "start-video-scan" });
    } catch {
      const reloaded = waitForTabComplete(tabId);
      await browser.tabs.reload(tabId);
      await reloaded;
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      response = await browser.tabs.sendMessage(tabId, { type: "start-video-scan" });
    }
    if (!response?.started && response?.reason !== "already-running") {
      throw new Error("بررسی ویدئوهای جدید شروع نشد.");
    }
    elements.scanTitle.textContent = "در حال بررسی ویدئوها…";
  } catch (error) {
    setVideoScanning(false);
    state.videoScanTabId = null;
    showNotice(error instanceof Error ? error.message : String(error), true);
  }
}

async function cancelScan() {
  if (state.scanTabId) {
    try {
      await browser.tabs.sendMessage(state.scanTabId, { type: "cancel-subscription-scan" });
    } catch {
      // The YouTube tab may already be closed.
    }
  }
  if (state.videoScanTabId) {
    try {
      await browser.tabs.sendMessage(state.videoScanTabId, { type: "cancel-video-scan" });
    } catch {
      // The YouTube tab may already be closed.
    }
  }
  setScanning(false);
  setVideoScanning(false);
  state.scanTabId = null;
  state.videoScanTabId = null;
}

async function onScannerMessage(message) {
  if (!message?.type) return;

  if (message.type === "video-scan-progress") {
    setVideoScanning(true);
    elements.scanTitle.textContent = `${faNumber(message.count)} ویدئو بررسی شد`;
    elements.scanDetail.textContent = "در حال مقایسه با بررسی قبلی…";
  }

  if (message.type === "video-scan-complete") {
    const videos = Array.isArray(message.videos) ? message.videos.filter(isValidVideo) : [];
    const known = new Set(state.data.knownVideoIds);
    const discovered = videos.filter((video) => !known.has(video.videoId));
    const accepted = [];

    for (const video of discovered) {
      const candidate = {
        key: video.channelKey,
        title: video.channelTitle || "",
        url: video.channelUrl,
        avatar: ""
      };
      const channel = state.data.channels.find((item) =>
        item.key === video.channelKey || globalThis.YSOChannelData?.sameChannel(item, candidate)
      );
      // The subscriptions feed may still contain stale videos.  It must never
      // create or restore a channel that is absent from the verified list.
      if (!channel) continue;
      const mappedVideo = {
        ...video,
        channelKey: channel.key,
        channelUrl: channel.url,
        channelTitle: channel.title
      };
      accepted.push(mappedVideo);
      const previous = state.data.recentVideos[channel.key] || [];
      state.data.recentVideos[channel.key] = [
        mappedVideo,
        ...previous.filter((item) => item.videoId !== video.videoId)
      ].slice(0, 12);
    }

    state.data.knownVideoIds = [
      ...state.data.knownVideoIds,
      ...videos.map((video) => video.videoId)
    ].slice(-5000);
    state.data = normalizeData(globalThis.YSOChannelData?.reconcile(state.data) || state.data);
    state.data.lastVideoCheck = message.checkedAt || new Date().toISOString();
    pruneRecentVideos();
    await saveData();
    setVideoScanning(false);
    state.videoScanTabId = null;
    render();
    const newChannelCount = new Set(accepted.map((video) => video.channelKey)).size;
    showNotice(
      accepted.length > 0
        ? `${faNumber(accepted.length)} ویدئوی جدید از ${faNumber(newChannelCount)} کانال پیدا شد.`
        : "ویدئوی جدیدی نسبت به بررسی قبلی پیدا نشد."
    );
  }

  if (message.type === "video-scan-error") {
    setVideoScanning(false);
    state.videoScanTabId = null;
    showNotice(message.message || "بررسی ویدئوها ناموفق بود.", true);
  }

  if (message.type === "video-scan-cancelled") {
    setVideoScanning(false);
    state.videoScanTabId = null;
    showNotice("بررسی ویدئوهای جدید لغو شد.");
  }

  if (!message.type.startsWith("subscription-scan-")) return;

  if (message.type === "subscription-scan-progress") {
    setScanning(true);
    elements.scanTitle.textContent = `${faNumber(message.count)} کانال پیدا شد`;
    elements.scanDetail.textContent = "در حال رفتن به انتهای فهرست؛ لطفاً تب YouTube را نبندید.";
  }

  if (message.type === "subscription-scan-complete") {
    const channels = Array.isArray(message.channels) ? message.channels.filter(isValidChannel) : [];
    const previousChannels = state.data.channels;
    const hadPreviousCompleteScan = Boolean(state.data.lastSync);
    if (
      hadPreviousCompleteScan &&
      previousChannels.length >= 10 &&
      channels.length < previousChannels.length * 0.6
    ) {
      setScanning(false);
      state.scanTabId = null;
      showNotice(
        `اسکن ناقص به نظر می‌رسد (${faNumber(channels.length)} از ${faNumber(previousChannels.length)} کانال). فهرست قبلی حفظ شد و هشداری ثبت نشد.`,
        true
      );
      return;
    }

    const detectedAt = message.scannedAt || new Date().toISOString();
    const removed = hadPreviousCompleteScan
      ? previousChannels
        .filter((channel) => !channels.some((current) =>
          globalThis.YSOChannelData?.sameChannel(channel, current) || channel.key === current.key
        ))
        .map((channel) => ({ ...channel, detectedAt }))
      : [];
    state.data = normalizeData(
      globalThis.YSOChannelData?.replaceChannels(state.data, channels) || { ...state.data, channels }
    );
    state.data.lastSync = detectedAt;
    if (removed.length > 0) {
      state.data.removedChannels = [...removed, ...state.data.removedChannels].slice(0, 1000);
    }
    pruneAssignments();
    pruneRecentVideos();
    await saveData();
    setScanning(false);
    state.scanTabId = null;
    render();
    void repairMissingAvatars();
    showNotice(
      removed.length > 0
        ? `${faNumber(channels.length)} کانال دریافت و حذف ${faNumber(removed.length)} کانال ثبت شد.`
        : `${faNumber(channels.length)} کانال با موفقیت دریافت شد.`,
      removed.length > 0
    );
    await notifyRemovedChannels(removed);
  }

  if (message.type === "subscription-scan-error") {
    setScanning(false);
    state.scanTabId = null;
    showNotice(message.message || "دریافت فهرست ناموفق بود.", true);
  }

  if (message.type === "subscription-scan-cancelled") {
    setScanning(false);
    state.scanTabId = null;
    showNotice("دریافت فهرست لغو شد.");
  }
}

function exportBackup() {
  const payload = {
    app: "youtube-subscription-organizer",
    exportedAt: new Date().toISOString(),
    data: state.data
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `youtube-subscriptions-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function importBackup(file) {
  try {
    const parsed = JSON.parse(await file.text());
    const imported = normalizeData(parsed?.data || parsed);
    if (!Array.isArray(imported.channels) || !Array.isArray(imported.categories)) {
      throw new Error("ساختار فایل پشتیبان معتبر نیست.");
    }
    state.data = imported;
    pruneAssignments();
    pruneRecentVideos();
    await saveData();
    render();
    showNotice("پشتیبان با موفقیت بازیابی شد.");
  } catch (error) {
    showNotice(error instanceof Error ? error.message : "فایل پشتیبان خوانده نشد.", true);
  } finally {
    elements.importData.value = "";
  }
}

elements.categoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = elements.categoryName.value.trim();
  if (!name) return;

  state.data.categories.push({
    id: crypto.randomUUID(),
    name: name.slice(0, 32),
    color: elements.categoryColor.value,
    createdAt: new Date().toISOString()
  });
  elements.categoryName.value = "";
  await saveData();
  render();
});

elements.searchInput.addEventListener("input", () => {
  state.query = elements.searchInput.value;
  renderChannels();
});

elements.sortSelect.addEventListener("change", () => {
  state.sort = elements.sortSelect.value;
  renderChannels();
});

elements.syncButton.addEventListener("click", startScan);
elements.videoSyncButton.addEventListener("click", startVideoScan);
elements.emptySyncButton.addEventListener("click", startScan);
elements.cancelScan.addEventListener("click", cancelScan);
elements.clearAllNew.addEventListener("click", markAllVideosSeen);
elements.exportData.addEventListener("click", exportBackup);
elements.importData.addEventListener("change", () => {
  const file = elements.importData.files?.[0];
  if (file) void importBackup(file);
});
browser.runtime.onMessage.addListener(onScannerMessage);
browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[STORAGE_KEY]) return;
  const updated = normalizeData(changes[STORAGE_KEY].newValue);
  state.data = normalizeData(globalThis.YSOChannelData?.reconcile(updated) || updated);
  render();
});

void loadData();
