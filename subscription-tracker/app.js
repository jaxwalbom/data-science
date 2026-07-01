const SUBS_KEY = "renewals_subs_v1";
const VAULT_META_KEY = "renewals_vault_meta_v1";
const PBKDF2_ITERATIONS = 250000;

const state = {
  subs: loadSubs(),
  revealed: {}, // in-memory only: { [subId]: { username, password, notes } }
};

let sessionKey = null; // in-memory CryptoKey, never persisted
let vaultPending = null;
let vaultMode = "unlock";

const els = {
  costSummary: document.getElementById("costSummary"),
  lockBtn: document.getElementById("lockBtn"),
  subList: document.getElementById("subList"),
  emptyState: document.getElementById("emptyState"),
  addBtn: document.getElementById("addBtn"),

  sheetBackdrop: document.getElementById("sheetBackdrop"),
  addForm: document.getElementById("addForm"),
  cancelBtn: document.getElementById("cancelBtn"),
  nameInput: document.getElementById("nameInput"),
  costInput: document.getElementById("costInput"),
  cycleInput: document.getElementById("cycleInput"),
  renewalInput: document.getElementById("renewalInput"),
  urlInput: document.getElementById("urlInput"),
  usernameInput: document.getElementById("usernameInput"),
  passwordInput: document.getElementById("passwordInput"),
  togglePasswordInput: document.getElementById("togglePasswordInput"),
  notesInput: document.getElementById("notesInput"),

  vaultBackdrop: document.getElementById("vaultBackdrop"),
  vaultForm: document.getElementById("vaultForm"),
  vaultTitle: document.getElementById("vaultTitle"),
  vaultDesc: document.getElementById("vaultDesc"),
  vaultPasswordInput: document.getElementById("vaultPasswordInput"),
  vaultConfirmField: document.getElementById("vaultConfirmField"),
  vaultConfirmInput: document.getElementById("vaultConfirmInput"),
  vaultError: document.getElementById("vaultError"),
  vaultCancelBtn: document.getElementById("vaultCancelBtn"),
  vaultSubmitBtn: document.getElementById("vaultSubmitBtn"),
};

// ---------- storage ----------

function loadSubs() {
  try {
    const raw = localStorage.getItem(SUBS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSubs() {
  localStorage.setItem(SUBS_KEY, JSON.stringify(state.subs));
}

function loadVaultMeta() {
  try {
    const raw = localStorage.getItem(VAULT_META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ---------- crypto ----------

function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

function bufToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBuf(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

async function deriveKey(password, saltBuf) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBuf, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptJSON(key, obj) {
  const iv = randomBytes(12);
  const data = new TextEncoder().encode(JSON.stringify(obj));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  return { iv: bufToBase64(iv), ct: bufToBase64(ct) };
}

async function decryptJSON(key, encObj) {
  const iv = new Uint8Array(base64ToBuf(encObj.iv));
  const ctBuf = base64ToBuf(encObj.ct);
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ctBuf);
  return JSON.parse(new TextDecoder().decode(plainBuf));
}

async function createVault(password) {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  const verifier = await encryptJSON(key, { check: "renewals-vault" });
  localStorage.setItem(VAULT_META_KEY, JSON.stringify({ salt: bufToBase64(salt), verifier }));
  return key;
}

async function tryUnlock(password) {
  const meta = loadVaultMeta();
  if (!meta) return null;
  const salt = base64ToBuf(meta.salt);
  const key = await deriveKey(password, salt);
  try {
    const result = await decryptJSON(key, meta.verifier);
    return result && result.check === "renewals-vault" ? key : null;
  } catch {
    return null;
  }
}

function ensureVaultKey() {
  if (sessionKey) return Promise.resolve(sessionKey);
  const mode = loadVaultMeta() ? "unlock" : "create";
  return openVaultPrompt(mode);
}

// ---------- vault prompt sheet ----------

function openVaultPrompt(mode) {
  vaultMode = mode;
  hideVaultError();
  els.vaultPasswordInput.value = "";
  els.vaultConfirmInput.value = "";
  if (mode === "create") {
    els.vaultTitle.textContent = "Create master password";
    els.vaultDesc.textContent = "This encrypts saved logins on this device. There's no recovery — if you forget it, saved logins can't be recovered.";
    els.vaultConfirmField.hidden = false;
    els.vaultSubmitBtn.textContent = "Create";
  } else {
    els.vaultTitle.textContent = "Unlock vault";
    els.vaultDesc.textContent = "Enter your master password to view or save logins.";
    els.vaultConfirmField.hidden = true;
    els.vaultSubmitBtn.textContent = "Unlock";
  }
  els.vaultBackdrop.hidden = false;
  setTimeout(() => els.vaultPasswordInput.focus(), 50);
  return new Promise((resolve, reject) => {
    vaultPending = { resolve, reject };
  });
}

function closeVaultPrompt() {
  els.vaultBackdrop.hidden = true;
}

function showVaultError(msg) {
  els.vaultError.textContent = msg;
  els.vaultError.hidden = false;
}

function hideVaultError() {
  els.vaultError.hidden = true;
  els.vaultError.textContent = "";
}

let vaultSubmitInFlight = false;

els.vaultForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (vaultSubmitInFlight) return;
  vaultSubmitInFlight = true;
  els.vaultSubmitBtn.disabled = true;

  try {
    const pwd = els.vaultPasswordInput.value;
    hideVaultError();

    if (vaultMode === "create") {
      if (pwd.length < 8) {
        showVaultError("Master password must be at least 8 characters.");
        return;
      }
      if (pwd !== els.vaultConfirmInput.value) {
        showVaultError("Passwords don't match.");
        return;
      }
      const key = await createVault(pwd);
      sessionKey = key;
      closeVaultPrompt();
      renderLockIcon();
      const pending = vaultPending;
      vaultPending = null;
      pending?.resolve(key);
    } else {
      const key = await tryUnlock(pwd);
      if (!key) {
        showVaultError("Incorrect master password.");
        return;
      }
      sessionKey = key;
      closeVaultPrompt();
      renderLockIcon();
      const pending = vaultPending;
      vaultPending = null;
      pending?.resolve(key);
    }
  } finally {
    vaultSubmitInFlight = false;
    els.vaultSubmitBtn.disabled = false;
  }
});

els.vaultCancelBtn.addEventListener("click", () => {
  closeVaultPrompt();
  const pending = vaultPending;
  vaultPending = null;
  pending?.reject(new Error("cancelled"));
});

els.vaultBackdrop.addEventListener("click", (e) => {
  if (e.target === els.vaultBackdrop) {
    closeVaultPrompt();
    const pending = vaultPending;
    vaultPending = null;
    pending?.reject(new Error("cancelled"));
  }
});

els.lockBtn.addEventListener("click", async () => {
  if (sessionKey) {
    sessionKey = null;
    state.revealed = {};
    renderAll();
  } else {
    try {
      await ensureVaultKey();
      renderAll();
    } catch {
      // cancelled
    }
  }
});

function renderLockIcon() {
  els.lockBtn.textContent = sessionKey ? "🔓" : "🔒";
  els.lockBtn.title = sessionKey ? "Lock vault" : "Unlock vault";
}

// ---------- helpers ----------

function isoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function monthlyCost(sub) {
  if (sub.cycle === "yearly") return sub.cost / 12;
  if (sub.cycle === "weekly") return sub.cost * 4.345;
  return sub.cost;
}

function cycleSuffix(cycle) {
  if (cycle === "yearly") return "/yr";
  if (cycle === "weekly") return "/wk";
  return "/mo";
}

function renewalBadge(sub) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const renewal = new Date(sub.nextRenewal + "T00:00:00");
  const days = Math.round((renewal - today) / 86400000);

  if (days < 0) return { cls: "urgent", text: `${Math.abs(days)}d overdue` };
  if (days === 0) return { cls: "urgent", text: "Renews today" };
  if (days <= 3) return { cls: "urgent", text: `In ${days}d` };
  if (days <= 7) return { cls: "soon", text: `In ${days}d` };
  return { cls: "", text: `In ${days}d` };
}

function advanceRenewal(sub) {
  const d = new Date(sub.nextRenewal + "T00:00:00");
  if (sub.cycle === "monthly") d.setMonth(d.getMonth() + 1);
  else if (sub.cycle === "yearly") d.setFullYear(d.getFullYear() + 1);
  else if (sub.cycle === "weekly") d.setDate(d.getDate() + 7);
  sub.nextRenewal = isoDate(d);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function toggleReveal(id) {
  if (state.revealed[id]) {
    delete state.revealed[id];
    renderAll();
    return;
  }
  const sub = state.subs.find((s) => s.id === id);
  if (!sub || !sub.credentials) return;
  try {
    const key = await ensureVaultKey();
    const data = await decryptJSON(key, sub.credentials);
    state.revealed[id] = data;
    renderAll();
  } catch {
    // cancelled or wrong password; leave hidden
  }
}

// ---------- rendering ----------

function renderCostSummary() {
  const total = state.subs.reduce((sum, s) => sum + monthlyCost(s), 0);
  els.costSummary.textContent = `$${total.toFixed(2)}/mo`;
}

function renderSubList() {
  if (state.subs.length === 0) {
    els.subList.innerHTML = "";
    els.emptyState.hidden = false;
    return;
  }
  els.emptyState.hidden = true;

  const sorted = [...state.subs].sort((a, b) => (a.nextRenewal < b.nextRenewal ? -1 : a.nextRenewal > b.nextRenewal ? 1 : 0));

  els.subList.innerHTML = sorted
    .map((sub) => {
      const badge = renewalBadge(sub);
      const initial = (sub.name.trim().charAt(0) || "?").toUpperCase();
      const revealed = state.revealed[sub.id];

      let credentialHtml = "";
      if (sub.credentials && revealed) {
        const rows = [];
        if (revealed.username) {
          rows.push(`<div class="credential-row"><span class="credential-label">User</span><span class="credential-value">${escapeHtml(revealed.username)}</span><button type="button" class="copy-btn" data-copy="${escapeAttr(revealed.username)}">Copy</button></div>`);
        }
        if (revealed.password) {
          rows.push(`<div class="credential-row"><span class="credential-label">Pass</span><span class="credential-value">${escapeHtml(revealed.password)}</span><button type="button" class="copy-btn" data-copy="${escapeAttr(revealed.password)}">Copy</button></div>`);
        }
        if (revealed.notes) {
          rows.push(`<div class="credential-row"><span class="credential-label">Notes</span><span class="credential-value">${escapeHtml(revealed.notes)}</span></div>`);
        }
        credentialHtml = `<div class="credential-panel">${rows.join("")}</div>`;
      }

      return `
        <li class="sub-item" data-id="${sub.id}">
          <div class="sub-top">
            <div class="sub-avatar">${initial}</div>
            <div class="sub-info">
              <div class="sub-name">${escapeHtml(sub.name)}</div>
              <div class="sub-cost">$${sub.cost.toFixed(2)}${cycleSuffix(sub.cycle)}</div>
            </div>
            <div class="sub-badge ${badge.cls}">${badge.text}</div>
            <button type="button" class="sub-delete" data-delete-id="${sub.id}" aria-label="Delete">✕</button>
          </div>
          <div class="sub-actions">
            <button type="button" class="pill-btn renewed" data-renew-id="${sub.id}">Renewed ✓</button>
            ${sub.url ? `<a class="pill-btn" href="${escapeAttr(sub.url)}" target="_blank" rel="noopener noreferrer">Open site</a>` : ""}
            ${sub.credentials ? `<button type="button" class="pill-btn" data-reveal-id="${sub.id}">${revealed ? "Hide login" : "Show login"}</button>` : ""}
          </div>
          ${credentialHtml}
        </li>`;
    })
    .join("");
}

function renderAll() {
  renderCostSummary();
  renderSubList();
  renderLockIcon();
}

// ---------- add-subscription sheet ----------

function openAddSheet() {
  els.addForm.reset();
  els.renewalInput.value = isoDate(new Date());
  els.cycleInput.value = "monthly";
  els.passwordInput.type = "password";
  els.togglePasswordInput.textContent = "👁";
  els.sheetBackdrop.hidden = false;
  setTimeout(() => els.nameInput.focus(), 50);
}

function closeAddSheet() {
  els.sheetBackdrop.hidden = true;
}

els.addBtn.addEventListener("click", openAddSheet);
els.cancelBtn.addEventListener("click", closeAddSheet);
els.sheetBackdrop.addEventListener("click", (e) => {
  if (e.target === els.sheetBackdrop) closeAddSheet();
});

els.togglePasswordInput.addEventListener("click", () => {
  const isPwd = els.passwordInput.type === "password";
  els.passwordInput.type = isPwd ? "text" : "password";
  els.togglePasswordInput.textContent = isPwd ? "🙈" : "👁";
});

let addSubmitInFlight = false;

els.addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (addSubmitInFlight) return;
  addSubmitInFlight = true;
  const submitBtn = els.addForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;

  try {
    const name = els.nameInput.value.trim();
    const cost = parseFloat(els.costInput.value);
    const cycle = els.cycleInput.value;
    const nextRenewal = els.renewalInput.value;
    const url = els.urlInput.value.trim();
    const username = els.usernameInput.value.trim();
    const password = els.passwordInput.value;
    const notes = els.notesInput.value.trim();

    if (!name || !Number.isFinite(cost) || cost < 0 || !nextRenewal) return;

    let credentials = null;
    if (username || password || notes) {
      try {
        const key = await ensureVaultKey();
        credentials = await encryptJSON(key, { username, password, notes });
      } catch {
        alert("Vault locked — saved the subscription without the login.");
      }
    }

    state.subs.push({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
      name,
      cost,
      cycle,
      nextRenewal,
      url,
      credentials,
      createdAt: Date.now(),
    });
    saveSubs();

    closeAddSheet();
    renderAll();
  } finally {
    addSubmitInFlight = false;
    submitBtn.disabled = false;
  }
});

els.subList.addEventListener("click", async (e) => {
  const deleteBtn = e.target.closest("[data-delete-id]");
  if (deleteBtn) {
    const id = deleteBtn.getAttribute("data-delete-id");
    if (!confirm("Delete this subscription and any saved login?")) return;
    state.subs = state.subs.filter((s) => s.id !== id);
    delete state.revealed[id];
    saveSubs();
    renderAll();
    return;
  }

  const renewBtn = e.target.closest("[data-renew-id]");
  if (renewBtn) {
    const id = renewBtn.getAttribute("data-renew-id");
    const sub = state.subs.find((s) => s.id === id);
    if (sub) {
      advanceRenewal(sub);
      saveSubs();
      renderAll();
    }
    return;
  }

  const revealBtn = e.target.closest("[data-reveal-id]");
  if (revealBtn) {
    const id = revealBtn.getAttribute("data-reveal-id");
    await toggleReveal(id);
    return;
  }

  const copyBtn = e.target.closest("[data-copy]");
  if (copyBtn) {
    const value = copyBtn.getAttribute("data-copy");
    try {
      await navigator.clipboard.writeText(value);
      const original = copyBtn.textContent;
      copyBtn.textContent = "Copied";
      setTimeout(() => {
        copyBtn.textContent = original;
      }, 1200);
    } catch {
      // clipboard unavailable; ignore
    }
  }
});

renderAll();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
