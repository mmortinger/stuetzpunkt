'use strict';

// ── Data & state ─────────────────────────────────────────────────────────────
let cfg      = null;   // config.json
let menuData = null;   // menu.json
let allDays  = [];     // flat list: [{...dayFields, weekIdx}]
let currentRecommendation = null;
let settingsOpen = false;
const pageMode = document.body.dataset.page || 'home';

const recommendationState = {
  daily: {},
  weekly: {},
};

const PROFILE_STORAGE_KEY = 'stuetzpunkt-profile-v1';
const EXTRA_MODE_OPTIONAL = 'optional';
const EXTRA_MODE_ALWAYS = 'always';
const EXTRA_MODE_NEVER = 'never';
const EXTRA_MODE_OPTIONS = [
  { value: EXTRA_MODE_OPTIONAL, label: 'Bei Bedarf' },
  { value: EXTRA_MODE_ALWAYS, label: 'Immer' },
  { value: EXTRA_MODE_NEVER, label: 'Nie' },
];
const EXTRA_LABELS = {
  fruit: 'Obst',
  soup: 'Suppe',
  pastry: 'Gebäck',
  oj: 'OJ',
  smallSalad: 'kleiner Salat',
  dessert: 'Nachspeise',
};
const defaultProfile = {
  diet: 'none',
  budgetMode: 'balanced',
  allowLargeSaladMain: false,
  addPastryToLargeSalad: false,
  allowDessert: true,
  extras: {
    fruit: EXTRA_MODE_OPTIONAL,
    soup: EXTRA_MODE_NEVER,
    pastry: EXTRA_MODE_NEVER,
    oj: EXTRA_MODE_NEVER,
    smallSalad: EXTRA_MODE_NEVER,
    dessert: EXTRA_MODE_OPTIONAL,
  },
};

let profile = { ...defaultProfile };

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

// ── Profile persistence ──────────────────────────────────────────────────────
function normalizeExtraMode(value, fallback = EXTRA_MODE_NEVER) {
  if ([EXTRA_MODE_OPTIONAL, EXTRA_MODE_ALWAYS, EXTRA_MODE_NEVER].includes(value)) return value;
  if (value === false) return EXTRA_MODE_NEVER;
  return fallback;
}

function extraMode(key) {
  return normalizeExtraMode(profile.extras?.[key], defaultProfile.extras[key]);
}

function normalizeProfile(data = {}) {
  const sourceExtras = data.extras || {};
  const normalized = {
    ...defaultProfile,
    ...data,
    extras: Object.fromEntries(
      Object.entries(defaultProfile.extras).map(([key, fallback]) => [
        key,
        normalizeExtraMode(sourceExtras[key], fallback),
      ])
    ),
  };

  if (sourceExtras.dessert === undefined && typeof data.allowDessert === 'boolean') {
    normalized.extras.dessert = data.allowDessert ? EXTRA_MODE_OPTIONAL : EXTRA_MODE_NEVER;
  }
  if (data.filler && defaultProfile.extras[data.filler] !== undefined) {
    normalized.extras[data.filler] = EXTRA_MODE_OPTIONAL;
  }
  if (data.alwaysSmallSalad === true) normalized.extras.smallSalad = EXTRA_MODE_ALWAYS;
  if (normalized.diet === 'vegan') normalized.diet = 'vegetarian';
  normalized.allowDessert = normalized.extras.dessert !== EXTRA_MODE_NEVER;

  return normalized;
}

function safeParseProfile(raw) {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return normalizeProfile(data);
  } catch {
    return null;
  }
}

function encodeProfile(p) {
  return btoa(encodeURIComponent(JSON.stringify(p)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeProfile(raw) {
  try {
    const normalized = raw
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(raw.length / 4) * 4, '=');
    return safeParseProfile(decodeURIComponent(atob(normalized)));
  } catch {
    return null;
  }
}

function profileFromHash() {
  const hash = window.location.hash.replace(/^#/, '');
  const params = new URLSearchParams(hash);
  const raw = params.get('p');
  return raw ? decodeProfile(raw) : null;
}

function loadProfile() {
  const fromHash = profileFromHash();
  if (fromHash) {
    profile = normalizeProfile(fromHash);
    saveProfile();
    return;
  }

  const stored = safeParseProfile(localStorage.getItem(PROFILE_STORAGE_KEY));
  profile = stored || normalizeProfile();
}

function saveProfile() {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

function profileUrl() {
  const url = new URL(window.location.href);
  url.hash = 'p=' + encodeProfile(profile);
  return url.toString();
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

function setCartFromSelection(selection) {
  cart.soup       = selection.soup;
  cart.salatKlein = selection.salatKlein;
  cart.salatGross = selection.salatGross;
  cart.mains      = [...selection.mains];
  cart.desserts   = [...selection.desserts];
  cart.obst       = selection.obst;
  cart.gebaeck    = selection.gebaeck;
  cart.oj         = selection.oj;
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

// ── Recommendation helpers ───────────────────────────────────────────────────
function normalizedDishText(dish) {
  return [
    dish?.slot,
    dish?.name,
    dish?.desc,
  ].filter(Boolean).join(' ').toLocaleLowerCase('de-AT');
}

function hasAny(text, words) {
  return words.some(word => text.includes(word));
}

function classifyDish(dish) {
  const text = normalizedDishText(dish);
  const meatWords = [
    'rind', 'rindsuppe', 'bolognese', 'huhn', 'hühner', 'chicken', 'panko-hühnerbrust',
    'fleisch', 'kalb', 'schwein', 'speck', 'schinken', 'lamm', 'ente', 'coq au vin',
    'albondigas',
  ];
  const fishWords = ['lachs', 'fisch', 'thunfisch', 'garnele', 'shrimp'];
  const dairyWords = [
    'milch', 'käse', 'kaese', 'feta', 'parmesan', 'joghurt', 'yoghurt', 'rahm',
    'sauerrahm', 'butter', 'ricotta', 'creme', 'creme', 'österkron', 'oesterkron',
  ];
  const eggWords = ['spätzle', 'spaetzle'];
  const slot = (dish?.slot || '').toLocaleLowerCase('de-AT');
  const hasMeatOrFish = hasAny(text, meatWords) || hasAny(text, fishWords);
  const hasDairy = hasAny(text, dairyWords);
  const hasEgg = hasAny(text, eggWords);
  const vegetarianSlot = slot.includes('vegetarisch') || slot.includes('vegan');

  return {
    vegetarian: vegetarianSlot || !hasMeatOrFish,
    vegan: !hasMeatOrFish && !hasDairy && !hasEgg,
    hasDairy,
  };
}

function isEligibleDish(dish) {
  const info = classifyDish(dish);
  if (profile.diet === 'vegetarian' && !info.vegetarian) return false;
  return true;
}

function recommendationKey(dayIdx) {
  return allDays[dayIdx]?.date || String(dayIdx);
}

function getRecommendationState(dayIdx, scope = 'daily') {
  const bucket = recommendationState[scope] || recommendationState.daily;
  const key = recommendationKey(dayIdx);
  if (!bucket[key]) bucket[key] = { preferredMainKey: null, comboOffset: 0 };
  return bucket[key];
}

function resetRecommendationState() {
  recommendationState.daily = {};
  recommendationState.weekly = {};
}

function getMainChoices(day) {
  const dishChoices = day.mains
    .map((dish, idx) => ({
      type: 'dish',
      key: `main:${idx}:${dish.name}`,
      label: dish.name,
      dish,
      idx,
    }))
    .filter(choice => choice.dish.int != null && isEligibleDish(choice.dish));

  const saladChoice = profile.allowLargeSaladMain && day.salads.length
    ? [{
      type: 'large-salad',
      key: 'salad:gross',
      label: 'Großer Salat',
      dish: null,
      idx: -1,
    }]
    : [];

  return [...dishChoices, ...saladChoice];
}

function emptySelection(day) {
  return {
    soup: 0,
    salatKlein: 0,
    salatGross: 0,
    mains: day.mains.map(() => 0),
    desserts: day.desserts.map(() => 0),
    obst: 0,
    gebaeck: 0,
    oj: 0,
  };
}

function calcSelection(selection, day) {
  const p = cfg.preise_fix;
  let wk = 0;

  if (selection.soup > 0 && day.soup?.int != null) wk += selection.soup * day.soup.int;
  wk += selection.salatKlein * p.salat_klein;
  wk += selection.salatGross * p.salat_gross;
  day.mains.forEach((m, i) => {
    if (selection.mains[i] > 0 && m.int != null) wk += selection.mains[i] * m.int;
  });
  day.desserts.forEach((d, i) => {
    if (selection.desserts[i] > 0 && d.int != null) wk += selection.desserts[i] * d.int;
  });
  wk += selection.obst * p.obst_stueck;
  wk += selection.gebaeck * p.gebaeck_stueck;
  wk += selection.oj * p.orangensaft_glas;

  return Math.round(wk * 100) / 100;
}

function extraCounts(key, counts) {
  const mode = extraMode(key);
  if (mode === EXTRA_MODE_NEVER) return [0];

  const positiveCounts = counts.filter(count => count > 0);
  if (!positiveCounts.length) return [0];
  return mode === EXTRA_MODE_ALWAYS ? positiveCounts : [0, ...positiveCounts];
}

function dessertChoicesFor(eligibleDesserts) {
  const dessertChoices = eligibleDesserts.map(({ dish, idx }) => ({ dish, idx }));
  const emptyChoice = { dish: null, idx: -1 };

  if (extraMode('dessert') === EXTRA_MODE_NEVER || !dessertChoices.length) return [emptyChoice];
  if (extraMode('dessert') === EXTRA_MODE_ALWAYS) return dessertChoices;
  return [emptyChoice, ...dessertChoices];
}

function scoreExtraPreference(key, amount, presentBonus, missingPenalty) {
  const mode = extraMode(key);
  if (mode === EXTRA_MODE_NEVER) return 0;
  if (amount > 0) return -presentBonus;
  return missingPenalty;
}

// Lower score = better. scoreExtraPreference returns a negative value (reward) when the
// item is present (mode !== NEVER) and a positive value (penalty) when it is absent.
function scoreSelection(selection, day) {
  const wk = calcSelection(selection, day);
  const ss = sweetSpot();
  const hasMain = selection.mains.some(Boolean) || selection.salatGross > 0;
  const hasSoup = selection.soup > 0;
  const hasDessert = selection.desserts.some(Boolean);

  // 'under': aim 0.20 € below sweet spot to leave a small buffer.
  // 'over':  aim 0.45 € above sweet spot — just enough for one extra piece of fruit.
  let target = ss;
  if (profile.budgetMode === 'under') target = ss - 0.2;
  if (profile.budgetMode === 'over') target = ss + 0.45;

  let score = Math.abs(wk - target);
  // 18 = hard penalty ensuring a main is always chosen when one is available.
  // It dominates all other score components so the optimizer never skips the main.
  if (!hasMain && day.mains.length) score += 18;

  // Additional asymmetric overspend penalties on top of the plain distance-from-target:
  // 'under': 5 base + steep linear rate (×4) to strongly discourage going over the sweet spot.
  // 'balanced': gentler 1 base + ×1.5 rate — mild nudge to stay on the safe side.
  // 'over': allow up to 0.75 € below sweet spot for free; penalize further under-spending softly.
  if (profile.budgetMode === 'under' && wk > ss) score += 5 + ((wk - ss) * 4);
  if (profile.budgetMode === 'balanced' && wk > ss) score += 1 + ((wk - ss) * 1.5);
  if (profile.budgetMode === 'over' && wk < ss) score += Math.max(0, ss - wk - 0.75) * 0.4;

  // Slight bias against large-salad-as-main: prefer real mains when both fit equally well.
  if (selection.salatGross > 0) score += 0.45;
  score += scoreExtraPreference('soup', hasSoup ? 1 : 0, 0.35, 0.3);
  // Fruit reward diminishes per piece (capped at 0.5) to avoid stacking many pieces.
  score += scoreExtraPreference('fruit', selection.obst, Math.min(0.5, selection.obst * 0.16), 0.25);
  score += scoreExtraPreference('pastry', selection.gebaeck, 0.22, 0.16);
  // OJ gets an additional +0.35 below so it is chosen last among fillers even when allowed.
  score += scoreExtraPreference('oj', selection.oj, 0.12, 0.12);
  score += scoreExtraPreference('smallSalad', selection.salatKlein, 0.25, 0.35);

  // Dessert is a last-resort filler: add a small cost so it wins only when nothing else fits.
  if (hasDessert && extraMode('dessert') === EXTRA_MODE_OPTIONAL) score += 0.25;
  if (selection.oj > 0) score += 0.35;

  return { score, wk };
}

function buildRecommendationCandidates(dayIdx, state) {
  const day = allDays[dayIdx];
  if (!day) return [];

  const availableMainChoices = getMainChoices(day);
  const preferredMainChoice = state?.preferredMainKey
    ? availableMainChoices.find(choice => choice.key === state.preferredMainKey)
    : null;
  const mainChoices = preferredMainChoice
    ? [preferredMainChoice]
    : availableMainChoices.length
      ? availableMainChoices
      : [{ type: 'none', key: 'main:none', label: '', dish: null, idx: -1 }];

  const eligibleDesserts = day.desserts
    .map((dish, idx) => ({ dish, idx }))
    .filter(item => item.dish.int != null && isEligibleDish(item.dish));
  const soupAllowed = day.soup?.int != null && isEligibleDish(day.soup);
  const soupCounts = soupAllowed ? extraCounts('soup', [1]) : [0];
  const dessertChoices = dessertChoicesFor(eligibleDesserts);
  const obstCounts = extraCounts('fruit', [1, 2, 3, 4]);
  const gebaeckCounts = extraCounts('pastry', [1, 2]);
  const ojCounts = extraCounts('oj', [1]);
  const candidates = [];

  mainChoices.forEach(mainChoice => {
    soupCounts.forEach(soupCount => {
      const smallSaladCounts = mainChoice.type !== 'large-salad'
        ? extraCounts('smallSalad', [1])
        : [0];
      smallSaladCounts.forEach(saladCount => {
        dessertChoices.forEach(dessertChoice => {
          obstCounts.forEach(obst => {
            gebaeckCounts.forEach(gebaeck => {
              ojCounts.forEach(oj => {
                const selection = emptySelection(day);
                selection.soup = soupCount;
                selection.salatKlein = saladCount;
                selection.obst = obst;
                selection.gebaeck = mainChoice.type === 'large-salad'
                  && profile.addPastryToLargeSalad
                  && extraMode('pastry') !== EXTRA_MODE_NEVER
                  ? Math.max(1, gebaeck)
                  : gebaeck;
                selection.oj = oj;
                if (mainChoice.type === 'dish' && mainChoice.idx >= 0) selection.mains[mainChoice.idx] = 1;
                if (mainChoice.type === 'large-salad') selection.salatGross = 1;
                if (dessertChoice.idx >= 0) selection.desserts[dessertChoice.idx] = 1;

                const scored = scoreSelection(selection, day);
                candidates.push({
                  selection,
                  score: scored.score,
                  wk: scored.wk,
                  mainKey: mainChoice.key,
                  mainLabel: mainChoice.label,
                  mainType: mainChoice.type,
                });
              });
            });
          });
        });
      });
    });
  });

  return candidates.sort((a, b) => a.score - b.score);
}

function buildMainAlternatives(dayIdx) {
  return getMainChoices(allDays[dayIdx])
    .map(choice => buildRecommendationCandidates(dayIdx, {
      preferredMainKey: choice.key,
      comboOffset: 0,
    })[0])
    .filter(Boolean)
    .sort((a, b) => a.score - b.score);
}

function buildRecommendation(dayIdx = cart.dayIdx, state = getRecommendationState(dayIdx, 'daily')) {
  const day = allDays[dayIdx];
  const candidates = buildRecommendationCandidates(dayIdx, state);
  if (!day || !candidates.length) return null;

  const offset = state?.comboOffset || 0;
  const best = candidates[offset % candidates.length];

  const items = [];
  const mainIdx = best.selection.mains.findIndex(Boolean);
  const dessertIdx = best.selection.desserts.findIndex(Boolean);

  if (mainIdx >= 0) items.push(day.mains[mainIdx].name);
  if (best.selection.salatGross > 0) items.push('Großer Salat');
  if (best.selection.soup > 0) items.push(day.soup.name);
  if (best.selection.salatKlein > 0) items.push('Kleiner Salat');
  if (dessertIdx >= 0) items.push(day.desserts[dessertIdx].name);
  if (best.selection.obst > 0) items.push(`${best.selection.obst}x Obst`);
  if (best.selection.gebaeck > 0) items.push(`${best.selection.gebaeck}x Gebäck`);
  if (best.selection.oj > 0) items.push('Orangensaft');

  const notes = [];
  if (profile.diet === 'vegetarian') notes.push('vegetarisch gefiltert');
  if (extraMode('smallSalad') !== EXTRA_MODE_NEVER && best.selection.salatKlein > 0) notes.push('kleiner Salat als Zusatz');
  if (best.selection.salatGross > 0) notes.push('großer Salat zählt als Hauptspeise');
  if (!getMainChoices(day).length && day.mains.length) notes.push('keine passende Hauptspeise erkannt');

  return {
    ...best,
    items,
    notes,
    zahlbetrag: zahlbetrag(best.wk),
  };
}

function refreshRecommendation(dayIdx, scope, mode) {
  const state = getRecommendationState(dayIdx, scope);

  if (mode === 'combo') {
    state.comboOffset = (state.comboOffset || 0) + 1;
    return;
  }

  const alternatives = buildMainAlternatives(dayIdx);
  const current = buildRecommendation(dayIdx, state);
  if (!current?.mainKey || current.mainKey === 'main:none' || alternatives.length < 2) {
    state.comboOffset = (state.comboOffset || 0) + 1;
    return;
  }

  const currentIdx = alternatives.findIndex(item => item.mainKey === current.mainKey);
  const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % alternatives.length : 0;
  state.preferredMainKey = alternatives[nextIdx].mainKey;
  state.comboOffset = 0;
}

function renderProfilePanel() {
  const panel = document.getElementById('profile-panel');
  if (!panel) return;
  panel.innerHTML = `
    <details class="profile-accordion"${settingsOpen ? ' open' : ''}>
      <summary class="profile-summary">
        <span>
          <span class="section-title">Empfehlungsprofil</span>
          <span class="profile-current">${profileSummary()}</span>
        </span>
        <span class="profile-summary-action">Einstellungen</span>
      </summary>
      <div class="profile-content">
        <div class="profile-actions">
          <span class="info-tip info-tip-wide" tabindex="0" role="img" aria-label="Deine Einstellungen werden automatisch in diesem Browser gespeichert. Der Profil-Link schreibt sie zusätzlich in die URL. Wenn du diesen Link als Bookmark speicherst oder teilst, lädt die App beim Öffnen genau diese Einstellungen und speichert sie wieder lokal." data-tip="Deine Einstellungen werden automatisch in diesem Browser gespeichert. Der Profil-Link schreibt sie zusätzlich in die URL. Wenn du diesen Link als Bookmark speicherst oder teilst, lädt die App beim Öffnen genau diese Einstellungen und speichert sie wieder lokal.">i</span>
          <button class="link-btn" data-action="copy-profile-link" type="button">Profil-Link</button>
        </div>
        <div class="settings-group">
          <h3 class="settings-title">Allgemein</h3>
          <div class="profile-grid">
            <label class="field">
              ${settingLabel('Sweet Spot', 'Steuert, ob Empfehlungen möglichst nah am Förderlimit landen, lieber knapp darunter bleiben oder leicht darüber gehen dürfen.')}
              <select data-profile="budgetMode">
                <option value="balanced"${profile.budgetMode === 'balanced' ? ' selected' : ''}>Möglichst nah</option>
                <option value="under"${profile.budgetMode === 'under' ? ' selected' : ''}>Knapp drunter</option>
                <option value="over"${profile.budgetMode === 'over' ? ' selected' : ''}>Leicht drüber</option>
              </select>
            </label>
            <label class="field">
              ${settingLabel('Ernährung', 'Vegetarisch filtert Hauptspeisen anhand des vegetarisch/vegan Slots und einfacher Texterkennung. Vegan wird bewusst nicht angeboten, weil die Daten dafür nicht zuverlässig genug sind.')}
              <select data-profile="diet">
                <option value="none"${profile.diet === 'none' ? ' selected' : ''}>Alles</option>
                <option value="vegetarian"${profile.diet === 'vegetarian' ? ' selected' : ''}>Vegetarisch</option>
              </select>
            </label>
            <div class="salad-options-row">
              ${profileCheckbox('allowLargeSaladMain', 'Großer Salat statt Hauptspeise erlauben', 'Wenn aktiv, darf ein großer Salat als Hauptspeise-Ersatz empfohlen werden. In so einer Kombination wird kein kleiner Salat zusätzlich gewählt.', false)}
              ${profileCheckbox('addPastryToLargeSalad', '1 Gebäck zu großem Salat', 'Wenn aktiv, bekommt ein großer Salat als Hauptspeise ein Gebäck dazu, sofern Gebäck nicht auf Nie steht.', false)}
            </div>
          </div>
        </div>
        <div class="settings-group">
          <h3 class="settings-title">Zusätze</h3>
          <div class="extras-grid">
            ${profileExtraModeControl('fruit', 'Obst', 'Bei Bedarf füllt Obst den Warenkorb Richtung Sweet Spot auf. Immer startet mit mindestens einem Stück. Nie lässt Obst weg.')}
            ${profileExtraModeControl('soup', 'Suppe', 'Bei Bedarf darf Suppe zum Sweet Spot beitragen. Immer nimmt Suppe dazu, sofern sie verfügbar und passend ist.')}
            ${profileExtraModeControl('pastry', 'Gebäck', 'Bei Bedarf darf Gebäck den Sweet Spot auffüllen. Immer nimmt mindestens ein Gebäck dazu. Nie lässt Gebäck weg.')}
            ${profileExtraModeControl('oj', 'Orangensaft', 'Bei Bedarf darf Orangensaft ergänzen. Immer nimmt ein Glas dazu. Nie lässt Orangensaft weg.')}
            ${profileExtraModeControl('smallSalad', 'Kleiner Salat', 'Bei Bedarf darf ein kleiner Salat ergänzt werden. Immer nimmt ihn zu Hauptspeisen dazu, aber nicht bei großem Salat als Hauptspeise.')}
            ${profileExtraModeControl('dessert', 'Nachspeise', 'Bei Bedarf darf eine Nachspeise helfen, den Sweet Spot zu treffen. Immer wählt eine passende Nachspeise, sofern vorhanden. Nie lässt Nachspeisen weg.')}
          </div>
        </div>
        <p id="profile-link-status" class="profile-status" aria-live="polite"></p>
      </div>
    </details>`;
}

function renderRecommendation() {
  const el = document.getElementById('recommendation');
  if (!el) return;
  currentRecommendation = buildRecommendation(cart.dayIdx, getRecommendationState(cart.dayIdx, 'daily'));

  if (!currentRecommendation) {
    el.innerHTML = `
      <h2 class="section-title">Empfehlung</h2>
      <p class="recommendation-empty">Keine Empfehlung für diesen Tag.</p>`;
    return;
  }

  const itemList = currentRecommendation.items.length
    ? currentRecommendation.items.map(item => `<li>${esc(item)}</li>`).join('')
    : '<li>Nur Extras</li>';
  const notes = currentRecommendation.notes.length
    ? `<div class="recommendation-notes">${currentRecommendation.notes.map(esc).join(' · ')}</div>`
    : '';

  el.innerHTML = `
    <div class="recommendation-head">
      <div>
        <h2 class="section-title">Empfehlung</h2>
        <div class="recommendation-price">${fmt(currentRecommendation.zahlbetrag)}</div>
      </div>
      <div class="recommendation-actions">
        <button class="link-btn" data-action="refresh-recommendation" data-scope="daily" data-mode="main" type="button">Andere Hauptspeise</button>
        <button class="primary-btn" data-action="apply-recommendation" type="button">Übernehmen</button>
      </div>
    </div>
    <ul class="recommendation-items">${itemList}</ul>
    <div class="recommendation-meta">
      <span>Warenkorb ${fmt(currentRecommendation.wk)}</span>
      <span>Sweet Spot ${fmt(sweetSpot())}</span>
    </div>
    ${notes}`;
}

function settingLabel(label, tip) {
  return `
    <span class="setting-label">
      <span>${label}</span>
      <span class="info-tip" tabindex="0" role="img" aria-label="${esc(tip)}" data-tip="${esc(tip)}">i</span>
    </span>`;
}

function profileCheckbox(key, label, tip, wide = true) {
  return `
    <label class="check-field${wide ? ' check-field-wide' : ''}">
      <input type="checkbox" data-profile="${key}"${profile[key] ? ' checked' : ''}>
      ${settingLabel(label, tip)}
    </label>`;
}

function profileExtraModeControl(key, label, tip) {
  const selectedMode = extraMode(key);
  const options = EXTRA_MODE_OPTIONS.map(option => `
    <label>
      <input type="radio" name="extra-${key}" data-profile-extra="${key}" value="${option.value}"${selectedMode === option.value ? ' checked' : ''}>
      <span>${option.label}</span>
    </label>`).join('');

  return `
    <fieldset class="extra-mode-field">
      <legend>${settingLabel(label, tip)}</legend>
      <div class="mode-segment" role="radiogroup" aria-label="${esc(label)}">${options}</div>
    </fieldset>`;
}

function profileSummary() {
  const diet = profile.diet === 'vegetarian' ? 'Vegetarisch' : 'Alles';
  const budget = {
    balanced: 'nah am Sweet Spot',
    under: 'knapp drunter',
    over: 'leicht drüber',
  }[profile.budgetMode] || 'nah am Sweet Spot';
  const optionalExtras = Object.keys(EXTRA_LABELS)
    .filter(key => extraMode(key) === EXTRA_MODE_OPTIONAL)
    .map(key => EXTRA_LABELS[key]);
  const alwaysExtras = Object.keys(EXTRA_LABELS)
    .filter(key => extraMode(key) === EXTRA_MODE_ALWAYS)
    .map(key => EXTRA_LABELS[key]);
  const extras = [
    profile.allowLargeSaladMain ? 'großer Salat möglich' : '',
    profile.addPastryToLargeSalad && extraMode('pastry') !== EXTRA_MODE_NEVER ? 'Gebäck zu großem Salat' : '',
    optionalExtras.length ? `bei Bedarf: ${optionalExtras.join(', ')}` : '',
    alwaysExtras.length ? `immer: ${alwaysExtras.join(', ')}` : '',
  ].filter(Boolean);
  return `${diet} · ${budget}${extras.length ? ' · ' + extras.join(', ') : ''}`;
}

function renderWeeklyRecommendations() {
  const el = document.getElementById('weekly-recommendations');
  if (!el) return;
  const todayISO = new Date().toISOString().slice(0, 10);

  const days = allDays.map((day, dayIdx) => {
    const recommendation = buildRecommendation(dayIdx, getRecommendationState(dayIdx, 'weekly'));
    const isPast = day.date < todayISO;
    const itemList = recommendation?.items.length
      ? recommendation.items.map(item => `<li>${esc(item)}</li>`).join('')
      : '<li>Keine Empfehlung</li>';

    return `
      <article class="week-rec-card${isPast ? ' past' : ''}">
        <div class="week-rec-date">
          <span>${esc(day.weekday.slice(0, 2))}</span>
          <strong>${fmtDt(day.date)}</strong>
        </div>
        <div class="week-rec-body">
          <div class="week-rec-price">${recommendation ? fmt(recommendation.zahlbetrag) : '—'}</div>
          <ul>${itemList}</ul>
          ${recommendation ? `<div class="recommendation-meta"><span>${fmt(recommendation.wk)}</span><span>${fmt(sweetSpot())}</span></div>` : ''}
        </div>
        <div class="week-rec-actions">
          <button class="link-btn" data-action="refresh-recommendation" data-scope="weekly" data-mode="main" data-day-idx="${dayIdx}" type="button">Hauptspeise</button>
          <button class="link-btn" data-action="refresh-recommendation" data-scope="weekly" data-mode="combo" data-day-idx="${dayIdx}" type="button">Kombi</button>
        </div>
      </article>`;
  }).join('');

  el.innerHTML = `
    <div class="weekly-head">
      <h2 class="section-title">Wochenübersicht</h2>
    </div>
    <div class="weekly-grid">${days}</div>`;
}

// ── Rendering — day nav ───────────────────────────────────────────────────────
function renderDayNav() {
  const nav      = document.getElementById('day-nav');
  if (!nav) return;
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
  if (!panel) return;
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
  if (!document.getElementById('summary')) return;
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
  renderProfilePanel();
  if (pageMode === 'weekly') {
    renderWeeklyRecommendations();
    return;
  }

  renderDayNav();
  renderRecommendation();
  renderDayPanel();
  renderSummary();
}

// ── Event handling ────────────────────────────────────────────────────────────
document.addEventListener('click', e => {
  if (e.target.closest('.info-tip')) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }

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

  if (action === 'apply-recommendation') {
    if (!currentRecommendation) return;
    setCartFromSelection(currentRecommendation.selection);
    render();
    document.getElementById('summary')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }

  if (action === 'refresh-recommendation') {
    const scope = el.dataset.scope || 'daily';
    const mode = el.dataset.mode || 'main';
    const dayIdx = scope === 'weekly' ? parseInt(el.dataset.dayIdx, 10) : cart.dayIdx;
    refreshRecommendation(dayIdx, scope, mode);
    if (scope === 'weekly') renderWeeklyRecommendations();
    else renderRecommendation();
    return;
  }

  if (action === 'copy-profile-link') {
    const link = profileUrl();
    const status = document.getElementById('profile-link-status');
    const fallback = () => {
      // Clipboard unavailable — put the URL in the address bar so the user can copy it manually.
      window.location.hash = 'p=' + encodeProfile(profile);
      if (status) status.textContent = 'Profil-Link in der Adresszeile.';
    };

    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(link)
        .then(() => { if (status) status.textContent = 'Profil-Link kopiert!'; })
        .catch(fallback);
    } else {
      fallback();
    }
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

document.addEventListener('change', e => {
  const extraEl = e.target.closest('[data-profile-extra]');
  if (extraEl) {
    profile.extras[extraEl.dataset.profileExtra] = normalizeExtraMode(
      extraEl.value,
      defaultProfile.extras[extraEl.dataset.profileExtra]
    );
    profile.allowDessert = extraMode('dessert') !== EXTRA_MODE_NEVER;
    resetRecommendationState();
    saveProfile();
    render();
    return;
  }

  const el = e.target.closest('[data-profile]');
  if (!el) return;

  const key = el.dataset.profile;
  profile[key] = el.type === 'checkbox' ? el.checked : el.value;
  resetRecommendationState();
  saveProfile();
  render();
});

document.addEventListener('toggle', e => {
  if (!e.target.matches('.profile-accordion')) return;
  settingsOpen = e.target.open;
}, true);

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const loadingEl = document.getElementById('loading');
  const errorEl   = document.getElementById('error-msg');

  try {
    loadProfile();

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
  document.getElementById('profile-panel')?.removeAttribute('hidden');

  if (pageMode === 'weekly') {
    document.getElementById('weekly-recommendations')?.removeAttribute('hidden');
  } else {
    document.getElementById('day-nav')?.removeAttribute('hidden');
    document.getElementById('recommendation')?.removeAttribute('hidden');
    document.getElementById('day-panel')?.removeAttribute('hidden');
    document.getElementById('summary')?.removeAttribute('hidden');
  }

  render();
}

init();
