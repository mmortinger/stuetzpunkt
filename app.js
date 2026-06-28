'use strict';

// ── Data & state ─────────────────────────────────────────────────────────────
let cfg      = null;   // config.json
let menuData = null;   // menu.json
let allDays  = [];     // flat list: [{...dayFields, weekIdx}]

const cart = {
  dayIdx:   0,
  soup:     false,
  salat:    null,   // null | 'klein' | 'gross'
  mainIdx:  null,   // null | number (index into day.mains)
  desserts: [],     // boolean[]
  obst:     0,
  gebaeck:  0,
  oj:       0,      // orangensaft
};

// ── Formatting ────────────────────────────────────────────────────────────────
const fmt   = v => v.toFixed(2).replace('.', ',') + ' €';
const fmtDt = iso => {                          // '2026-06-22' → '22.06.'
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.`;
};

// ── Calculation ───────────────────────────────────────────────────────────────
function calcWarenkorb() {
  const day = allDays[cart.dayIdx];
  const p   = cfg.preise_fix;
  let wk    = 0;

  if (cart.soup && day.soup?.int != null)           wk += day.soup.int;
  if (cart.salat === 'klein')                       wk += p.salat_klein;
  if (cart.salat === 'gross')                       wk += p.salat_gross;
  if (cart.mainIdx != null && day.mains[cart.mainIdx]?.int != null)
                                                    wk += day.mains[cart.mainIdx].int;
  cart.desserts.forEach((on, i) => {
    if (on && day.desserts[i]?.int != null)         wk += day.desserts[i].int;
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
  cart.soup     = false;
  cart.salat    = null;
  cart.mainIdx  = null;
  cart.desserts = day.desserts.map(() => false);
  cart.obst     = 0;
  cart.gebaeck  = 0;
  cart.oj       = 0;
}

function selectDefaultDay() {
  if (!allDays.length) return 0;
  const todayISO = new Date().toISOString().slice(0, 10);
  let idx = allDays.findIndex(d => d.date === todayISO);
  if (idx >= 0) return idx;
  // next future day
  idx = allDays.findIndex(d => d.date > todayISO);
  return idx >= 0 ? idx : 0;
}

// ── Rendering — day nav ───────────────────────────────────────────────────────
function renderDayNav() {
  const nav = document.getElementById('day-nav');
  const todayISO = new Date().toISOString().slice(0, 10);

  // Group into weeks
  const weeks = menuData.weeks.map((w, wi) =>
    w.days.map(d => ({ ...d, weekIdx: wi }))
  );

  nav.innerHTML = weeks.map(weekDays => {
    const tabs = weekDays.map(day => {
      const globalIdx = allDays.findIndex(d => d.date === day.date);
      const isPast    = day.date < todayISO;
      const isActive  = globalIdx === cart.dayIdx;
      const shortDay  = day.weekday.slice(0, 2);   // 'Mo', 'Di', …
      return `<button
        class="day-tab${isActive ? ' active' : ''}${isPast ? ' past' : ''}"
        data-action="select-day"
        data-idx="${globalIdx}"
        aria-pressed="${isActive}"
        aria-label="${day.weekday} ${fmtDt(day.date)}"
      >${shortDay} ${fmtDt(day.date)}</button>`;
    }).join('');
    return `<div class="week-group">${tabs}</div>`;
  }).join('');
}

// ── Rendering — menu panel ────────────────────────────────────────────────────
function renderDayPanel() {
  const panel = document.getElementById('day-panel');
  const day   = allDays[cart.dayIdx];
  const p     = cfg.preise_fix;

  const sections = [];

  // ── Suppe ────
  if (day.soup) {
    const active = cart.soup;
    const price  = day.soup.int != null ? fmt(day.soup.int) : '—';
    sections.push(`
      <section class="menu-section glass">
        <h2 class="section-title">Suppe</h2>
        <button class="dish-toggle${active ? ' active' : ''}"
          data-action="toggle-soup" aria-pressed="${active}">
          <span class="dish-name">${esc(day.soup.name)}</span>
          <span class="dish-desc">${esc(day.soup.desc)}</span>
          <span class="dish-price">${price}</span>
        </button>
      </section>`);
  }

  // ── Salat ────
  if (day.salads.length) {
    const saladNames = day.salads.map(s => esc(s.name)).join(' · ');
    const opts = [
      { val: 'null',  label: 'Kein',  price: null },
      { val: 'klein', label: 'Klein', price: p.salat_klein },
      { val: 'gross', label: 'Groß',  price: p.salat_gross },
    ].map(o => {
      const checked = (o.val === 'null' ? cart.salat === null : cart.salat === o.val);
      const priceStr = o.price != null ? ` · ${fmt(o.price)}` : '';
      return `<label class="radio-pill">
        <input type="radio" name="salat" value="${o.val}" ${checked ? 'checked' : ''}
          data-action="salat" data-val="${o.val}">
        <span>${o.label}${priceStr}</span>
      </label>`;
    }).join('');

    sections.push(`
      <section class="menu-section glass">
        <h2 class="section-title">Salatbuffet</h2>
        <div class="salat-items">${saladNames}</div>
        <div class="salat-picker">${opts}</div>
      </section>`);
  }

  // ── Hauptspeise ────
  if (day.mains.length) {
    const items = day.mains.map((m, i) => {
      const checked = cart.mainIdx === i;
      const price   = m.int != null ? fmt(m.int) : '—';
      return `<label class="main-item" aria-label="${esc(m.slot)}: ${esc(m.name)}">
        <input type="radio" name="main" value="${i}" ${checked ? 'checked' : ''}
          data-action="main" data-idx="${i}">
        <div class="main-card${checked ? ' active' : ''}">
          <span class="main-slot">${esc(m.slot)}</span>
          <span class="main-name">${esc(m.name)}</span>
          ${m.desc ? `<span class="main-desc">${esc(m.desc)}</span>` : ''}
          <span class="main-price">${price}</span>
        </div>
      </label>`;
    }).join('');

    sections.push(`
      <section class="menu-section glass">
        <h2 class="section-title">Hauptspeise</h2>
        <div class="mains-list">${items}</div>
      </section>`);
  }

  // ── Desserts ────
  if (day.desserts.length) {
    const items = day.desserts.map((d, i) => {
      const active = !!cart.desserts[i];
      const price  = d.int != null ? fmt(d.int) : '—';
      return `<button class="dish-toggle${active ? ' active' : ''}"
        data-action="toggle-dessert" data-idx="${i}" aria-pressed="${active}">
        <span class="dish-name">${esc(d.name)}</span>
        <span class="dish-desc"></span>
        <span class="dish-price">${price}</span>
      </button>`;
    }).join('');

    sections.push(`
      <section class="menu-section glass">
        <h2 class="section-title">Dessert</h2>
        ${items}
      </section>`);
  }

  // ── Extras (steppers) ────
  const steppers = [
    { field: 'obst',    emoji: '🍎', label: 'Obst',        price: p.obst_stueck,      val: cart.obst },
    { field: 'gebaeck', emoji: '🥐', label: 'Gebäck',      price: p.gebaeck_stueck,   val: cart.gebaeck },
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

  // Progress bar
  const pct    = Math.min(100, (wk / ss) * 100);
  const fill   = document.getElementById('progress-fill');
  fill.style.width = pct.toFixed(1) + '%';
  fill.classList.toggle('over', wk > ss);

  document.getElementById('progress-left').textContent  = fmt(wk);
  document.getElementById('progress-right').textContent = `Sweet Spot ${fmt(ss)}`;

  // Obst info
  const obstGratis = Math.max(0, Math.floor((ss - wk) / p.obst_stueck));
  const nextCost   = zahlbetrag(wk + p.obst_stueck) - zb;
  const infoEl     = document.getElementById('obst-info');

  if (obstGratis > 0) {
    infoEl.innerHTML =
      `<span class="obst-gratis">Noch ${obstGratis} Stück Obst gratis möglich 🍎</span>`;
  } else if (wk >= ss) {
    const nextFmt = fmtPlus(nextCost);
    infoEl.innerHTML =
      `<span class="obst-costs">Stück Obst Nr. ${cart.obst + 1} kostet ${nextFmt}</span>`;
  } else {
    infoEl.innerHTML = '';
  }
}

function fmtPlus(v) {
  return '+' + v.toFixed(2).replace('.', ',') + ' €';
}

// ── Render all ────────────────────────────────────────────────────────────────
function render() {
  renderDayNav();
  renderDayPanel();
  renderSummary();
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

// ── Event handling (delegation) ───────────────────────────────────────────────
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

  if (action === 'toggle-soup') {
    cart.soup = !cart.soup;
    el.classList.toggle('active', cart.soup);
    el.setAttribute('aria-pressed', cart.soup);
    renderSummary();
    return;
  }

  if (action === 'toggle-dessert') {
    const i = parseInt(el.dataset.idx, 10);
    cart.desserts[i] = !cart.desserts[i];
    el.classList.toggle('active', cart.desserts[i]);
    el.setAttribute('aria-pressed', cart.desserts[i]);
    renderSummary();
    return;
  }

  if (action === 'stepper') {
    const field = el.dataset.field;
    const delta = parseInt(el.dataset.delta, 10);
    cart[field] = Math.max(0, (cart[field] || 0) + delta);
    const valEl = document.getElementById('stepper-' + field);
    if (valEl) valEl.textContent = cart[field];
    renderSummary();
    return;
  }
});

// Radio inputs need 'change', not click
document.addEventListener('change', e => {
  const el = e.target;
  if (!el.dataset.action) return;

  if (el.dataset.action === 'salat') {
    const v = el.dataset.val;
    cart.salat = v === 'null' ? null : v;
    renderSummary();
    return;
  }

  if (el.dataset.action === 'main') {
    const idx = parseInt(el.dataset.idx, 10);
    cart.mainIdx = idx;
    // Update active class on main cards
    document.querySelectorAll('.main-card').forEach((card, i) => {
      card.classList.toggle('active', i === idx);
    });
    renderSummary();
    return;
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const loadingEl = document.getElementById('loading');
  const errorEl   = document.getElementById('error-msg');
  const appEl     = document.getElementById('day-panel');
  const summaryEl = document.getElementById('summary');
  const navEl     = document.getElementById('day-nav');

  try {
    [cfg, menuData] = await Promise.all([
      fetch('config.json').then(r => { if (!r.ok) throw new Error('config.json: ' + r.status); return r.json(); }),
      fetch('menu.json').then(r => { if (!r.ok) throw new Error('menu.json: ' + r.status); return r.json(); }),
    ]);
  } catch (err) {
    loadingEl.hidden = true;
    errorEl.hidden   = false;
    errorEl.textContent = 'Fehler beim Laden: ' + err.message;
    return;
  }

  // Flatten days
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

  // Show scraped_at
  if (menuData.scraped_at) {
    const dt = new Date(menuData.scraped_at);
    document.getElementById('scraped-at').textContent =
      'Stand: ' + dt.toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  loadingEl.hidden  = true;
  navEl.hidden      = false;
  appEl.hidden      = false;
  summaryEl.hidden  = false;

  render();
}

init();
