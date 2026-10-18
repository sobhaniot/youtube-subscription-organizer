"use strict";

(() => {
  const videoScanState = {
    running: false,
    cancelled: false
  };

  const videoWait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  function normalizeVideoUrl(href) {
    if (!href) return null;
    try {
      const url = new URL(href, location.origin);
      const videoId = url.searchParams.get("v");
      if (url.pathname !== "/watch" || !videoId) return null;
      return {
        videoId,
        url: `${location.origin}/watch?v=${encodeURIComponent(videoId)}`
      };
    } catch {
      return null;
    }
  }

  function videoFromRenderer(renderer) {
    const videoLink = renderer.querySelector(
      'a#video-title-link, a#video-title, a[href^="/watch?v="]'
    );
    const video = normalizeVideoUrl(videoLink?.getAttribute("href"));
    if (!video) return null;

    const channelLink = renderer.querySelector(
      'ytd-channel-name a, #channel-name a, a.yt-simple-endpoint.yt-formatted-string[href^="/@"], a[href^="/channel/"]'
    );
    const channelUrl = normalizeChannelUrl(channelLink?.getAttribute("href"));
    if (!channelUrl) return null;

    const title =
      videoLink.getAttribute("title")?.trim() ||
      videoLink.textContent?.trim() ||
      "ویدیوی بدون عنوان";
    const channelTitle =
      channelLink?.textContent?.trim() ||
      renderer.querySelector("#channel-name, ytd-channel-name")?.textContent?.trim() ||
      "کانال یوتیوب";
    const thumbnail = imageUrlFrom(renderer.querySelector("ytd-thumbnail img, yt-thumbnail-view-model img, img"));
    const publishedText =
      renderer.querySelector("#metadata-line span, .inline-metadata-item")?.textContent?.trim() || "";

    return {
      videoId: video.videoId,
      title,
      url: video.url,
      thumbnail,
      publishedText,
      channelKey: channelKey(channelUrl),
      channelUrl,
      channelTitle,
      foundAt: new Date().toISOString()
    };
  }

  function collectVisibleVideos(target) {
    const renderers = document.querySelectorAll(
      "ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer"
    );
    for (const renderer of renderers) {
      const video = videoFromRenderer(renderer);
      if (video) target.set(video.videoId, video);
    }
  }

  async function sendVideoEvent(payload) {
    try {
      await browser.runtime.sendMessage(payload);
    } catch {
      // The dashboard may have been closed.
    }
  }

  async function waitForVideos() {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      if (document.querySelector("ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer")) {
        return true;
      }
      if (document.querySelector('a[href*="ServiceLogin"], a[href*="accounts.google.com"]')) return false;
      await videoWait(500);
    }
    return false;
  }

  async function runVideoScan() {
    videoScanState.running = true;
    videoScanState.cancelled = false;
    const videos = new Map();

    try {
      if (location.pathname !== "/feed/subscriptions") {
        throw new Error("صفحهٔ ویدئوهای اشتراک‌ها باز نیست.");
      }
      if (!(await waitForVideos())) {
        throw new Error("ویدیویی پیدا نشد. مطمئن شوید وارد حساب YouTube شده‌اید.");
      }

      let stableRounds = 0;
      let previousCount = -1;
      let previousHeight = -1;

      for (let round = 1; round <= 60 && videos.size < 250 && !videoScanState.cancelled; round += 1) {
        collectVisibleVideos(videos);
        const height = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
        await sendVideoEvent({ type: "video-scan-progress", count: videos.size, round });

        if (videos.size === previousCount && height === previousHeight) stableRounds += 1;
        else stableRounds = 0;
        if (stableRounds >= 5) break;

        previousCount = videos.size;
        previousHeight = height;
        window.scrollTo({ top: height, behavior: "instant" });
        await videoWait(750);
      }

      collectVisibleVideos(videos);
      window.scrollTo({ top: 0, behavior: "instant" });

      if (videoScanState.cancelled) {
        await sendVideoEvent({ type: "video-scan-cancelled" });
        return;
      }

      await sendVideoEvent({
        type: "video-scan-complete",
        videos: [...videos.values()],
        checkedAt: new Date().toISOString()
      });
    } catch (error) {
      await sendVideoEvent({
        type: "video-scan-error",
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      videoScanState.running = false;
      videoScanState.cancelled = false;
    }
  }

  browser.runtime.onMessage.addListener((message) => {
    if (message?.type === "start-video-scan") {
      if (videoScanState.running) return Promise.resolve({ started: false, reason: "already-running" });
      void runVideoScan();
      return Promise.resolve({ started: true });
    }
    if (message?.type === "cancel-video-scan") {
      videoScanState.cancelled = true;
      return Promise.resolve({ cancelled: true });
    }
    return false;
  });
})();
