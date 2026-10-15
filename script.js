/* =========================================================
   1) DIE 3 VARIABLEN – hier einfach die Sitzzahlen ändern
   ========================================================= */
const SEATS_A = 48;
const SEATS_B = 27;
const SEATS_C = 10;
const SEATS_D = 10;
const SEATS_E = 1;

/* =========================================================
   2) NAMEN & FARBEN (optional anpassen)
   ========================================================= */
const PARTIES = [
  { name: "Annikapartei", seats: SEATS_D, color: "#8d0b0b" },
  { name: "Pilotenpartei", seats: SEATS_A, color: "#ff4d6d" },
  { name: "Arbeiterpartei", seats: SEATS_B, color: "#ffb703" },
  { name: "Naturschutzpartei", seats: SEATS_C, color: "#3a86ff" },
  { name: "Noepartei", seats: SEATS_E, color: "#0073ff" },
];

/* =========================================================
   Ab hier ist der eigentliche Code – muss nicht geändert werden
   ========================================================= */
const TOTAL    = PARTIES.reduce((sum, p) => sum + p.seats, 0);
const MAJORITY = Math.floor(TOTAL / 2) + 1;      // einfache Mehrheit
const selected = new Set();

const svg        = document.getElementById("parliament");
const partiesEl  = document.getElementById("parties");
const meterFill  = document.getElementById("meterFill");
const meterMark  = document.getElementById("meterMark");
const statusText = document.getElementById("statusText");
const resetBtn   = document.getElementById("resetBtn");
const SVG_NS     = "http://www.w3.org/2000/svg";

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
    perRow[i] += Math.sign(diff);
    diff -= Math.sign(diff);
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

/* ---------- Diagramm zeichnen ---------- */
function drawParliament() {
  const { seats, dot, cx, cy } = computeSeats(TOTAL);

  // Sitze den Parteien zuordnen
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
    btn.setAttribute("aria-pressed", "false");
    btn.innerHTML = `
      <span class="party-name"><span class="dot"></span>${party.name}</span>
      <span class="party-seats">${party.seats}</span>
      <span class="party-share">${((party.seats / TOTAL) * 100).toFixed(1)} % der Sitze</span>
    `;
    btn.addEventListener("click", () => toggle(i));
    partiesEl.appendChild(btn);
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

function update() {
  const seatsInCoalition = [...selected].reduce((sum, i) => sum + PARTIES[i].seats, 0);
  const hasSelection = selected.size > 0;
  const hasMajority  = seatsInCoalition >= MAJORITY;

  // Sitze hervorheben / abdunkeln
  svg.querySelectorAll(".seat").forEach(seat => {
    const active = selected.has(Number(seat.dataset.party));
    seat.classList.toggle("lit", hasSelection && active);
    seat.classList.toggle("dim", hasSelection && !active);
  });

  // Karten
  [...partiesEl.children].forEach((btn, i) =>
    btn.setAttribute("aria-pressed", String(selected.has(i)))
  );

  // Mitte
  countTo(hasSelection ? seatsInCoalition : TOTAL);
  document.getElementById("centerLabel").textContent =
    hasSelection ? `von ${TOTAL} Sitzen` : "Sitze insgesamt";

  // Balken
  meterFill.style.width = `${(seatsInCoalition / TOTAL) * 100}%`;
  meterFill.classList.remove("win");
  if (hasMajority) { void meterFill.offsetWidth; meterFill.classList.add("win"); }

  // Text
  statusText.classList.toggle("win", hasMajority);
  if (!hasSelection) {
    statusText.innerHTML = `Wähle Parteien aus. Für die Mehrheit braucht es <strong>${MAJORITY}</strong> von ${TOTAL} Sitzen.`;
  } else if (hasMajority) {
    const names = [...selected].map(i => PARTIES[i].name).join(" + ");
    statusText.innerHTML = `<strong>Mehrheit erreicht:</strong> ${names} haben zusammen ${seatsInCoalition} Sitze.`;
  } else {
    statusText.innerHTML = `Noch <strong>${MAJORITY - seatsInCoalition}</strong> Sitze bis zur Mehrheit (${seatsInCoalition} von ${MAJORITY}).`;
  }

  resetBtn.disabled = !hasSelection;
}

resetBtn.addEventListener("click", () => { selected.clear(); update(); });

/* ---------- Start ---------- */
meterMark.style.left = `${(MAJORITY / TOTAL) * 100}%`;
drawParliament();
drawCards();
update();   // zählt beim Start von 0 auf die Gesamtzahl der Sitze
