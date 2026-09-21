const TASKS_KEY = "compass_tasks_v1";
const JOURNAL_KEY = "compass_journal_v1";
const GOALS_KEY = "compass_goals_v1";

const MOODS = [
  { key: "great", emoji: "😄", label: "Great" },
  { key: "good", emoji: "🙂", label: "Good" },
  { key: "meh", emoji: "😐", label: "Meh" },
  { key: "low", emoji: "😕", label: "Low" },
  { key: "rough", emoji: "😣", label: "Rough" },
];

const GOAL_EMOJI_OPTIONS = ["🎯", "📚", "💰", "🏋️", "🧘", "🌱", "🏆", "✈️", "🎨", "💼", "🧠", "❤️"];

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
const PRIORITY_LABEL = { high: "High", medium: "Medium", low: "Low" };

const state = {
  tasks: loadJSON(TASKS_KEY, []),
  journal: loadJSON(JOURNAL_KEY, {}), // { [dateIso]: { mood, note, updatedAt } }
  goals: loadJSON(GOALS_KEY, []),
  activeTab: "today",
  editingTaskId: null,
  editingGoalMood: null, // mood selected in journal sheet
  selectedGoalEmoji: GOAL_EMOJI_OPTIONS[0],
  showCompleted: false,
};

const els = {
  pageTitle: document.getElementById("pageTitle"),
  dateChip: document.getElementById("dateChip"),
  addBtn: document.getElementById("addBtn"),
  tabbar: document.querySelector(".tabbar"),

  statRow: document.getElementById("statRow"),
  moodQuicklog: document.getElementById("moodQuicklog"),
  moodQuickGrid: document.getElementById("moodQuickGrid"),
  todayTaskList: document.getElementById("todayTaskList"),
  todayEmptyState: document.getElementById("todayEmptyState"),

  taskListToday: document.getElementById("taskListToday"),
  taskListUpcoming: document.getElementById("taskListUpcoming"),
  taskListAnytime: document.getElementById("taskListAnytime"),
  taskListCompleted: document.getElementById("taskListCompleted"),
  toggleCompleted: document.getElementById("toggleCompleted"),
  tasksEmptyState: document.getElementById("tasksEmptyState"),

  journalList: document.getElementById("journalList"),
  journalEmptyState: document.getElementById("journalEmptyState"),

  goalList: document.getElementById("goalList"),
  goalsEmptyState: document.getElementById("goalsEmptyState"),

  taskSheetBackdrop: document.getElementById("taskSheetBackdrop"),
  taskForm: document.getElementById("taskForm"),
  taskSheetTitle: document.getElementById("taskSheetTitle"),
  taskTitleInput: document.getElementById("taskTitleInput"),
  taskDueInput: document.getElementById("taskDueInput"),
  taskRecurringRow: document.getElementById("taskRecurringRow"),
  taskPriorityRow: document.getElementById("taskPriorityRow"),

  journalSheetBackdrop: document.getElementById("journalSheetBackdrop"),
  journalForm: document.getElementById("journalForm"),
  journalSheetTitle: document.getElementById("journalSheetTitle"),
  journalMoodGrid: document.getElementById("journalMoodGrid"),
  journalNoteInput: document.getElementById("journalNoteInput"),

  goalSheetBackdrop: document.getElementById("goalSheetBackdrop"),
  goalForm: document.getElementById("goalForm"),
  goalTitleInput: document.getElementById("goalTitleInput"),
  goalEmojiGrid: document.getElementById("goalEmojiGrid"),
  goalStepsInput: document.getElementById("goalStepsInput"),
};

// ---------- storage ----------

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveTasks() {
  localStorage.setItem(TASKS_KEY, JSON.stringify(state.tasks));
}

function saveJournal() {
  localStorage.setItem(JOURNAL_KEY, JSON.stringify(state.journal));
}

function saveGoals() {
  localStorage.setItem(GOALS_KEY, JSON.stringify(state.goals));
}

// ---------- date helpers ----------

function isoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function weekKey(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // Monday of this week
  d.setDate(d.getDate() + diff);
  return isoDate(d);
}

function todayIso() {
  return isoDate(new Date());
}

function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatDateLabel(dateIso) {
  const d = new Date(`${dateIso}T00:00:00`);
  return new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(d);
}

// ---------- task logic ----------

function taskRefKey(task, today) {
  return task.recurring === "weekly" ? weekKey(today) : isoDate(today);
}

function isTaskDoneOn(task, refKey) {
  if (task.recurring === "none") return !!task.done;
  return (task.completions || []).includes(refKey);
}

function isTaskDueToday(task, todayIsoStr) {
  if (task.recurring === "daily" || task.recurring === "weekly") return true;
  if (!task.dueDate) return false;
  return task.dueDate <= todayIsoStr && !task.done;
}

function toggleTask(taskId) {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;
  const today = new Date();
  if (task.recurring === "none") {
    task.done = !task.done;
    task.completedAt = task.done ? Date.now() : null;
  } else {
    const key = taskRefKey(task, today);
    const list = task.completions || (task.completions = []);
    const idx = list.indexOf(key);
    if (idx === -1) list.push(key);
    else list.splice(idx, 1);
  }
  saveTasks();
  renderAll();
}

function deleteTask(taskId) {
  if (!confirm("Delete this task?")) return;
  state.tasks = state.tasks.filter((t) => t.id !== taskId);
  saveTasks();
  renderAll();
}

function sortByPriorityThenDate(a, b) {
  const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (pr !== 0) return pr;
  return (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
}

function taskItemHtml(task, refKey) {
  const done = isTaskDoneOn(task, refKey);
  const badges = [];
  if (task.recurring === "daily") badges.push('<span class="badge">Daily</span>');
  if (task.recurring === "weekly") badges.push('<span class="badge">Weekly</span>');
  if (task.dueDate && task.recurring === "none") {
    const overdue = task.dueDate < todayIso() && !done;
    badges.push(`<span class="badge${overdue ? " badge-danger" : ""}">${formatDateLabel(task.dueDate)}</span>`);
  }
  badges.push(`<span class="badge badge-priority-${task.priority}">${PRIORITY_LABEL[task.priority]}</span>`);

  return `
    <li class="task-item${done ? " done" : ""}" data-id="${task.id}">
      <button type="button" class="task-check${done ? " done" : ""}" data-toggle-id="${task.id}" aria-label="Toggle done">✓</button>
      <div class="task-body">
        <div class="task-title">${escapeHtml(task.title)}</div>
        <div class="task-meta">${badges.join("")}</div>
      </div>
      <button type="button" class="task-delete" data-delete-id="${task.id}" aria-label="Delete task">✕</button>
    </li>`;
}

function renderTodayTab() {
  const tIso = todayIso();
  const today = new Date();

  const dueToday = state.tasks
    .filter((t) => isTaskDueToday(t, tIso))
    .sort(sortByPriorityThenDate);

  const doneCount = dueToday.filter((t) => isTaskDoneOn(t, taskRefKey(t, today))).length;

  els.todayTaskList.innerHTML = dueToday.map((t) => taskItemHtml(t, taskRefKey(t, today))).join("");
  els.todayEmptyState.hidden = dueToday.length > 0;

  const moodEntry = state.journal[tIso];
  const activeGoals = state.goals.filter((g) => g.steps.length === 0 || g.steps.some((s) => !s.done));

  els.statRow.innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${doneCount}/${dueToday.length}</div>
      <div class="stat-label">Tasks today</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${moodEntry ? MOODS.find((m) => m.key === moodEntry.mood)?.emoji || "—" : "—"}</div>
      <div class="stat-label">Mood today</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${activeGoals.length}</div>
      <div class="stat-label">Active goals</div>
    </div>`;

  els.moodQuicklog.hidden = !!moodEntry;
  if (!moodEntry) {
    els.moodQuickGrid.innerHTML = MOODS.map(
      (m) => `<button type="button" class="mood-option" data-quick-mood="${m.key}">${m.emoji}<span>${m.label}</span></button>`
    ).join("");
  }
}

function renderTasksTab() {
  const tIso = todayIso();
  const today = new Date();

  const todayGroup = state.tasks.filter((t) => isTaskDueToday(t, tIso)).sort(sortByPriorityThenDate);
  const upcomingGroup = state.tasks
    .filter((t) => t.recurring === "none" && t.dueDate && t.dueDate > tIso && !t.done)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const anytimeGroup = state.tasks
    .filter((t) => t.recurring === "none" && !t.dueDate && !t.done)
    .sort(sortByPriorityThenDate);
  const completedGroup = state.tasks
    .filter((t) => t.recurring === "none" && t.done)
    .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));

  els.taskListToday.innerHTML = todayGroup.map((t) => taskItemHtml(t, taskRefKey(t, today))).join("");
  document.getElementById("groupLabel-today").hidden = todayGroup.length === 0;

  els.taskListUpcoming.innerHTML = upcomingGroup.map((t) => taskItemHtml(t, taskRefKey(t, today))).join("");
  document.getElementById("groupLabel-upcoming").hidden = upcomingGroup.length === 0;

  els.taskListAnytime.innerHTML = anytimeGroup.map((t) => taskItemHtml(t, taskRefKey(t, today))).join("");
  document.getElementById("groupLabel-anytime").hidden = anytimeGroup.length === 0;

  els.toggleCompleted.hidden = completedGroup.length === 0;
  els.toggleCompleted.textContent = state.showCompleted ? "Hide completed" : `Show completed (${completedGroup.length})`;
  els.taskListCompleted.hidden = !state.showCompleted;
  els.taskListCompleted.innerHTML = completedGroup.map((t) => taskItemHtml(t, taskRefKey(t, today))).join("");

  const totalVisible = todayGroup.length + upcomingGroup.length + anytimeGroup.length + completedGroup.length;
  els.tasksEmptyState.hidden = totalVisible > 0;
}

// ---------- journal logic ----------

function saveJournalEntry(dateIso, mood, note) {
  state.journal[dateIso] = { mood, note: note.trim(), updatedAt: Date.now() };
  saveJournal();
}

function renderJournalTab() {
  const entries = Object.entries(state.journal).sort((a, b) => b[0].localeCompare(a[0]));

  els.journalList.innerHTML = entries
    .map(([dateIso, entry]) => {
      const mood = MOODS.find((m) => m.key === entry.mood);
      return `
        <li class="journal-item" data-date="${dateIso}">
          <div class="journal-mood">${mood ? mood.emoji : "—"}</div>
          <div class="journal-body">
            <div class="journal-date">${formatDateLabel(dateIso)}</div>
            ${entry.note ? `<div class="journal-note">${escapeHtml(entry.note)}</div>` : '<div class="journal-note journal-note-empty">No notes</div>'}
          </div>
        </li>`;
    })
    .join("");

  els.journalEmptyState.hidden = entries.length > 0;
}

// ---------- goal logic ----------

function goalProgress(goal) {
  if (goal.steps.length === 0) return null;
  const done = goal.steps.filter((s) => s.done).length;
  return Math.round((done / goal.steps.length) * 100);
}

function renderGoalsTab() {
  els.goalList.innerHTML = state.goals
    .map((g) => {
      const progress = goalProgress(g);
      const stepsHtml = g.steps
        .map(
          (s) => `
        <li class="goal-step${s.done ? " done" : ""}" data-goal-id="${g.id}" data-step-id="${s.id}">
          <button type="button" class="step-check${s.done ? " done" : ""}" data-toggle-step="${s.id}" data-goal-id="${g.id}" aria-label="Toggle step">✓</button>
          <span class="step-text">${escapeHtml(s.text)}</span>
          <button type="button" class="step-delete" data-delete-step="${s.id}" data-goal-id="${g.id}" aria-label="Delete step">✕</button>
        </li>`
        )
        .join("");

      return `
        <li class="goal-card" data-id="${g.id}">
          <div class="goal-top">
            <div class="goal-emoji">${g.emoji}</div>
            <div class="goal-info">
              <div class="goal-title">${escapeHtml(g.title)}</div>
              ${progress !== null ? `<div class="goal-progress-label">${progress}% complete</div>` : '<div class="goal-progress-label">No steps yet</div>'}
            </div>
            <button type="button" class="habit-delete" data-delete-goal="${g.id}" aria-label="Delete goal">✕</button>
          </div>
          ${progress !== null ? `<div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div>` : ""}
          <ul class="goal-steps">${stepsHtml}</ul>
          <form class="add-step-form" data-goal-id="${g.id}">
            <input type="text" class="add-step-input" placeholder="Add a step" maxlength="80" />
            <button type="submit" class="add-step-btn">Add</button>
          </form>
        </li>`;
    })
    .join("");

  els.goalsEmptyState.hidden = state.goals.length > 0;
}

// ---------- rendering ----------

function renderDateChip() {
  els.dateChip.textContent = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date());
}

function renderAll() {
  renderDateChip();
  renderTodayTab();
  renderTasksTab();
  renderJournalTab();
  renderGoalsTab();
}

// ---------- tab switching ----------

const TAB_TITLES = { today: "Today", tasks: "Tasks", journal: "Journal", goals: "Goals" };

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll(".tab-panel").forEach((el) => (el.hidden = true));
  document.getElementById(`tab-${tab}`).hidden = false;
  document.querySelectorAll(".tab-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
  els.pageTitle.textContent = TAB_TITLES[tab];
}

els.tabbar.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  switchTab(btn.dataset.tab);
});

// ---------- FAB ----------

els.addBtn.addEventListener("click", () => {
  if (state.activeTab === "journal") {
    openJournalSheet(todayIso());
  } else if (state.activeTab === "goals") {
    openGoalSheet();
  } else {
    openTaskSheet();
  }
});

// ---------- task sheet ----------

function openTaskSheet() {
  state.editingTaskId = null;
  els.taskSheetTitle.textContent = "Add task";
  els.taskTitleInput.value = "";
  els.taskDueInput.value = "";
  setChipSelected(els.taskRecurringRow, "recurring", "none");
  setChipSelected(els.taskPriorityRow, "priority", "medium");
  els.taskSheetBackdrop.hidden = false;
  setTimeout(() => els.taskTitleInput.focus(), 50);
}

function setChipSelected(row, dataKey, value) {
  row.querySelectorAll(".chip").forEach((c) => c.classList.toggle("selected", c.dataset[dataKey] === value));
}

function getChipSelected(row, dataKey) {
  const el = row.querySelector(".chip.selected");
  return el ? el.dataset[dataKey] : null;
}

els.taskRecurringRow.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  setChipSelected(els.taskRecurringRow, "recurring", chip.dataset.recurring);
});

els.taskPriorityRow.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  setChipSelected(els.taskPriorityRow, "priority", chip.dataset.priority);
});

els.taskForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const title = els.taskTitleInput.value.trim();
  if (!title) return;
  const recurring = getChipSelected(els.taskRecurringRow, "recurring") || "none";
  const priority = getChipSelected(els.taskPriorityRow, "priority") || "medium";
  const dueDate = els.taskDueInput.value || null;

  state.tasks.push({
    id: newId(),
    title,
    dueDate: recurring === "none" ? dueDate : null,
    recurring,
    priority,
    done: false,
    completedAt: null,
    completions: [],
    createdAt: Date.now(),
  });
  saveTasks();
  closeSheet(els.taskSheetBackdrop);
  renderAll();
});

// ---------- journal sheet ----------

function openJournalSheet(dateIso) {
  const existing = state.journal[dateIso];
  state.editingGoalMood = existing ? existing.mood : null;
  els.journalSheetTitle.textContent = dateIso === todayIso() ? "Today's entry" : formatDateLabel(dateIso);
  els.journalForm.dataset.date = dateIso;
  els.journalNoteInput.value = existing ? existing.note : "";
  renderJournalMoodGrid();
  els.journalSheetBackdrop.hidden = false;
}

function renderJournalMoodGrid() {
  els.journalMoodGrid.innerHTML = MOODS.map(
    (m) =>
      `<button type="button" class="mood-option${m.key === state.editingGoalMood ? " selected" : ""}" data-mood="${m.key}">${m.emoji}<span>${m.label}</span></button>`
  ).join("");
}

els.journalMoodGrid.addEventListener("click", (e) => {
  const btn = e.target.closest(".mood-option");
  if (!btn) return;
  state.editingGoalMood = btn.dataset.mood;
  renderJournalMoodGrid();
});

els.journalForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!state.editingGoalMood) {
    alert("Pick a mood first.");
    return;
  }
  const dateIso = els.journalForm.dataset.date;
  saveJournalEntry(dateIso, state.editingGoalMood, els.journalNoteInput.value);
  closeSheet(els.journalSheetBackdrop);
  renderAll();
});

els.moodQuickGrid.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-quick-mood]");
  if (!btn) return;
  saveJournalEntry(todayIso(), btn.dataset.quickMood, "");
  renderAll();
});

els.journalList.addEventListener("click", (e) => {
  const item = e.target.closest(".journal-item");
  if (!item) return;
  openJournalSheet(item.dataset.date);
});

// ---------- goal sheet ----------

function populateGoalEmojiGrid() {
  els.goalEmojiGrid.innerHTML = GOAL_EMOJI_OPTIONS.map(
    (em) => `<button type="button" class="emoji-option${em === state.selectedGoalEmoji ? " selected" : ""}" data-emoji="${em}">${em}</button>`
  ).join("");
}

els.goalEmojiGrid.addEventListener("click", (e) => {
  const btn = e.target.closest(".emoji-option");
  if (!btn) return;
  state.selectedGoalEmoji = btn.dataset.emoji;
  populateGoalEmojiGrid();
});

function openGoalSheet() {
  els.goalTitleInput.value = "";
  els.goalStepsInput.value = "";
  state.selectedGoalEmoji = GOAL_EMOJI_OPTIONS[0];
  populateGoalEmojiGrid();
  els.goalSheetBackdrop.hidden = false;
  setTimeout(() => els.goalTitleInput.focus(), 50);
}

els.goalForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const title = els.goalTitleInput.value.trim();
  if (!title) return;
  const steps = els.goalStepsInput.value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((text) => ({ id: newId(), text, done: false }));

  state.goals.push({
    id: newId(),
    title,
    emoji: state.selectedGoalEmoji,
    steps,
    createdAt: Date.now(),
  });
  saveGoals();
  closeSheet(els.goalSheetBackdrop);
  renderAll();
});

els.goalList.addEventListener("click", (e) => {
  const toggleStep = e.target.closest("[data-toggle-step]");
  if (toggleStep) {
    const goal = state.goals.find((g) => g.id === toggleStep.dataset.goalId);
    const step = goal?.steps.find((s) => s.id === toggleStep.dataset.toggleStep);
    if (step) step.done = !step.done;
    saveGoals();
    renderAll();
    return;
  }

  const deleteStep = e.target.closest("[data-delete-step]");
  if (deleteStep) {
    const goal = state.goals.find((g) => g.id === deleteStep.dataset.goalId);
    if (goal) goal.steps = goal.steps.filter((s) => s.id !== deleteStep.dataset.deleteStep);
    saveGoals();
    renderAll();
    return;
  }

  const deleteGoal = e.target.closest("[data-delete-goal]");
  if (deleteGoal) {
    if (!confirm("Delete this goal and its steps?")) return;
    state.goals = state.goals.filter((g) => g.id !== deleteGoal.dataset.deleteGoal);
    saveGoals();
    renderAll();
  }
});

els.goalList.addEventListener("submit", (e) => {
  const form = e.target.closest(".add-step-form");
  if (!form) return;
  e.preventDefault();
  const input = form.querySelector(".add-step-input");
  const text = input.value.trim();
  if (!text) return;
  const goal = state.goals.find((g) => g.id === form.dataset.goalId);
  if (!goal) return;
  goal.steps.push({ id: newId(), text, done: false });
  saveGoals();
  renderAll();
});

// ---------- task/completed toggling ----------

els.toggleCompleted.addEventListener("click", () => {
  state.showCompleted = !state.showCompleted;
  renderTasksTab();
});

document.addEventListener("click", (e) => {
  const toggleBtn = e.target.closest("[data-toggle-id]");
  if (toggleBtn) {
    toggleTask(toggleBtn.dataset.toggleId);
    return;
  }
  const deleteBtn = e.target.closest("[data-delete-id]");
  if (deleteBtn) {
    deleteTask(deleteBtn.dataset.deleteId);
  }
});

// ---------- sheet dismissal ----------

function closeSheet(backdrop) {
  backdrop.hidden = true;
}

document.querySelectorAll(".sheet-backdrop").forEach((backdrop) => {
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeSheet(backdrop);
  });
  backdrop.querySelectorAll("[data-cancel]").forEach((btn) => {
    btn.addEventListener("click", () => closeSheet(backdrop));
  });
});

// ---------- init ----------

renderAll();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
