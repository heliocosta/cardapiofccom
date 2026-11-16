(function () {
  var DISMISS_KEY = "cfc_android_banner_dismissed";
  var DAYS_14 = 14 * 86400000;
  var ALLOWED_SCHEME = /^(cardapiofc|cfc):\/\//;
  var ALLOWED_STORE = /^https:\/\/(apps\.apple\.com|play\.google\.com)\//;

  function isAndroid() { return /Android/i.test(navigator.userAgent); }
  function isIos() { return /iPhone|iPad|iPod/i.test(navigator.userAgent); }

  // 1. Custom scheme fallback to store URL after 1500ms if document remains visible
  document.addEventListener("click", function (e) {
    var el = e.target && e.target.closest && e.target.closest('[data-cfc-app-target="scheme"]');
    if (!el) return;
    var href = el.getAttribute("href") || "";
    if (!ALLOWED_SCHEME.test(href)) return;
    var fallback = isIos() ? el.getAttribute("data-ios-url") : el.getAttribute("data-android-url");
    if (!fallback || !ALLOWED_STORE.test(fallback)) return;

    e.preventDefault();
    var left = false;
    var onVis = function () { if (document.hidden) left = true; };
    document.addEventListener("visibilitychange", onVis, { once: true });
    location.href = href;
    setTimeout(function () {
      document.removeEventListener("visibilitychange", onVis);
      if (!left && !document.hidden) location.href = fallback;
    }, 1500);
  });

  // 2. Android smart banner controller
  var banner = document.getElementById("cfc-android-banner");
  if (!banner || !isAndroid()) return;
  try {
    var ts = parseInt(localStorage.getItem(DISMISS_KEY) || "0", 10);
    if (ts && Date.now() - ts < DAYS_14) return;
  } catch (e) {}

  banner.classList.remove("hidden");
  var closeBtn = banner.querySelector("[data-cfc-banner-dismiss]");
  if (closeBtn) {
    closeBtn.addEventListener("click", function () {
      banner.classList.add("hidden");
      try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) {}
    });
  }
})();
