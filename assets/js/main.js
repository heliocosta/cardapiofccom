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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSwitcher);
  } else {
    initSwitcher();
  }
})();
