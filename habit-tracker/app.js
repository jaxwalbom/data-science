const HABITS_KEY = "streaks_habits_v1";
const COMPLETIONS_KEY = "streaks_completions_v1";

const EMOJI_OPTIONS = ["💧", "🏃", "📖", "🧘", "😴", "🥗", "✍️", "🚭", "🎯", "💪", "🎸", "🧹"];

const state = {
  habits: loadHabits(),
  completions: loadCompletions(), // { [habitId]: string[] of ISO dates }
  selectedEmoji: EMOJI_OPTIONS[0],
};

const els = {
  todaySummary: document.getElementById("todaySummary"),
  habitList: document.getElementById("habitList"),
  emptyState: document.getElementById("emptyState"),
  addBtn: document.getElementById("addBtn"),
  sheetBackdrop: document.getElementById("sheetBackdrop"),
  addForm: document.getElementById("addForm"),
  cancelBtn: document.getElementById("cancelBtn"),
  nameInput: document.getElementById("nameInput"),
  emojiGrid: document.getElementById("emojiGrid"),
};

function loadHabits() {
  try {
    const raw = localStorage.getItem(HABITS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHabits() {
  localStorage.setItem(HABITS_KEY, JSON.stringify(state.habits));
}

function loadCompletions() {
  try {
    const raw = localStorage.getItem(COMPLETIONS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCompletions() {
  localStorage.setItem(COMPLETIONS_KEY, JSON.stringify(state.completions));
}

function isoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function isDone(habitId, dateIso) {
  const list = state.completions[habitId];
  return !!list && list.includes(dateIso);
}

function toggleDone(habitId, dateIso) {
  const list = state.completions[habitId] || [];
  const idx = list.indexOf(dateIso);
  if (idx === -1) {
    list.push(dateIso);
  } else {
    list.splice(idx, 1);
  }
  state.completions[habitId] = list;
  saveCompletions();
}

function currentStreak(habitId) {
  let streak = 0;
  let cursor = new Date();
  const todayIso = isoDate(cursor);
  if (!isDone(habitId, todayIso)) {
    cursor = addDays(cursor, -1);
  }
  while (isDone(habitId, isoDate(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function last7Days() {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    days.push(addDays(new Date(), -i));
  }
  return days;
}

function populateEmojiGrid() {
  els.emojiGrid.innerHTML = EMOJI_OPTIONS.map(
    (e) => `<button type="button" class="emoji-option${e === state.selectedEmoji ? " selected" : ""}" data-emoji="${e}">${e}</button>`
  ).join("");
}

els.emojiGrid.addEventListener("click", (e) => {
  const btn = e.target.closest(".emoji-option");
  if (!btn) return;
  state.selectedEmoji = btn.getAttribute("data-emoji");
  populateEmojiGrid();
});

function renderTodaySummary() {
  const todayIso = isoDate(new Date());
  const doneCount = state.habits.filter((h) => isDone(h.id, todayIso)).length;
  els.todaySummary.textContent = `${doneCount}/${state.habits.length} today`;
}

function renderHabitList() {
  if (state.habits.length === 0) {
    els.habitList.innerHTML = "";
    els.emptyState.hidden = false;
    return;
  }
  els.emptyState.hidden = true;

  const todayIso = isoDate(new Date());
  const days = last7Days();
  const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: "narrow" });

  els.habitList.innerHTML = state.habits
    .map((h) => {
      const streak = currentStreak(h.id);
      const todayDone = isDone(h.id, todayIso);
      const dayCells = days
        .map((d) => {
          const dIso = isoDate(d);
          const done = isDone(h.id, dIso);
          const isToday = dIso === todayIso;
          return `
            <div class="day-cell">
              <span class="day-label">${weekdayFmt.format(d)}</span>
              <button type="button" class="day-dot${done ? " done" : ""}${isToday ? " today" : ""}"
                data-habit-id="${h.id}" data-date="${dIso}" aria-label="${dIso}"></button>
            </div>`;
        })
        .join("");

      return `
        <li class="habit-item" data-id="${h.id}">
          <div class="habit-top">
            <div class="habit-emoji">${h.emoji}</div>
            <div class="habit-info">
              <div class="habit-name">${escapeHtml(h.name)}</div>
              <div class="habit-streak${streak > 0 ? " active" : ""}">${streak > 0 ? `🔥 ${streak} day${streak === 1 ? "" : "s"}` : "No streak yet"}</div>
            </div>
            <button type="button" class="habit-check${todayDone ? " done" : ""}" data-toggle-today="${h.id}" aria-label="Mark today done">✓</button>
            <button type="button" class="habit-delete" data-delete-id="${h.id}" aria-label="Delete habit">✕</button>
          </div>
          <div class="habit-week">${dayCells}</div>
        </li>`;
    })
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderAll() {
  renderTodaySummary();
  renderHabitList();
}

function openSheet() {
  els.nameInput.value = "";
  state.selectedEmoji = EMOJI_OPTIONS[0];
  populateEmojiGrid();
  els.sheetBackdrop.hidden = false;
  setTimeout(() => els.nameInput.focus(), 50);
}

function closeSheet() {
  els.sheetBackdrop.hidden = true;
}

els.addBtn.addEventListener("click", openSheet);
els.cancelBtn.addEventListener("click", closeSheet);
els.sheetBackdrop.addEventListener("click", (e) => {
  if (e.target === els.sheetBackdrop) closeSheet();
});

els.addForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = els.nameInput.value.trim();
  if (!name) return;

  state.habits.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    name,
    emoji: state.selectedEmoji,
    createdAt: Date.now(),
  });
  saveHabits();

  closeSheet();
  renderAll();
});

els.habitList.addEventListener("click", (e) => {
  const toggleBtn = e.target.closest("[data-toggle-today]");
  if (toggleBtn) {
    const habitId = toggleBtn.getAttribute("data-toggle-today");
    toggleDone(habitId, isoDate(new Date()));
    renderAll();
    return;
  }

  const dayDot = e.target.closest(".day-dot");
  if (dayDot) {
    const habitId = dayDot.getAttribute("data-habit-id");
    const dateIso = dayDot.getAttribute("data-date");
    toggleDone(habitId, dateIso);
    renderAll();
    return;
  }

  const deleteBtn = e.target.closest("[data-delete-id]");
  if (deleteBtn) {
    const id = deleteBtn.getAttribute("data-delete-id");
    if (!confirm("Delete this habit and its history?")) return;
    state.habits = state.habits.filter((h) => h.id !== id);
    delete state.completions[id];
    saveHabits();
    saveCompletions();
    renderAll();
  }
});

populateEmojiGrid();
renderAll();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
