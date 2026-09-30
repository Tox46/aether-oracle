(function () {
  "use strict";

  const STORAGE_KEY = "objective-eta-calculator-v1";
  const THEME_KEY = "objective-eta-theme";
  const LIBRARY_KEY = "objective-eta-settlement-library-v1";

  const state = {
    culture: { current: 0, target: 0, passive: 0, settlements: [] },
    science: { current: 0, target: 0, passive: 0, settlements: [] },
  };

  // library: { [recognitionKey]: { name, culture: {amount,hours,minutes,builder}|null, science: {...}|null } }
  let library = {};

  function recognitionKey(name) {
    if (!name) return null;
    const trimmed = String(name).trim();
    if (!trimmed) return null;
    const numMatch = trimmed.match(/\d+/);
    if (numMatch) return "#" + numMatch[0];
    return trimmed.slice(0, 2).toLowerCase();
  }

  function loadLibrary() {
    try {
      const raw = localStorage.getItem(LIBRARY_KEY);
      if (raw) library = JSON.parse(raw) || {};
    } catch (e) {
      console.warn("Could not load settlement library", e);
      library = {};
    }
  }

  function saveLibrary() {
    try {
      localStorage.setItem(LIBRARY_KEY, JSON.stringify(library));
    } catch (e) {
      console.warn("Could not save settlement library", e);
    }
  }

  function storeSettlementInLibrary(type, settlement) {
    const key = recognitionKey(settlement.name);
    if (!key) return; // no usable name, nothing to remember it by
    if (!library[key])
      library[key] = { name: settlement.name, culture: null, science: null };
    library[key].name = settlement.name || library[key].name;
    library[key][type] = {
      amount: settlement.amount || 0,
      hours: settlement.hours || 0,
      minutes: settlement.minutes || 0,
      builder: !!settlement.builder,
    };
    saveLibrary();
    renderLibrary();
  }

  let armedRemoveBtn = null;
  let armedRemoveTimeout = null;

  function disarmRemoveButton() {
    if (armedRemoveBtn) {
      armedRemoveBtn.classList.remove("confirm-armed");
      if (armedRemoveBtn._confirmTip) {
        armedRemoveBtn._confirmTip.remove();
        armedRemoveBtn._confirmTip = null;
      }
      armedRemoveBtn = null;
    }
    if (armedRemoveTimeout) {
      clearTimeout(armedRemoveTimeout);
      armedRemoveTimeout = null;
    }
  }

  function armRemoveButton(btn, message) {
    disarmRemoveButton();
    btn.classList.add("confirm-armed");
    const tip = document.createElement("span");
    tip.className = "confirm-tip";
    tip.textContent = message;
    document.body.appendChild(tip);

    const margin = 8;
    const btnRect = btn.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();

    let left = btnRect.left + btnRect.width / 2 - tipRect.width / 2;
    left = Math.max(
      margin,
      Math.min(left, window.innerWidth - tipRect.width - margin),
    );
    const top = btnRect.top - tipRect.height - 10;

    tip.style.left = left + "px";
    tip.style.top = Math.max(margin, top) + "px";

    // point the little arrow at the button's center, clamped inside the tooltip
    const arrowLeft = Math.max(
      10,
      Math.min(btnRect.left + btnRect.width / 2 - left - 5, tipRect.width - 10),
    );
    tip.style.setProperty("--arrow-left", arrowLeft + "px");

    btn._confirmTip = tip;
    armedRemoveBtn = btn;
    armedRemoveTimeout = setTimeout(disarmRemoveButton, 3000);
  }

  document.addEventListener("click", (e) => {
    if (
      armedRemoveBtn &&
      !armedRemoveBtn.contains(e.target) &&
      e.target !== armedRemoveBtn._confirmTip
    ) {
      disarmRemoveButton();
    }
  });
  window.addEventListener(
    "scroll",
    () => {
      if (armedRemoveBtn) disarmRemoveButton();
    },
    true,
  );

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  function defaultSettlement() {
    return {
      id: uid(),
      name: "",
      amount: 0,
      hours: 0,
      minutes: 0,
      builder: false,
      dailyLimit: 0,
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        ["culture", "science"].forEach((k) => {
          if (parsed[k]) {
            state[k].current = parsed[k].current || 0;
            state[k].target = parsed[k].target || 0;
            state[k].passive = parsed[k].passive || 0;
            state[k].settlements = Array.isArray(parsed[k].settlements)
              ? parsed[k].settlements
              : [];
          }
        });
      }
    } catch (e) {
      console.warn("Could not load saved state", e);
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Could not save state", e);
    }
  }

  function loadTheme() {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "dark" || t === "light") {
      document.documentElement.setAttribute("data-theme", t);
    } else {
      const prefersDark =
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.setAttribute(
        "data-theme",
        prefersDark ? "dark" : "light",
      );
    }
  }

  document.getElementById("themeToggle").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(THEME_KEY, next);
  });

  // Number inputs can still expose invalid or incomplete values while editing.
  // Accept only complete, valid numbers so text such as "12abc" is never
  // partially interpreted as 12.
  function readNumericInput(input) {
    const raw = input.value.trim();
    if (raw === "") return 0;
    const value = Number(raw);
    return Number.isFinite(value) && input.validity.valid ? value : null;
  }

  // Number inputs may still permit characters such as "e" in some browsers.
  // Block non-numeric character keys while preserving navigation and shortcuts.
  document.addEventListener("keydown", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== "number") return;
    if (
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.key.length !== 1
    )
      return;

    const isDigit = /^[0-9]$/.test(event.key);
    const allowsDecimal = input.step !== "1" && event.key === ".";
    if (!isDigit && !allowsDecimal) event.preventDefault();
  });

  // ---------- Rendering settlement rows ----------
  function renderSettlements(type) {
    const container = document.getElementById(type + "-settlements");
    container.innerHTML = "";
    state[type].settlements.forEach((s) => {
      const div = document.createElement("div");
      div.className = "settlement";
      div.innerHTML = `
        <div class="settlement-header">
          <strong style="font-size:.85rem;">Settlement</strong>
          <button class="remove-btn" type="button">&times;</button>
        </div>
        <div class="field-row">
          <div>
            <label>Name</label>
            <input type="text" class="s-name" value="${escapeHtml(s.name)}" placeholder="Settlement name">
          </div>
          <div>
            <label>Project amount</label>
            <input type="number" class="s-amount" min="0" step="1" value="${s.amount}">
          </div>
        </div>
        <div class="field-row" style="grid-template-columns:1fr 1fr;">
          <div>
            <label>Project time - hours</label>
            <input type="number" class="s-hours" min="0" step="1" value="${s.hours}">
          </div>
          <div>
            <label>Project time - minutes</label>
            <input type="number" class="s-minutes" min="0" max="59" step="1" value="${s.minutes}">
          </div>
        </div>
                <label class="builder-flag">
          <input type="checkbox" class="s-builder" ${s.builder ? "checked" : ""}>
          Uses builder on every project
          <span class="tooltip" tabindex="0">?
            <span class="tip-text">Toggle this only if you will use a builder on EVERY project run in this settlement, not just once. A builder gives +50% production speed (a project takes 2/3 of the normal time).</span>
          </span>
        </label>
        <div class="daily-limit">
          <label class="daily-limit-toggle">
            <input type="checkbox" class="s-daily-limit-enabled" ${s.dailyLimit > 0 ? "checked" : ""}>
            Limit projects per day for this settlement
          </label>
          <div class="daily-limit-fields" ${s.dailyLimit > 0 ? "" : "hidden"}>
            <label>Projects per day</label>
            <div class="daily-limit-input-row">
              <input type="number" class="s-daily-limit" min="1" step="1" value="${s.dailyLimit > 0 ? s.dailyLimit : 1}">
              <p class="daily-limit-warning" role="alert" hidden></p>
            </div>
            <p class="daily-limit-summary" aria-live="polite"></p>
          </div>
        </div>

      `;
      container.appendChild(div);

      const removeBtn = div.querySelector(".remove-btn");
      removeBtn.addEventListener("click", () => {
        storeSettlementInLibrary(type, s);
        state[type].settlements = state[type].settlements.filter(
          (x) => x.id !== s.id,
        );
        saveState();
        renderSettlements(type);
        compute(type);
      });
      div.querySelector(".s-name").addEventListener("input", (e) => {
        s.name = e.target.value;
        saveState();
        compute(type);
      });
      div.querySelector(".s-amount").addEventListener("input", (e) => {
        const value = readNumericInput(e.target);
        if (value === null) return;
        s.amount = value;
        saveState();
        compute(type);
      });
      div.querySelector(".s-hours").addEventListener("input", (e) => {
        const value = readNumericInput(e.target);
        if (value === null) return;
        s.hours = value;
        saveState();
        updateDailyLimitSummary(div, s);
        compute(type);
      });
      div.querySelector(".s-minutes").addEventListener("input", (e) => {
        const value = readNumericInput(e.target);
        if (value === null) return;
        s.minutes = value;
        saveState();
        updateDailyLimitSummary(div, s);
        compute(type);
      });
      div.querySelector(".s-builder").addEventListener("change", (e) => {
        s.builder = e.target.checked;
        saveState();
        updateDailyLimitSummary(div, s);
        compute(type);
      });
      const limitToggle = div.querySelector(".s-daily-limit-enabled");
      const limitFields = div.querySelector(".daily-limit-fields");
      const limitInput = div.querySelector(".s-daily-limit");
      limitToggle.addEventListener("change", (e) => {
        const value = readNumericInput(limitInput);
        s.dailyLimit = e.target.checked
          ? Math.max(1, value === null ? 1 : Math.floor(value))
          : 0;
        limitFields.hidden = !e.target.checked;
        saveState();
        updateDailyLimitSummary(div, s);
        compute(type);
      });
      limitInput.addEventListener("input", (e) => {
        const value = readNumericInput(e.target);
        if (value === null) return;
        s.dailyLimit = Math.max(1, Math.floor(value));
        saveState();
        updateDailyLimitSummary(div, s);
        compute(type);
      });
      updateDailyLimitSummary(div, s);
    });
  }

  function escapeHtml(str) {
    return String(str).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }

  document.getElementById("add-culture").addEventListener("click", () => {
    state.culture.settlements.push(defaultSettlement());
    saveState();
    renderSettlements("culture");
    compute("culture");
  });
  document.getElementById("add-science").addEventListener("click", () => {
    state.science.settlements.push(defaultSettlement());
    saveState();
    renderSettlements("science");
    compute("science");
  });

  // ---------- Core math ----------
  function projectSeconds(s) {
    const base = s.hours * 3600 + s.minutes * 60;
    if (base <= 0) return 0;
    return s.builder ? base * (2 / 3) : base;
  }

  function completedProjects(tSeconds, s) {
    const duration = projectSeconds(s);
    if (duration <= 0 || tSeconds < duration) return 0;
    if (!(s.dailyLimit > 0)) return Math.floor(tSeconds / duration);

    const completedPerDay = Math.min(
      Math.floor(86400 / duration),
      Math.floor(s.dailyLimit),
    );
    if (completedPerDay <= 0) return 0;
    const fullDays = Math.floor(tSeconds / 86400);
    const secondsToday = tSeconds % 86400;
    const today = Math.min(
      completedPerDay,
      Math.floor(secondsToday / duration),
    );
    return fullDays * completedPerDay + today;
  }

  function updateDailyLimitSummary(container, settlement) {
    const summary = container.querySelector(".daily-limit-summary");
    const warning = container.querySelector(".daily-limit-warning");
    const limitInput = container.querySelector(".s-daily-limit");
    if (!summary || !warning || !limitInput) return;
    if (!(settlement.dailyLimit > 0)) {
      warning.hidden = true;
      warning.textContent = "";
      limitInput.classList.remove("over-limit");
      return;
    }
    const projectDuration = projectSeconds(settlement);
    if (projectDuration <= 0) {
      summary.textContent =
        "Enter a project time to calculate the daily hours.";
      warning.hidden = true;
      warning.textContent = "";
      limitInput.classList.remove("over-limit");
      return;
    }
    const totalMinutes = Math.round(
      (projectDuration * settlement.dailyLimit) / 60,
    );
    warning.hidden = totalMinutes <= 1440;
    limitInput.classList.toggle("over-limit", !warning.hidden);
    warning.textContent = warning.hidden
      ? ""
      : "Over 24h/day. Check the count or duration.";

    const projectMinutes = Math.round(projectDuration / 60);
    const formatMinutes = (minutes) => {
      const hours = Math.floor(minutes / 60);
      const remainder = minutes % 60;
      return (
        [hours ? `${hours}h` : "", remainder ? `${remainder}m` : ""]
          .filter(Boolean)
          .join(" ") || "0m"
      );
    };
    summary.textContent = `${settlement.dailyLimit} × ${formatMinutes(projectMinutes)} projects = ${formatMinutes(totalMinutes)} of project time per day.`;
  }

  // amount accumulated from settlement projects (completed cycles) + passive, at t seconds
  function amountAt(tSeconds, passivePerHour, settlements) {
    let val = passivePerHour * (tSeconds / 3600);
    settlements.forEach((s) => {
      if (projectSeconds(s) > 0 && s.amount > 0) {
        val += completedProjects(tSeconds, s) * s.amount;
      }
    });
    return val;
  }

  function totalRatePerHour(passivePerHour, settlements) {
    let rate = passivePerHour;
    settlements.forEach((s) => {
      const duration = projectSeconds(s);
      if (duration > 0 && s.amount > 0) {
        const projectsPerDay =
          s.dailyLimit > 0
            ? Math.min(Math.floor(86400 / duration), Math.floor(s.dailyLimit))
            : Infinity;
        rate +=
          s.amount * (s.dailyLimit > 0 ? projectsPerDay / 24 : 3600 / duration);
      }
    });
    return rate;
  }

  // binary search smallest t (seconds) such that amountAt(t) >= deltaNeeded
  function timeToReach(deltaNeeded, passivePerHour, settlements) {
    if (deltaNeeded <= 0) return 0;
    const rate = totalRatePerHour(passivePerHour, settlements);
    if (rate <= 0) return Infinity;

    let maxCycleHours = 0;
    settlements.forEach((s) => {
      const duration = projectSeconds(s);
      if (duration > 0) {
        maxCycleHours = Math.max(
          maxCycleHours,
          s.dailyLimit > 0 ? 24 : duration / 3600,
        );
      }
    });

    const approxHours = deltaNeeded / rate;
    let hi = (approxHours + maxCycleHours + 1) * 3600 * 2;
    let lo = 0;

    for (let i = 0; i < 100; i++) {
      const mid = (lo + hi) / 2;
      if (amountAt(mid, passivePerHour, settlements) >= deltaNeeded) {
        hi = mid;
      } else {
        lo = mid;
      }
    }
    return hi;
  }

  function formatDuration(totalSeconds) {
    if (!isFinite(totalSeconds)) return "never (no production)";
    if (totalSeconds <= 0) return "0m (already reached)";
    const totalMinutes = Math.ceil(totalSeconds / 60);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    let parts = [];
    if (days > 0) parts.push(days + "d");
    if (hours > 0 || days > 0) parts.push(hours + "h");
    parts.push(minutes + "m");
    return parts.join(" ");
  }

  function formatLocal(date) {
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  function formatUTC(date) {
    const h = String(date.getUTCHours()).padStart(2, "0");
    const m = String(date.getUTCMinutes()).padStart(2, "0");
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return `${months[date.getUTCMonth()]} ${date.getUTCDate()} ${h}:${m} UTC`;
  }

  function compute(type) {
    const data = state[type];
    const resultsEl = document.getElementById(type + "-results");
    const delta = data.target - data.current;

    if (
      data.target <= 0 &&
      data.current <= 0 &&
      data.settlements.length === 0 &&
      data.passive <= 0
    ) {
      resultsEl.innerHTML = `<p style="color:var(--text-dim);font-size:.85rem;">Fill in the values above to see your estimate.</p>`;
      return;
    }

    if (delta <= 0) {
      resultsEl.innerHTML = `<div class="big-result">Target already reached</div>`;
      return;
    }

    const seconds = timeToReach(delta, data.passive, data.settlements);
    const rate = totalRatePerHour(data.passive, data.settlements);

    let html = "";
    html += `<div class="big-result" data-key="big-result">Time to target: ${formatDuration(seconds)}</div>`;

    if (isFinite(seconds)) {
      const now = new Date();
      const reach = new Date(now.getTime() + seconds * 1000);
      html += `<div class="result-row"><span class="label">Reached at (local)</span><span class="value" data-key="reach-local">${formatLocal(reach)}</span></div>`;
      html += `<div class="result-row"><span class="label">Reached at (UTC)</span><span class="value" data-key="reach-utc">${formatUTC(reach)}</span></div>`;
    } else {
      html += `<div class="warn">No net production configured - target will never be reached with current inputs.</div>`;
    }

    html += `<div class="result-row"><span class="label">Rate per hour</span><span class="value" data-key="rate-hour">${rate.toFixed(2)}</span></div>`;
    html += `<div class="result-row"><span class="label">Rate per day</span><span class="value" data-key="rate-day">${(rate * 24).toFixed(2)}</span></div>`;

    // Builders currently in use: one builder is spent (paid in advance) per
    // project cycle, for every settlement that has the builder flag on. So
    // a settlement that completes 2 cycles before the target is reached
    // spends 2 builders, not 1.
    function buildersSpent(settlements, tSeconds) {
      let total = 0;
      settlements.forEach((s) => {
        if (!s.builder) return;
        if (projectSeconds(s) > 0 && s.amount > 0) {
          total += completedProjects(tSeconds, s);
        }
      });
      return total;
    }

    const buildersInUse = buildersSpent(data.settlements, seconds);
    html += `<div class="result-row"><span class="label">Builders in use</span><span class="value" data-key="builders-inuse">${buildersInUse} \u{1F528}</span></div>`;

    // Builder improvement analysis: for settlements NOT currently using a builder
    const candidates = data.settlements.filter(
      (s) => !s.builder && s.amount > 0 && (s.hours > 0 || s.minutes > 0),
    );
    if (candidates.length > 0 && isFinite(seconds)) {
      html += `<div class="builder-improve"><div class="label" style="margin-bottom:4px;">Builder impact (if used on every project):</div>`;
      candidates.forEach((s) => {
        const modified = data.settlements.map((x) =>
          x.id === s.id ? Object.assign({}, x, { builder: true }) : x,
        );
        const newSeconds = timeToReach(delta, data.passive, modified);
        const saved = seconds - newSeconds;
        const wouldBeBuilders = buildersSpent(modified, newSeconds);
        const label = s.name && s.name.trim() ? s.name : "(unnamed settlement)";
        html += `<div class="item"><span class="name">${escapeHtml(label)}</span><span class="builder-count" data-key="item-${s.id}-count">${wouldBeBuilders} \u{1F528}</span><span class="time-saved" data-key="item-${s.id}-time">-${formatDuration(saved)}</span></div>`;
      });
      html += `</div>`;
    }

    resultsEl.innerHTML = html;
    flashChangedValues(type, resultsEl);
  }

  // Briefly highlights any data-key value that changed since the last
  // compute() for this type, so recalculated numbers are easier to notice.
  const prevValues = { culture: {}, science: {} };
  function flashChangedValues(type, resultsEl) {
    const cache = prevValues[type];
    resultsEl.querySelectorAll("[data-key]").forEach((el) => {
      const key = el.dataset.key;
      const text = el.textContent;
      if (cache[key] !== undefined && cache[key] !== text) {
        el.classList.add("value-flash");
      }
      cache[key] = text;
    });
  }

  // ---------- Settlement library UI ----------
  function renderLibrary() {
    const container = document.getElementById("library-chips");
    const keys = Object.keys(library).sort((a, b) =>
      (library[a].name || "").localeCompare(library[b].name || ""),
    );
    if (keys.length === 0) {
      container.innerHTML = `<span class="library-empty">No settlements remembered yet. Remove one from a project list to store it here.</span>`;
      return;
    }
    container.innerHTML = "";
    keys.forEach((key) => {
      const entry = library[key];
      const chip = document.createElement("div");
      chip.className = "library-chip";
      chip.innerHTML = `<span class="key-badge">${escapeHtml(key)}</span><span class="chip-name">${escapeHtml(entry.name || "(unnamed)")}</span><button class="chip-del" type="button" title="Forget this settlement">&times;</button>`;

      chip.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        startChipDrag(e, chip, key);
      });
      chip.querySelector(".chip-name").addEventListener("click", () => {
        if (chip.dataset.justDragged) return;
        openLibraryModal(key);
      });
      chip.querySelector(".key-badge").addEventListener("click", () => {
        if (chip.dataset.justDragged) return;
        openLibraryModal(key);
      });
      chip.querySelector(".chip-del").addEventListener("click", (e) => {
        e.stopPropagation();
        if (chip.dataset.justDragged) return;
        const delBtn = e.currentTarget;
        if (!delBtn.classList.contains("confirm-armed")) {
          armRemoveButton(delBtn, "click X again to remove it");
          return;
        }
        delete library[key];
        saveLibrary();
        renderLibrary();
      });
      container.appendChild(chip);
    });
  }

  function statBlockHtml(type, proj) {
    const p = proj || { amount: 0, hours: 0, minutes: 0, builder: false };
    return `
      <div class="field-row" style="grid-template-columns:1fr 1fr;">
        <div>
          <label>Amount per project</label>
          <input type="number" class="modal-amount" data-proj="${type}" min="0" step="1" value="${p.amount}">
        </div>
        <div>
          <label class="modal-builder-label">
            <input type="checkbox" class="modal-builder" data-proj="${type}" ${p.builder ? "checked" : ""}> Uses builder
          </label>
        </div>
      </div>
      <div class="field-row" style="grid-template-columns:1fr 1fr;">
        <div>
          <label>Hours</label>
          <input type="number" class="modal-hours" data-proj="${type}" min="0" step="1" value="${p.hours}">
        </div>
        <div>
          <label>Minutes</label>
          <input type="number" class="modal-minutes" data-proj="${type}" min="0" max="59" step="1" value="${p.minutes}">
        </div>
      </div>
    `;
  }

  function openLibraryModal(key) {
    const entry = library[key];
    if (!entry) return;
    const root = document.getElementById("modal-root");
    root.innerHTML = `
      <div class="modal-overlay" id="modal-overlay">
        <div class="modal-card">
          <label>Name</label>
          <input type="text" id="modal-name" value="${escapeHtml(entry.name || "")}">
          <div class="key-badge" style="margin-top:4px;">Recognized by: ${escapeHtml(key)}</div>
          <div class="modal-section culture">
            <h4>Culture project</h4>
            ${statBlockHtml("culture", entry.culture)}
          </div>
          <div class="modal-section science">
            <h4>Science project</h4>
            ${statBlockHtml("science", entry.science)}
          </div>
          <div style="display:flex;gap:10px;margin-top:20px;">
            <button class="modal-close" id="modal-cancel-btn">Cancel</button>
            <button class="modal-close" id="modal-save-btn" style="border-color:var(--culture);color:var(--culture);">Save</button>
          </div>
        </div>
      </div>
    `;
    document.getElementById("modal-overlay").addEventListener("click", (e) => {
      if (e.target.id === "modal-overlay") root.innerHTML = "";
    });
    document
      .getElementById("modal-cancel-btn")
      .addEventListener("click", () => {
        root.innerHTML = "";
      });
    document.getElementById("modal-save-btn").addEventListener("click", () => {
      const newName = document.getElementById("modal-name").value.trim();
      const newKey = recognitionKey(newName) || key;

      function readProj(type) {
        const amount = readNumericInput(
          document.querySelector(`.modal-amount[data-proj="${type}"]`),
        );
        const hours = readNumericInput(
          document.querySelector(`.modal-hours[data-proj="${type}"]`),
        );
        const minutes = readNumericInput(
          document.querySelector(`.modal-minutes[data-proj="${type}"]`),
        );
        if (amount === null || hours === null || minutes === null)
          return undefined;
        const builder = document.querySelector(
          `.modal-builder[data-proj="${type}"]`,
        ).checked;
        if (amount <= 0 && hours <= 0 && minutes <= 0) return null;
        return { amount, hours, minutes, builder };
      }

      const culture = readProj("culture");
      const science = readProj("science");
      if (culture === undefined || science === undefined) return;
      const updated = {
        name: newName || entry.name,
        culture,
        science,
      };

      if (newKey !== key) delete library[key];
      library[newKey] = updated;
      saveLibrary();
      renderLibrary();
      root.innerHTML = "";
    });
  }

  function setDropButtonsActive(active) {
    document.querySelectorAll(".add-btn.dropzone").forEach((btn) => {
      if (active) {
        btn.classList.add("drag-active");
        btn.textContent = btn.dataset.dropLabel;
      } else {
        btn.classList.remove("drag-active");
        btn.classList.remove("drag-over");
        btn.textContent = btn.dataset.defaultLabel;
      }
    });
  }

  // Dropzones no longer need dedicated dragover/dragleave/drop wiring:
  // the pointer-based drag below (see startChipDrag) detects the zone
  // under the pointer itself and calls performDrop() directly. This
  // sidesteps long-standing Firefox flakiness with the native HTML5
  // Drag and Drop API (dragstart firing but the drag never completing).
  function wireDropzone(type) {
    // kept as a no-op hook for backwards compatibility / future wiring
  }

  function performDrop(type, key) {
    const entry = library[key];
    if (!entry) return;
    const proj = entry[type];
    const settlement = {
      id: uid(),
      name: entry.name || "",
      amount: proj ? proj.amount : 0,
      hours: proj ? proj.hours : 0,
      minutes: proj ? proj.minutes : 0,
      builder: proj ? !!proj.builder : false,
    };
    state[type].settlements.push(settlement);
    saveState();
    renderSettlements(type);
    compute(type);
  }

  // ---------- Pointer-based chip drag (replaces native HTML5 DnD) ----------
  // Native HTML5 drag-and-drop has a well-known Firefox reliability problem:
  // the grab/grabbing cursor shows, but dragstart never actually completes a
  // drag session, so drop never fires. Using Pointer Events instead gives us
  // full control and works consistently across Firefox, Chrome, Safari, and
  // touch devices.
  function startChipDrag(startEvent, chip, key) {
    const pointerId = startEvent.pointerId;
    const startX = startEvent.clientX;
    const startY = startEvent.clientY;
    const THRESHOLD = 6;
    let dragging = false;
    let ghost = null;

    function currentZoneAt(x, y) {
      const el = document.elementFromPoint(x, y);
      return el ? el.closest(".add-btn.dropzone") : null;
    }

    function updateDropTarget(x, y) {
      document
        .querySelectorAll(".add-btn.dropzone")
        .forEach((z) => z.classList.remove("drag-over"));
      const zone = currentZoneAt(x, y);
      if (zone) zone.classList.add("drag-over");
    }

    function onMove(e) {
      if (e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragging) {
        if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;
        dragging = true;
        chip.classList.add("dragging-source");
        chip.dataset.justDragged = "1";
        setDropButtonsActive(true);
        const rect = chip.getBoundingClientRect();
        ghost = chip.cloneNode(true);
        ghost.classList.add("chip-ghost");
        ghost.style.width = rect.width + "px";
        document.body.appendChild(ghost);
      }
      e.preventDefault();
      if (ghost) {
        ghost.style.left = e.clientX + 14 + "px";
        ghost.style.top = e.clientY + 14 + "px";
      }
      updateDropTarget(e.clientX, e.clientY);
    }

    function cleanup() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      chip.classList.remove("dragging-source");
      setDropButtonsActive(false);
      document
        .querySelectorAll(".add-btn.dropzone")
        .forEach((z) => z.classList.remove("drag-over"));
      if (ghost) {
        ghost.remove();
        ghost = null;
      }
    }

    function onUp(e) {
      if (e.pointerId !== pointerId) return;
      if (dragging) {
        const zone = currentZoneAt(e.clientX, e.clientY);
        if (zone && zone.dataset.type) {
          performDrop(zone.dataset.type, key);
        }
        cleanup();
        // let click handlers on children see the flag briefly, then clear it
        setTimeout(() => {
          delete chip.dataset.justDragged;
        }, 0);
      } else {
        cleanup();
      }
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  function bindMainField(id, type, key) {
    const el = document.getElementById(id);
    el.addEventListener("input", () => {
      const value = readNumericInput(el);
      if (value === null) return;
      state[type][key] = value;
      saveState();
      compute(type);
    });
  }

  bindMainField("culture-current", "culture", "current");
  bindMainField("culture-target", "culture", "target");
  bindMainField("culture-passive", "culture", "passive");
  bindMainField("science-current", "science", "current");
  bindMainField("science-target", "science", "target");
  bindMainField("science-passive", "science", "passive");

  function applyStateToInputs() {
    document.getElementById("culture-current").value =
      state.culture.current || "";
    document.getElementById("culture-target").value =
      state.culture.target || "";
    document.getElementById("culture-passive").value =
      state.culture.passive || "";
    document.getElementById("science-current").value =
      state.science.current || "";
    document.getElementById("science-target").value =
      state.science.target || "";
    document.getElementById("science-passive").value =
      state.science.passive || "";
  }

  // init
  loadTheme();
  loadState();
  loadLibrary();
  applyStateToInputs();
  renderSettlements("culture");
  renderSettlements("science");
  renderLibrary();
  wireDropzone("culture");
  wireDropzone("science");
  compute("culture");
  compute("science");

  // refresh reach times periodically so "time to target" stays accurate
  setInterval(() => {
    compute("culture");
    compute("science");
  }, 60000);
})();
