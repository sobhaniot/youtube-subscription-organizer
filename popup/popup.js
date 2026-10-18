"use strict";

document.querySelector("#open-dashboard").addEventListener("click", async () => {
  const dashboardUrl = browser.runtime.getURL("dashboard/index.html");
  const existing = await browser.tabs.query({ url: dashboardUrl });

  if (existing.length > 0) {
    await browser.tabs.update(existing[0].id, { active: true });
    if (existing[0].windowId) {
      await browser.windows.update(existing[0].windowId, { focused: true });
    }
  } else {
    await browser.tabs.create({ url: dashboardUrl });
  }

  window.close();
});

function waitForTabComplete(tabId, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      reject(new Error("YouTube load timeout"));
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

async function getYouTubeTab() {
  const [active] = await browser.tabs.query({ active: true, currentWindow: true });
  if (active?.url && /^https?:\/\/(?:www\.)?youtube\.com\//i.test(active.url)) return active;

  const existing = await browser.tabs.query({ url: "*://www.youtube.com/*" });
  if (existing.length > 0) {
    await browser.tabs.update(existing[0].id, { active: true });
    if (existing[0].windowId) {
      await browser.windows.update(existing[0].windowId, { focused: true });
    }
    return existing[0];
  }

  const tab = await browser.tabs.create({ url: "https://www.youtube.com/", active: true });
  await waitForTabComplete(tab.id);
  return tab;
}

document.querySelector("#open-sidebar").addEventListener("click", async () => {
  await browser.sidebarAction.open();
  await getYouTubeTab();
  window.close();
});
