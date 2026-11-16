(function () {
  var form = document.querySelector("[data-cfc-search-form]");
  var input = document.getElementById("cfc-search-input");
  var statusEl = document.getElementById("cfc-search-status");
  var resultsEl = document.getElementById("cfc-search-results");
  if (!form || !input || !resultsEl) return;

  var indexUrl = form.getAttribute("data-index-url");
  var labels = {
    league: form.getAttribute("data-label-leagues") || "Leagues",
    team: form.getAttribute("data-label-teams") || "Teams",
    match: form.getAttribute("data-label-matches") || "Matches",
    empty: form.getAttribute("data-label-empty") || "No results found.",
    loading: form.getAttribute("data-label-loading") || "Loading...",
    error: form.getAttribute("data-label-error") || "Error loading search.",
    count: form.getAttribute("data-label-count") || "{count} result(s)",
  };
  var tz = form.getAttribute("data-edition-tz") || "UTC";
  var items = null;
  var loading = null;
  var timer = null;
  var trackTimer = null;
  var tracked = {};
  var activeIdx = -1;

  function norm(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }

  function loadIndex() {
    if (items) return Promise.resolve(items);
    if (loading) return loading;
    if (statusEl) statusEl.textContent = labels.loading;
    loading = fetch(indexUrl)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) {
        items = (Array.isArray(data) ? data : []).map(function (it) {
          var hay = [it.name, it.slug].concat(it.altNames || []);
          if (it.league && it.league.name) hay.push(it.league.name);
          it._hay = norm(hay.join(" "));
          return it;
        });
        return items;
      })
      .catch(function () {
        loading = null;
        if (statusEl) statusEl.textContent = labels.error;
        return null;
      });
    return loading;
  }

  function formatKickoff(iso) {
    if (!iso) return "";
    try {
      return new Intl.DateTimeFormat(document.documentElement.lang || "en", {
        timeZone: tz, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      }).format(new Date(iso));
    } catch (e) { return iso.slice(0, 16).replace("T", " "); }
  }

  function render(q) {
    resultsEl.textContent = "";
    activeIdx = -1;
    var nq = norm(q);
    if (nq.length < 2) {
      if (statusEl) statusEl.textContent = "";
      return;
    }
    var tokens = nq.split(/\s+/).filter(Boolean);
    var groups = { league: [], team: [], match: [] };
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var ok = true;
      for (var j = 0; j < tokens.length; j++) {
        if (it._hay.indexOf(tokens[j]) === -1) { ok = false; break; }
      }
      if (ok && groups[it.kind] && groups[it.kind].length < 20) groups[it.kind].push(it);
    }

    var total = groups.league.length + groups.team.length + groups.match.length;
    if (statusEl) {
      statusEl.textContent = total ? labels.count.replace("{count}", String(total)) : labels.empty;
    }
    if (!total) return;

    ["league", "team", "match"].forEach(function (kind) {
      var list = groups[kind];
      if (!list.length) return;
      var sec = document.createElement("div");
      sec.className = "cfc-search-group";
      var h = document.createElement("h2");
      h.className = "cfc-search-group__title";
      h.textContent = labels[kind];
      sec.appendChild(h);

      var ul = document.createElement("ul");
      ul.className = "cfc-search-list";
      list.forEach(function (it) {
        var li = document.createElement("li");
        var a = document.createElement("a");
        a.className = "cfc-card cfc-card--row cfc-search-item";
        a.href = it.url;
        if (it.crest) {
          var img = document.createElement("img");
          img.src = it.crest;
          img.alt = "";
          img.width = 24;
          img.height = 24;
          img.loading = "lazy";
          a.appendChild(img);
        }
        var name = document.createElement("span");
        name.className = "cfc-search-item__name";
        name.textContent = it.name;
        a.appendChild(name);
        if (it.kickoff || (it.league && it.league.name)) {
          var meta = document.createElement("span");
          meta.className = "cfc-search-item__meta";
          meta.textContent = [it.league && it.league.name, formatKickoff(it.kickoff)].filter(Boolean).join(" · ");
          a.appendChild(meta);
        }
        li.appendChild(a);
        ul.appendChild(li);
      });
      sec.appendChild(ul);
      resultsEl.appendChild(sec);
    });

    clearTimeout(trackTimer);
    trackTimer = setTimeout(function () {
      if (!tracked[nq]) {
        tracked[nq] = true;
        window.cfcq = window.cfcq || [];
        window.cfcq.push(["search", { search_term: nq, results_count: total }]);
      }
    }, 1000);
  }

  function syncUrl(q) {
    try {
      var u = new URL(location.href);
      if (q.trim()) u.searchParams.set("q", q.trim());
      else u.searchParams.delete("q");
      history.replaceState(history.state, "", u.pathname + u.search + u.hash);
    } catch (e) {}
  }

  function run(q) {
    loadIndex().then(function (data) { if (data) render(q); });
  }

  input.addEventListener("focus", function () { loadIndex(); });
  input.addEventListener("input", function () {
    var val = input.value;
    syncUrl(val);
    clearTimeout(timer);
    timer = setTimeout(function () { run(val); }, 200);
  });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    syncUrl(input.value);
    run(input.value);
  });

  document.addEventListener("keydown", function (e) {
    var links = resultsEl.querySelectorAll("a.cfc-search-item");
    if (!links.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIdx = (activeIdx + 1) % links.length;
      links[activeIdx].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIdx = activeIdx <= 0 ? links.length - 1 : activeIdx - 1;
      links[activeIdx].focus();
    } else if (e.key === "Escape") {
      activeIdx = -1;
      input.focus();
    }
  });

  var initQ = new URLSearchParams(location.search).get("q");
  if (initQ) {
    input.value = initQ;
    run(initQ);
  }
})();
