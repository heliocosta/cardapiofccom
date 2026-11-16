export function initBanner(boot, store, onChoice) {
  var el = document.getElementById("cfc-consent");
  if (!el) return;
  var l2 = el.querySelector("[data-cfc-layer2]");
  var chk = el.querySelector("[data-cfc-check-analytics]");
  var title = document.getElementById("cfc-consent-title");
  var opener = null;
  function show(focus) {
    el.hidden = false;
    if (focus && title) title.focus();
  }
  function hide() {
    el.hidden = true;
    if (l2) l2.hidden = true;
    if (opener) { opener.focus(); opener = null; }
  }
  function choose(a) {
    store.save({ analytics: a });
    hide();
    onChoice();
  }
  el.addEventListener("click", function (e) {
    var b = e.target.closest("[data-cfc-act]");
    if (!b) return;
    var act = b.getAttribute("data-cfc-act");
    if (act === "accept") choose(true);
    else if (act === "reject") choose(false);
    else if (act === "customise" && l2) { l2.hidden = false; if (chk) chk.checked = store.current().analytics; }
    else if (act === "save") choose(!!(chk && chk.checked));
  });
  document.querySelectorAll("[data-cfc-consent-open]").forEach(function (b) {
    b.hidden = false;
    b.addEventListener("click", function () {
      opener = b;
      if (l2) l2.hidden = false;
      if (chk) chk.checked = store.current().analytics;
      show(true);
    });
  });
  if (boot.needsBanner) show(false);
}
