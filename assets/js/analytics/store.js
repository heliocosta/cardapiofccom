import { KEY, GA_COOKIES, toState } from "./shared.js";

export function createStore(boot, cfg) {
  function expire() {
    var host = location.hostname;
    var parts = host.split(".");
    var domains = ["", host];
    if (parts.length > 2) domains.push("." + parts.slice(-2).join("."));
    else domains.push("." + host);
    document.cookie.split(";").forEach(function (c) {
      var n = c.split("=")[0].trim();
      if (!GA_COOKIES.test(n)) return;
      domains.forEach(function (d) {
        document.cookie = n + "=; max-age=0; path=/" + (d ? "; domain=" + d : "");
      });
    });
  }
  return {
    // Decided choice applies; otherwise current default (implicit when no banner context).
    current: function () {
      var s = boot.stored;
      return { analytics: s ? !!s.a : !boot.needsBanner, decided: !!s };
    },
    save: function (choice) {
      var prev = this.current().analytics;
      var c = { v: 1, pv: cfg.pv, t: Date.now(), a: choice.analytics ? 1 : 0, m: 0 };
      boot.stored = c;
      boot.needsBanner = false;
      try {
        localStorage.setItem(KEY, JSON.stringify(c));
      } catch (e) {}
      window.gtag("consent", "update", toState(c));
      if (prev && !c.a) expire();
    },
  };
}
