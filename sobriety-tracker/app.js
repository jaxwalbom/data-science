const META_KEY = "anchor_meta_v1";
const VAULT_KEY = "anchor_vault_v1";
const PBKDF2_ITERATIONS = 250000;

const MOODS = [
  { value: 1, emoji: "😞" },
  { value: 2, emoji: "🙁" },
  { value: 3, emoji: "😐" },
  { value: 4, emoji: "🙂" },
  { value: 5, emoji: "😄" },
];

const MILESTONE_LABELS = {
  1: "1 day",
  3: "3 days",
  7: "1 week",
  14: "2 weeks",
  21: "3 weeks",
  30: "1 month",
  45: "45 days",
  60: "2 months",
  90: "3 months",
  120: "4 months",
  180: "6 months",
  270: "9 months",
  365: "1 year",
};
const FIXED_MILESTONES = Object.keys(MILESTONE_LABELS).map(Number).sort((a, b) => a - b);

const HOTLINES = [
  { name: "988 Suicide & Crisis Lifeline", sub: "Call or text 988, 24/7", tel: "988", sms: "988" },
  { name: "SAMHSA National Helpline", sub: "1-800-662-4357 · free, confidential, 24/7", tel: "18006624357" },
  { name: "Crisis Text Line", sub: "Text HOME to 741741", sms: "741741" },
];

const DISTRACTIONS = [
  "Step outside and name 5 things you can see, 4 you can hear, 3 you can touch.",
  "Text or call someone from your support list — right now, not after.",
  "Do 20 jumping jacks or a fast lap around the block.",
  "Run cold water over your hands and wrists for 30 seconds.",
  "Make a cup of tea or coffee and drink it slowly, on purpose.",
  "Write down exactly what you're feeling, no editing.",
  "Put on one song you love and actually listen to it, start to finish.",
  "Tidy one small surface — a desk, a counter, a drawer.",
  "Take a shower.",
  "Go for a 10-minute walk with no destination.",
  "Do a chore you've been avoiding.",
  "Look at old photos of people who matter to you.",
];

const MEETING_SEED = [
  {
    id: "seed-womens-247",
    name: "Women's 24/7 Meeting",
    schedule: "24/7 — always available",
    url: "https://us02web.zoom.us/j/92894148568",
    passcode: "Billw",
  },
];

const DEFAULT_DATA = () => ({
  startDate: null,
  pastRuns: [],
  events: [],
  celebrated: [],
  checkins: {},
  contacts: [],
  meetings: MEETING_SEED.map((m) => ({ ...m })),
  meetingLogs: [],
});

function ensureMeetingsSeeded() {
  let changed = false;
  if (!Array.isArray(data.meetings)) {
    data.meetings = MEETING_SEED.map((m) => ({ ...m }));
    changed = true;
  }
  if (!Array.isArray(data.meetingLogs)) {
    data.meetingLogs = [];
    changed = true;
  }
  if (changed) save();
}

let meta = loadMeta();
let data = DEFAULT_DATA();
let sessionKey = null;
let clockTimer = null;
let breathingTimer = null;
let breathingRunning = false;

const els = {};

function loadMeta() {
  try {
    const raw = localStorage.getItem(META_KEY);
    return raw ? JSON.parse(raw) : { locked: false };
  } catch {
    return { locked: false };
  }
}

function saveMeta() {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

// ---------- Crypto helpers ----------

function toB64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function fromB64(str) {
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0)).buffer;
}

function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

async function deriveKey(passcode, saltBuf) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(passcode), "PBKDF2", false, ["deriveKey"]);
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
  const enc = new TextEncoder();
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj)));
  return { iv: toB64(iv), ct: toB64(ct) };
}

async function decryptJSON(key, encObj) {
  const iv = new Uint8Array(fromB64(encObj.iv));
  const ctBuf = fromB64(encObj.ct);
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ctBuf);
  return JSON.parse(new TextDecoder().decode(plainBuf));
}

// ---------- Persistence ----------

async function persist() {
  if (meta.locked && sessionKey) {
    const enc = await encryptJSON(sessionKey, data);
    localStorage.setItem(VAULT_KEY, JSON.stringify(enc));
  } else if (!meta.locked) {
    localStorage.setItem(VAULT_KEY, JSON.stringify(data));
  }
}

function save() {
  persist().catch((err) => console.error("Failed to save", err));
}

// ---------- Date helpers ----------

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

function toDatetimeLocalValue(date) {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const da = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${da}T${h}:${mi}`;
}

function elapsedParts(startMs) {
  const totalMs = Math.max(0, Date.now() - startMs);
  const totalSeconds = Math.floor(totalMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds };
}

// ---------- Milestones ----------

function milestonesUpTo(days) {
  const list = [...FIXED_MILESTONES];
  for (let y = 2; y <= Math.ceil(days / 365) + 1; y++) list.push(y * 365);
  return list;
}

function milestoneLabel(days) {
  if (MILESTONE_LABELS[days]) return MILESTONE_LABELS[days];
  const years = Math.round(days / 365);
  return `${years} year${years === 1 ? "" : "s"}`;
}

function nextMilestone(days) {
  const list = milestonesUpTo(days);
  return list.find((m) => m > days) ?? days + 365;
}

function prevMilestone(days) {
  const list = [0, ...milestonesUpTo(days)];
  return list.filter((m) => m <= days).pop() ?? 0;
}

function checkForNewMilestone(days) {
  const list = milestonesUpTo(days);
  const reached = list.filter((m) => m <= days && !data.celebrated.includes(m));
  if (reached.length === 0) return;
  const top = reached[reached.length - 1];
  data.celebrated.push(...reached);
  save();
  showToast(`🎉 ${milestoneLabel(top)} sober. Keep going.`);
}

// ---------- Streak math ----------

function currentDays() {
  if (!data.startDate) return 0;
  return elapsedParts(data.startDate).days;
}

function longestStreakDays() {
  const past = data.pastRuns.map((r) => r.days);
  return Math.max(0, currentDays(), ...past);
}

// ---------- UI: toast ----------

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    els.toast.hidden = true;
  }, 4000);
}

// ---------- Sheet ----------

function openSheet(html, mount) {
  els.sheet.innerHTML = `<div class="sheet-handle"></div>${html}`;
  els.sheetBackdrop.hidden = false;
  if (mount) mount(els.sheet);
}

function closeSheet() {
  els.sheetBackdrop.hidden = true;
  els.sheet.innerHTML = "";
}

// ---------- Tabs ----------

function switchTab(name) {
  document.querySelectorAll(".tab-panel").forEach((p) => {
    p.hidden = p.id !== `tab-${name}`;
  });
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === name);
  });
  if (name !== "toolkit") stopBreathing();
}

// ---------- Rendering: Today ----------

function renderToday() {
  const has = !!data.startDate;
  els.startCard.hidden = has;
  els.clockCard.hidden = !has;
  els.milestoneCard.hidden = !has;
  els.cravingBtn.hidden = !has;
  els.logSlipBtn.hidden = !has;

  if (!has) {
    els.startInput.value = toDatetimeLocalValue(new Date());
    els.streakPill.textContent = "Not started";
    return;
  }

  const parts = elapsedParts(data.startDate);
  els.clockDays.textContent = parts.days;
  els.clockDaysLabel.textContent = parts.days === 1 ? "day" : "days";
  els.clockTime.textContent = [parts.hours, parts.minutes, parts.seconds]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
  els.clockSince.textContent = `Since ${new Date(data.startDate).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })}`;
  els.streakPill.textContent = `Day ${parts.days}`;

  const days = parts.days;
  const next = nextMilestone(days);
  const prev = prevMilestone(days);
  const pct = Math.min(100, Math.round(((days - prev) / (next - prev)) * 100));
  els.milestoneLabel.textContent = `Next: ${milestoneLabel(next)}`;
  els.milestoneRemaining.textContent = `${next - days} day${next - days === 1 ? "" : "s"} to go`;
  els.milestoneFill.style.width = `${pct}%`;

  checkForNewMilestone(days);
}

function tickClock() {
  if (data.startDate) renderToday();
}

// ---------- Start / slip ----------

function handleStart() {
  const val = els.startInput.value;
  const ms = val ? new Date(val).getTime() : Date.now();
  if (Number.isNaN(ms) || ms > Date.now()) {
    showToast("Please pick a valid date in the past.");
    return;
  }
  data.startDate = ms;
  data.celebrated = [];
  save();
  renderAll();
}

function openSlipSheet() {
  openSheet(
    `<h2>Log a slip</h2>
     <p class="muted">This isn't about shame — it's data. Logging it honestly is part of staying accountable to yourself.</p>
     <label class="field">
       <span>When</span>
       <input type="datetime-local" id="slipWhen" />
     </label>
     <label class="field">
       <span>Note (optional)</span>
       <textarea id="slipNote" rows="3" maxlength="500" placeholder="What happened, what led up to it..."></textarea>
     </label>
     <div class="sheet-actions">
       <button type="button" class="btn btn-secondary" id="slipLogOnly">Log only</button>
       <button type="button" class="btn btn-danger" id="slipLogReset">Log &amp; reset clock</button>
     </div>`,
    (sheet) => {
      sheet.querySelector("#slipWhen").value = toDatetimeLocalValue(new Date());
      sheet.querySelector("#slipLogOnly").addEventListener("click", () => submitSlip(false));
      sheet.querySelector("#slipLogReset").addEventListener("click", () => submitSlip(true));
    }
  );
}

function submitSlip(reset) {
  const whenVal = els.sheet.querySelector("#slipWhen").value;
  const note = els.sheet.querySelector("#slipNote").value.trim();
  const at = whenVal ? new Date(whenVal).getTime() : Date.now();

  data.events.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    type: "slip",
    at,
    note,
  });

  if (reset && data.startDate) {
    const runDays = Math.floor((at - data.startDate) / 86400000);
    data.pastRuns.push({ start: data.startDate, end: at, days: Math.max(0, runDays) });
    data.startDate = Date.now();
    data.celebrated = [];
  }

  save();
  closeSheet();
  renderAll();
  showToast(reset ? "Logged. Your clock has been reset — you can start again right now." : "Logged. You're still moving forward.");
}

// ---------- Check-in ----------

function renderMoodGrid(selected) {
  els.moodGrid.innerHTML = MOODS.map(
    (m) => `<button type="button" class="mood-option${m.value === selected ? " selected" : ""}" data-mood="${m.value}">${m.emoji}</button>`
  ).join("");
}

function renderCheckinForm() {
  const todayIso = isoDate(new Date());
  const existing = data.checkins[todayIso];
  const mood = existing ? existing.mood : 3;
  renderMoodGrid(mood);
  els.checkinForm.dataset.mood = mood;
  els.cravingInput.value = existing ? existing.craving : 0;
  els.cravingValue.textContent = els.cravingInput.value;
  els.checkinNote.value = existing ? existing.note || "" : "";
}

function renderCheckinHistory() {
  const dates = Object.keys(data.checkins).sort().reverse().slice(0, 14);
  els.checkinEmpty.hidden = dates.length > 0;
  els.checkinHistory.innerHTML = dates
    .map((d) => {
      const c = data.checkins[d];
      const mood = MOODS.find((m) => m.value === c.mood);
      const label = new Date(d + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
      return `<li class="checkin-item">
        <span class="checkin-date">${label}</span>
        <span class="checkin-mood">${mood ? mood.emoji : ""}</span>
        <span class="checkin-craving">${c.craving}/10</span>
        <span class="checkin-note">${escapeHtml(c.note || "")}</span>
      </li>`;
    })
    .join("");
}

function saveCheckin(e) {
  e.preventDefault();
  const todayIso = isoDate(new Date());
  data.checkins[todayIso] = {
    mood: Number(els.checkinForm.dataset.mood),
    craving: Number(els.cravingInput.value),
    note: els.checkinNote.value.trim(),
    updatedAt: Date.now(),
  };
  save();
  renderCheckinHistory();
  renderStats();
  showToast("Check-in saved.");
}

// ---------- Toolkit ----------

function renderBreathingReset() {
  clearTimeout(breathingTimer);
  breathingRunning = false;
  els.breathingCircle.classList.remove("expand");
  els.breathingText.textContent = "Ready";
  els.breathingBtn.textContent = "Start";
}

function stopBreathing() {
  if (breathingRunning) renderBreathingReset();
}

function startBreathing() {
  breathingRunning = true;
  els.breathingBtn.textContent = "Stop";
  const phases = [
    { text: "Breathe in...", expand: true, ms: 4000 },
    { text: "Hold", expand: true, ms: 4000 },
    { text: "Breathe out...", expand: false, ms: 4000 },
    { text: "Hold", expand: false, ms: 4000 },
  ];
  let i = 0;
  const step = () => {
    if (!breathingRunning) return;
    const phase = phases[i % phases.length];
    els.breathingText.textContent = phase.text;
    els.breathingCircle.classList.toggle("expand", phase.expand);
    i++;
    breathingTimer = setTimeout(step, phase.ms);
  };
  step();
}

function toggleBreathing() {
  if (breathingRunning) {
    renderBreathingReset();
  } else {
    startBreathing();
  }
}

function contactRowHtml(c, { deletable }) {
  const tel = c.tel || (c.phone ? c.phone.replace(/[^\d+]/g, "") : "");
  const sms = c.sms || tel;
  return `<li class="contact-item">
    <div class="contact-info">
      <div class="contact-name">${escapeHtml(c.name)}</div>
      <div class="contact-sub">${escapeHtml(c.sub || c.phone || "")}</div>
    </div>
    <div class="contact-actions">
      ${tel ? `<a class="icon-link" href="tel:${tel}" aria-label="Call ${escapeHtml(c.name)}">📞</a>` : ""}
      ${sms ? `<a class="icon-link" href="sms:${sms}" aria-label="Text ${escapeHtml(c.name)}">💬</a>` : ""}
      ${deletable ? `<button type="button" class="icon-link delete" data-delete-contact="${c.id}" aria-label="Delete">✕</button>` : ""}
    </div>
  </li>`;
}

function renderContacts() {
  els.hotlineList.innerHTML = HOTLINES.map((h) => contactRowHtml(h, { deletable: false })).join("");
  els.toolkitHotlines.innerHTML = HOTLINES.map((h) => contactRowHtml(h, { deletable: false })).join("");

  els.contactEmpty.hidden = data.contacts.length > 0;
  els.contactList.innerHTML = data.contacts.map((c) => contactRowHtml(c, { deletable: true })).join("");
  els.toolkitContacts.innerHTML = data.contacts
    .slice(0, 2)
    .map((c) => contactRowHtml(c, { deletable: false }))
    .join("");
}

function openAddContactSheet() {
  openSheet(
    `<h2>Add a contact</h2>
     <label class="field">
       <span>Name</span>
       <input type="text" id="contactName" maxlength="60" placeholder="e.g. Sponsor, Mom, Alex" required />
     </label>
     <label class="field">
       <span>Phone number</span>
       <input type="tel" id="contactPhone" placeholder="e.g. 555-123-4567" required />
     </label>
     <div class="sheet-actions">
       <button type="button" class="btn btn-secondary" id="contactCancel">Cancel</button>
       <button type="button" class="btn btn-primary" id="contactSave">Save</button>
     </div>`,
    (sheet) => {
      sheet.querySelector("#contactCancel").addEventListener("click", closeSheet);
      sheet.querySelector("#contactSave").addEventListener("click", () => {
        const name = sheet.querySelector("#contactName").value.trim();
        const phone = sheet.querySelector("#contactPhone").value.trim();
        if (!name || !phone) return;
        data.contacts.push({
          id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
          name,
          phone,
        });
        save();
        closeSheet();
        renderContacts();
      });
    }
  );
}

function meetingRowHtml(m, { deletable }) {
  return `<li class="contact-item">
    <div class="contact-info">
      <div class="contact-name">${escapeHtml(m.name)}</div>
      <div class="contact-sub">${escapeHtml(m.schedule || "")}${m.passcode ? ` · Passcode: ${escapeHtml(m.passcode)}` : ""}</div>
    </div>
    <div class="contact-actions">
      <a class="icon-link" href="${escapeHtml(m.url)}" target="_blank" rel="noopener noreferrer" aria-label="Join ${escapeHtml(m.name)}">🎥</a>
      ${deletable ? `<button type="button" class="icon-link delete" data-delete-meeting="${m.id}" aria-label="Delete">✕</button>` : ""}
    </div>
  </li>`;
}

function renderMeetings() {
  els.meetingEmpty.hidden = data.meetings.length > 0;
  els.meetingList.innerHTML = data.meetings.map((m) => meetingRowHtml(m, { deletable: true })).join("");
  els.toolkitMeetings.innerHTML = data.meetings.length
    ? data.meetings.slice(0, 2).map((m) => meetingRowHtml(m, { deletable: false })).join("")
    : `<p class="empty-sub">No meetings saved yet. Add one from Support.</p>`;
}

function openAddMeetingSheet() {
  openSheet(
    `<h2>Add a meeting</h2>
     <label class="field">
       <span>Name</span>
       <input type="text" id="meetingName" maxlength="60" placeholder="e.g. Women's 24/7 Meeting" required />
     </label>
     <label class="field">
       <span>Schedule</span>
       <input type="text" id="meetingSchedule" maxlength="60" placeholder="e.g. 24/7, or Tue 7pm" />
     </label>
     <label class="field">
       <span>Link</span>
       <input type="text" id="meetingUrl" placeholder="e.g. https://zoom.us/j/..." required />
     </label>
     <label class="field">
       <span>Passcode (optional)</span>
       <input type="text" id="meetingPasscode" maxlength="40" />
     </label>
     <div class="sheet-actions">
       <button type="button" class="btn btn-secondary" id="meetingCancel">Cancel</button>
       <button type="button" class="btn btn-primary" id="meetingSave">Save</button>
     </div>`,
    (sheet) => {
      sheet.querySelector("#meetingCancel").addEventListener("click", closeSheet);
      sheet.querySelector("#meetingSave").addEventListener("click", () => {
        const name = sheet.querySelector("#meetingName").value.trim();
        const schedule = sheet.querySelector("#meetingSchedule").value.trim();
        const url = sheet.querySelector("#meetingUrl").value.trim();
        const passcode = sheet.querySelector("#meetingPasscode").value.trim();
        if (!name || !url) return;
        data.meetings.push({
          id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
          name,
          schedule,
          url,
          passcode,
        });
        save();
        closeSheet();
        renderMeetings();
      });
    }
  );
}

function meetingLogRowHtml(l) {
  const date = new Date(l.at);
  const dateLabel = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const timeLabel = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const hours = l.minutes / 60;
  const durationLabel = hours >= 1 ? `${hours % 1 === 0 ? hours : hours.toFixed(1)}h` : `${l.minutes}m`;
  return `<li class="contact-item">
    <div class="contact-info">
      <div class="contact-name">${escapeHtml(l.name)}</div>
      <div class="contact-sub">${dateLabel} · ${timeLabel} · ${durationLabel}</div>
    </div>
    <div class="contact-actions">
      <button type="button" class="icon-link delete" data-delete-meeting-log="${l.id}" aria-label="Delete">✕</button>
    </div>
  </li>`;
}

function renderMeetingLog() {
  const logs = [...data.meetingLogs].sort((a, b) => b.at - a.at).slice(0, 14);
  els.meetingLogEmpty.hidden = logs.length > 0;
  els.meetingLogList.innerHTML = logs.map(meetingLogRowHtml).join("");
}

function openLogMeetingSheet() {
  const hasMeetings = data.meetings.length > 0;
  const options = data.meetings
    .map((m) => `<option value="${escapeHtml(m.name)}">${escapeHtml(m.name)}</option>`)
    .join("");
  openSheet(
    `<h2>Log a meeting</h2>
     <label class="field">
       <span>Meeting</span>
       <select id="logMeetingSelect">
         ${options}
         <option value="__other__">Other...</option>
       </select>
     </label>
     <label class="field" id="logMeetingNameField">
       <span>Name</span>
       <input type="text" id="logMeetingName" maxlength="60" placeholder="Meeting name" />
     </label>
     <label class="field">
       <span>When</span>
       <input type="datetime-local" id="logMeetingWhen" />
     </label>
     <label class="field">
       <span>Duration (minutes)</span>
       <input type="number" id="logMeetingMinutes" min="1" max="600" value="60" />
     </label>
     <div class="sheet-actions">
       <button type="button" class="btn btn-secondary" id="logMeetingCancel">Cancel</button>
       <button type="button" class="btn btn-primary" id="logMeetingSave">Save</button>
     </div>`,
    (sheet) => {
      const select = sheet.querySelector("#logMeetingSelect");
      const nameField = sheet.querySelector("#logMeetingNameField");
      const nameInput = sheet.querySelector("#logMeetingName");
      const syncNameField = () => {
        nameField.hidden = select.value !== "__other__";
      };
      if (!hasMeetings) select.value = "__other__";
      syncNameField();
      select.addEventListener("change", syncNameField);

      sheet.querySelector("#logMeetingWhen").value = toDatetimeLocalValue(new Date());
      sheet.querySelector("#logMeetingCancel").addEventListener("click", closeSheet);
      sheet.querySelector("#logMeetingSave").addEventListener("click", () => {
        const name = select.value === "__other__" ? nameInput.value.trim() : select.value;
        const whenVal = sheet.querySelector("#logMeetingWhen").value;
        const minutes = Number(sheet.querySelector("#logMeetingMinutes").value);
        if (!name || !whenVal || !minutes || minutes <= 0) return;
        data.meetingLogs.push({
          id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
          name,
          at: new Date(whenVal).getTime(),
          minutes,
        });
        save();
        closeSheet();
        renderMeetingLog();
        renderStats();
      });
    }
  );
}

function handleDistraction() {
  const idea = DISTRACTIONS[Math.floor(Math.random() * DISTRACTIONS.length)];
  els.distractionText.textContent = idea;
}

// ---------- Stats ----------

function renderBarChart(el, entries, opts) {
  el.innerHTML = entries
    .map(({ label, value }) => {
      const pct = value == null ? 0 : Math.max(4, Math.round((value / opts.max) * 100));
      return `<div class="bar-col">
        <div class="bar${value == null ? " empty" : ""}" style="height:${pct}%"></div>
        <div class="bar-day">${label}</div>
      </div>`;
    })
    .join("");
}

function renderStats() {
  const cur = currentDays();
  els.statCurrent.textContent = cur;
  els.statLongest.textContent = longestStreakDays();
  els.statCheckins.textContent = Object.keys(data.checkins).length;

  const last14 = [];
  for (let i = 13; i >= 0; i--) last14.push(addDays(new Date(), -i));

  const cravingEntries = last14.map((d) => {
    const c = data.checkins[isoDate(d)];
    return { label: String(d.getDate()), value: c ? c.craving : null };
  });
  const moodEntries = last14.map((d) => {
    const c = data.checkins[isoDate(d)];
    return { label: String(d.getDate()), value: c ? c.mood : null };
  });

  renderBarChart(els.cravingChart, cravingEntries, { max: 10 });
  renderBarChart(els.moodChart, moodEntries, { max: 5 });

  const cravingValues = cravingEntries.map((e) => e.value).filter((v) => v != null);
  els.statAvgCraving.textContent = cravingValues.length
    ? (cravingValues.reduce((a, b) => a + b, 0) / cravingValues.length).toFixed(1)
    : "–";

  const cutoff30 = Date.now() - 30 * 86400000;
  const recentLogs = data.meetingLogs.filter((l) => l.at >= cutoff30);
  els.statMeetings30.textContent = recentLogs.length;
  const totalMinutes30 = recentLogs.reduce((sum, l) => sum + l.minutes, 0);
  els.statMeetingHours30.textContent = (totalMinutes30 / 60).toFixed(1).replace(/\.0$/, "");
}

// ---------- Lock settings ----------

function renderLockSettings() {
  if (meta.locked) {
    els.lockSettingsArea.innerHTML = `<button type="button" class="btn btn-secondary" id="removeLockBtn">Remove passcode lock</button>`;
    els.lockSettingsArea.querySelector("#removeLockBtn").addEventListener("click", removeLock);
  } else {
    els.lockSettingsArea.innerHTML = `<button type="button" class="btn btn-secondary" id="addLockBtn">Add a passcode lock</button>`;
    els.lockSettingsArea.querySelector("#addLockBtn").addEventListener("click", openSetPasscodeSheet);
  }
}

function openSetPasscodeSheet() {
  openSheet(
    `<h2>Set a passcode</h2>
     <p class="muted">This locks the app behind a passcode on this device. There's no recovery — if you forget it, your data can't be restored.</p>
     <label class="field">
       <span>Passcode (4+ characters)</span>
       <input type="password" inputmode="numeric" id="pcNew" autocomplete="off" />
     </label>
     <label class="field">
       <span>Confirm passcode</span>
       <input type="password" inputmode="numeric" id="pcConfirm" autocomplete="off" />
     </label>
     <p class="error-text" id="pcError" hidden></p>
     <div class="sheet-actions">
       <button type="button" class="btn btn-secondary" id="pcCancel">Cancel</button>
       <button type="button" class="btn btn-primary" id="pcSave">Enable lock</button>
     </div>`,
    (sheet) => {
      sheet.querySelector("#pcCancel").addEventListener("click", closeSheet);
      sheet.querySelector("#pcSave").addEventListener("click", async () => {
        const a = sheet.querySelector("#pcNew").value;
        const b = sheet.querySelector("#pcConfirm").value;
        const err = sheet.querySelector("#pcError");
        if (a.length < 4) {
          err.textContent = "Passcode must be at least 4 characters.";
          err.hidden = false;
          return;
        }
        if (a !== b) {
          err.textContent = "Passcodes don't match.";
          err.hidden = false;
          return;
        }
        const salt = randomBytes(16);
        const key = await deriveKey(a, salt);
        const verifier = await encryptJSON(key, { check: "anchor-vault" });
        sessionKey = key;
        meta = { locked: true, salt: toB64(salt), verifier };
        saveMeta();
        await persist();
        closeSheet();
        renderLockSettings();
        showToast("Passcode lock enabled.");
      });
    }
  );
}

function removeLock() {
  if (!confirm("Remove passcode lock? Your data will be stored unencrypted on this device.")) return;
  meta = { locked: false };
  saveMeta();
  sessionKey = null;
  localStorage.setItem(VAULT_KEY, JSON.stringify(data));
  renderLockSettings();
  showToast("Passcode lock removed.");
}

// ---------- Reset all ----------

function resetAll() {
  if (!confirm("Erase all Anchor data on this device? This cannot be undone.")) return;
  if (!confirm("Are you sure? Your streak history, check-ins, and contacts will be permanently deleted.")) return;
  data = DEFAULT_DATA();
  meta = { locked: false };
  sessionKey = null;
  saveMeta();
  localStorage.setItem(VAULT_KEY, JSON.stringify(data));
  renderAll();
  showToast("All data erased.");
}

// ---------- Misc ----------

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderAll() {
  renderToday();
  renderCheckinForm();
  renderCheckinHistory();
  renderContacts();
  renderMeetings();
  renderMeetingLog();
  renderLockSettings();
  renderStats();
}

// ---------- Boot ----------

function cacheEls() {
  [
    "app", "streakPill",
    "startCard", "startInput", "startBtn",
    "clockCard", "clockDays", "clockDaysLabel", "clockTime", "clockSince",
    "milestoneCard", "milestoneLabel", "milestoneRemaining", "milestoneFill",
    "cravingBtn", "logSlipBtn",
    "checkinForm", "moodGrid", "cravingInput", "cravingValue", "checkinNote",
    "checkinHistory", "checkinEmpty",
    "breathingCircle", "breathingText", "breathingBtn",
    "distractionText", "distractionBtn",
    "toolkitContacts", "toolkitHotlines", "toolkitMeetings",
    "hotlineList", "contactList", "contactEmpty", "addContactBtn",
    "meetingList", "meetingEmpty", "addMeetingBtn",
    "meetingLogList", "meetingLogEmpty", "logMeetingBtn",
    "lockSettingsArea", "resetAllBtn",
    "statCurrent", "statLongest", "statCheckins", "statAvgCraving",
    "statMeetings30", "statMeetingHours30",
    "cravingChart", "moodChart",
    "lockScreen", "lockInput", "lockError", "lockSubmitBtn",
    "sheetBackdrop", "sheet", "toast",
  ].forEach((id) => (els[id] = document.getElementById(id)));
}

function bindEvents() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  els.startBtn.addEventListener("click", handleStart);
  els.logSlipBtn.addEventListener("click", openSlipSheet);
  els.cravingBtn.addEventListener("click", () => switchTab("toolkit"));

  els.moodGrid.addEventListener("click", (e) => {
    const btn = e.target.closest(".mood-option");
    if (!btn) return;
    els.checkinForm.dataset.mood = btn.dataset.mood;
    renderMoodGrid(Number(btn.dataset.mood));
  });
  els.cravingInput.addEventListener("input", () => {
    els.cravingValue.textContent = els.cravingInput.value;
  });
  els.checkinForm.addEventListener("submit", saveCheckin);

  els.breathingBtn.addEventListener("click", toggleBreathing);
  els.distractionBtn.addEventListener("click", handleDistraction);

  els.addContactBtn.addEventListener("click", openAddContactSheet);
  els.contactList.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-delete-contact]");
    if (!btn) return;
    const id = btn.getAttribute("data-delete-contact");
    if (!confirm("Delete this contact?")) return;
    data.contacts = data.contacts.filter((c) => c.id !== id);
    save();
    renderContacts();
  });

  els.addMeetingBtn.addEventListener("click", openAddMeetingSheet);
  els.meetingList.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-delete-meeting]");
    if (!btn) return;
    const id = btn.getAttribute("data-delete-meeting");
    if (!confirm("Delete this meeting?")) return;
    data.meetings = data.meetings.filter((m) => m.id !== id);
    save();
    renderMeetings();
  });

  els.logMeetingBtn.addEventListener("click", openLogMeetingSheet);
  els.meetingLogList.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-delete-meeting-log]");
    if (!btn) return;
    const id = btn.getAttribute("data-delete-meeting-log");
    if (!confirm("Delete this meeting log entry?")) return;
    data.meetingLogs = data.meetingLogs.filter((l) => l.id !== id);
    save();
    renderMeetingLog();
    renderStats();
  });

  els.resetAllBtn.addEventListener("click", resetAll);

  els.sheetBackdrop.addEventListener("click", (e) => {
    if (e.target === els.sheetBackdrop) closeSheet();
  });

  els.lockSubmitBtn.addEventListener("click", attemptUnlock);
  els.lockInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") attemptUnlock();
  });
}

async function attemptUnlock() {
  const passcode = els.lockInput.value;
  els.lockError.hidden = true;
  try {
    const key = await deriveKey(passcode, new Uint8Array(fromB64(meta.salt)));
    await decryptJSON(key, meta.verifier);
    sessionKey = key;
    const raw = localStorage.getItem(VAULT_KEY);
    data = raw ? await decryptJSON(sessionKey, JSON.parse(raw)) : DEFAULT_DATA();
    els.lockScreen.hidden = true;
    els.app.hidden = false;
    boot2();
  } catch {
    els.lockError.hidden = false;
    els.lockInput.value = "";
    els.lockInput.focus();
  }
}

function boot2() {
  ensureMeetingsSeeded();
  renderAll();
  clearInterval(clockTimer);
  clockTimer = setInterval(tickClock, 1000);
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
}

async function boot() {
  cacheEls();
  bindEvents();

  if (meta.locked) {
    els.lockScreen.hidden = false;
    els.lockInput.focus();
    return;
  }

  const raw = localStorage.getItem(VAULT_KEY);
  data = raw ? JSON.parse(raw) : DEFAULT_DATA();
  els.app.hidden = false;
  boot2();
}

boot();
