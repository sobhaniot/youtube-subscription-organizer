(function (scope) {
  "use strict";

  const CACHE_NAME = "youtube-channel-avatars-v1";
  const resolved = new Map();
  const objectUrls = new Set();

  function compactUrl(value) {
    if (!/^https:\/\/yt3\.(?:ggpht|googleusercontent)\.com\//i.test(value)) return value;
    return value.replace(/=s\d+(-)/i, "=s88$1");
  }

  async function fromCacheOrNetwork(source) {
    if (!/^https?:\/\//i.test(source)) return source;
    if (!scope.caches || typeof scope.fetch !== "function") return source;
    const url = compactUrl(source);
    try {
      const cache = await scope.caches.open(CACHE_NAME);
      let response = await cache.match(url);
      if (!response) {
        response = await scope.fetch(url, {
          cache: "force-cache",
          credentials: "omit",
          referrerPolicy: "no-referrer"
        });
        if (response.ok) await cache.put(url, response.clone());
      }
      if (!response?.ok) return source;
      const contentType = response.headers?.get("content-type") || "";
      if (contentType && !contentType.startsWith("image/")) return source;
      const blob = await response.blob();
      if (!blob.size) return source;
      const objectUrl = scope.URL.createObjectURL(blob);
      objectUrls.add(objectUrl);
      return objectUrl;
    } catch {
      return source;
    }
  }

  function resolve(source) {
    if (!source || typeof source !== "string") return Promise.resolve("");
    if (source.startsWith("data:image/") || source.startsWith("blob:")) return Promise.resolve(source);
    if (!resolved.has(source)) resolved.set(source, fromCacheOrNetwork(source));
    return resolved.get(source);
  }

  scope.addEventListener?.("unload", () => {
    for (const url of objectUrls) scope.URL.revokeObjectURL(url);
    objectUrls.clear();
  });

  scope.YSOAvatarCache = { resolve };
})(globalThis);
