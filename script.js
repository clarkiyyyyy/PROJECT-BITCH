/* THREADLAB — site interactions
   Navigation, tools drawer, dashboard, thread simulator, learning labs.
   Vanilla JavaScript only: no backend, no database, no build step. */

(function () {
  "use strict";

  /* =========================================================
     Small helpers
     ========================================================= */
  function $(selector, ctx) {
    return (ctx || document).querySelector(selector);
  }

  function $$(selector, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(selector));
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  function oneDecimal(value) {
    return (Math.round(value * 10) / 10).toFixed(1);
  }

  function pad(value, size) {
    var text = String(value);
    while (text.length < size) {
      text = "0" + text;
    }
    return text;
  }

  /* mm:ss.mmm from a number of seconds */
  function formatClock(seconds) {
    var total = Math.max(0, seconds);
    var mins = Math.floor(total / 60);
    var secs = Math.floor(total % 60);
    var millis = Math.floor((total - Math.floor(total)) * 1000);
    return pad(mins, 2) + ":" + pad(secs, 2) + "." + pad(millis, 3);
  }

  function randomBetween(min, max) {
    return Math.round((min + Math.random() * (max - min)) * 2) / 2;
  }

  function logLine(container, timeText, message, soft) {
    if (!container) return;
    var line = document.createElement("p");
    line.className = "log-line";

    if (timeText) {
      var time = document.createElement("span");
      time.className = "log-time";
      time.textContent = timeText;
      line.appendChild(time);
    }

    var text = document.createElement("span");
    text.className = "log-msg" + (soft ? " log-msg--soft" : "");
    text.textContent = message;
    line.appendChild(text);

    container.appendChild(line);
    container.scrollTop = container.scrollHeight;
  }

  function setBusy(button, busy, label) {
    if (!button) return;
    button.disabled = busy;
    if (busy && label) {
      button.dataset.idleLabel = button.textContent;
      button.textContent = label;
    } else if (!busy && button.dataset.idleLabel) {
      button.textContent = button.dataset.idleLabel;
    }
  }

  /* =========================================================
     Local storage — saveProgress() / loadProgress()
     ========================================================= */
  var STORAGE_KEY = "threadlab.state.v1";

  var TOPIC_IDS = [
    "concepts",
    "threads-vs-processes",
    "context-switch",
    "synchronization",
    "race-condition",
    "deadlock",
    "python"
  ];

  var EXTRA_CONCEPT_IDS = [
    "race-condition",
    "deadlock",
    "python",
    "gil",
    "workloads",
    "lifecycle",
    "best-practices"
  ];

  var TOOL_IDS = [
    "dashboard",
    "simulator",
    "race-lab",
    "deadlock-lab",
    "lifecycle-lab",
    "context-switch-lab"
  ];

  var defaultState = function () {
    return {
      concepts: 6,
      sims: 0,
      threads: 0,
      quiz: 0,
      progress: ["concepts", "threads-vs-processes", "context-switch"],
      conceptsRead: [],
      tools: [],
      activity: [],
      badges: {},
      modes: {},
      flags: {}
    };
  };

  var state = defaultState();

  function loadProgress() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        state = Object.assign(defaultState(), parsed || {});
      }
    } catch (error) {
      state = defaultState();
    }
    return state;
  }

  function saveProgress() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      /* storage unavailable — the site keeps working in memory */
    }
  }

  /* =========================================================
     Existing behaviour: mobile navigation
     ========================================================= */
  var toggle = $(".nav-toggle");
  var nav = $(".primary-nav");

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
    });

    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Open navigation menu");
      });
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && nav.classList.contains("is-open")) {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.focus();
      }
    });
  }

  /* =========================================================
     Existing behaviour: active section highlight
     ========================================================= */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll(".nav-link"));
  var sections = navLinks
    .map(function (link) {
      return document.querySelector(link.getAttribute("href"));
    })
    .filter(Boolean);

  function highlight() {
    var position = window.scrollY + 140;
    var currentId = sections.length ? sections[0].id : "";

    sections.forEach(function (section) {
      if (section.offsetTop <= position) {
        currentId = section.id;
      }
    });

    navLinks.forEach(function (link) {
      var active = link.getAttribute("href") === "#" + currentId;
      link.classList.toggle("is-active", active);
      if (active) {
        link.setAttribute("aria-current", "true");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  /* Marks every learning section the reader has scrolled past. */
  function markScrolledSections() {
    var position = window.scrollY + 240;
    TOPIC_IDS.concat(TOOL_IDS).forEach(function (id) {
      var el = document.getElementById(id);
      if (el && el.offsetTop <= position) rememberSection(id);
    });
  }

  if (sections.length) {
    highlight();
    window.addEventListener("scroll", highlight, { passive: true });
    window.addEventListener("resize", highlight);
  }

  /* =========================================================
     Existing behaviour: quiz answers
     ========================================================= */
  var quizButtons = $$(".quiz-toggle");

  quizButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      var answer = button.nextElementSibling;
      if (!answer) return;

      var isOpen = !answer.hasAttribute("hidden");
      if (isOpen) {
        answer.setAttribute("hidden", "");
        button.textContent = "Show Answer";
        button.setAttribute("aria-expanded", "false");
      } else {
        answer.removeAttribute("hidden");
        button.textContent = "Hide Answer";
        button.setAttribute("aria-expanded", "true");
      }

      var revealed = quizButtons.filter(function (item) {
        var panel = item.nextElementSibling;
        return panel && !panel.hasAttribute("hidden");
      }).length;

      var percent = quizButtons.length
        ? Math.round((revealed / quizButtons.length) * 100)
        : 0;

      if (percent > state.quiz) {
        state.quiz = percent;
        saveProgress();
        updateDashboard();
      }
    });
  });

  /* =========================================================
     Existing behaviour: copy code
     ========================================================= */
  document.querySelectorAll("[data-copy-target]").forEach(function (button) {
    button.addEventListener("click", function () {
      var target = document.getElementById(button.getAttribute("data-copy-target"));
      if (!target) return;

      var text = target.textContent;
      var done = function () {
        var original = button.textContent;
        button.textContent = "Copied";
        window.setTimeout(function () {
          button.textContent = original;
        }, 1600);
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function () {
          fallbackCopy(text, done);
        });
      } else {
        fallbackCopy(text, done);
      }
    });
  });

  function fallbackCopy(text, callback) {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "absolute";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand("copy");
      callback();
    } catch (error) {
      /* clipboard unavailable — silently ignore */
    }
    document.body.removeChild(area);
  }

  /* =========================================================
     Tools drawer — openToolsMenu() / closeToolsMenu()
     ========================================================= */
  var toolsToggle = $(".tools-toggle");
  var drawer = $("#tools-drawer");
  var drawerOverlay = $("[data-drawer-overlay]");
  var drawerClose = $(".drawer-close");
  var drawerReturnFocus = null;

  function openToolsMenu() {
    if (!drawer) return;
    drawerReturnFocus = document.activeElement;
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    if (drawerOverlay) drawerOverlay.classList.add("is-open");
    if (toolsToggle) toolsToggle.setAttribute("aria-expanded", "true");
    document.body.classList.add("drawer-open");
    if (drawerClose) drawerClose.focus();
  }

  function closeToolsMenu() {
    if (!drawer) return;
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    if (drawerOverlay) drawerOverlay.classList.remove("is-open");
    if (toolsToggle) toolsToggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("drawer-open");
    if (drawerReturnFocus && drawerReturnFocus.focus) {
      drawerReturnFocus.focus();
    }
  }

  if (toolsToggle) {
    toolsToggle.addEventListener("click", function () {
      if (drawer && drawer.classList.contains("is-open")) {
        closeToolsMenu();
      } else {
        openToolsMenu();
      }
    });
  }

  if (drawerClose) drawerClose.addEventListener("click", closeToolsMenu);
  if (drawerOverlay) drawerOverlay.addEventListener("click", closeToolsMenu);

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && drawer && drawer.classList.contains("is-open")) {
      closeToolsMenu();
    }
  });

  if (drawer) {
    $$(".drawer-item", drawer).forEach(function (item) {
      item.addEventListener("click", function () {
        var target = item.getAttribute("href");
        if (target && target.charAt(0) === "#") {
          rememberSection(target.slice(1));
        }
        closeToolsMenu();
      });
    });
  }

  /* =========================================================
     Dashboard — updateDashboard()
     ========================================================= */
  function rememberSection(id) {
    if (!id) return;
    var changed = false;

    if (TOPIC_IDS.indexOf(id) !== -1 && state.progress.indexOf(id) === -1) {
      state.progress.push(id);
      changed = true;
    }

    if (EXTRA_CONCEPT_IDS.indexOf(id) !== -1 && state.conceptsRead.indexOf(id) === -1) {
      state.conceptsRead.push(id);
      state.concepts = Math.min(12, 6 + state.conceptsRead.length);
      changed = true;
    }

    if (TOOL_IDS.indexOf(id) !== -1 && state.tools.indexOf(id) === -1) {
      state.tools.push(id);
      changed = true;
    }

    if (changed) {
      saveProgress();
      updateDashboard();
    }
  }

  function timeAgo(timestamp) {
    var seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
    if (seconds < 60) return "just now";
    var minutes = Math.round(seconds / 60);
    if (minutes < 60) return minutes + " minute" + (minutes === 1 ? "" : "s") + " ago";
    var hours = Math.round(minutes / 60);
    if (hours < 24) return hours + " hour" + (hours === 1 ? "" : "s") + " ago";
    return Math.round(hours / 24) + " day" + (Math.round(hours / 24) === 1 ? "" : "s") + " ago";
  }

  function logActivity(title, detail, status) {
    state.activity.unshift({
      title: title,
      detail: detail,
      status: status,
      at: Date.now()
    });
    state.activity = state.activity.slice(0, 6);
    saveProgress();
    updateDashboard();
  }

  function checkBadges() {
    var badges = state.badges;

    if (state.sims >= 1 && !badges["first-sim"]) badges["first-sim"] = true;
    if (state.modes.concurrent && state.modes.sequential && !badges.concurrency) {
      badges.concurrency = true;
    }
    if (state.flags.lock && !badges.lock) badges.lock = true;
    if (state.flags.deadlock && !badges.deadlock) badges.deadlock = true;

    var openedAll = TOOL_IDS.every(function (id) {
      return state.tools.indexOf(id) !== -1;
    });
    if (openedAll && !badges.explorer) badges.explorer = true;
  }

  function updateDashboard() {
    checkBadges();

    var totalTopics = TOPIC_IDS.length;
    var done = state.progress.filter(function (id) {
      return TOPIC_IDS.indexOf(id) !== -1;
    }).length;
    var percent = Math.round((done / totalTopics) * 100);

    var setText = function (id, value) {
      var el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    setText("stat-concepts", String(state.concepts));
    setText("stat-sims", String(state.sims));
    setText("stat-quiz", state.quiz + "%");
    setText("stat-threads", String(state.threads));
    setText("progress-percent", percent + "%");

    var fill = document.getElementById("progress-fill");
    if (fill) fill.style.width = percent + "%";

    $$("#progress-topics .progress-topic").forEach(function (item) {
      var id = item.getAttribute("data-topic");
      item.classList.toggle("is-done", state.progress.indexOf(id) !== -1);
    });

    var nextTopic = TOPIC_IDS.filter(function (id) {
      return state.progress.indexOf(id) === -1;
    })[0];

    var topicNames = {
      concepts: "Introduction to Threads",
      "threads-vs-processes": "Threads vs Processes",
      "context-switch": "Context Switching",
      synchronization: "Synchronization",
      "race-condition": "Race Conditions",
      deadlock: "Deadlocks",
      python: "Python Threading"
    };

    setText(
      "dash-focus",
      nextTopic ? topicNames[nextTopic] || nextTopic : "All topics completed"
    );

    var activityList = document.getElementById("activity-list");
    if (activityList) {
      activityList.innerHTML = "";
      if (!state.activity.length) {
        var empty = document.createElement("li");
        empty.className = "activity-empty";
        empty.textContent = "No activity yet. Run a simulation to get started.";
        activityList.appendChild(empty);
      } else {
        state.activity.forEach(function (entry) {
          var item = document.createElement("li");
          item.className = "activity-item";

          var title = document.createElement("span");
          title.className = "activity-title";
          title.textContent = entry.title;

          var status = document.createElement("span");
          status.className = "activity-status";
          status.textContent = entry.status;

          var detail = document.createElement("span");
          detail.className = "activity-detail";
          detail.textContent = entry.detail;

          var time = document.createElement("span");
          time.className = "activity-time";
          time.textContent = timeAgo(entry.at);

          item.appendChild(title);
          item.appendChild(status);
          item.appendChild(detail);
          item.appendChild(time);
          activityList.appendChild(item);
        });
      }
    }

    $$("#badge-list .badge-item").forEach(function (item) {
      var key = item.getAttribute("data-badge");
      item.classList.toggle("is-unlocked", Boolean(state.badges[key]));
    });
  }

  var activityClear = $("#activity-clear");
  if (activityClear) {
    activityClear.addEventListener("click", function () {
      state.activity = [];
      saveProgress();
      updateDashboard();
    });
  }

  /* =========================================================
     Radio card highlight (shared by every control panel)
     ========================================================= */
  function syncRadioCards() {
    $$(".radio-row").forEach(function (row) {
      $$("input[type=radio]", row).forEach(function (input) {
        var card = input.closest(".radio-card");
        if (card) card.classList.toggle("is-checked", input.checked);
      });
    });
  }

  $$(".radio-row input[type=radio]").forEach(function (input) {
    input.addEventListener("change", syncRadioCards);
  });

  /* =========================================================
     Thread simulator
     ========================================================= */
  var sim = {
    running: false,
    paused: false,
    mode: "concurrent",
    threads: [],
    start: 0,
    pausedAt: 0,
    pausedTotal: 0,
    timer: null,
    timers: [],
    total: 0,
    selected: null,
    durations: null
  };

  var monitor = $("#thread-monitor");
  var monitorEmpty = $("#monitor-empty");
  var execLog = $("#exec-log");
  var stl = $("#stl");
  var startBtn = $("#sim-start");
  var pauseBtn = $("#sim-pause");
  var resetBtn = $("#sim-reset");

  function currentMode() {
    var checked = document.querySelector('input[name="sim-mode"]:checked');
    return checked ? checked.value : "concurrent";
  }

  function readConfig() {
    var countInput = $("#threads-count");
    var minInput = $("#min-delay");
    var maxInput = $("#max-delay");
    var count = clamp(parseInt(countInput ? countInput.value : "5", 10) || 5, 1, 10);
    var min = parseFloat(minInput ? minInput.value : "1") || 1;
    var max = parseFloat(maxInput ? maxInput.value : "3") || 3;
    if (max < min) max = min;
    return { count: count, min: min, max: max };
  }

  function makeDurations(count, min, max) {
    var list = [];
    for (var i = 0; i < count; i += 1) {
      list.push(randomBetween(min, max));
    }
    return list;
  }

  function elapsedSeconds() {
    if (!sim.start) return 0;
    var base = window.performance.now() - sim.start;
    if (sim.paused) base -= window.performance.now() - sim.pausedAt;
    return Math.max(0, (base - sim.pausedTotal) / 1000);
  }

  function addLog(message, soft) {
    logLine(execLog, formatClock(elapsedSeconds()), message, soft);
  }

  function setModeLabel() {
    var label = $("#sim-mode-label");
    if (label) {
      label.textContent = currentMode() === "sequential" ? "Sequential mode" : "Concurrent mode";
    }
  }

  function clearSimTimers() {
    sim.timers.forEach(function (id) {
      window.clearTimeout(id);
    });
    sim.timers = [];
    if (sim.timer) {
      window.clearInterval(sim.timer);
      sim.timer = null;
    }
  }

  /* createThread(id, duration, offset) — builds one monitor row + timeline row */
  function createThread(id, duration, offset) {
    var name = "Thread " + pad(id, 2);
    var waitFrom = duration * (0.3 + Math.random() * 0.12);
    var waitTo = waitFrom + duration * (0.28 + Math.random() * 0.14);

    var thread = {
      id: id,
      name: name,
      duration: duration,
      start: offset,
      waitFrom: Math.min(waitFrom, duration * 0.7),
      waitTo: Math.min(waitTo, duration * 0.9),
      status: "ready",
      startedAt: null,
      endedAt: null,
      order: null,
      flagged: {},
      el: null,
      fill: null,
      meta: null,
      chip: null,
      bar: null
    };

    /* monitor row */
    var row = document.createElement("button");
    row.type = "button";
    row.className = "sim-thread";
    row.setAttribute("data-thread", String(id));

    var top = document.createElement("span");
    top.className = "sim-thread-top";

    var nameEl = document.createElement("span");
    nameEl.className = "sim-thread-name";
    nameEl.textContent = name;

    var chip = document.createElement("span");
    chip.className = "status-chip status-chip--ready";
    chip.textContent = "Ready";

    top.appendChild(nameEl);
    top.appendChild(chip);

    var bottom = document.createElement("span");
    bottom.className = "sim-thread-bottom";

    var bar = document.createElement("span");
    bar.className = "sim-thread-bar";
    var fill = document.createElement("span");
    fill.className = "sim-thread-fill";
    bar.appendChild(fill);

    var meta = document.createElement("span");
    meta.className = "sim-thread-meta";
    meta.textContent = "0.0s / " + oneDecimal(duration) + "s";

    bottom.appendChild(bar);
    bottom.appendChild(meta);

    row.appendChild(top);
    row.appendChild(bottom);

    row.addEventListener("click", function () {
      showThreadDetail(thread, row);
    });

    if (monitor) {
      if (monitorEmpty) monitorEmpty.setAttribute("hidden", "");
      monitor.appendChild(row);
    }

    thread.el = row;
    thread.fill = fill;
    thread.meta = meta;
    thread.chip = chip;
    thread.bar = bar;

    /* timeline row */
    if (stl) {
      var stlEmpty = $("#stl-empty");
      if (stlEmpty) stlEmpty.setAttribute("hidden", "");

      var stlRow = document.createElement("div");
      stlRow.className = "stl-row";

      var label = document.createElement("span");
      label.className = "stl-label";
      label.textContent = name;

      var track = document.createElement("div");
      track.className = "stl-track";
      var stlBar = document.createElement("span");
      stlBar.className = "stl-bar";
      track.appendChild(stlBar);

      stlRow.appendChild(label);
      stlRow.appendChild(track);
      stl.appendChild(stlRow);

      thread.bar = stlBar;
    }

    sim.threads.push(thread);
    addLog(name + " created", true);
    return thread;
  }

  function setThreadStatus(thread, status, atTime) {
    if (thread.status === status) return;
    thread.status = status;

    var labels = {
      ready: "Ready",
      running: "Running",
      waiting: "Waiting",
      completed: "Completed"
    };

    if (thread.chip) {
      thread.chip.textContent = labels[status];
      thread.chip.className = "status-chip status-chip--" + status;
    }

    if (thread.el) {
      thread.el.classList.toggle("is-done", status === "completed");
    }

    if (status === "running" && !thread.flagged.started) {
      thread.flagged.started = true;
      thread.startedAt = atTime;
      addLog(thread.name + " started");
    } else if (status === "waiting" && !thread.flagged.waiting) {
      thread.flagged.waiting = true;
      addLog(thread.name + " waiting", true);
    } else if (status === "completed" && !thread.flagged.completed) {
      thread.flagged.completed = true;
      thread.endedAt = atTime;
      thread.order = sim.threads.filter(function (item) {
        return item.order !== null;
      }).length + 1;
      addLog(thread.name + " completed");
    }

    updateCounters();
  }

  /* updateThreadProgress() — one animation frame of the whole monitor */
  function updateThreadProgress() {
    var time = elapsedSeconds();
    var completed = 0;

    sim.threads.forEach(function (thread) {
      var local = time - thread.start;
      var status;

      if (local < 0) status = "ready";
      else if (local >= thread.duration) status = "completed";
      else if (local >= thread.waitFrom && local <= thread.waitTo) status = "waiting";
      else status = "running";

      if (status !== thread.status) setThreadStatus(thread, status, Math.max(0, local));
      if (status === "completed") completed += 1;

      var progress = clamp((local / thread.duration) * 100, 0, 100);
      if (thread.fill) thread.fill.style.width = progress + "%";
      if (thread.meta) {
        thread.meta.textContent =
          status === "completed"
            ? oneDecimal(thread.duration) + "s"
            : oneDecimal(Math.max(0, local)) + "s / " + oneDecimal(thread.duration) + "s";
      }

      if (thread.bar) {
        thread.bar.style.left = (thread.start / sim.total) * 100 + "%";
        thread.bar.style.width =
          (clamp(local, 0, thread.duration) / sim.total) * 100 + "%";
        thread.bar.classList.toggle("is-done", status === "completed");
      }
    });

    updateCounters();

    if (sim.selected) fillThreadDetail(sim.selected);

    if (completed === sim.threads.length && sim.threads.length > 0) {
      finishSimulation();
    }
  }

  function updateCounters() {
    var counts = { running: 0, waiting: 0, completed: 0 };
    sim.threads.forEach(function (thread) {
      if (thread.status === "running") counts.running += 1;
      else if (thread.status === "waiting") counts.waiting += 1;
      else if (thread.status === "completed") counts.completed += 1;
    });

    var setText = function (id, value) {
      var el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    setText("count-total", String(sim.threads.length));
    setText("count-running", String(counts.running));
    setText("count-waiting", String(counts.waiting));
    setText("count-completed", String(counts.completed));
    setText("count-elapsed", oneDecimal(elapsedSeconds()) + "s");
  }

  function buildTimelineScale(total) {
    if (!stl) return;
    var old = $(".stl-scale", stl);
    if (old) old.parentNode.removeChild(old);

    var scale = document.createElement("div");
    scale.className = "stl-scale";

    var step = total > 8 ? 2 : 1;
    for (var s = 0; s <= Math.ceil(total); s += step) {
      var tick = document.createElement("span");
      tick.className = "stl-tick";
      tick.style.left = (s / total) * 100 + "%";
      tick.textContent = s + "s";
      scale.appendChild(tick);
    }
    stl.insertBefore(scale, stl.firstChild);
  }

  function showThreadDetail(thread, row) {
    sim.selected = thread;
    $$(".sim-thread").forEach(function (item) {
      item.classList.remove("is-selected");
    });
    if (row) row.classList.add("is-selected");
    var panel = $("#thread-detail");
    if (panel) panel.removeAttribute("hidden");
    fillThreadDetail(thread);
  }

  function fillThreadDetail(thread) {
    if (!thread) return;
    var setText = function (id, value) {
      var el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    var labels = {
      ready: "Ready",
      running: "Running",
      waiting: "Waiting",
      completed: "Completed"
    };

    setText("detail-name", thread.name);
    setText("detail-state", labels[thread.status]);
    setText("detail-duration", oneDecimal(thread.duration) + " seconds");
    setText(
      "detail-started",
      thread.startedAt === null ? "Not started" : formatClock(thread.start + thread.startedAt)
    );
    setText(
      "detail-finished",
      thread.endedAt === null ? "Not yet" : formatClock(thread.start + thread.endedAt)
    );

    if (thread.order === null) {
      setText("detail-order", "Not completed");
    } else {
      var suffix = ["th", "st", "nd", "rd"];
      var mod = thread.order % 100;
      setText(
        "detail-order",
        thread.order + (suffix[(mod - 20) % 10] || suffix[mod] || suffix[0]) + " thread completed"
      );
    }
  }

  var detailClose = $("#detail-close");
  if (detailClose) {
    detailClose.addEventListener("click", function () {
      var panel = $("#thread-detail");
      if (panel) panel.setAttribute("hidden", "");
      sim.selected = null;
      $$(".sim-thread").forEach(function (item) {
        item.classList.remove("is-selected");
      });
    });
  }

  /* startSimulation() */
  function startSimulation(options) {
    options = options || {};
    if (sim.running) return;

    var config = readConfig();
    var mode = options.mode || currentMode();
    var durations = options.durations || makeDurations(config.count, config.min, config.max);

    resetSimulation(true);

    sim.mode = mode;
    sim.durations = durations.slice();
    sim.running = true;
    sim.paused = false;
    sim.threads = [];
    sim.selected = null;
    sim.pausedTotal = 0;
    sim.total =
      mode === "sequential"
        ? durations.reduce(function (sum, value) { return sum + value; }, 0)
        : Math.max.apply(null, durations);

    setModeLabel();

    if (stl) buildTimelineScale(sim.total);
    addLog("Simulation started");
    addLog(mode === "sequential" ? "Sequential mode selected" : "Concurrent mode selected", true);

    var offset = 0;
    durations.forEach(function (duration, index) {
      var startOffset = offset;
      if (mode === "sequential") offset += duration;

      sim.timers.push(
        window.setTimeout(function () {
          createThread(index + 1, duration, startOffset);
        }, index * 18)
      );
    });

    sim.start = window.performance.now();
    sim.timer = window.setInterval(updateThreadProgress, 90);

    if (startBtn) {
      startBtn.disabled = true;
      startBtn.textContent = "Running\u2026";
    }
    if (pauseBtn) pauseBtn.disabled = false;
  }

  /* pause / resume */
  function togglePause() {
    if (!sim.running || !pauseBtn) return;
    if (!sim.paused) {
      sim.paused = true;
      sim.pausedAt = window.performance.now();
      pauseBtn.textContent = "Resume Simulation";
      addLog("Simulation paused");
    } else {
      sim.pausedTotal += window.performance.now() - sim.pausedAt;
      sim.paused = false;
      pauseBtn.textContent = "Pause Simulation";
      addLog("Simulation resumed");
    }
  }

  /* resetSimulation(silent) */
  function resetSimulation(silent) {
    clearSimTimers();
    sim.running = false;
    sim.paused = false;
    sim.pausedAt = 0;
    sim.start = 0;
    sim.threads = [];
    sim.selected = null;
    sim.total = 0;

    if (monitor) {
      $$(".sim-thread", monitor).forEach(function (row) {
        row.parentNode.removeChild(row);
      });
      if (monitorEmpty) monitorEmpty.removeAttribute("hidden");
    }

    if (stl) {
      $$(".stl-row, .stl-scale", stl).forEach(function (row) {
        row.parentNode.removeChild(row);
      });
      var stlEmpty = $("#stl-empty");
      if (stlEmpty) stlEmpty.removeAttribute("hidden");
    }

    var detail = $("#thread-detail");
    if (detail) detail.setAttribute("hidden", "");

    ["sim-comparison", "sim-result"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.setAttribute("hidden", "");
    });

    if (startBtn) {
      startBtn.disabled = false;
      startBtn.textContent = "Start Threads";
    }
    if (pauseBtn) {
      pauseBtn.disabled = false;
      pauseBtn.textContent = "Pause Simulation";
    }

    updateCounters();

    if (!silent) {
      if (execLog) execLog.innerHTML = "";
      addLog("Simulation reset");
    }
  }

  function finishSimulation() {
    if (!sim.running) return;
    clearSimTimers();
    sim.running = false;
    sim.paused = false;

    var durations = sim.threads.map(function (thread) { return thread.duration; });
    var sum = durations.reduce(function (total, value) { return total + value; }, 0);
    var slowest = Math.max.apply(null, durations);
    var actual = elapsedSeconds();
    var concurrentTime = sim.mode === "concurrent" ? actual : slowest;
    var sequentialTime = sum;

    addLog("All threads completed");

    if (startBtn) {
      startBtn.disabled = false;
      startBtn.textContent = "Start Threads";
    }
    if (pauseBtn) {
      pauseBtn.disabled = false;
      pauseBtn.textContent = "Pause Simulation";
    }

    var setText = function (id, value) {
      var el = document.getElementById(id);
      if (el) el.textContent = value;
    };

    setText("cmp-concurrent", oneDecimal(concurrentTime) + "s");
    setText("cmp-sequential", oneDecimal(sequentialTime) + "s");
    setText("cmp-work", oneDecimal(sum) + "s");

    setText("result-summary", sim.threads.length + " threads successfully completed.");
    setText("result-concurrent", oneDecimal(concurrentTime) + " seconds");
    setText("result-work", oneDecimal(sum) + " seconds");
    setText(
      "result-explanation",
      sim.mode === "concurrent"
        ? "Although the total work represented " +
            oneDecimal(sum) +
            " seconds of individual task time, the tasks overlapped during concurrent execution. " +
            "This reduced the overall elapsed time to " +
            oneDecimal(concurrentTime) +
            " seconds."
        : "In sequential mode every thread waited for the previous one, so the elapsed time equals " +
            "the sum of the individual durations. Running the same threads concurrently would finish in " +
            oneDecimal(slowest) +
            " seconds."
    );

    var comparison = $("#sim-comparison");
    var result = $("#sim-result");
    if (comparison) comparison.removeAttribute("hidden");
    if (result) result.removeAttribute("hidden");

    registerSimulation(sim.threads.length, sim.mode);
  }

  function registerSimulation(threadCount, mode) {
    state.sims += 1;
    state.threads += threadCount;
    state.modes[mode] = true;
    saveProgress();

    logActivity(
      "Thread Simulation",
      threadCount + " thread" + (threadCount === 1 ? "" : "s") + " \u2022 " + (mode === "sequential" ? "Sequential" : "Concurrent"),
      "Completed"
    );
  }

  if (startBtn) {
    startBtn.addEventListener("click", function () {
      startSimulation({ mode: currentMode() });
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      resetSimulation(false);
    });
  }

  if (pauseBtn) pauseBtn.addEventListener("click", togglePause);

  var againBtn = $("#result-again");
  if (againBtn) {
    againBtn.addEventListener("click", function () {
      var result = $("#sim-result");
      if (result) result.setAttribute("hidden", "");
      startSimulation({ mode: sim.mode });
      if (monitor) monitor.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  var sequentialBtn = $("#result-sequential");
  if (sequentialBtn) {
    sequentialBtn.addEventListener("click", function () {
      var radio = document.querySelector('input[name="sim-mode"][value="sequential"]');
      if (radio) {
        radio.checked = true;
        syncRadioCards();
        setModeLabel();
      }
      var result = $("#sim-result");
      if (result) result.setAttribute("hidden", "");
      startSimulation({ mode: "sequential", durations: sim.durations });
      if (monitor) monitor.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  /* configuration controls */
  var threadsCount = $("#threads-count");
  var threadsMinus = $("#threads-minus");
  var threadsPlus = $("#threads-plus");

  function setThreadCount(value) {
    if (!threadsCount) return;
    threadsCount.value = String(clamp(value, 1, 10));
  }

  if (threadsMinus) {
    threadsMinus.addEventListener("click", function () {
      setThreadCount((parseInt(threadsCount.value, 10) || 5) - 1);
    });
  }

  if (threadsPlus) {
    threadsPlus.addEventListener("click", function () {
      setThreadCount((parseInt(threadsCount.value, 10) || 5) + 1);
    });
  }

  if (threadsCount) {
    threadsCount.addEventListener("change", function () {
      setThreadCount(parseInt(threadsCount.value, 10) || 5);
    });
  }

  var minDelay = $("#min-delay");
  var maxDelay = $("#max-delay");

  function syncDelays(changed) {
    var min = parseFloat(minDelay.value);
    var max = parseFloat(maxDelay.value);
    if (max < min) {
      if (changed === "min") maxDelay.value = String(min);
      else minDelay.value = String(max);
    }
    var minOut = $("#min-delay-out");
    var maxOut = $("#max-delay-out");
    if (minOut) minOut.textContent = String(parseFloat(minDelay.value));
    if (maxOut) maxOut.textContent = String(parseFloat(maxDelay.value));
  }

  if (minDelay) minDelay.addEventListener("input", function () { syncDelays("min"); });
  if (maxDelay) maxDelay.addEventListener("input", function () { syncDelays("max"); });

  $$('input[name="sim-mode"]').forEach(function (input) {
    input.addEventListener("change", setModeLabel);
  });

  var logClear = $("#log-clear");
  if (logClear) {
    logClear.addEventListener("click", function () {
      if (execLog) execLog.innerHTML = "";
      logLine(execLog, "00:00.000", "Log cleared", true);
    });
  }

  /* =========================================================
     Custom thread experiment
     ========================================================= */
  var expTasks = [
    { name: "Download File", duration: 3 },
    { name: "Fetch API", duration: 2 },
    { name: "Save Database", duration: 1 }
  ];

  var expList = $("#exp-list");
  var expRunning = false;

  function renderExpTasks() {
    if (!expList) return;
    expList.innerHTML = "";

    expTasks.forEach(function (task, index) {
      var row = document.createElement("div");
      row.className = "exp-row";

      var tag = document.createElement("span");
      tag.className = "exp-tag";
      tag.textContent = "TASK " + pad(index + 1, 2);

      var nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "exp-input";
      nameInput.value = task.name;
      nameInput.setAttribute("aria-label", "Task " + (index + 1) + " name");
      nameInput.addEventListener("input", function () {
        task.name = nameInput.value || "Task " + (index + 1);
      });

      var durationWrap = document.createElement("span");
      durationWrap.className = "exp-duration";
      var durationInput = document.createElement("input");
      durationInput.type = "number";
      durationInput.className = "exp-input";
      durationInput.min = "1";
      durationInput.max = "5";
      durationInput.step = "1";
      durationInput.value = String(task.duration);
      durationInput.setAttribute("aria-label", "Task " + (index + 1) + " duration in seconds");
      durationInput.addEventListener("change", function () {
        task.duration = clamp(parseFloat(durationInput.value) || 2, 1, 5);
        durationInput.value = String(task.duration);
      });
      var unit = document.createElement("span");
      unit.textContent = "sec";
      durationWrap.appendChild(durationInput);
      durationWrap.appendChild(unit);

      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "exp-remove";
      remove.textContent = "\u00D7";
      remove.setAttribute("aria-label", "Delete task " + (index + 1));
      remove.addEventListener("click", function () {
        if (expTasks.length <= 1) return;
        expTasks.splice(index, 1);
        renderExpTasks();
      });

      row.appendChild(tag);
      row.appendChild(nameInput);
      row.appendChild(durationWrap);
      row.appendChild(remove);
      expList.appendChild(row);
    });

    var count = $("#exp-count");
    if (count) count.textContent = expTasks.length + " of 10 tasks";
  }

  function addTask() {
    if (expTasks.length >= 10) return;
    expTasks.push({
      name: "Task " + (expTasks.length + 1),
      duration: 2
    });
    renderExpTasks();
  }

  function runExperiment(tasks) {
    if (expRunning) return;
    var list = tasks || expTasks;
    if (!list.length) return;

    expRunning = true;
    var results = $("#exp-results");
    var rows = $("#exp-result-rows");
    if (results) results.removeAttribute("hidden");
    if (rows) rows.innerHTML = "";

    var entries = list.map(function (task, index) {
      var wrap = document.createElement("div");
      wrap.className = "exp-result";

      var top = document.createElement("div");
      top.className = "exp-result-top";

      var name = document.createElement("span");
      name.className = "exp-result-name";
      name.textContent = task.name;

      var chip = document.createElement("span");
      chip.className = "status-chip status-chip--ready";
      chip.textContent = "Running";

      top.appendChild(name);
      top.appendChild(chip);

      var bar = document.createElement("span");
      bar.className = "sim-thread-bar";
      bar.style.display = "block";
      bar.style.marginTop = "4px";
      var fill = document.createElement("span");
      fill.className = "sim-thread-fill";
      bar.appendChild(fill);

      wrap.appendChild(top);
      wrap.appendChild(bar);
      if (rows) rows.appendChild(wrap);

      return { task: task, chip: chip, fill: fill, done: false, index: index };
    });

    var total = Math.max.apply(
      null,
      entries.map(function (entry) { return entry.task.duration; })
    );
    var started = window.performance.now();

    var timer = window.setInterval(function () {
      var time = (window.performance.now() - started) / 1000;
      var finished = 0;

      entries.forEach(function (entry) {
        var progress = clamp((time / entry.task.duration) * 100, 0, 100);
        entry.fill.style.width = progress + "%";
        if (progress >= 100 && !entry.done) {
          entry.done = true;
          entry.chip.textContent = "Completed";
          entry.chip.className = "status-chip status-chip--completed";
        }
        if (entry.done) finished += 1;
      });

      if (finished === entries.length) {
        window.clearInterval(timer);
        expRunning = false;

        var sum = entries.reduce(function (total, entry) {
          return total + entry.task.duration;
        }, 0);
        var slowest = Math.max.apply(
          null,
          entries.map(function (entry) { return entry.task.duration; })
        );

        var setText = function (id, value) {
          var el = document.getElementById(id);
          if (el) el.textContent = value;
        };
        setText("exp-concurrent", oneDecimal(slowest) + "s");
        setText("exp-sequential", oneDecimal(sum) + "s");
        setText("exp-work", oneDecimal(sum) + "s");

        registerSimulation(entries.length, "concurrent");
        if (results) results.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }, 60);
  }

  var expAdd = $("#exp-add");
  if (expAdd) expAdd.addEventListener("click", addTask);

  var expRun = $("#exp-run");
  if (expRun) {
    expRun.addEventListener("click", function () {
      runExperiment(expTasks);
    });
  }

  /* Preset experiments */
  var PRESETS = {
    file: ["Download File A", "Download File B", "Download File C", "Download File D"],
    web: ["Fetch API", "Load Profile", "Load Notifications", "Download Images", "Send Analytics"],
    db: ["Read Products", "Check Inventory", "Load Transactions", "Generate Report"]
  };

  $$(".preset-run").forEach(function (button) {
    button.addEventListener("click", function () {
      var key = button.getAttribute("data-preset");
      var names = PRESETS[key] || [];
      expTasks = names.map(function (name) {
        return { name: name, duration: randomBetween(1, 4) };
      });
      renderExpTasks();
      runExperiment(expTasks);
      var card = $("#exp-results");
      if (card) card.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

  /* =========================================================
     Race Condition Lab — runRaceCondition() / runWithLock()
     ========================================================= */
  var raceLog = $("#race-log");
  var raceBusy = false;
  var raceStep = 0;

  function raceResetState() {
    raceStep = 0;
    if (raceLog) raceLog.innerHTML = "";
    var value = $("#race-value");
    if (value) value.textContent = "0";
    var verdict = $("#race-verdict");
    if (verdict) verdict.setAttribute("hidden", "");
    var lockState = $("#race-lock-state");
    if (lockState) lockState.textContent = "Lock not used";
  }

  function raceStepLine(message) {
    raceStep += 1;
    logLine(raceLog, pad(raceStep, 2), message);
  }

  function setRaceBusy(busy) {
    raceBusy = busy;
    ["race-without", "race-with"].forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.disabled = busy;
    });
  }

  function showRaceVerdict(title, actual, explanation, alert) {
    var verdict = $("#race-verdict");
    var titleEl = $("#race-verdict-title");
    var actualEl = $("#race-actual");
    var textEl = $("#race-explain");
    if (titleEl) {
      titleEl.textContent = title;
      titleEl.classList.toggle("is-alert", Boolean(alert));
    }
    if (actualEl) actualEl.textContent = actual;
    if (textEl) textEl.textContent = explanation;
    if (verdict) verdict.removeAttribute("hidden");
  }

  async function runRaceCondition() {
    if (raceBusy) return;
    setRaceBusy(true);
    raceResetState();
    var value = $("#race-value");
    var lockState = $("#race-lock-state");

    raceStepLine("Shared counter starts at 0");
    await sleep(420);

    if (value) value.textContent = "0";
    raceStepLine("Thread A reads counter \u2192 0");
    await sleep(520);

    if (value) value.textContent = "0";
    raceStepLine("Thread B reads counter \u2192 0");
    await sleep(520);

    raceStepLine("Thread A adds 1 to its local copy");
    await sleep(440);

    raceStepLine("Thread B adds 1 to its local copy");
    await sleep(520);

    if (value) value.textContent = "1";
    raceStepLine("Thread A writes \u2192 1");
    await sleep(520);

    if (value) value.textContent = "1";
    raceStepLine("Thread B writes \u2192 1");
    await sleep(380);

    if (lockState) lockState.textContent = "Lock not used";
    raceStepLine("Both threads finished");

    showRaceVerdict(
      "Race Condition Occurred",
      "1",
      "Both threads read the same value before either write happened, so one increment was " +
        "lost. The final value is 1 instead of 2. The lock ensures that only one thread " +
        "modifies the shared value at a time.",
      true
    );

    state.flags.race = true;
    saveProgress();
    logActivity("Race Condition Lab", "Without lock \u2022 counter stayed at 1", "Completed");
    setRaceBusy(false);
  }

  async function runWithLock() {
    if (raceBusy) return;
    setRaceBusy(true);
    raceResetState();
    var value = $("#race-value");
    var lockState = $("#race-lock-state");

    raceStepLine("Thread A requests the lock");
    await sleep(360);

    if (lockState) lockState.textContent = "Lock available";
    raceStepLine("Lock: available");
    await sleep(340);

    if (lockState) lockState.textContent = "Held by Thread A";
    raceStepLine("Thread A acquires lock");
    await sleep(520);

    raceStepLine("Thread B requests the lock");
    await sleep(420);

    raceStepLine("Thread B is WAITING \u2014 lock is held");
    await sleep(560);

    if (value) value.textContent = "1";
    raceStepLine("Thread A: counter 0 \u2192 1");
    await sleep(480);

    if (lockState) lockState.textContent = "Lock available";
    raceStepLine("Thread A releases lock");
    await sleep(420);

    if (lockState) lockState.textContent = "Held by Thread B";
    raceStepLine("Thread B acquires lock");
    await sleep(520);

    if (value) value.textContent = "2";
    raceStepLine("Thread B: counter 1 \u2192 2");
    await sleep(460);

    if (lockState) lockState.textContent = "Lock available";
    raceStepLine("Thread B releases lock");
    await sleep(320);

    raceStepLine("Both threads finished \u2014 counter is 2");

    showRaceVerdict(
      "Protected by Lock",
      "2",
      "The lock allows only one simulated thread at a time to modify the protected shared " +
        "value, so both increments are kept and the result matches the expected value of 2.",
      false
    );

    state.flags.lock = true;
    saveProgress();
    logActivity("Race Condition Lab", "With lock \u2022 counter reached 2", "Completed");
    setRaceBusy(false);
  }

  var raceWithout = $("#race-without");
  var raceWith = $("#race-with");
  var raceReset = $("#race-reset");

  if (raceWithout) raceWithout.addEventListener("click", runRaceCondition);
  if (raceWith) raceWith.addEventListener("click", runWithLock);
  if (raceReset) {
    raceReset.addEventListener("click", function () {
      if (raceBusy) return;
      raceResetState();
      logLine(raceLog, "", "Choose Run Without Lock or Run With Lock.", true);
    });
  }

  /* =========================================================
     Deadlock visualizer — simulateDeadlock()
     ========================================================= */
  var deadLog = $("#dead-log");
  var deadBusy = false;

  function setLock(id, owner) {
    var ownerEl = document.getElementById(id);
    if (!ownerEl) return;
    ownerEl.textContent = owner;
    var box = ownerEl.closest(".lock-box");
    if (box) box.classList.toggle("is-held", owner !== "Free");
  }

  function deadlockResetState() {
    setLock("lock-a-owner", "Free");
    setLock("lock-b-owner", "Free");
    var status = $("#dead-status");
    if (status) status.textContent = "Idle";
    var flag = $("#dead-flag");
    if (flag) flag.setAttribute("hidden", "");
    if (deadLog) deadLog.innerHTML = "";
  }

  function setDeadBusy(busy) {
    deadBusy = busy;
    ["dead-run", "dead-prevent"].forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.disabled = busy;
    });
  }

  function showDeadFlag(title, text, alert) {
    var flag = $("#dead-flag");
    var titleEl = $("#dead-flag-title");
    var textEl = $("#dead-flag-text");
    if (titleEl) {
      titleEl.textContent = title;
      titleEl.classList.toggle("is-alert", Boolean(alert));
    }
    if (textEl) textEl.textContent = text;
    if (flag) flag.removeAttribute("hidden");
  }

  async function simulateDeadlock() {
    if (deadBusy) return;
    setDeadBusy(true);
    deadlockResetState();

    var status = $("#dead-status");
    if (status) status.textContent = "Running";

    logLine(deadLog, "00.000", "Thread 1 acquired Lock A");
    setLock("lock-a-owner", "Thread 1");
    await sleep(700);

    logLine(deadLog, "00.700", "Thread 2 acquired Lock B");
    setLock("lock-b-owner", "Thread 2");
    await sleep(700);

    logLine(deadLog, "01.400", "Thread 1 waiting for Lock B\u2026");
    await sleep(750);

    logLine(deadLog, "02.150", "Thread 2 waiting for Lock A\u2026");
    await sleep(750);

    logLine(deadLog, "02.900", "Circular wait detected", true);
    if (status) status.textContent = "Deadlock detected";

    showDeadFlag(
      "DEADLOCK",
      "Neither thread can continue because each thread is waiting for a resource held by " +
        "the other. This is a visual simulation only \u2014 the page never actually blocks.",
      true
    );

    state.flags.deadlock = true;
    saveProgress();
    logActivity("Deadlock Demo", "Circular wait detected", "Completed");
    setDeadBusy(false);
  }

  async function showPrevention() {
    if (deadBusy) return;
    setDeadBusy(true);
    deadlockResetState();

    var status = $("#dead-status");
    if (status) status.textContent = "Prevented";

    logLine(deadLog, "00.000", "Thread 1 acquires Lock A");
    setLock("lock-a-owner", "Thread 1");
    await sleep(620);

    logLine(deadLog, "00.620", "Thread 1 acquires Lock B");
    setLock("lock-b-owner", "Thread 1");
    await sleep(620);

    logLine(deadLog, "01.240", "Thread 1 releases Lock A and Lock B");
    setLock("lock-a-owner", "Free");
    setLock("lock-b-owner", "Free");
    await sleep(620);

    logLine(deadLog, "01.860", "Thread 2 acquires Lock A");
    setLock("lock-a-owner", "Thread 2");
    await sleep(620);

    logLine(deadLog, "02.480", "Thread 2 acquires Lock B");
    setLock("lock-b-owner", "Thread 2");
    await sleep(620);

    logLine(deadLog, "03.100", "Thread 2 releases Lock A and Lock B");
    setLock("lock-a-owner", "Free");
    setLock("lock-b-owner", "Free");
    await sleep(360);

    logLine(deadLog, "03.460", "Both threads completed without blocking", true);

    showDeadFlag(
      "PREVENTED",
      "Using a consistent resource acquisition order is one common strategy for preventing " +
        "circular wait. Both threads take Lock A first, so neither blocks the other.",
      false
    );

    state.flags.prevented = true;
    saveProgress();
    logActivity("Deadlock Demo", "Same lock order \u2022 no circular wait", "Completed");
    setDeadBusy(false);
  }

  var deadRun = $("#dead-run");
  var deadPrevent = $("#dead-prevent");
  var deadReset = $("#dead-reset");

  if (deadRun) deadRun.addEventListener("click", simulateDeadlock);
  if (deadPrevent) deadPrevent.addEventListener("click", showPrevention);
  if (deadReset) {
    deadReset.addEventListener("click", function () {
      if (deadBusy) return;
      deadlockResetState();
      logLine(deadLog, "", "Press Simulate Deadlock to begin.", true);
    });
  }

  /* =========================================================
     Thread lifecycle — runLifecycle()
     ========================================================= */
  var LC_STATES = [
    ["NEW", "The thread object has been created but has not started yet."],
    ["READY", "The thread is ready to run and waits for the scheduler to select it."],
    ["RUNNING", "Thread has been scheduled for execution."],
    ["WAITING", "The thread waits for an event such as I/O, a timer or a lock."],
    ["READY", "The wait finished, so the thread is runnable again and re-enters the ready queue."],
    ["RUNNING", "The scheduler selected the thread again and execution continues."],
    ["TERMINATED", "The thread finished execution and released its resources."]
  ];

  var lcIndex = 0;
  var lcTimer = null;

  function renderLifecycle() {
    var states = $$("#lc-viz .lc-state");
    states.forEach(function (item, index) {
      item.classList.toggle("is-active", index === lcIndex);
      item.classList.toggle("is-done", index < lcIndex);
    });

    var current = document.getElementById("lc-current");
    var reason = document.getElementById("lc-reason");
    var step = document.getElementById("lc-step");

    if (current) current.textContent = LC_STATES[lcIndex][0];
    if (reason) reason.textContent = LC_STATES[lcIndex][1];
    if (step) step.textContent = "Step " + (lcIndex + 1) + " of " + LC_STATES.length;
  }

  function runLifecycle() {
    var button = $("#lc-run");
    if (lcTimer) return;
    if (button) button.disabled = true;

    lcIndex = 0;
    renderLifecycle();

    lcTimer = window.setInterval(function () {
      lcIndex += 1;
      if (lcIndex >= LC_STATES.length) {
        lcIndex = LC_STATES.length - 1;
        renderLifecycle();
        window.clearInterval(lcTimer);
        lcTimer = null;
        if (button) button.disabled = false;
        logActivity("Thread Lifecycle", "Sample thread reached TERMINATED", "Completed");
        return;
      }
      renderLifecycle();
    }, 950);
  }

  function resetLifecycle() {
    if (lcTimer) {
      window.clearInterval(lcTimer);
      lcTimer = null;
    }
    lcIndex = 0;
    renderLifecycle();
    var button = $("#lc-run");
    if (button) button.disabled = false;
  }

  var lcRun = $("#lc-run");
  var lcReset = $("#lc-reset");
  if (lcRun) lcRun.addEventListener("click", runLifecycle);
  if (lcReset) lcReset.addEventListener("click", resetLifecycle);

  /* =========================================================
     Context switch visualizer
     ========================================================= */
  var csLog = $("#cs-log");
  var csBusy = false;

  function csResetState() {
    var strip = $("#cs-strip");
    if (strip) strip.innerHTML = "";
    var thread = $("#cpu-thread");
    if (thread) thread.textContent = "[ IDLE ]";
    var status = $("#cs-state");
    if (status) status.textContent = "Idle";
    if (csLog) csLog.innerHTML = "";
  }

  function setCsBusy(busy) {
    csBusy = busy;
    ["cs-run", "cs-reset"].forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.disabled = busy;
    });
  }

  function addCsBlock(letter, divider) {
    var strip = $("#cs-strip");
    if (!strip) return;
    if (divider) {
      var div = document.createElement("span");
      div.className = "cs-divider";
      div.textContent = "|";
      strip.appendChild(div);
    }
    var block = document.createElement("span");
    block.className = "cs-block cs-block--" + letter.toLowerCase();
    block.textContent = letter;
    strip.appendChild(block);
  }

  async function runContextSwitch() {
    if (csBusy) return;
    setCsBusy(true);
    csResetState();

    var threadEl = $("#cpu-thread");
    var statusEl = $("#cs-state");
    var segments = [
      { letter: "A", delay: 900 },
      { letter: "B", delay: 1100 },
      { letter: "A", delay: 800 },
      { letter: "B", delay: 1000 }
    ];

    for (var i = 0; i < segments.length; i += 1) {
      var segment = segments[i];
      var letter = segment.letter;
      var other = letter === "A" ? "B" : "A";

      if (threadEl) threadEl.textContent = "[ THREAD " + letter + " ]";
      if (statusEl) statusEl.textContent = "Thread " + letter + " running";

      logLine(csLog, null, "Thread " + letter + " running on the CPU", false);
      addCsBlock(letter, i > 0);
      await sleep(segment.delay);

      if (i < segments.length - 1) {
        if (statusEl) statusEl.textContent = "Switching\u2026";
        logLine(csLog, null, "Saving Thread " + letter + " context\u2026", true);
        await sleep(380);
        logLine(csLog, null, "Scheduler selecting next thread\u2026", true);
        await sleep(380);
        logLine(csLog, null, "Restoring Thread " + other + " context\u2026", true);
        await sleep(380);
      }
    }

    if (statusEl) statusEl.textContent = "Complete";
    logLine(csLog, null, "Context switch sequence finished", false);

    logActivity("Context Switch Visualizer", "4 slices, 2 threads", "Completed");
    setCsBusy(false);
  }

  var csRun = $("#cs-run");
  var csReset = $("#cs-reset");
  if (csRun) csRun.addEventListener("click", runContextSwitch);
  if (csReset) {
    csReset.addEventListener("click", function () {
      if (csBusy) return;
      csResetState();
      logLine(csLog, null, "Press Run Context Switch to begin.", true);
    });
  }

  /* =========================================================
     Scheduler playground
     ========================================================= */
  var schedTasks = [
    { label: "A", name: "Thread A", priority: "Normal", duration: 2 },
    { label: "B", name: "Thread B", priority: "Normal", duration: 1 },
    { label: "C", name: "Thread C", priority: "Normal", duration: 3 }
  ];

  var schedBusy = false;
  var schedList = $("#sched-list");

  function renderSchedTasks() {
    if (!schedList) return;
    schedList.innerHTML = "";

    schedTasks.forEach(function (task, index) {
      var row = document.createElement("div");
      row.className = "sched-row";

      var tag = document.createElement("span");
      tag.className = "sched-tag";
      tag.textContent = task.label;

      var nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "exp-input";
      nameInput.value = task.name;
      nameInput.setAttribute("aria-label", "Thread " + (index + 1) + " name");
      nameInput.addEventListener("input", function () {
        task.name = nameInput.value || task.label;
      });

      var priority = document.createElement("select");
      priority.className = "exp-input sched-select";
      priority.setAttribute("aria-label", "Thread " + (index + 1) + " priority");
      ["Normal", "High", "Low"].forEach(function (option) {
        var el = document.createElement("option");
        el.value = option;
        el.textContent = "Priority: " + option;
        if (option === task.priority) el.selected = true;
        priority.appendChild(el);
      });
      priority.addEventListener("change", function () {
        task.priority = priority.value;
      });

      var durationWrap = document.createElement("span");
      durationWrap.className = "sched-dur";
      var durationInput = document.createElement("input");
      durationInput.type = "number";
      durationInput.className = "exp-input";
      durationInput.min = "1";
      durationInput.max = "5";
      durationInput.value = String(task.duration);
      durationInput.setAttribute("aria-label", "Thread " + (index + 1) + " duration in seconds");
      durationInput.addEventListener("change", function () {
        task.duration = clamp(parseInt(durationInput.value, 10) || 2, 1, 5);
        durationInput.value = String(task.duration);
      });
      var unit = document.createElement("span");
      unit.textContent = "sec";
      durationWrap.appendChild(durationInput);
      durationWrap.appendChild(unit);

      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "exp-remove";
      remove.textContent = "\u00D7";
      remove.setAttribute("aria-label", "Remove " + task.name);
      remove.addEventListener("click", function () {
        if (schedTasks.length <= 1) return;
        schedTasks.splice(index, 1);
        renderSchedTasks();
      });

      row.appendChild(tag);
      row.appendChild(nameInput);
      row.appendChild(priority);
      row.appendChild(durationWrap);
      row.appendChild(remove);
      schedList.appendChild(row);
    });

    var count = $("#sched-count");
    if (count) count.textContent = schedTasks.length + " of 6 tasks";
  }

  function buildSchedule() {
    var priorityWeight = { High: 0, Normal: 1, Low: 2 };

    var queue = schedTasks
      .map(function (task, index) {
        return { task: task, index: index, remaining: task.duration };
      })
      .sort(function (a, b) {
        var byPriority = priorityWeight[a.task.priority] - priorityWeight[b.task.priority];
        return byPriority !== 0 ? byPriority : a.index - b.index;
      });

    var modeInput = document.querySelector('input[name="sched-mode"]:checked');
    var mode = modeInput ? modeInput.value : "fcfs";
    var quantumInput = $("#quantum");
    var quantum = quantumInput ? parseFloat(quantumInput.value) : 1;
    var slices = [];
    var order = [];

    if (mode === "fcfs") {
      queue.forEach(function (entry) {
        slices.push({ entry: entry, duration: entry.remaining });
        order.push(entry);
      });
    } else {
      var guard = 0;
      while (queue.some(function (entry) { return entry.remaining > 0; }) && guard < 200) {
        guard += 1;
        queue.forEach(function (entry) {
          if (entry.remaining <= 0) return;
          var slice = Math.min(quantum, entry.remaining);
          slices.push({ entry: entry, duration: slice });
          entry.remaining -= slice;
          if (entry.remaining <= 0 && order.indexOf(entry) === -1) order.push(entry);
        });
      }
    }

    return { slices: slices, order: order, mode: mode, quantum: quantum };
  }

  function setSchedBusy(busy) {
    schedBusy = busy;
    ["sched-run", "sched-add", "sched-reset"].forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.disabled = busy;
    });
  }

  function runSchedule() {
    if (schedBusy) return;
    setSchedBusy(true);

    var plan = buildSchedule();
    var strip = $("#sched-strip");
    var orderList = $("#sched-order");
    var schedLog = $("#sched-log");
    var clock = $("#sched-clock");

    if (strip) strip.innerHTML = "";
    if (orderList) orderList.innerHTML = "";
    if (schedLog) schedLog.innerHTML = "";

    var stripEmpty = $("#sched-strip-empty");
    if (stripEmpty) stripEmpty.setAttribute("hidden", "");

    logLine(schedLog, null, plan.mode === "fcfs" ? "First Come First Served selected" : "Round Robin selected (quantum " + oneDecimal(plan.quantum) + "s)", true);

    var logical = 0;
    var SPEED = 300; /* ms of wall time per simulated second */

    plan.slices.forEach(function (slice, index) {
      window.setTimeout(function () {
        if (strip) {
          var bar = document.createElement("span");
          bar.className = "sched-slice sched-slice--t" + (slice.entry.index % 4);
          bar.style.setProperty("--d", String(slice.duration));
          bar.textContent = slice.entry.task.label;
          strip.appendChild(bar);
        }

        var start = logical;
        logical += slice.duration;

        if (clock) clock.textContent = oneDecimal(logical) + "s";

        logLine(
          schedLog,
          null,
          "CPU \u2190 " +
            slice.entry.task.name +
            " (" +
            oneDecimal(start) +
            "s \u2192 " +
            oneDecimal(logical) +
            "s)",
          false
        );

        if (index === plan.slices.length - 1) {
          if (orderList) {
            plan.order.forEach(function (entry, position) {
              var item = document.createElement("li");
              var num = document.createElement("span");
              num.className = "order-num";
              num.textContent = String(position + 1) + ".";
              var text = document.createElement("span");
              text.textContent = entry.task.name;
              item.appendChild(num);
              item.appendChild(text);
              orderList.appendChild(item);
            });
          }

          logLine(schedLog, null, "Schedule finished in " + oneDecimal(logical) + " simulated seconds", true);

          logActivity(
            "Scheduler Playground",
            (plan.mode === "fcfs" ? "FCFS" : "Round Robin") +
              " \u2022 " +
              oneDecimal(logical) +
              "s simulated",
            "Completed"
          );

          setSchedBusy(false);
        }
      }, index * SPEED);
    });

    if (!plan.slices.length) setSchedBusy(false);
  }

  function resetSchedule() {
    if (schedBusy) return;
    var strip = $("#sched-strip");
    var orderList = $("#sched-order");
    var schedLog = $("#sched-log");
    var clock = $("#sched-clock");
    if (strip) strip.innerHTML = "";
    if (orderList) {
      orderList.innerHTML = "";
      var empty = document.createElement("li");
      empty.className = "activity-empty";
      empty.textContent = "Run a schedule to see the order.";
      orderList.appendChild(empty);
    }
    if (schedLog) {
      schedLog.innerHTML = "";
      logLine(schedLog, null, "Waiting for a schedule\u2026", true);
    }
    if (clock) clock.textContent = "0.0s";
    var stripEmpty = $("#sched-strip-empty");
    if (stripEmpty) stripEmpty.removeAttribute("hidden");
  }

  var schedAdd = $("#sched-add");
  var schedRun = $("#sched-run");
  var schedReset = $("#sched-reset");

  if (schedAdd) {
    schedAdd.addEventListener("click", function () {
      if (schedTasks.length >= 6) return;
      var letters = ["A", "B", "C", "D", "E", "F"];
      var label = letters[schedTasks.length];
      schedTasks.push({
        label: label,
        name: "Thread " + label,
        priority: "Normal",
        duration: 2
      });
      renderSchedTasks();
    });
  }

  if (schedRun) schedRun.addEventListener("click", runSchedule);
  if (schedReset) schedReset.addEventListener("click", resetSchedule);

  var quantum = $("#quantum");
  if (quantum) {
    quantum.addEventListener("input", function () {
      var out = $("#quantum-out");
      if (out) out.textContent = String(parseFloat(quantum.value));
    });
  }

  $$('input[name="sched-mode"]').forEach(function (input) {
    input.addEventListener("change", function () {
      var group = $("#quantum-group");
      var checked = document.querySelector('input[name="sched-mode"]:checked');
      if (group && checked) {
        if (checked.value === "rr") group.removeAttribute("hidden");
        else group.setAttribute("hidden", "");
      }
      syncRadioCards();
    });
  });

  /* =========================================================
     Boot
     ========================================================= */
  loadProgress();
  syncRadioCards();
  setModeLabel();
  renderExpTasks();
  renderSchedTasks();
  renderLifecycle();
  updateDashboard();
  updateCounters();
  markScrolledSections();

  window.addEventListener("scroll", markScrolledSections, { passive: true });

  if (location.hash) {
    rememberSection(location.hash.slice(1));
  }
})();
