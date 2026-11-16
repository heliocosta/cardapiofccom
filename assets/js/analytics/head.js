import { KEY, parseChoice, tzMatches, toState } from "./shared.js";

// Synchronous consent bootstrap: runs before any other script. Never throws.
(function () {
  var cfg = window.__cfcCfg || {};
  var boot = { stored: null, bannerContext: true, needsBanner: true, gpc: false, source: null, geoCountry: null };
  window.__cfc = boot;
  window.cfcq = window.cfcq || [];
  try {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
    var all = function (v) {
      return { analytics_storage: v, ad_storage: v, ad_user_data: v, ad_personalization: v };
    };
    boot.gpc = !!navigator.globalPrivacyControl;
    var wait = cfg.wait || 500;
    var region = all("denied");
    region.region = cfg.region || [];
    region.wait_for_update = wait;
    gtag("consent", "default", region);
    var rest = all(cfg.outside || "granted");
    rest.ad_storage = rest.ad_user_data = rest.ad_personalization = "denied";
    rest.wait_for_update = wait;
    gtag("consent", "default", rest);
    gtag("set", "ads_data_redaction", true);

    var raw = null;
    try {
      raw = localStorage.getItem(KEY);
    } catch (e) {}
    boot.stored = raw ? parseChoice(raw, cfg.pv, cfg.days, Date.now()) : null;
    if (boot.stored) gtag("consent", "update", toState(boot.stored));

    var tz = "";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (e) {}
    boot.bannerContext = !!cfg.inRegion || tzMatches(tz, cfg.tz || []);
    boot.needsBanner = boot.bannerContext && !boot.stored;

    var u = new URL(location.href);
    var geo = u.searchParams.get("cfc_geo");
    if (geo !== null) {
      boot.source = "geo";
      if (/^[A-Z]{2}$/.test(geo)) boot.geoCountry = geo;
      u.searchParams.delete("cfc_geo");
      history.replaceState(history.state, "", u.pathname + u.search + u.hash);
    } else if (cfg.global && u.searchParams.has("edition")) {
      boot.source = "manual";
    }
  } catch (e) {}
})();
