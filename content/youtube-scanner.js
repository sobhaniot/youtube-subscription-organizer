"use strict";

const scanState = {
  running: false,
  cancelled: false
};

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function usableImageUrl(value) {
  if (!value || typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("data:image/gif") || trimmed.startsWith("blob:")) return "";
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  return /^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:image/") ? trimmed : "";
}

function imageUrlFrom(element) {
  if (!element) return "";
  const directCandidates = [
    element.getAttribute("src"),
    element.getAttribute("data-src"),
    element.getAttribute("data-thumb"),
    element.getAttribute("data-thumbnail-url"),
    element.currentSrc
  ];
  for (const candidate of directCandidates) {
    const usable = usableImageUrl(candidate);
    if (usable) return usable;
  }

  const srcset = element.getAttribute("srcset") || "";
  const candidates = srcset
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .map(usableImageUrl)
    .filter(Boolean);
  if (candidates.length) return candidates.at(-1);

  const backgroundImage = element.style?.backgroundImage || getComputedStyle(element).backgroundImage || "";
  const backgroundMatch = backgroundImage.match(/url\(["']?([^"')]+)["']?\)/i);
  return usableImageUrl(backgroundMatch?.[1]);
}

function avatarFromRendererData(renderer) {
  const roots = [renderer.data, renderer.__data?.data, renderer.__data].filter(Boolean);
  const visited = new WeakSet();
  const stack = roots.map((value) => ({ value, depth: 0 }));
  while (stack.length) {
    const { value, depth } = stack.pop();
    if (!value || typeof value !== "object" || depth > 8 || visited.has(value)) continue;
    visited.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (typeof child === "string" && key === "url" && /https?:\/\/yt3\./i.test(child)) {
        const usable = usableImageUrl(child);
        if (usable) return usable;
      } else if (child && typeof child === "object") {
        stack.push({ value: child, depth: depth + 1 });
      }
    }
  }
  return "";
}

function normalizeChannelUrl(href) {
  if (!href) return null;

  try {
    const url = new URL(href, location.origin);
    const path = url.pathname.replace(/\/$/, "");
    if (!/^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)$/.test(path)) {
      return null;
    }
    return `${location.origin}${path}`;
  } catch {
    return null;
  }
}

function channelKey(url) {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function textFrom(renderer) {
  const selectors = [
    "#channel-title #text",
    "#channel-title yt-formatted-string",
    "#text-container #text",
    "yt-formatted-string#text",
    "a#main-link",
    "a#channel-info",
    "#channel-title"
  ];

  for (const selector of selectors) {
    const element = renderer.querySelector(selector);
    const value =
      element?.getAttribute("title")?.trim() ||
      element?.textContent?.replace(/\s+/g, " ").trim() ||
      element?.getAttribute("aria-label")?.trim();
    if (value) return value;
  }
  return "کانال بدون نام";
}

function extractChannel(renderer) {
  const links = renderer.querySelectorAll(
    'a#main-link, a#channel-info, a[href^="/@"], a[href^="/channel/"], a[href^="/c/"], a[href^="/user/"]'
  );
  let url = null;

  for (const link of links) {
    url = normalizeChannelUrl(link.getAttribute("href"));
    if (url) break;
  }

  if (!url) return null;

  const imageCandidates = renderer.querySelectorAll(
    "#avatar img, yt-img-shadow#avatar img, yt-avatar-shape img, yt-avatar-shape [style*='background-image'], .yt-spec-avatar-shape__image, yt-decorated-avatar-view-model img, img.yt-core-image, img"
  );
  let avatar = "";
  for (const image of imageCandidates) {
    avatar = imageUrlFrom(image);
    if (avatar) break;
  }
  if (!avatar) avatar = avatarFromRendererData(renderer);
  const path = new URL(url).pathname;
  const idMatch = path.match(/^\/channel\/([^/]+)/i);

  return {
    key: channelKey(url),
    channelId: idMatch?.[1] || null,
    title: textFrom(renderer),
    url,
    avatar,
    scannedAt: new Date().toISOString()
  };
}

function collectVisibleChannels(target) {
  const renderers = document.querySelectorAll("ytd-channel-renderer, ytd-grid-channel-renderer");
  for (const renderer of renderers) {
    const channel = extractChannel(renderer);
    if (channel) {
      const previous = target.get(channel.key);
      target.set(channel.key, {
        ...previous,
        ...channel,
        avatar: channel.avatar || previous?.avatar || ""
      });
    }
  }
}

async function sendEvent(payload) {
  try {
    await browser.runtime.sendMessage(payload);
  } catch {
    // The dashboard may have been closed while the scan was running.
  }
}

async function waitForInitialResults() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (document.querySelector("ytd-channel-renderer, ytd-grid-channel-renderer")) return true;
    if (document.querySelector('a[href*="ServiceLogin"], ytd-button-renderer a[href*="accounts.google.com"]')) {
      return false;
    }
    await wait(500);
  }
  return Boolean(document.querySelector("ytd-channel-renderer, ytd-grid-channel-renderer"));
}

async function runScan() {
  scanState.running = true;
  scanState.cancelled = false;
  const channels = new Map();

  try {
    if (location.pathname !== "/feed/channels") {
      throw new Error("صفحهٔ اشتراک‌های یوتیوب باز نیست.");
    }

    const ready = await waitForInitialResults();
    if (!ready) {
      throw new Error("فهرست کانال‌ها پیدا نشد. مطمئن شوید وارد حساب YouTube شده‌اید.");
    }

    let stableRounds = 0;
    let previousCount = -1;
    let previousHeight = -1;

    for (let round = 1; round <= 240 && !scanState.cancelled; round += 1) {
      collectVisibleChannels(channels);
      const height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);

      await sendEvent({
        type: "subscription-scan-progress",
        count: channels.size,
        round
      });

      if (channels.size === previousCount && height === previousHeight) {
        stableRounds += 1;
      } else {
        stableRounds = 0;
      }

      if (stableRounds >= 6) break;

      previousCount = channels.size;
      previousHeight = height;
      window.scrollTo({ top: height, behavior: "instant" });
      await wait(850);
    }

    collectVisibleChannels(channels);
    window.scrollTo({ top: 0, behavior: "instant" });

    if (scanState.cancelled) {
      await sendEvent({ type: "subscription-scan-cancelled" });
      return;
    }

    if (channels.size === 0) {
      throw new Error("هیچ کانالی پیدا نشد. ممکن است حساب شما اشتراکی نداشته باشد.");
    }

    await sendEvent({
      type: "subscription-scan-complete",
      channels: [...channels.values()],
      scannedAt: new Date().toISOString()
    });
  } catch (error) {
    await sendEvent({
      type: "subscription-scan-error",
      message: error instanceof Error ? error.message : String(error)
    });
  } finally {
    scanState.running = false;
    scanState.cancelled = false;
  }
}

browser.runtime.onMessage.addListener((message) => {
  if (message?.type === "start-subscription-scan") {
    if (scanState.running) return Promise.resolve({ started: false, reason: "already-running" });
    void runScan();
    return Promise.resolve({ started: true });
  }

  if (message?.type === "cancel-subscription-scan") {
    scanState.cancelled = true;
    return Promise.resolve({ cancelled: true });
  }

  if (message?.type === "scanner-ping") {
    return Promise.resolve({ ready: true, running: scanState.running });
  }

  return false;
});
