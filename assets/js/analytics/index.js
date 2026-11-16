import * as params from "@params";
import { createStore } from "./store.js";
import { createLoader } from "./loaders.js";
import { createEvents } from "./events.js";
import { initBanner } from "./banner.js";

(function () {
  var node = document.getElementById("cfc-analytics-config");
  var rc = {};
  try { rc = JSON.parse(node.textContent); } catch (e) {}
  var cfg = window.__cfcCfg || {};
  // Fail safe when the head bootstrap is missing: treat as undecided with banner context.
  var boot = window.__cfc || { stored: null, bannerContext: true, needsBanner: true, source: null };
  if (!window.gtag) { window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments); }; }
  var store = createStore(boot, cfg);
  var loader = createLoader(boot, rc, store);
  var events = createEvents(params.events || {}, rc, boot, loader);
  initBanner(boot, store, function () { loader.evaluate(); events.flush(); });
  events.init();
  loader.evaluate();
})();
