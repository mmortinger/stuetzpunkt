'use strict';

// ── Data & state ─────────────────────────────────────────────────────────────
let cfg      = null;   // config.json
let menuData = null;   // menu.json
let allDays  = [];     // flat list: [{...dayFields, weekIdx}]

const cart = {
  dayIdx:     0,
  soup:       0,   // count
  salatKlein: 0,   // count (replaces salat: null|'klein'|'gross')
  salatGross: 0,
  mains:      [],  // number[] — count per main item
  desserts:   [],  // number[] — count per dessert
  obst:       0,
  gebaeck:    0,
  oj:         0,
};

// ── Formatting ────────────────────────────────────────────────────────────────
const fmt   = v => v.toFixed(2).replace('.', ',') + ' €';
const fmtDt = iso => {
  const [, m, d] = iso.split('-');
  return `${d}.${m}.`;
};

// ── Calculation ───────────────────────────────────────────────────────────────
function calcWarenkorb() {
  const day = allDays[cart.dayIdx];
  const p   = cfg.preise_fix;
  let wk    = 0;

  if (cart.soup > 0 && day.soup?.int != null)
    wk += cart.soup * day.soup.int;
  wk += cart.salatKlein * p.salat_klein;
  wk += cart.salatGross * p.salat_gross;
  day.mains.forEach((m, i) => {
    if (cart.mains[i] > 0 && m.int != null) wk += cart.mains[i] * m.int;
  });
  day.desserts.forEach((d, i) => {
    if (cart.desserts[i] > 0 && d.int != null) wk += cart.desserts[i] * d.int;
  });
  wk += cart.obst    * p.obst_stueck;
  wk += cart.gebaeck * p.gebaeck_stueck;
  wk += cart.oj      * p.orangensaft_glas;

  return Math.round(wk * 100) / 100;
}

function zahlbetrag(wk) {
  return Math.max(cfg.min_betrag, wk - cfg.max_stuetzung);
}

function sweetSpot() {
  return cfg.min_betrag + cfg.max_stuetzung;
}

// ── Cart helpers ──────────────────────────────────────────────────────────────
function resetCart() {
  const day = allDays[cart.dayIdx];
  cart.soup       = 0;
  cart.salatKlein = 0;
  cart.salatGross = 0;
  cart.mains      = day.mains.map(() => 0);
  cart.desserts = day.desserts.map(() => 0);
  cart.obst     = 0;
  cart.gebaeck  = 0;
  cart.oj       = 0;
}

function selectDefaultDay() {
  if (!allDays.length) return 0;
  const todayISO = new Date().toISOString().slice(0, 10);
  let idx = allDays.findIndex(d => d.date === todayISO);
  if (idx >= 0) return idx;
  idx = allDays.findIndex(d => d.date > todayISO);
  return idx >= 0 ? idx : 0;
}

// ── HTML escaping ─────────────────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Rendering — day nav ───────────────────────────────────────────────────────
function renderDayNav() {
  const nav      = document.getElementById('day-nav');
  const todayISO = new Date().toISOString().slice(0, 10);

  nav.innerHTML = menuData.weeks.map(w => {
    const tabs = w.days.map(day => {
      const globalIdx = allDays.findIndex(d => d.date === day.date);
      const isPast    = day.date < todayISO;
      const isActive  = globalIdx === cart.dayIdx;
      const shortDay  = day.weekday.slice(0, 2);
      return `<button
        class="day-tab${isActive ? ' active' : ''}${isPast ? ' past' : ''}"
        data-action="select-day" data-idx="${globalIdx}"
        aria-pressed="${isActive}"
        aria-label="${day.weekday} ${fmtDt(day.date)}"
      >${shortDay} ${fmtDt(day.date)}</button>`;
    }).join('');
    return `<div class="week-group">${tabs}</div>`;
  }).join('');
}

// ── Dish card helper ──────────────────────────────────────────────────────────
function dishCard({ id, active, slotLabel, name, desc, unitPrice, field, idx }) {
  const idxAttr  = idx !== undefined ? ` data-idx="${idx}"` : '';
  const idStr    = id ? ` id="${id}"` : '';
  const valId    = id ? `id="${id}-val"` : '';
  return `
    <div class="dish-card${active ? ' active' : ''}"${idStr}>
      <div class="dish-info">
        ${slotLabel ? `<span class="main-slot">${esc(slotLabel)}</span>` : ''}
        <span class="dish-name">${esc(name)}</span>
        ${desc ? `<span class="dish-desc">${esc(desc)}</span>` : ''}
        ${unitPrice != null ? `<span class="dish-unit-price">${fmt(unitPrice)}/Stk.</span>` : ''}
      </div>
      <div class="stepper">
        <button class="stepper-btn"
          data-action="stepper-dish" data-field="${field}"${idxAttr} data-delta="-1"
          aria-label="${esc(name)} verringern">−</button>
        <span class="stepper-val" ${valId}>${active && idx === undefined ? cart.soup : (idx !== undefined && field === 'main' ? cart.mains[idx] : (idx !== undefined ? cart.desserts[idx] : 0))}</span>
        <button class="stepper-btn"
          data-action="stepper-dish" data-field="${field}"${idxAttr} data-delta="1"
          aria-label="${esc(name)} erhöhen">+</button>
      </div>
    </div>`;
}

// ── Rendering — menu panel ────────────────────────────────────────────────────
function renderDayPanel() {
  const panel = document.getElementById('day-panel');
  const day   = allDays[cart.dayIdx];
  const p     = cfg.preise_fix;
  const sections = [];

  // ── Suppe ────
  if (day.soup) {
    sections.push(`
      <section class="menu-section glass">
        <h2 class="section-title">Suppe</h2>
        <div class="dish-card${cart.soup > 0 ? ' active' : ''}" id="dish-soup">
          <div class="dish-info">
            <span class="dish-name">${esc(day.soup.name)}</span>
            ${day.soup.desc ? `<span class="dish-desc">${esc(day.soup.desc)}</span>` : ''}
            ${day.soup.int != null ? `<span class="dish-unit-price">${fmt(day.soup.int)}/Stk.</span>` : ''}
          </div>
          <div class="stepper">
            <button class="stepper-btn" data-action="stepper-dish" data-field="soup" data-delta="-1"
              aria-label="Suppe verringern">−</button>
            <span class="stepper-val" id="dish-soup-val">${cart.soup}</span>
            <button class="stepper-btn" data-action="stepper-dish" data-field="soup" data-delta="1"
              aria-label="Suppe hinzufügen">+</button>
          </div>
        </div>
      </section>`);
  }

  // ── Salat ────
  if (day.salads.length) {
    const saladNames = day.salads.map(s => esc(s.name)).join(' · ');
    const salatRows = [
      { field: 'salatKlein', label: 'Klein', price: p.salat_klein, val: cart.salatKlein },
      { field: 'salatGross', label: 'Groß',  price: p.salat_gross, val: cart.salatGross },
    ].map(s => `
      <div class="stepper-row${s.val > 0 ? ' active-row' : ''}">
        <span class="stepper-label">${s.label}</span>
        <div class="stepper">
          <button class="stepper-btn" data-action="stepper" data-field="${s.field}" data-delta="-1"
            aria-label="Salat ${s.label} verringern">−</button>
          <span class="stepper-val" id="stepper-${s.field}">${s.val}</span>
          <button class="stepper-btn" data-action="stepper" data-field="${s.field}" data-delta="1"
            aria-label="Salat ${s.label} hinzufügen">+</button>
        </div>
        <span class="stepper-price">${fmt(s.price)}/Stk.</span>
      </div>`).join('');
    sections.push(`
      <section class="menu-section glass">
        <h2 class="section-title">Salatbuffet</h2>
        <div class="salat-items">${saladNames}</div>
        <div class="steppers-grid salat-steppers">${salatRows}</div>
      </section>`);
  }

  // ── Hauptspeise ────
  if (day.mains.length) {
    const items = day.mains.map((m, i) => {
      const active = cart.mains[i] > 0;
      return `
        <div class="dish-card${active ? ' active' : ''}" id="dish-main-${i}">
          <div class="dish-info">
            <span class="main-slot">${esc(m.slot)}</span>
            <span class="dish-name">${esc(m.name)}</span>
            ${m.desc ? `<span class="dish-desc">${esc(m.desc)}</span>` : ''}
            ${m.int != null ? `<span class="dish-unit-price">${fmt(m.int)}/Stk.</span>` : ''}
          </div>
          <div class="stepper">
            <button class="stepper-btn" data-action="stepper-dish" data-field="main" data-idx="${i}" data-delta="-1"
              aria-label="${esc(m.name)} verringern">−</button>
            <span class="stepper-val" id="dish-main-${i}-val">${cart.mains[i]}</span>
            <button class="stepper-btn" data-action="stepper-dish" data-field="main" data-idx="${i}" data-delta="1"
              aria-label="${esc(m.name)} hinzufügen">+</button>
          </div>
        </div>`;
    }).join('');
    sections.push(`
      <section class="menu-section glass">
        <h2 class="section-title">Hauptspeise</h2>
        <div class="mains-list">${items}</div>
      </section>`);
  }

  // ── Dessert ────
  if (day.desserts.length) {
    const items = day.desserts.map((d, i) => {
      const active = cart.desserts[i] > 0;
      return `
        <div class="dish-card${active ? ' active' : ''}" id="dish-dessert-${i}">
          <div class="dish-info">
            <span class="dish-name">${esc(d.name)}</span>
            ${d.int != null ? `<span class="dish-unit-price">${fmt(d.int)}/Stk.</span>` : ''}
          </div>
          <div class="stepper">
            <button class="stepper-btn" data-action="stepper-dish" data-field="dessert" data-idx="${i}" data-delta="-1"
              aria-label="${esc(d.name)} verringern">−</button>
            <span class="stepper-val" id="dish-dessert-${i}-val">${cart.desserts[i]}</span>
            <button class="stepper-btn" data-action="stepper-dish" data-field="dessert" data-idx="${i}" data-delta="1"
              aria-label="${esc(d.name)} hinzufügen">+</button>
          </div>
        </div>`;
    }).join('');
    sections.push(`
      <section class="menu-section glass">
        <h2 class="section-title">Dessert</h2>
        ${items}
      </section>`);
  }

  // ── Extras ────
  const steppers = [
    { field: 'obst',    emoji: '🍎', label: 'Obst',        price: p.obst_stueck,      val: cart.obst },
    { field: 'gebaeck', emoji: '🥖', label: 'Gebäck',      price: p.gebaeck_stueck,   val: cart.gebaeck },
    { field: 'oj',      emoji: '🍊', label: 'Orangensaft', price: p.orangensaft_glas, val: cart.oj },
  ].map(s => `
    <div class="stepper-row">
      <span class="stepper-label">${s.emoji} ${s.label}</span>
      <div class="stepper">
        <button class="stepper-btn" data-action="stepper" data-field="${s.field}" data-delta="-1"
          aria-label="${s.label} verringern">−</button>
        <span class="stepper-val" id="stepper-${s.field}">${s.val}</span>
        <button class="stepper-btn" data-action="stepper" data-field="${s.field}" data-delta="1"
          aria-label="${s.label} erhöhen">+</button>
      </div>
      <span class="stepper-price">${fmt(s.price)}/Stk.</span>
    </div>`).join('');

  sections.push(`
    <section class="menu-section glass">
      <h2 class="section-title">Extras</h2>
      <div class="steppers-grid">${steppers}</div>
    </section>`);

  panel.innerHTML = sections.join('');
}

// ── Rendering — summary ───────────────────────────────────────────────────────
function renderSummary() {
  const wk = calcWarenkorb();
  const zb = zahlbetrag(wk);
  const ss = sweetSpot();
  const p  = cfg.preise_fix;

  document.getElementById('sum-wk').textContent = fmt(wk);
  document.getElementById('sum-zb').textContent = fmt(zb);

  const pct  = Math.min(100, (wk / ss) * 100);
  const fill = document.getElementById('progress-fill');
  fill.style.width = pct.toFixed(1) + '%';
  fill.classList.toggle('over', wk > ss);

  document.getElementById('progress-left').textContent  = fmt(wk);
  document.getElementById('progress-right').textContent = `Sweet Spot ${fmt(ss)}`;

  const obstGratis = Math.max(0, Math.floor((ss - wk) / p.obst_stueck));
  const nextCost   = zahlbetrag(wk + p.obst_stueck) - zb;
  const infoEl     = document.getElementById('obst-info');

  if (obstGratis > 0) {
    infoEl.innerHTML =
      `<span class="obst-gratis">Noch ${obstGratis} Stück Obst gratis möglich 🍎</span>`;
  } else if (wk >= ss) {
    const overflow = wk - ss;
    const sign     = nextCost > 0 ? '+' : '';
    infoEl.innerHTML =
      `<span class="obst-costs">Stück Obst Nr. ${cart.obst + 1} kostet ${sign}${nextCost.toFixed(2).replace('.', ',')} €</span>` +
      `<span class="sweet-spot-over">+${overflow.toFixed(2).replace('.', ',')} € über Sweet Spot</span>`;
  } else {
    infoEl.innerHTML = '';
  }
}

function render() {
  renderDayNav();
  renderDayPanel();
  renderSummary();
}

// ── Event handling ────────────────────────────────────────────────────────────
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;

  const action = el.dataset.action;

  if (action === 'select-day') {
    const idx = parseInt(el.dataset.idx, 10);
    if (idx === cart.dayIdx) return;
    cart.dayIdx = idx;
    resetCart();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  // Extras stepper (obst / gebaeck / oj)
  if (action === 'stepper') {
    const field = el.dataset.field;
    const delta = parseInt(el.dataset.delta, 10);
    cart[field] = Math.max(0, (cart[field] || 0) + delta);
    const valEl = document.getElementById('stepper-' + field);
    if (valEl) valEl.textContent = cart[field];
    renderSummary();
    return;
  }

  // Dish stepper (soup / main / dessert)
  if (action === 'stepper-dish') {
    const field = el.dataset.field;
    const delta = parseInt(el.dataset.delta, 10);
    const idx   = el.dataset.idx !== undefined ? parseInt(el.dataset.idx, 10) : null;

    if (field === 'soup') {
      cart.soup = Math.max(0, cart.soup + delta);
      const valEl  = document.getElementById('dish-soup-val');
      const cardEl = document.getElementById('dish-soup');
      if (valEl)  valEl.textContent = cart.soup;
      if (cardEl) cardEl.classList.toggle('active', cart.soup > 0);
    } else if (field === 'main') {
      cart.mains[idx] = Math.max(0, cart.mains[idx] + delta);
      const valEl  = document.getElementById(`dish-main-${idx}-val`);
      const cardEl = document.getElementById(`dish-main-${idx}`);
      if (valEl)  valEl.textContent = cart.mains[idx];
      if (cardEl) cardEl.classList.toggle('active', cart.mains[idx] > 0);
    } else if (field === 'dessert') {
      cart.desserts[idx] = Math.max(0, cart.desserts[idx] + delta);
      const valEl  = document.getElementById(`dish-dessert-${idx}-val`);
      const cardEl = document.getElementById(`dish-dessert-${idx}`);
      if (valEl)  valEl.textContent = cart.desserts[idx];
      if (cardEl) cardEl.classList.toggle('active', cart.desserts[idx] > 0);
    }

    renderSummary();
    return;
  }
});


// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const loadingEl = document.getElementById('loading');
  const errorEl   = document.getElementById('error-msg');

  try {
    [cfg, menuData] = await Promise.all([
      fetch('config.json').then(r => { if (!r.ok) throw new Error('config.json: ' + r.status); return r.json(); }),
      fetch('menu.json?v=' + Date.now()).then(r  => { if (!r.ok) throw new Error('menu.json: '   + r.status); return r.json(); }),
    ]);
  } catch (err) {
    loadingEl.hidden = true;
    errorEl.hidden   = false;
    errorEl.textContent = 'Fehler beim Laden: ' + err.message;
    return;
  }

  allDays = menuData.weeks.flatMap((w, wi) =>
    w.days.map(d => ({ ...d, weekIdx: wi }))
  );

  if (!allDays.length) {
    loadingEl.hidden = true;
    errorEl.hidden   = false;
    errorEl.textContent = 'Keine Menüdaten gefunden. Bitte Scraper neu ausführen.';
    return;
  }

  cart.dayIdx = selectDefaultDay();
  resetCart();

  if (menuData.scraped_at) {
    const dt = new Date(menuData.scraped_at);
    document.getElementById('scraped-at').textContent =
      'Stand: ' + dt.toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  loadingEl.hidden = true;
  document.getElementById('day-nav').hidden     = false;
  document.getElementById('day-panel').hidden   = false;
  document.getElementById('summary').hidden     = false;

  render();
}

init();
