/* DrayDesk: container clocks in dollars. Vanilla JS, localStorage only. */
(() => {
  "use strict";

  const KEY = "draydesk.v1";
  const UI_KEY = "draydesk.ui.v1";
  const HOUR = 3600e3;
  const DAY = 24 * HOUR;
  const STATUSES = {
    terminal: "At terminal",
    out: "Out loaded",
    empty: "Empty, ready to return",
    returned: "Returned",
  };

  // ---------- storage (wrapped: private mode / blocked storage must not break the app) ----------
  const store = {
    get(k, fallback) {
      try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
    },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };

  // ---------- ISO 6346 container number check digit ----------
  const LETTER = (() => {
    const map = {}; let v = 10;
    for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") { if (v % 11 === 0) v++; map[ch] = v++; }
    return map;
  })();
  function checkContainer(raw) {
    const cn = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!/^[A-Z]{4}\d{7}$/.test(cn)) return { cn, ok: false, msg: "Format is 4 letters + 7 digits, e.g. MSCU1234566" };
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      const ch = cn[i];
      const val = i < 4 ? LETTER[ch] : Number(ch);
      sum += val * 2 ** i;
    }
    const expect = (sum % 11) % 10;
    const ok = expect === Number(cn[10]);
    return { cn, ok, msg: ok ? "Check digit valid" : `Check digit should be ${expect}. Double-check the number.` };
  }

  // ---------- dates ----------
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  function endOfDay(s) {
    if (!s) return null;
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d, 23, 59, 59).getTime();
  }
  const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
  const money = (n) => "$" + Math.round(n).toLocaleString("en-US");
  function dur(ms) {
    const abs = Math.abs(ms);
    if (abs < HOUR) return `${Math.max(1, Math.round(abs / 60e3))}m`;
    if (abs < 2 * DAY) return `${Math.round(abs / HOUR)}h`;
    const d = Math.floor(abs / DAY), h = Math.round((abs % DAY) / HOUR);
    return h ? `${d}d ${h}h` : `${d}d`;
  }
  const fmtDate = (s) => s ? new Date(endOfDay(s)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "not set";
  const fmtAppt = (s) => s ? new Date(s).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

  // ---------- money math ----------
  // Demurrage: charged by the terminal while the loaded box sits past Last Free Day.
  // Tier 1 rate for the first `demStep` days late, tier 2 after that.
  // Per diem: charged by the steamship line from free-time end until the empty is returned.
  function clocks(c, now = Date.now()) {
    const out = [];
    if (c.status === "terminal") {
      const due = endOfDay(c.lfd);
      if (due) {
        const left = due - now;
        let accrued = 0, rate = Number(c.demRate) || 0;
        if (left < 0) {
          const late = Math.ceil(-left / DAY);
          const step = Number(c.demStep) || 0;
          const r1 = Number(c.demRate) || 0, r2 = Number(c.demRate2) || r1;
          const t1 = step ? Math.min(late, step) : late;
          accrued = t1 * r1 + Math.max(0, late - t1) * r2;
          rate = late >= step && step ? r2 : r1;
        }
        out.push({ kind: "dem", label: "Last Free Day", due, left, rate, accrued });
      }
    }
    if (c.status === "out" || c.status === "empty") {
      const due = endOfDay(c.returnBy);
      if (due) {
        const left = due - now;
        const rate = Number(c.pdRate) || 0;
        const accrued = left < 0 ? Math.ceil(-left / DAY) * rate : 0;
        out.push({ kind: "pd", label: "Empty return", due, left, rate, accrued });
      }
    }
    return out;
  }

  function assess(c, now = Date.now()) {
    const cl = clocks(c, now);
    if (c.status === "returned") return { level: "done", score: -1, clocks: cl, primary: null, accrued: 0, bleeding: 0 };
    const primary = cl.slice().sort((a, b) => a.left - b.left)[0] || null;
    const accrued = cl.reduce((s, k) => s + k.accrued, 0);
    const bleeding = cl.filter((k) => k.left < 0).reduce((s, k) => s + k.rate, 0);
    let level = "ok", score = 0;
    if (primary) {
      const hrs = primary.left / HOUR;
      level = hrs < 24 ? "hot" : hrs < 72 ? "warn" : "ok";
      // Rank by dollars per hour until the NEXT charge lands. For a late box that is the next
      // midnight roll-over, so a $225/day box going late in 2h outranks a $165/day box already late.
      score = Math.max(...cl.map((k) => {
        const next = k.left >= 0 ? k.left : DAY - ((-k.left) % DAY);
        return k.rate / Math.max(next / HOUR, 1) + (k.left < 0 ? 1 : 0);
      }));
    } else {
      level = "warn"; score = 0.5; // missing dates is itself a risk
    }
    if (c.appt) {
      const a = new Date(c.appt).getTime() - now;
      if (a > -2 * HOUR && a < 6 * HOUR) score += 50; // appointment window is close: move now
    }
    return { level, score, clocks: cl, primary, accrued, bleeding };
  }

  function nextAction(c, a) {
    const where = c.terminal || "terminal";
    if (c.status === "terminal") {
      const appt = c.appt ? ` Appointment ${fmtAppt(c.appt)}.` : " No appointment booked yet.";
      return `Pull from ${where} before ${a.primary && a.primary.left < 0 ? "it costs more" : "Last Free Day"}.${appt}`;
    }
    if (c.status === "out") return `Deliver to ${c.customer || "customer"}, get it unloaded, then return the empty.`;
    if (c.status === "empty") return `Return empty to ${c.returnTo || where}${c.line ? ` (${c.line})` : ""}.`;
    return "Done.";
  }

  // ---------- state ----------
  let db = store.get(KEY, null);
  if (!db) { db = { containers: samples(), sample: true }; store.set(KEY, db); }
  const ui = Object.assign({ filter: "active", selected: null }, store.get(UI_KEY, {}));
  const save = () => store.set(KEY, db);
  const saveUI = () => store.set(UI_KEY, ui);

  function samples() {
    const now = new Date();
    const appt = new Date(now.getTime() + 3 * HOUR); appt.setMinutes(0, 0, 0);
    const local = (d) => `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return [
      { id: uid(), cn: "MSCU1234566", line: "MSC", terminal: "APM Elizabeth", status: "terminal", lfd: addDays(0), demRate: 225, demRate2: 400, demStep: 4, appt: local(appt), returnBy: addDays(5), pdRate: 175, customer: "Edison DC", returnTo: "APM Elizabeth", notes: "Hot box. Customer wants it by 2pm." },
      { id: uid(), cn: "MAEU7654320", line: "Maersk", terminal: "Maher", status: "terminal", lfd: addDays(2), demRate: 175, demRate2: 350, demStep: 4, appt: "", returnBy: addDays(7), pdRate: 150, customer: "Carteret warehouse", returnTo: "Maher", notes: "" },
      { id: uid(), cn: "CMAU3141590", line: "CMA CGM", terminal: "PNCT", status: "empty", lfd: addDays(-3), demRate: 200, demRate2: 400, demStep: 4, appt: "", returnBy: addDays(-1), pdRate: 165, customer: "Secaucus 3PL", returnTo: "PNCT", notes: "Empty has been sitting at the customer." },
      { id: uid(), cn: "HLXU2718283", line: "Hapag-Lloyd", terminal: "GCT Bayonne", status: "out", lfd: addDays(-1), demRate: 200, demRate2: 375, demStep: 4, appt: "", returnBy: addDays(4), pdRate: 150, customer: "Linden cold storage", returnTo: "GCT Bayonne", notes: "" },
    ];
  }
  function uid() { return (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())).slice(0, 13); }

  // ---------- render ----------
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const wide = matchMedia("(min-width: 700px)");

  function visible() {
    const f = ui.filter;
    return db.containers
      .filter((c) => f === "active" ? c.status !== "returned" : c.status === f)
      .map((c) => ({ c, a: assess(c) }))
      .sort((x, y) => y.a.score - x.a.score);
  }

  function renderTotals() {
    const active = db.containers.filter((c) => c.status !== "returned").map((c) => ({ c, a: assess(c) }));
    const bleeding = active.reduce((s, x) => s + x.a.bleeding, 0);
    const accrued = active.reduce((s, x) => s + x.a.accrued, 0);
    const soon = active.filter((x) => x.a.primary && x.a.primary.left >= 0 && x.a.primary.left < 48 * HOUR)
      .reduce((s, x) => s + x.a.primary.rate, 0);
    $("#totals").innerHTML = `
      <div class="total ${bleeding ? "hot" : ""}"><b>${money(bleeding)}</b><span>per day now</span></div>
      <div class="total ${accrued ? "hot" : ""}"><b>${money(accrued)}</b><span>owed so far</span></div>
      <div class="total"><b>${money(soon)}</b><span>/day at risk 48h</span></div>`;
  }

  function renderNext() {
    const top = db.containers.filter((c) => c.status !== "returned").map((c) => ({ c, a: assess(c) }))
      .sort((x, y) => y.a.score - x.a.score)[0];
    const el = $("#next");
    if (!top) { el.innerHTML = `<div class="next empty"><div class="eyebrow">Next move</div><div class="why">Nothing on the clock. Add a container to start.</div></div>`; return; }
    const { c, a } = top, p = a.primary;
    const clockTxt = !p ? "Dates missing. Add Last Free Day or return date." :
      p.left < 0 ? `${p.label} passed ${dur(p.left)} ago. Costing ${money(p.rate)}/day.` :
      `${p.label} in ${dur(p.left)}. Then ${money(p.rate)}/day.`;
    el.innerHTML = `<div class="next" role="button" tabindex="0" data-id="${esc(c.id)}">
      <div class="eyebrow">Next move</div>
      <div class="cn">${esc(c.cn)}</div>
      <div class="why">${esc(nextAction(c, a))}</div>
      <div class="money">${esc(clockTxt)}${a.accrued ? ` Owed: ${money(a.accrued)}.` : ""}</div></div>`;
  }

  function renderRows() {
    const list = visible();
    $("#rows").innerHTML = list.length ? list.map(({ c, a }) => {
      const p = a.primary;
      const clock = c.status === "returned" ? `<b>Done</b>` : !p ? `<b>No date</b>set LFD` :
        p.left < 0 ? `<b>-${dur(p.left)}</b>${money(p.rate)}/day` : `<b>${dur(p.left)}</b>${p.kind === "dem" ? "to LFD" : "to return"}`;
      return `<li class="row ${a.level}" data-id="${esc(c.id)}" aria-selected="${ui.selected === c.id}" tabindex="0">
        <span class="stripe"></span>
        <div><div class="cn">${esc(c.cn)}</div>
          <div class="sub">${esc(STATUSES[c.status])} · ${esc(c.line || "line?")} · ${esc(c.terminal || "terminal?")}${c.appt && c.status === "terminal" ? " · appt " + esc(fmtAppt(c.appt)) : ""}</div></div>
        <div class="clock">${clock}</div></li>`;
    }).join("") : `<li class="hint" style="padding:12px">No containers in this view.</li>`;
    document.querySelectorAll(".chip").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.f === ui.filter)));
    $("#sampleNote").hidden = !db.sample;
  }

  function detailHTML(c) {
    if (!c) {
      return `<div class="placeholder"><svg viewBox="0 0 32 32" aria-hidden="true"><rect x="2" y="8" width="28" height="16" rx="2" fill="currentColor"/></svg>
        <p>Pick a container on the left, or add one.</p><button class="btn primary" type="button" data-act="new">+ Container</button></div>`;
    }
    const a = assess(c);
    const cards = [];
    const dem = a.clocks.find((k) => k.kind === "dem");
    const pd = a.clocks.find((k) => k.kind === "pd");
    const card = (title, k, offText) => {
      if (!k) return `<div class="clockcard off"><div class="k">${title}</div><div class="v">n/a</div><div class="d">${offText}</div></div>`;
      const lvl = k.left < 0 ? "hot" : k.left < 72 * HOUR ? "warn" : "";
      return `<div class="clockcard ${lvl}"><div class="k">${title}</div>
        <div class="v">${k.left < 0 ? "-" + dur(k.left) : dur(k.left)}</div>
        <div class="d">${k.left < 0 ? `Owed ${money(k.accrued)} · ${money(k.rate)}/day` : `Then ${money(k.rate)}/day`}</div></div>`;
    };
    cards.push(card("Demurrage · LFD " + esc(fmtDate(c.lfd)), dem, c.status === "terminal" ? "Set Last Free Day" : "Off the terminal"));
    cards.push(card("Per diem · return " + esc(fmtDate(c.returnBy)), pd, c.status === "terminal" ? "Starts when you pull it" : c.status === "returned" ? "Returned" : "Set return-by date"));
    if (c.appt) cards.push(`<div class="clockcard"><div class="k">Terminal appointment</div><div class="v">${esc(fmtAppt(c.appt))}</div><div class="d">${new Date(c.appt).getTime() < Date.now() ? "Passed" : "In " + dur(new Date(c.appt).getTime() - Date.now())}</div></div>`);
    const steps = [
      c.status === "terminal" && `<button class="btn primary" data-act="status" data-to="out">Picked up</button>`,
      c.status === "out" && `<button class="btn primary" data-act="status" data-to="empty">Unloaded, empty</button>`,
      (c.status === "empty" || c.status === "out") && `<button class="btn ${c.status === "empty" ? "primary" : ""}" data-act="status" data-to="returned">Empty returned</button>`,
      c.status === "returned" && `<button class="btn" data-act="status" data-to="empty">Undo return</button>`,
    ].filter(Boolean).join("");
    return `<div class="detail">
      <h1>${esc(c.cn)}</h1>
      <div class="meta"><span class="pill ${a.level === "done" ? "" : a.level}">${esc(STATUSES[c.status])}</span> ${esc(c.line)} · ${esc(c.terminal)}${c.customer ? " → " + esc(c.customer) : ""}</div>
      <div class="clocks">${cards.join("")}</div>
      <div class="steps">${steps}</div>
      ${editForm(c)}
    </div>`;
  }

  function editForm(c) {
    const chk = checkContainer(c.cn);
    const opt = (v) => `<option value="${v}" ${c.status === v ? "selected" : ""}>${STATUSES[v]}</option>`;
    return `<form class="edit" data-id="${esc(c.id)}" autocomplete="off">
      <label>Container #<input class="mono" name="cn" value="${esc(c.cn)}" maxlength="13" required placeholder="MSCU1234566"><span class="hint ${c.cn ? (chk.ok ? "good" : "bad") : ""}" data-hint="cn">${c.cn ? esc(chk.msg) : "4 letters + 7 digits"}</span></label>
      <label>Status<select name="status">${Object.keys(STATUSES).map(opt).join("")}</select></label>
      <label>Steamship line<input name="line" value="${esc(c.line)}" placeholder="MSC, Maersk, ONE..."></label>
      <label>Terminal<input name="terminal" value="${esc(c.terminal)}" placeholder="Pier / ramp"></label>
      <label>Last Free Day<input type="date" name="lfd" value="${esc(c.lfd)}"></label>
      <label>Appointment<input type="datetime-local" name="appt" value="${esc(c.appt)}"></label>
      <label>Demurrage $/day<input type="number" inputmode="decimal" min="0" name="demRate" value="${esc(c.demRate)}"></label>
      <label>After day #<input type="number" inputmode="numeric" min="0" name="demStep" value="${esc(c.demStep)}"><span class="hint">tier 2 starts after this many late days</span></label>
      <label>Tier 2 $/day<input type="number" inputmode="decimal" min="0" name="demRate2" value="${esc(c.demRate2)}"></label>
      <label>Empty return by<input type="date" name="returnBy" value="${esc(c.returnBy)}"></label>
      <label>Per diem $/day<input type="number" inputmode="decimal" min="0" name="pdRate" value="${esc(c.pdRate)}"></label>
      <label>Return empty to<input name="returnTo" value="${esc(c.returnTo)}" placeholder="Terminal or depot"></label>
      <label>Customer / delivery<input name="customer" value="${esc(c.customer)}"></label>
      <label class="full">Notes<textarea name="notes" rows="2">${esc(c.notes)}</textarea></label>
      <div class="actions full">
        <button class="btn danger" type="button" data-act="delete">Delete</button>
        <span class="hint" style="align-self:center">Saves as you type.</span>
      </div>
    </form>`;
  }

  function renderDetail() {
    const c = db.containers.find((x) => x.id === ui.selected) || null;
    if (wide.matches) {
      $("#detailPane").innerHTML = detailHTML(c);
    } else if ($("#sheet").open) {
      if (c) $("#sheetBody").innerHTML = detailHTML(c); else $("#sheet").close();
    }
  }

  function render() { renderTotals(); renderNext(); renderRows(); renderDetail(); }

  // Keep inputs focused while typing: only refresh the non-form parts.
  function renderAroundForm(c) {
    renderTotals(); renderNext(); renderRows();
    const host = wide.matches ? $("#detailPane") : $("#sheetBody");
    const tmp = document.createElement("div"); tmp.innerHTML = detailHTML(c);
    const swap = (sel) => { const a = host.querySelector(sel), b = tmp.querySelector(sel); if (a && b) a.replaceWith(b); };
    swap(".clocks"); swap(".steps"); swap(".meta"); swap("h1");
  }

  // ---------- actions ----------
  function select(id) {
    ui.selected = id; saveUI();
    try { history.replaceState(null, "", id ? `#c=${id}` : location.pathname); } catch { /* sandboxed */ }
    if (wide.matches) { render(); return; }
    renderRows();
    $("#sheetBody").innerHTML = detailHTML(db.containers.find((x) => x.id === id));
    if (!$("#sheet").open) $("#sheet").showModal();
  }

  function addContainer() {
    const c = { id: uid(), cn: "", line: "", terminal: "", status: "terminal", lfd: addDays(2), demRate: 200, demRate2: 400, demStep: 4, appt: "", returnBy: addDays(6), pdRate: 150, customer: "", returnTo: "", notes: "" };
    db.containers.unshift(c); save();
    if (ui.filter !== "active" && ui.filter !== "terminal") ui.filter = "active";
    select(c.id);
    setTimeout(() => { const i = document.querySelector('form.edit input[name="cn"]'); if (i) i.focus(); }, 30);
  }

  function onField(e) {
    const form = e.target.closest("form.edit"); if (!form) return;
    const c = db.containers.find((x) => x.id === form.dataset.id); if (!c) return;
    const { name } = e.target; let { value } = e.target;
    if (name === "cn") {
      value = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const chk = checkContainer(value);
      const hint = form.querySelector('[data-hint="cn"]');
      hint.textContent = value ? chk.msg : "4 letters + 7 digits";
      hint.className = "hint " + (value ? (chk.ok ? "good" : "bad") : "");
    }
    c[name] = value;
    save();
    renderAroundForm(c);
  }

  function onClick(e) {
    const row = e.target.closest(".row, .next[data-id]");
    if (row) { select(row.dataset.id); return; }
    const chip = e.target.closest(".chip");
    if (chip) { ui.filter = chip.dataset.f; saveUI(); renderRows(); return; }
    const act = e.target.closest("[data-act]");
    if (!act) return;
    const c = db.containers.find((x) => x.id === ui.selected);
    if (act.dataset.act === "new") return addContainer();
    if (!c) return;
    if (act.dataset.act === "status") {
      c.status = act.dataset.to;
      if (c.status === "out" && !c.pickedUp) c.pickedUp = ymd(new Date());
      if (c.status === "returned") c.returnedAt = ymd(new Date());
      save(); render();
      if (!wide.matches) $("#sheetBody").innerHTML = detailHTML(c);
    } else if (act.dataset.act === "delete") {
      if (!confirm(`Delete ${c.cn || "this container"}?`)) return;
      db.containers = db.containers.filter((x) => x !== c); ui.selected = null; save(); saveUI();
      if ($("#sheet").open) $("#sheet").close();
      render();
    }
  }

  // ---------- CSV ----------
  const COLS = ["cn", "status", "line", "terminal", "lfd", "appt", "demRate", "demStep", "demRate2", "returnBy", "pdRate", "returnTo", "customer", "notes"];
  function toCSV() {
    const q = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return [COLS.join(","), ...db.containers.map((c) => COLS.map((k) => q(c[k])).join(","))].join("\n");
  }
  function parseCSV(text) {
    const rows = []; let row = [], cell = "", inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') inQ = false; else cell += ch; }
      else if (ch === '"') inQ = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
    if (!head) return [];
    const idx = head.map((h) => COLS.find((k) => k.toLowerCase() === h.trim().toLowerCase()));
    return body.map((r) => {
      const c = { id: uid(), status: "terminal" };
      idx.forEach((k, i) => { if (k) c[k] = (r[i] || "").trim(); });
      c.cn = (c.cn || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!STATUSES[c.status]) c.status = "terminal";
      return c;
    }).filter((c) => c.cn);
  }

  // ---------- wire up ----------
  document.addEventListener("click", onClick);
  document.addEventListener("input", onField);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches(".row, .next[data-id]")) select(e.target.dataset.id);
  });
  $("#addFab").addEventListener("click", addContainer);
  $("#addTop").addEventListener("click", addContainer);
  $("#sheetClose").addEventListener("click", () => $("#sheet").close());
  $("#sheet").addEventListener("close", () => { ui.selected = wide.matches ? ui.selected : null; renderRows(); });
  $("#clearSamples").addEventListener("click", () => {
    db.containers = []; db.sample = false; ui.selected = null; save(); saveUI(); render();
  });
  $("#exportBtn").addEventListener("click", () => {
    const blob = new Blob([toCSV()], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `draydesk-${ymd(new Date())}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $("#importFile").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const added = parseCSV(await f.text());
    if (db.sample) { db.containers = []; db.sample = false; }
    const have = new Set(db.containers.map((c) => c.cn));
    const fresh = added.filter((c) => !have.has(c.cn));
    db.containers.push(...fresh); save(); render();
    alert(`Imported ${fresh.length} container(s)${added.length - fresh.length ? `, skipped ${added.length - fresh.length} duplicate(s)` : ""}.`);
    e.target.value = "";
  });
  // Folding/unfolding (Duo) or resizing crosses 700px: move the open detail between sheet and pane, keep the selection.
  wide.addEventListener("change", () => {
    if (wide.matches && $("#sheet").open) { const keep = ui.selected; $("#sheet").close(); ui.selected = keep; }
    render();
    if (!wide.matches && ui.selected) select(ui.selected);
  });
  const m = location.hash.match(/c=([\w-]+)/);
  if (m && db.containers.some((c) => c.id === m[1])) ui.selected = m[1];
  if (!wide.matches) { const keep = ui.selected; render(); if (keep && m) select(keep); } else render();
  setInterval(() => { if (!document.activeElement || !document.activeElement.closest("form.edit")) render(); }, 60e3);

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  // exposed for tests
  window.DrayDesk = { checkContainer, clocks, assess, parseCSV };
})();
