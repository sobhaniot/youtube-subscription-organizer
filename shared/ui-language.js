(function initializeYsoLanguage() {
  "use strict";

  const LANGUAGE_KEY = "ysoInterfaceLanguage";
  const faToEn = new Map(Object.entries({
    "اشتراک‌های یوتیوب": "YouTube subscriptions",
    "اشتراک‌های من": "My subscriptions",
    "مدیر اشتراک‌های یوتیوب": "YouTube Subscription Organizer",
    "مدیر اشتراک‌ها": "Subscription Organizer",
    "مرتب، کامل، در دسترس": "Organized, complete, at a glance",
    "کتابخانهٔ شخصی شما": "Your personal library",
    "همهٔ کانال‌ها، بدون محدودیت فهرست": "All your channels, without list limits",
    "هنوز اطلاعاتی از یوتیوب دریافت نشده است.": "No YouTube data has been fetched yet.",
    "بررسی ویدئوهای جدید": "Check for new videos",
    "دریافت کانال‌ها": "Fetch channels",
    "در حال بازکردن فهرست اشتراک‌ها…": "Opening your subscriptions…",
    "ممکن است با توجه به تعداد کانال‌ها کمی طول بکشد.": "This may take a while depending on the number of channels.",
    "لغو": "Cancel",
    "کل کانال‌ها": "Total channels",
    "دسته‌بندی‌شده": "Categorized",
    "بدون دسته": "Uncategorized",
    "دارای ویدئوی جدید": "With new videos",
    "جست‌وجوی نام کانال…": "Search channel names…",
    "مرتب‌سازی": "Sort",
    "نام: الف تا ی": "Name: A to Z",
    "نام: ی تا الف": "Name: Z to A",
    "تعداد دسته‌ها": "Number of categories",
    "همه دیده شدند": "Mark all as seen",
    "فهرست شما آمادهٔ ساخته‌شدن است": "Your library is ready to set up",
    "روی «دریافت از یوتیوب» بزنید. افزونه صفحهٔ اشتراک‌ها را باز می‌کند و تا انتهای فهرست پیش می‌رود.": "Select “Fetch from YouTube”. The extension will open your subscriptions and scan the full list.",
    "شروع دریافت": "Start fetching",
    "دسته‌ها": "Categories",
    "دستهٔ جدید": "New category",
    "مثلاً موسیقی": "For example, Music",
    "رنگ دسته": "Category color",
    "افزودن دسته": "Add category",
    "خروجی پشتیبان": "Export backup",
    "بازیابی پشتیبان": "Restore backup",
    "همهٔ کانال‌ها": "All channels",
    "ویدئوی جدید": "New videos",
    "حذف‌شده‌ها": "Removed",
    "ابزارهای فهرست": "List tools",
    "جست‌وجوی کانال…": "Search channels…",
    "کانال‌ها": "Channels",
    "بستن پنل": "Close panel",
    "جست‌وجوی کانال": "Search channels",
    "رفرش کانال‌ها": "Refresh channels",
    "پنل کنار YouTube": "YouTube sidebar",
    "داشبورد کامل": "Full dashboard",
    "کانال‌های یوتیوب را یک‌جا ببین و دسته‌بندی کن.": "View and organize your YouTube subscriptions in one place.",
    "نسخهٔ افزونه": "Extension version",
    "زبان رابط": "Interface language",
    "Language / زبان": "Language / زبان",
    "فارسی": "Persian",
    "انگلیسی": "English",
    "بستن": "Close",
    "دسته‌بندی": "Organize",
    "افزودن": "Add",
    "همه": "All",
    "یک دسته بسازید": "Create a category",
    "نام دسته": "Category name",
    "ذخیره": "Save",
    "حذف": "Delete",
    "ویدیوهای جدید": "New videos",
    "رفرش": "Refresh",
    "باز کردن داشبورد کامل": "Open full dashboard",
    "دریافت از یوتیوب": "Fetch from YouTube",
    "تعداد دسته‌ها": "Categories",
    "پیش‌فرض": "Default"
    ,"آمار": "Statistics"
    ,"مرتب‌سازی": "Sort by"
    ,"نام: الف تا ی": "Name: A to Z"
    ,"نام: ی تا الف": "Name: Z to A"
    ,"جست‌وجوی نام کانال…": "Search channel names…"
    ,"رنگ دسته": "Category color"
    ,"مثلاً موسیقی": "For example, Music"
    ,"خروجی پشتیبان": "Export backup"
    ,"بازیابی پشتیبان": "Restore backup"
    ,"همهٔ ویدئوهای جدید به‌عنوان دیده‌شده علامت خوردند.": "All new videos were marked as seen."
    ,"ویرایش یا حذف دسته": "Edit or delete category"
    ,"ابتدا یک دسته بسازید": "Create a category first."
    ,"هنوز کانال حذف‌شده‌ای ثبت نشده است.": "No removed channels have been recorded yet."
    ,"کانالی با این فیلتر پیدا نشد.": "No channels match this filter."
    ,"در حال بازکردن فهرست اشتراک‌ها…": "Opening your subscriptions…"
    ,"فهرست در یک تب پس‌زمینه دریافت می‌شود؛ صفحهٔ فعلی باز می‌ماند.": "Your subscriptions are being fetched in a background tab. This page will stay open."
    ,"در حال خواندن کانال‌ها…": "Reading channels…"
    ,"در حال بازکردن فید اشتراک‌ها…": "Opening your subscriptions feed…"
    ,"جدیدترین ویدئوهای کانال‌های دنبال‌شده بررسی می‌شوند.": "Checking the latest videos from your subscribed channels."
    ,"در حال بررسی ویدئوها…": "Checking videos…"
    ,"در حال مقایسه با بررسی قبلی…": "Comparing with the previous check…"
    ,"در حال پیمایش فهرست در تب پس‌زمینه…": "Scanning the list in a background tab…"
    ,"فهرست قبلی حفظ شد و هشداری ثبت نشد.": "The previous list was kept, and no removal alert was created."
    ,"در حال رفرش…": "Refreshing…"
    ,"رفرش کانال‌ها لغو شد.": "Channel refresh canceled."
    ,"دریافت فهرست ناموفق بود.": "Could not fetch the list."
    ,"ویدیوی جدیدی نسبت به بررسی قبلی پیدا نشد.": "No new videos were found since the previous check."
    ,"همهٔ ویدئوهای جدید به‌عنوان دیده‌شده علامت خوردند.": "All new videos were marked as seen."
    ,"پشتیبان با موفقیت بازیابی شد.": "Backup restored successfully."
    ,"ساختار فایل پشتیبان معتبر نیست.": "The backup file has an invalid format."
    ,"فایل پشتیبان خوانده نشد.": "Could not read the backup file."
    ,"صفحهٔ کامل": "Full page"
    ,"دریافت از یوتیوب": "Fetch from YouTube"
    ,"عنوان": "Title"
    ,"زبان رابط": "Interface language"
    ,"برای تغییر ترتیب بکشید": "Drag to reorder"
    ,"کانال بدون نام": "Untitled channel"
    ,"ویدیوی جدید در YouTube": "New video on YouTube"
    ,"هیچ ویدیوی جدیدی پیدا نشد.": "No new videos were found."
    ,"اسکن کامل شد.": "Scan complete."
    ,"فهرست اشتراک‌ها دریافت شد.": "Subscriptions fetched."
    ,"دسته‌بندی‌شده": "Categorized"
    ,"یک اشتراک حذف شده است": "One subscription was removed"
    ,"اشتراک حذف شده‌اند": "Subscriptions were removed"
    ,"همه کانال‌ها": "All channels"
    ,"همه کانال‌ها": "All channels"
    ,"ویدئوی جدید در YouTube": "New video on YouTube"
    ,"بررسی ویدئوهای جدید": "Check for new videos"
    ,"در حال خواندن کانال‌ها…": "Reading channels…"
    ,"در حال بررسی ویدئوها…": "Checking videos…"
    ,"اسکن تمام شد؛ در حال ذخیرهٔ فهرست…": "Scan complete; saving the list…"
    ,"دریافت کانال‌ها": "Fetch channels"
    ,"رفرش کانال‌ها": "Refresh channels"
    ,"ویدیوی جدید": "New video"
    ,"همهٔ کانال‌ها": "All channels"
    ,"تشخیص نقطه‌های آبی": "Diagnose blue dots"
    ,"گزارش تشخیصی نقطه‌های آبی": "Blue-dot diagnostic report"
    ,"گزارش را بررسی کنید یا کپی کنید و اینجا بفرستید. گزارش فقط در همین پنل ساخته می‌شود.": "Review or copy this report and send it here. It is generated locally in this panel."
    ,"کپی گزارش": "Copy report"
    ,"گزارش کپی شد": "Report copied"
    ,"برای تشخیص، YouTube را باز کنید و دوباره بزنید.": "Open YouTube and try again to diagnose."
    ,"ارتباط با صفحهٔ YouTube برقرار نشد. صفحه را تازه‌سازی کنید و دوباره بزنید.": "Could not connect to YouTube. Reload the page and try again."
  }));
  const enToFa = new Map([...faToEn].map(([fa, en]) => [en, fa]));

  const dynamicPatterns = [
    [/^(\d+) کانال$/, "$1 channels"],
    [/^نسخه (.+)$/, "Version $1"],
    [/^برای تغییر ترتیب بکشید$/, "Drag to reorder"],
    [/^کانال با این فیلتر پیدا نشد\.$/, "No channels match this filter."],
    [/^ابتدا در داشبورد کامل، فهرست اشتراک‌ها را دریافت کنید\.$/, "Fetch your subscriptions from the full dashboard first."],
    [/^در حال رفرش…$/, "Refreshing…"],
    [/^بارگذاری صفحهٔ YouTube بیش از حد طول کشید\.$/, "Loading YouTube took too long."],
    [/^در حال بازکردن فهرست اشتراک‌های YouTube…$/, "Opening YouTube subscriptions…"],
    [/^اسکن کانال‌ها از قبل در حال اجراست؛ فهرست پس از ذخیره به‌روز می‌شود\.$/, "A channel scan is already running. The list will update when it is saved."],
    [/^داشبورد در حال دریافت کانال‌هاست؛ تا پایان اسکن باز بماند\.$/, "The dashboard is fetching channels. Keep it open until the scan finishes."],
    [/^اسکنر در صفحهٔ YouTube شروع نشد\.$/, "Could not start the scanner on YouTube."],
    [/^در حال خواندن کانال‌ها در پس‌زمینه…$/, "Reading channels in the background…"],
    [/^(\d+) کانال پیدا شد؛ در حال پیمایش فهرست…$/, "$1 channels found; scanning the list…"],
    [/^رفرش کانال‌ها لغو شد\.$/, "Channel refresh canceled."],
    [/^اسکن تمام شد؛ در حال ذخیرهٔ فهرست…$/, "Scan complete; saving the list…"],
    [/^(\d+) کانال با موفقیت رفرش شد\.$/, "$1 channels refreshed successfully."],
    [/^ذخیرهٔ فهرست ناموفق بود\.$/, "Could not save the channel list."],
    [/^دسته‌بندی \((\d+)\)$/, "Organize ($1)"],
    [/^دسته‌بندی (.+)$/, "Organize $1"],
    [/^دسته‌بندی «(.+)»$/, "Organize “$1”"],
    [/^(\d+) ویدیوی جدید$/, "$1 new videos"],
    [/^(\d+) ویدئوی جدید$/, "$1 new videos"],
    [/^(\d+) ویدیوی دیگر$/, "$1 more videos"],
    [/^دریافت کانال‌ها: (.+)$/, "Channels fetched: $1"],
    [/^بررسی ویدئوها: (.+)$/, "Videos checked: $1"],
    [/^حذف از اشتراک‌ها: (.+)$/, "Removed from subscriptions: $1"],
    [/^کانالی با این فیلتر پیدا نشد\.$/, "No channels match this filter."],
    [/^دسته‌بندی \((\d+)\)$/, "Organize ($1)"]
  ];
  const englishPatterns = [
    [/^(\d+) channels$/, "$1 کانال"],
    [/^Version (.+)$/, "نسخه $1"],
    [/^(\d+) new videos$/, "$1 ویدئوی جدید"],
    [/^(\d+) more videos$/, "$1 ویدیوی دیگر"],
    [/^Channels fetched: (.+)$/, "دریافت کانال‌ها: $1"],
    [/^Videos checked: (.+)$/, "بررسی ویدئوها: $1"],
    [/^Removed from subscriptions: (.+)$/, "حذف از اشتراک‌ها: $1"],
    [/^Organize \((\d+)\)$/, "دسته‌بندی ($1)"],
    [/^Organize (.+)$/, "دسته‌بندی $1"]
    ,[/^(\d+) new videos$/, "$1 ویدئوی جدید"]
    ,[/^(\d+) channels found; scanning the list…$/, "$1 کانال پیدا شد؛ در حال پیمایش فهرست…"]
    ,[/^(\d+) channels refreshed successfully\.$/, "$1 کانال با موفقیت رفرش شد."]
    ,[/^(\d+) channels found$/, "$1 کانال پیدا شد"]
    ,[/^(\d+) ویدئو بررسی شد$/, "$1 videos checked"]
    ,[/^(\d+) کانال دریافت و حذف (\d+) کانال ثبت شد\.$/, "$1 channels fetched and $2 removed channels recorded."]
    ,[/^(\d+) کانال با موفقیت دریافت شد\.$/, "$1 channels fetched successfully."]
    ,[/^اسکن ناقص به نظر می‌رسد \((\d+) از (\d+) کانال\)\. فهرست قبلی حفظ شد و هشداری ثبت نشد\.$/, "The scan appears incomplete ($1 of $2 channels). The previous list was kept and no alert was recorded."]
    ,[/^اسکن ناقص بود \((\d+) از (\d+) کانال\)؛ فهرست قبلی حفظ شد\.$/, "The scan was incomplete ($1 of $2 channels); the previous list was kept."]
    ,[/^برای تغییر نام، نام جدید را بنویسید\. برای حذف کامل دسته، عبارت «حذف» را وارد کنید\.\n\nنام فعلی: (.+)$/, "Enter a new name to rename the category. Type “Delete” to remove it.\n\nCurrent name: $1"]
    ,[/^(\d+) ویدیوی جدید از (\d+) کانال پیدا شد\.$/, "$1 new videos found from $2 channels."]
    ,[/^(\d+) ویدئو بررسی شد$/, "$1 videos checked"]
    ,[/^(\d+) کانال دریافت و حذف (\d+) کانال ثبت شد\.$/, "$1 channels fetched; $2 removed channels recorded."]
    ,[/^(\d+) کانال با موفقیت دریافت شد\.$/, "$1 channels fetched successfully."]
    ,[/^(\d+) اشتراک حذف شده‌اند$/, "$1 subscriptions were removed"]
    ,[/^\d+ کانال دیگر$/, "More channels"]
  ];

  function translate(value, english) {
    const exact = (english ? faToEn : enToFa).get(value);
    if (exact) return exact;
    for (const [pattern, replacement] of (english ? dynamicPatterns : englishPatterns)) {
      if (pattern.test(value)) return value.replace(pattern, replacement);
    }
    return value;
  }

  function translateSubtree(root, english) {
    if (!root || root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const original = node.nodeValue.trim();
      if (!original) continue;
      if (node.parentElement?.closest("[data-yso-user-content]")) continue;
      const translated = translate(original, english);
      if (translated !== original) node.nodeValue = node.nodeValue.replace(original, translated);
    }
    const elements = [];
    if (root.nodeType === Node.ELEMENT_NODE && root.matches("[placeholder], [aria-label], [title]")) elements.push(root);
    elements.push(...root.querySelectorAll?.("[placeholder], [aria-label], [title]") || []);
    for (const element of elements) {
      if (element.closest("[data-yso-user-content]")) continue;
      for (const attribute of ["placeholder", "aria-label", "title"]) {
        if (!element.hasAttribute(attribute)) continue;
        const oldValue = element.getAttribute(attribute);
        const newValue = translate(oldValue, english);
        if (newValue !== oldValue) element.setAttribute(attribute, newValue);
      }
    }
  }

  function translateTextNode(node, english) {
    const original = node?.nodeValue?.trim();
    if (!original) return;
    const translated = translate(original, english);
    if (translated !== original) node.nodeValue = node.nodeValue.replace(original, translated);
  }

  function applyLanguage(language) {
    const english = language === "en";
    document.documentElement.lang = english ? "en" : "fa";
    document.documentElement.dir = english ? "ltr" : "rtl";
    document.body?.classList.toggle("yso-english", english);
    translateSubtree(document.body, english);
    if (document.title) document.title = translate(document.title, english);
    const languageSelect = document.querySelector("#interface-language");
    if (languageSelect) languageSelect.value = english ? "en" : "fa";
    window.dispatchEvent(new CustomEvent("yso-language-changed", { detail: english ? "en" : "fa" }));
  }

  let currentLanguage = "en";
  const observer = new MutationObserver((mutations) => {
    const english = currentLanguage === "en";
    for (const mutation of mutations) {
      if (mutation.type === "characterData") translateTextNode(mutation.target, english);
      for (const node of mutation.addedNodes || []) {
        if (node.nodeType === Node.ELEMENT_NODE) translateSubtree(node, english);
        else if (node.nodeType === Node.TEXT_NODE) translateTextNode(node, english);
      }
      if (mutation.type === "attributes") {
        const value = mutation.target.getAttribute(mutation.attributeName);
        if (value == null) continue;
        const translated = translate(value, english);
        if (translated !== value) mutation.target.setAttribute(mutation.attributeName, translated);
      }
    }
  });

  browser.storage.local.get(LANGUAGE_KEY).then((stored) => {
    currentLanguage = stored[LANGUAGE_KEY] === "fa" ? "fa" : "en";
    applyLanguage(currentLanguage);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["placeholder", "aria-label", "title"]
    });
    document.querySelector("#interface-language")?.addEventListener("change", (event) => {
      void window.ysoLanguage.set(event.target.value);
    });
  }).catch(() => applyLanguage("en"));

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[LANGUAGE_KEY]) return;
    currentLanguage = changes[LANGUAGE_KEY].newValue === "fa" ? "fa" : "en";
    applyLanguage(currentLanguage);
  });

  window.ysoLanguage = {
    key: LANGUAGE_KEY,
    get: () => currentLanguage,
    set: async (language) => {
      currentLanguage = language === "fa" ? "fa" : "en";
      await browser.storage.local.set({ [LANGUAGE_KEY]: currentLanguage });
      applyLanguage(currentLanguage);
    }
  };
})();
