// CardápioFC switcher enhancement and edition persistence
(function () {
  "use strict";

  function initSwitcher() {
    // Outside click closes details
    document.addEventListener("click", function (e) {
      var openSwitchers = document.querySelectorAll("details.cfc-switcher[open]");
      openSwitchers.forEach(function (details) {
        if (!details.contains(e.target)) {
          details.removeAttribute("open");
        }
      });
    });

    // Escape key closes details
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        var openSwitchers = document.querySelectorAll("details.cfc-switcher[open]");
        openSwitchers.forEach(function (details) {
          details.removeAttribute("open");
        });
      }
    });

    // Set cfc_edition cookie on choosing an edition
    document.addEventListener("click", function (e) {
      var link = e.target.closest("a[data-cfc-event='edition_switch']");
      if (link) {
        var targetEd = link.getAttribute("data-cfc-target-edition");
        if (targetEd) {
          document.cookie =
            "cfc_edition=" +
            encodeURIComponent(targetEd) +
            ";path=/;max-age=31536000;SameSite=Lax";
        }
      }
    });
  }


  function initLocalTime() {
    if (typeof Intl === "undefined" || !Intl.DateTimeFormat) return;
    var tz;
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (e) { return; }
    if (!tz) return;
    var lang = document.documentElement.lang || "en";
    var timeFmt = new Intl.DateTimeFormat(lang, { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false });
    var zoneFmt = new Intl.DateTimeFormat(lang, { timeZone: tz, timeZoneName: "short" });
    var offFmt = new Intl.DateTimeFormat("en", { timeZone: tz, timeZoneName: "shortOffset" });

    function tzPart(fmt, d) {
      var parts = fmt.formatToParts(d);
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === "timeZoneName") return parts[i].value;
      }
      return "";
    }

    var firstDate = null;
    document.querySelectorAll("time.cfc-kickoff-time[datetime]").forEach(function (el) {
      var d = new Date(el.getAttribute("datetime"));
      if (isNaN(d.getTime())) return;
      if (!firstDate) firstDate = d;
      var tSpan = el.querySelector(".cfc-kickoff-time__time");
      if (tSpan) tSpan.textContent = timeFmt.format(d);
      var zSpan = el.querySelector(".cfc-kickoff-time__zone");
      if (zSpan) {
        var shortName = tzPart(zoneFmt, d);
        var offset = tzPart(offFmt, d).replace("GMT", "UTC");
        zSpan.textContent = shortName + (offset ? " (" + offset + ")" : "");
      }
    });

    if (firstDate) {
      var label = tzPart(zoneFmt, firstDate);
      if (label) {
        document.querySelectorAll(".cfc-day-header__zone span").forEach(function (s) {
          s.textContent = label;
        });
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { initSwitcher(); initLocalTime(); });
  } else {
    initSwitcher();
    initLocalTime();
  }
})();
