const SENS = [/\S+@\S+/, /\d[\d\s().+-]{6,}/];

export function createEvents(vocab, rc, boot, loader) {
  var buf = [];
  function clean(spec, val) {
    if (val == null) return undefined;
    if (spec.type === "int") {
      var n = parseInt(val, 10);
      return n >= (spec.min || 0) ? n : undefined;
    }
    var v = String(val).replace(/\s+/g, " ").trim();
    if (spec.sanitize === "query") {
      v = v.toLowerCase();
      if (SENS.some(function (r) { return r.test(v); })) return undefined;
    }
    if (spec.enum) return spec.enum.indexOf(v) < 0 ? "other" : v;
    return spec.max ? v.slice(0, spec.max) : v;
  }
  function path(v) {
    return String(v || "").split(/[?#]/)[0].slice(0, 100);
  }
  function platform() {
    var u = navigator.userAgent;
    return /iPhone|iPad|iPod/.test(u) ? "ios" : /Android/.test(u) ? "android" : "other";
  }
  function build(name, raw, el) {
    var ev = vocab[name];
    if (!ev) return null;
    var out = {};
    Object.keys(ev.params).forEach(function (k) {
      var spec = ev.params[k];
      var val = raw[k];
      if (val === undefined && spec.attr && el) val = el.getAttribute("data-cfc-" + spec.attr);
      if (k === "app_path") val = val == null ? val : path(val);
      var c = clean(spec, val);
      if (c !== undefined && c !== "") out[k] = c;
    });
    (ev.derived || []).forEach(function (d) {
      if (d === "platform") out.platform = platform();
      else if (d === "from_edition") out.from_edition = rc.edition;
      else if (d === "landing_path") out.landing_path = path(location.pathname);
      else if (d === "link_domain" && el) {
        var a = el.closest("a[href]") || el;
        try { out.link_domain = new URL(a.getAttribute("href") || "", location.href).hostname; } catch (e) {}
      }
    });
    out.edition = rc.edition;
    out.page_type = rc.pageType;
    out.transport_type = "beacon";
    return out;
  }
  function send(name, params) {
    if (rc.env !== "production") console.info("[cfc-analytics]", name, params);
    if (!loader.allowed()) return;
    if (loader.gaReady() && rc.env === "production") return window.gtag("event", name, params);
    if (buf.length < 20) buf.push([name, params]);
  }
  function flush() {
    loader.onGaReady(function () {
      buf.splice(0).forEach(function (e) {
        if (rc.env === "production") window.gtag("event", e[0], e[1]);
      });
    });
  }
  function dispatch(name, raw, el) {
    var p = build(name, raw || {}, el);
    if (p) { send(name, p); flush(); }
  }
  return {
    init: function () {
      document.addEventListener("click", function (e) {
        var el = e.target && e.target.closest && e.target.closest("[data-cfc-event]");
        if (el) dispatch(el.getAttribute("data-cfc-event"), {}, el);
      }, true);
      var q = window.cfcq || [];
      var items = q.slice();
      q.length = 0;
      window.cfcq = { push: function (i) { dispatch(i[0], i[1]); } };
      items.forEach(function (i) { dispatch(i[0], i[1]); });
      if (boot.source === "geo") dispatch("geo_landing", { geo_country: boot.geoCountry });
    },
    flush: flush,
  };
}
