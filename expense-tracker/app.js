const STORAGE_KEY = "spendy_expenses_v1";

const CATEGORIES = [
  { id: "food", label: "Food", emoji: "🍔" },
  { id: "transport", label: "Transport", emoji: "🚗" },
  { id: "housing", label: "Housing", emoji: "🏠" },
  { id: "shopping", label: "Shopping", emoji: "🛍️" },
  { id: "bills", label: "Bills", emoji: "🧾" },
  { id: "entertainment", label: "Entertainment", emoji: "🎬" },
  { id: "health", label: "Health", emoji: "💊" },
  { id: "other", label: "Other", emoji: "🔖" },
];

const categoryById = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

const state = {
  expenses: loadExpenses(),
  monthCursor: startOfMonth(new Date()),
};

const els = {
  monthLabel: document.getElementById("monthLabel"),
  prevMonth: document.getElementById("prevMonth"),
  nextMonth: document.getElementById("nextMonth"),
  totalAmount: document.getElementById("totalAmount"),
  breakdown: document.getElementById("breakdown"),
  txList: document.getElementById("txList"),
  emptyState: document.getElementById("emptyState"),
  addBtn: document.getElementById("addBtn"),
  sheetBackdrop: document.getElementById("sheetBackdrop"),
  addForm: document.getElementById("addForm"),
  cancelBtn: document.getElementById("cancelBtn"),
  amountInput: document.getElementById("amountInput"),
  categoryInput: document.getElementById("categoryInput"),
  noteInput: document.getElementById("noteInput"),
  dateInput: document.getElementById("dateInput"),
};

function loadExpenses() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveExpenses() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.expenses));
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatMoney(n) {
  return `$${n.toFixed(2)}`;
}

function isoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function expensesForCursor() {
  const y = state.monthCursor.getFullYear();
  const m = state.monthCursor.getMonth();
  return state.expenses.filter((e) => {
    const d = new Date(e.date + "T00:00:00");
    return d.getFullYear() === y && d.getMonth() === m;
  });
}

function populateCategorySelect() {
  els.categoryInput.innerHTML = CATEGORIES.map(
    (c) => `<option value="${c.id}">${c.emoji} ${c.label}</option>`
  ).join("");
}

function renderMonthLabel() {
  els.monthLabel.textContent = state.monthCursor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function renderTotal(monthExpenses) {
  const total = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
  els.totalAmount.textContent = formatMoney(total);
}

function renderBreakdown(monthExpenses) {
  const sums = {};
  for (const e of monthExpenses) {
    sums[e.category] = (sums[e.category] || 0) + e.amount;
  }
  const rows = Object.entries(sums).sort((a, b) => b[1] - a[1]);
  const max = rows.length ? rows[0][1] : 0;

  els.breakdown.innerHTML = rows
    .map(([catId, amt]) => {
      const cat = categoryById[catId] || { label: catId, emoji: "🔖" };
      const pct = max > 0 ? Math.round((amt / max) * 100) : 0;
      return `
        <div class="breakdown-row">
          <div class="breakdown-top">
            <span class="breakdown-cat">${cat.emoji} ${cat.label}</span>
            <span class="breakdown-amt">${formatMoney(amt)}</span>
          </div>
          <div class="breakdown-bar-track">
            <div class="breakdown-bar-fill" style="width:${pct}%"></div>
          </div>
        </div>`;
    })
    .join("");
}

function renderTxList(monthExpenses) {
  if (monthExpenses.length === 0) {
    els.txList.innerHTML = "";
    els.emptyState.hidden = false;
    return;
  }
  els.emptyState.hidden = true;

  const sorted = [...monthExpenses].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return b.createdAt - a.createdAt;
  });

  const groups = [];
  let lastDate = null;
  for (const e of sorted) {
    if (e.date !== lastDate) {
      groups.push({ date: e.date, items: [] });
      lastDate = e.date;
    }
    groups[groups.length - 1].items.push(e);
  }

  const today = isoDate(new Date());
  const yesterday = isoDate(new Date(Date.now() - 86400000));

  els.txList.innerHTML = groups
    .map((group) => {
      const d = new Date(group.date + "T00:00:00");
      let heading;
      if (group.date === today) heading = "Today";
      else if (group.date === yesterday) heading = "Yesterday";
      else heading = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

      const items = group.items
        .map((e) => {
          const cat = categoryById[e.category] || { label: e.category, emoji: "🔖" };
          return `
            <li class="tx-item" data-id="${e.id}">
              <div class="tx-emoji">${cat.emoji}</div>
              <div class="tx-info">
                <div class="tx-cat">${cat.label}</div>
                ${e.note ? `<div class="tx-note">${escapeHtml(e.note)}</div>` : ""}
              </div>
              <div class="tx-amount">${formatMoney(e.amount)}</div>
              <button class="tx-delete" data-delete-id="${e.id}" aria-label="Delete">✕</button>
            </li>`;
        })
        .join("");

      return `<div class="tx-day-heading">${heading}</div>${items}`;
    })
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderAll() {
  renderMonthLabel();
  const monthExpenses = expensesForCursor();
  renderTotal(monthExpenses);
  renderBreakdown(monthExpenses);
  renderTxList(monthExpenses);
}

function openSheet() {
  els.dateInput.value = isoDate(new Date());
  els.amountInput.value = "";
  els.noteInput.value = "";
  els.categoryInput.value = CATEGORIES[0].id;
  els.sheetBackdrop.hidden = false;
  setTimeout(() => els.amountInput.focus(), 50);
}

function closeSheet() {
  els.sheetBackdrop.hidden = true;
}

els.prevMonth.addEventListener("click", () => {
  state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() - 1, 1);
  renderAll();
});

els.nextMonth.addEventListener("click", () => {
  state.monthCursor = new Date(state.monthCursor.getFullYear(), state.monthCursor.getMonth() + 1, 1);
  renderAll();
});

els.addBtn.addEventListener("click", openSheet);
els.cancelBtn.addEventListener("click", closeSheet);
els.sheetBackdrop.addEventListener("click", (e) => {
  if (e.target === els.sheetBackdrop) closeSheet();
});

els.addForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const amount = parseFloat(els.amountInput.value);
  if (!Number.isFinite(amount) || amount <= 0) return;

  state.expenses.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    amount,
    category: els.categoryInput.value,
    note: els.noteInput.value.trim(),
    date: els.dateInput.value,
    createdAt: Date.now(),
  });
  saveExpenses();

  const addedDate = new Date(els.dateInput.value + "T00:00:00");
  state.monthCursor = startOfMonth(addedDate);

  closeSheet();
  renderAll();
});

els.txList.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-delete-id]");
  if (!btn) return;
  const id = btn.getAttribute("data-delete-id");
  if (!confirm("Delete this expense?")) return;
  state.expenses = state.expenses.filter((exp) => exp.id !== id);
  saveExpenses();
  renderAll();
});

populateCategorySelect();
renderAll();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
