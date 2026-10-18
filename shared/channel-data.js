"use strict";

(() => {
  function pathFor(channel) {
    try {
      return new URL(channel?.url || "https://www.youtube.com" + (channel?.key || ""))
        .pathname.replace(/\/$/, "").toLocaleLowerCase();
    } catch {
      return String(channel?.key || "").replace(/\/$/, "").toLocaleLowerCase();
    }
  }

  function cleanTitle(channel) {
    return String(channel?.title || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
  }

  function cleanAvatar(channel) {
    let value = String(channel?.avatar || "").trim();
    if (!value) return "";
    try {
      const parsed = new URL(value);
      // YouTube serves the same cached avatar from both hostnames.  The path
      // contains the stable image token while the host and size suffix vary.
      if (/^yt3\.(?:ggpht|googleusercontent)\.com$/i.test(parsed.hostname)) {
        value = parsed.pathname;
      }
    } catch {
      // Keep non-URL values comparable for older stored records.
    }
    return value
      .replace(/[?&](?:rs|sz|s)=\d+[^&]*/gi, "")
      .replace(/=s\d+(?:-[^/?#]+)?(?=$|[?#])/i, "")
      .replace(/[?#].*$/, "")
      .replace(/\/$/, "")
      .toLocaleLowerCase();
  }

  function identitiesFor(channel) {
    const identities = new Set();
    const add = (value) => {
      const normalized = String(value || "").replace(/\/$/, "").toLocaleLowerCase();
      if (normalized) identities.add(normalized);
    };
    add(channel?.key);
    add(pathFor(channel));
    for (const alias of Array.isArray(channel?.aliases) ? channel.aliases : []) add(alias);
    return identities;
  }

  function sameChannel(left, right) {
    if (!left || !right) return false;
    const leftPath = pathFor(left);
    const rightPath = pathFor(right);
    const leftIdentities = identitiesFor(left);
    const rightIdentities = identitiesFor(right);
    if ([...leftIdentities].some((identity) => rightIdentities.has(identity))) return true;
    if (left.channelId && right.channelId &&
        String(left.channelId).toLocaleLowerCase() === String(right.channelId).toLocaleLowerCase()) return true;

    const leftTitle = cleanTitle(left);
    const rightTitle = cleanTitle(right);
    if (!leftTitle || leftTitle !== rightTitle) return false;
    const leftAvatar = cleanAvatar(left);
    const rightAvatar = cleanAvatar(right);
    if (leftAvatar && rightAvatar) return leftAvatar === rightAvatar;

    // A common duplicate is the same named channel represented once by its
    // handle and once by its UC id before one avatar has finished loading.
    return (/^\/@/.test(leftPath) && /^\/channel\//.test(rightPath)) ||
      (/^\/channel\//.test(leftPath) && /^\/@/.test(rightPath));
  }

  function channelScore(channel) {
    const path = pathFor(channel);
    return (path.startsWith("/@") ? 8 : 0) +
      (channel.avatar ? 4 : 0) +
      (channel.channelId ? 2 : 0) +
      (channel.title ? 1 : 0);
  }

  function mergeChannels(channels) {
    const groups = [];
    for (const channel of Array.isArray(channels) ? channels : []) {
      if (!channel || typeof channel.key !== "string" || typeof channel.url !== "string") continue;
      const group = groups.find((candidate) => candidate.some((member) => sameChannel(member, channel)));
      if (group) group.push(channel);
      else groups.push([channel]);
    }

    const aliases = new Map();
    const merged = groups.map((group) => {
      const ordered = [...group].sort((left, right) => channelScore(right) - channelScore(left));
      const preferred = ordered[0];
      const result = { ...preferred };
      for (const channel of ordered.slice(1)) {
        if (!result.avatar && channel.avatar) result.avatar = channel.avatar;
        if (!result.channelId && channel.channelId) result.channelId = channel.channelId;
        if (!result.title && channel.title) result.title = channel.title;
      }
      result.key = pathFor(result) || result.key;
      const knownAliases = new Set([result.key]);
      for (const channel of group) {
        knownAliases.add(channel.key);
        knownAliases.add(pathFor(channel));
        for (const alias of Array.isArray(channel.aliases) ? channel.aliases : []) knownAliases.add(alias);
      }
      result.aliases = [...knownAliases]
        .filter(Boolean)
        .map((alias) => String(alias).replace(/\/$/, "").toLocaleLowerCase())
        .filter((alias, index, values) => alias !== result.key && values.indexOf(alias) === index);
      for (const alias of knownAliases) {
        if (!alias) continue;
        aliases.set(String(alias), result.key);
        aliases.set(String(alias).replace(/\/$/, "").toLocaleLowerCase(), result.key);
      }
      aliases.set(pathFor(result), result.key);
      return result;
    });
    return { channels: merged, aliases };
  }

  function remapData(source, mergedChannels, aliases) {
    const result = { ...source, channels: mergedChannels };
    const validKeys = new Set(mergedChannels.map((channel) => channel.key));

    const assignments = {};
    for (const [key, ids] of Object.entries(source.assignments || {})) {
      const target = aliases.get(key) || aliases.get(String(key).replace(/\/$/, "").toLocaleLowerCase()) || key;
      if (!validKeys.has(target) || !Array.isArray(ids)) continue;
      assignments[target] = [...new Set([...(assignments[target] || []), ...ids])];
    }
    result.assignments = assignments;

    const recentVideos = {};
    for (const [key, videos] of Object.entries(source.recentVideos || {})) {
      const target = aliases.get(key) || aliases.get(String(key).replace(/\/$/, "").toLocaleLowerCase()) || key;
      if (!validKeys.has(target) || !Array.isArray(videos)) continue;
      const previous = recentVideos[target] || [];
      const combined = [...previous, ...videos].map((video) => ({
        ...video,
        channelKey: target,
        channelUrl: mergedChannels.find((channel) => channel.key === target)?.url || video.channelUrl
      }));
      const seen = new Set();
      recentVideos[target] = combined.filter((video) => {
        if (!video?.videoId || seen.has(video.videoId)) return false;
        seen.add(video.videoId);
        return true;
      }).slice(0, 12);
    }
    result.recentVideos = recentVideos;

    const markers = {};
    for (const [key, marker] of Object.entries(source.youtubeNewChannels || {})) {
      let target = aliases.get(key) || aliases.get(String(key).replace(/\/$/, "").toLocaleLowerCase());
      if (!target && marker?.title) {
        const matches = mergedChannels.filter((channel) => cleanTitle(channel) === cleanTitle(marker));
        if (matches.length === 1) target = matches[0].key;
      }
      if (target && validKeys.has(target)) markers[target] = marker;
    }
    result.youtubeNewChannels = markers;
    return result;
  }

  function reconcile(source) {
    const safe = source && typeof source === "object" ? source : {};
    const merged = mergeChannels(safe.channels);
    return remapData(safe, merged.channels, merged.aliases);
  }

  function replaceChannels(source, channels) {
    const safe = reconcile(source);
    const targets = mergeChannels(channels);
    const aliases = new Map(targets.aliases);
    for (const previous of safe.channels) {
      let match = targets.channels.find((channel) => sameChannel(previous, channel));
      if (!match) {
        // A rescan can switch between a custom URL and a handle without
        // exposing the channel ID or avatar.  Preserve user assignments only
        // when the title identifies exactly one old and one new channel.
        const title = cleanTitle(previous);
        if (title) {
          const oldMatches = safe.channels.filter((channel) => cleanTitle(channel) === title);
          const newMatches = targets.channels.filter((channel) => cleanTitle(channel) === title);
          if (oldMatches.length === 1 && newMatches.length === 1) match = newMatches[0];
        }
      }
      if (match) aliases.set(previous.key, match.key);
    }
    return remapData(safe, targets.channels, aliases);
  }

  globalThis.YSOChannelData = { reconcile, replaceChannels, sameChannel };
})();
