export function createLoader(boot, rc, store) {
  var failed = false, ready = false, started = false, cbs = [];
  var l = {
    allowed: function () {
      var c = store.current();
      return c.analytics && !!rc.ga4 && !failed;
    },
    gaReady: function () {
      return ready;
    },
    onGaReady: function (cb) {
      ready ? cb() : cbs.push(cb);
    },
    evaluate: function () {
      if (!l.allowed() || started) return;
      started = true;
      var go = function () {
        var p = { edition: rc.edition, page_type: rc.pageType, content_group: rc.pageType };
        if (boot.source) p.edition_source = boot.source;
        if (rc.env !== "production") {
          console.info("[cfc-analytics]", "load gtag.js", rc.ga4, p);
          ready = true;
          cbs.splice(0).forEach(function (f) { f(); });
          return;
        }
        var s = document.createElement("script");
        s.async = true;
        s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(rc.ga4);
        s.onerror = function () { failed = true; cbs.length = 0; };
        s.onload = function () {
          ready = true;
          cbs.splice(0).forEach(function (f) { f(); });
        };
        document.head.appendChild(s);
        window.gtag("js", new Date());
        window.gtag("config", rc.ga4, p);
      };
      var run = function () {
        window.requestIdleCallback ? requestIdleCallback(go, { timeout: 2000 }) : setTimeout(go, 200);
      };
      document.readyState === "complete" ? run() : addEventListener("load", run);
    },
  };
  return l;
}
