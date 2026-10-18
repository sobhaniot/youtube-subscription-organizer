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

const elements = {
  count: document.querySelector("#result-count"),
  search: document.querySelector("#search"),
  filters: document.querySelector("#filters"),
  list: document.querySelector("#channel-list"),
  close: document.querySelector("#close-sidebar"),
  dashboard: document.querySelector("#open-dashboard")
};

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
  if (tab?.id) await browser.tabs.update(tab.id, { url });
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
    void openInActiveTab(channel.url);
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
elements.dashboard.addEventListener("click", async () => {
  const url = browser.runtime.getURL("dashboard/index.html");
  const existing = await browser.tabs.query({ url });
  if (existing.length) await browser.tabs.update(existing[0].id, { active: true });
  else await browser.tabs.create({ url });
});
browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[STORAGE_KEY]) return;
  data = normalize(changes[STORAGE_KEY].newValue);
  render();
});

void load();
