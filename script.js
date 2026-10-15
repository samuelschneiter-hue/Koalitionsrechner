/* =========================================================
   1) SITZE VON HAND ÜBERSCHREIBEN (optional)
      null     = Sitze werden automatisch aus den Prozenten berechnet
      Zahl     = diese Sitzzahl wird fest verwendet (z. B. 62)
      A, B, C entsprechen der 1., 2. und 3. Partei in index.html.
      Für weitere Parteien: data-sitze="…" in index.html setzen.
   ========================================================= */
const SEATS_A = null;
const SEATS_B = null;
const SEATS_C = null;

/* =========================================================
   2) STANDARD-FARBEN (werden der Reihe nach vergeben,
      sofern in index.html kein data-farbe gesetzt ist)
   ========================================================= */
const PALETTE = [
  "#ff4d6d", "#ffb703", "#3a86ff", "#06d6a0",
  "#8338ec", "#fb5607", "#118ab2", "#ef476f",
];

/* =========================================================
   Ab hier ist der eigentliche Code – muss nicht geändert werden
   ========================================================= */

/* ---------- Hilfsfunktionen ---------- */
const notices = [];   // Warnungen, die oben auf der Seite erscheinen
const toNum = v => {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};
const fmt = n => String(Number(Number(n).toFixed(2)));          // 38 -> "38", 6.5 -> "6.5"
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const normName = s => s.trim().toLowerCase().replace(/\s+/g, " ");

/* ---------- Konfiguration aus index.html lesen ---------- */
const konfig = document.getElementById("konfig");
const cfg = konfig ? konfig.dataset : {};

const TOTAL_TARGET = (() => { const t = toNum(cfg.sitzeGesamt); return t >= 1 ? Math.round(t) : 100; })();
const THRESHOLD    = (() => { const s = toNum(cfg.sperrklausel); return s >= 0 ? s : 10; })();

const MANUAL = [SEATS_A, SEATS_B, SEATS_C];
const partyEls = konfig ? [...konfig.querySelectorAll("[data-partei]")] : [];
if (partyEls.length === 0) notices.push("In index.html wurden keine Parteien gefunden.");

const PARTIES = partyEls.map((el, i) => {
  const name = (el.dataset.name || `Partei ${i + 1}`).trim();
  let percent = toNum(el.dataset.prozent);
  if (!Number.isFinite(percent) || percent < 0) {
    notices.push(`Ungültiger Prozentwert bei „${name}“ – es wird 0 % verwendet.`);
    percent = 0;
  }
  const m = toNum(MANUAL[i] ?? el.dataset.sitze);
  const manual = Number.isFinite(m) && m >= 0 ? Math.round(m) : null;
  return {
    name, percent, manual,
    color: el.dataset.farbe || PALETTE[i % PALETTE.length],
    seats: 0, active: false, belowThreshold: false,
  };
});

/* ---------- Sitze aus Prozenten berechnen (Hare-Niemeyer) ----------
   1. Parteien unter der Sperrklausel scheiden aus.
   2. Die Prozente der übrigen werden auf 100 % normiert.
   3. Ganze Sitze zuteilen, Restsitze nach grösstem Rest verteilen.
   => Die Summe entspricht immer genau der Gesamtzahl. */
function allocateSeats(percents, total, threshold) {
  const seats = percents.map(() => 0);
  const eligible = percents.map((_, i) => i).filter(i => percents[i] > 0 && percents[i] >= threshold);
  const sum = eligible.reduce((s, i) => s + percents[i], 0);
  if (sum <= 0) return seats;

  const quotas = eligible.map(i => {
    const q = (percents[i] / sum) * total;
    seats[i] = Math.floor(q);
    return { i, rest: q - Math.floor(q) };
  });
  let left = total - eligible.reduce((s, i) => s + seats[i], 0);
  quotas.sort((a, b) => b.rest - a.rest || percents[b.i] - percents[a.i] || a.i - b.i);
  for (let k = 0; left > 0; k++, left--) seats[quotas[k % quotas.length].i] += 1;
  return seats;
}

const autoSeats = allocateSeats(PARTIES.map(p => p.percent), TOTAL_TARGET, THRESHOLD);
PARTIES.forEach((p, i) => {
  p.belowThreshold = p.percent < THRESHOLD;
  p.seats  = p.manual !== null ? p.manual : autoSeats[i];
  p.active = p.seats > 0;
});

const TOTAL    = PARTIES.reduce((sum, p) => sum + p.seats, 0);
const MAJORITY = Math.floor(TOTAL / 2) + 1;      // einfache Mehrheit
const selected = new Set();

/* ---------- Prüfungen & Warnungen ---------- */
const percentSum = PARTIES.reduce((s, p) => s + p.percent, 0);
if (PARTIES.length && Math.abs(percentSum - 100) > 0.01) {
  notices.push(`Warnung: Die Prozentwerte ergeben ${fmt(percentSum)} % statt 100 %. Die Sitze werden trotzdem auf die Parteien über der Sperrklausel verteilt.`);
}
const anyManual = PARTIES.some(p => p.manual !== null);
if (PARTIES.length && TOTAL !== TOTAL_TARGET) {
  if (!anyManual && autoSeats.every(s => s === 0)) {
    notices.push(`Keine Partei erreicht die Sperrklausel von ${fmt(THRESHOLD)} % – es werden keine Sitze verteilt.`);
  } else {
    notices.push(`Warnung: Die Sitze ergeben zusammen ${TOTAL} statt ${TOTAL_TARGET}${anyManual ? " (wegen von Hand eingetragener Sitze)" : ""}.`);
  }
}

/* ---------- Ausschlussliste lesen ---------- */
const EXCLUSIONS = (cfg.ausschluss || "")
  .split(/[;|\n]+/)
  .map(group => group.split(",").map(s => s.trim()).filter(Boolean))
  .filter(names => names.length >= 2)
  .map(names => {
    const idx = [];
    names.forEach(n => {
      const i = PARTIES.findIndex(p => normName(p.name) === normName(n));
      if (i === -1) notices.push(`Ausschlussliste: „${n}“ passt zu keiner Partei in index.html (Schreibweise prüfen).`);
      else if (!idx.includes(i)) idx.push(i);
    });
    return idx;
  })
  .filter(idx => idx.length >= 2);

/* ---------- DOM-Elemente ---------- */
const svg          = document.getElementById("parliament");
const partiesEl    = document.getElementById("parties");
const meterFill    = document.getElementById("meterFill");
const meterMark    = document.getElementById("meterMark");
const statusText   = document.getElementById("statusText");
const resetBtn     = document.getElementById("resetBtn");
const noticesEl    = document.getElementById("notices");
const conflictBox  = document.getElementById("conflictBox");
const conflictText = document.getElementById("conflictText");
const SVG_NS       = "http://www.w3.org/2000/svg";

/* ---------- Sitzpositionen berechnen (Halbkreis in Reihen) ---------- */
function computeSeats(total) {
  const cx = 320, cy = 322;
  const outer = 300;
  const inner = outer * 0.5;
  const rows  = Math.max(1, Math.round(Math.sqrt(total / 3)));

  const radii = [];
  for (let i = 0; i < rows; i++) {
    radii.push(rows === 1 ? outer : inner + (outer - inner) * (i / (rows - 1)));
  }

  // Sitze pro Reihe proportional zum Radius verteilen
  const radiusSum = radii.reduce((a, b) => a + b, 0);
  const perRow = radii.map(r => Math.max(1, Math.round(total * r / radiusSum)));
  let diff = total - perRow.reduce((a, b) => a + b, 0);
  for (let i = rows - 1; diff !== 0; i = (i - 1 + rows) % rows) {
    const step = Math.sign(diff);
    if (perRow[i] + step < 1) continue;
    perRow[i] += step;
    diff -= step;
  }

  // Punktgröße so wählen, dass nichts überlappt
  const rowGap = rows === 1 ? outer : (outer - inner) / (rows - 1);
  let minArc = Infinity;
  radii.forEach((r, i) => {
    if (perRow[i] > 1) minArc = Math.min(minArc, (Math.PI * r) / (perRow[i] - 1));
  });
  const dot = 0.4 * Math.min(rowGap, minArc);

  const seats = [];
  radii.forEach((r, i) => {
    const n = perRow[i];
    for (let j = 0; j < n; j++) {
      const angle = n === 1 ? Math.PI / 2 : Math.PI - (Math.PI * j) / (n - 1);
      seats.push({ x: cx + r * Math.cos(angle), y: cy - r * Math.sin(angle), angle, r });
    }
  });

  // Von links nach rechts sortieren => jede Partei bildet einen Keil
  seats.sort((a, b) => b.angle - a.angle || a.r - b.r);
  return { seats, dot, cx, cy };
}

/* ---------- Diagramm zeichnen (nur Parteien mit Sitzen) ---------- */
function drawParliament() {
  const cx = 320, cy = 322;

  if (TOTAL > 0) {
    const { seats, dot } = computeSeats(TOTAL);

    let index = 0;
    PARTIES.forEach((party, pi) => {
      for (let k = 0; k < party.seats; k++) seats[index++].party = pi;
    });

    seats.forEach((s, i) => {
      const c = document.createElementNS(SVG_NS, "circle");
      c.setAttribute("cx", s.x.toFixed(1));
      c.setAttribute("cy", s.y.toFixed(1));
      c.setAttribute("r", dot.toFixed(1));
      c.setAttribute("fill", PARTIES[s.party].color);
      c.setAttribute("class", "seat");
      c.dataset.party = s.party;
      c.style.animationDelay = `${Math.round(i * (900 / TOTAL))}ms`;
      svg.appendChild(c);
    });
  }

  // Zahl in der Mitte
  const num = document.createElementNS(SVG_NS, "text");
  num.setAttribute("x", cx); num.setAttribute("y", cy - 38);
  num.setAttribute("text-anchor", "middle");
  num.setAttribute("class", "center-number");
  num.setAttribute("id", "centerNumber");
  num.textContent = "0";

  const label = document.createElementNS(SVG_NS, "text");
  label.setAttribute("x", cx); label.setAttribute("y", cy - 10);
  label.setAttribute("text-anchor", "middle");
  label.setAttribute("class", "center-label");
  label.setAttribute("id", "centerLabel");

  svg.append(num, label);
}

/* ---------- Parteikarten erzeugen ---------- */
function drawCards() {
  PARTIES.forEach((party, i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "party";
    btn.style.setProperty("--pc", party.color);
    const votes = `${fmt(party.percent)} % der Stimmen`;

    if (party.active) {
      btn.setAttribute("aria-pressed", "false");
      btn.innerHTML = `
        <span class="party-name"><span class="dot"></span>${esc(party.name)}</span>
        <span class="party-seats">${party.seats}</span>
        <span class="party-share">${((party.seats / TOTAL) * 100).toFixed(1)} % der Sitze</span>
        <span class="party-share">${votes}</span>
      `;
      btn.addEventListener("click", () => toggle(i));
    } else {
      const reason = party.belowThreshold
        ? `weniger als ${fmt(THRESHOLD)} %, deshalb nicht im Parlament`
        : "keine Sitze, deshalb nicht im Parlament";
      btn.classList.add("is-out");
      btn.disabled = true;
      btn.title = reason;
      btn.innerHTML = `
        <span class="party-name"><span class="dot"></span>${esc(party.name)}</span>
        <span class="party-seats">0</span>
        <span class="party-share">${votes}</span>
        <span class="party-note">${esc(reason)}</span>
      `;
    }
    partiesEl.appendChild(btn);
  });
}

/* ---------- Warnungen zur Konfiguration anzeigen ---------- */
function drawNotices() {
  notices.forEach(text => {
    const p = document.createElement("p");
    p.className = "notice";
    p.textContent = text;
    noticesEl.appendChild(p);
  });
}

/* ---------- Auswahl umschalten ---------- */
function toggle(i) {
  selected.has(i) ? selected.delete(i) : selected.add(i);
  update();
}

let shownNumber = 0;
function countTo(target) {
  const el = document.getElementById("centerNumber");
  const from = shownNumber;
  const start = performance.now();
  const duration = 600;
  shownNumber = target;
  (function step(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(from + (target - from) * eased);
    if (t < 1) requestAnimationFrame(step);
  })(start);
}

/* ---------- Unvereinbare Parteien prüfen ---------- */
function updateConflicts() {
  const msgs = [];
  const seen = new Set();

  EXCLUSIONS.forEach(group => {
    const members = group.filter(i => selected.has(i));
    if (members.length < 2) return;
    const key = members.join("-");
    if (seen.has(key)) return;
    seen.add(key);

    const names = members.map(i => PARTIES[i].name);
    msgs.push(
      names.length === 2
        ? `${names[0]} und ${names[1]} schliessen sich aus.`
        : `${names.slice(0, -1).join(", ")} und ${names[names.length - 1]} schliessen sich gegenseitig aus.`
    );
  });

  if (msgs.length) {
    conflictText.innerHTML = msgs
      .map(m => `<p><strong>Koalition unwahrscheinlich:</strong> ${esc(m)}</p>`)
      .join("");
  }
  conflictBox.classList.toggle("show", msgs.length > 0);
  conflictBox.setAttribute("aria-hidden", String(msgs.length === 0));
}

function update() {
  const seatsInCoalition = [...selected].reduce((sum, i) => sum + PARTIES[i].seats, 0);
  const hasSelection = selected.size > 0;
  const hasMajority  = TOTAL > 0 && seatsInCoalition >= MAJORITY;

  // Sitze hervorheben / abdunkeln
  svg.querySelectorAll(".seat").forEach(seat => {
    const active = selected.has(Number(seat.dataset.party));
    seat.classList.toggle("lit", hasSelection && active);
    seat.classList.toggle("dim", hasSelection && !active);
  });

  // Karten
  [...partiesEl.children].forEach((btn, i) => {
    if (PARTIES[i].active) btn.setAttribute("aria-pressed", String(selected.has(i)));
  });

  // Mitte
  countTo(hasSelection ? seatsInCoalition : TOTAL);
  document.getElementById("centerLabel").textContent =
    hasSelection ? `von ${TOTAL} Sitzen` : "Sitze insgesamt";

  // Balken
  meterFill.style.width = `${TOTAL ? (seatsInCoalition / TOTAL) * 100 : 0}%`;
  meterFill.classList.remove("win");
  if (hasMajority) { void meterFill.offsetWidth; meterFill.classList.add("win"); }

  // Text
  statusText.classList.toggle("win", hasMajority);
  if (TOTAL === 0) {
    statusText.textContent = "Es sind keine Sitze verteilt. Bitte die Einstellungen in index.html prüfen.";
  } else if (!hasSelection) {
    statusText.innerHTML = `Wähle Parteien aus. Für die Mehrheit braucht es <strong>${MAJORITY}</strong> von ${TOTAL} Sitzen.`;
  } else if (hasMajority) {
    const names = [...selected].map(i => esc(PARTIES[i].name)).join(" + ");
    statusText.innerHTML = `<strong>Mehrheit erreicht:</strong> ${names} haben zusammen ${seatsInCoalition} Sitze.`;
  } else {
    statusText.innerHTML = `Noch <strong>${MAJORITY - seatsInCoalition}</strong> Sitze bis zur Mehrheit (${seatsInCoalition} von ${MAJORITY}).`;
  }

  updateConflicts();
  resetBtn.disabled = !hasSelection;
}

resetBtn.addEventListener("click", () => { selected.clear(); update(); });

/* ---------- Start ---------- */
meterMark.style.left = `${TOTAL ? (MAJORITY / TOTAL) * 100 : 50}%`;
drawNotices();
drawParliament();
drawCards();
update();   // zählt beim Start von 0 auf die Gesamtzahl der Sitze
