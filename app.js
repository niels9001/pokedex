const POKEAPI = "https://pokeapi.co/api/v2";
const TCGDEX = "https://api.tcgdex.net/v2/en";
const ART = (id) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
const SPRITE = (id) => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;
const CACHE_KEY = "pokedex-index-v1";
const CARDS_PER_PAGE = 24;

const TYPES = {
  normal: "Normaal", fire: "Vuur", water: "Water", electric: "Elektrisch", grass: "Gras", ice: "IJs",
  fighting: "Vecht", poison: "Gif", ground: "Grond", flying: "Vliegend", psychic: "Psychisch", bug: "Insect",
  rock: "Steen", ghost: "Geest", dragon: "Draak", dark: "Duister", steel: "Staal", fairy: "Fee",
};
const GENS = [
  [1, 151, "Kanto"], [152, 251, "Johto"], [252, 386, "Hoenn"], [387, 493, "Sinnoh"], [494, 649, "Unova"],
  [650, 721, "Kalos"], [722, 809, "Alola"], [810, 905, "Galar / Hisui"], [906, 1025, "Paldea"],
];
const STAT_NAMES = { hp: "HP", attack: "Aanval", defense: "Verdediging", "special-attack": "Sp. Aanval", "special-defense": "Sp. Verdediging", speed: "Snelheid" };

const $ = (s) => document.querySelector(s);
const grid = $("#grid"), status = $("#status"), search = $("#search"), genSel = $("#gen"), typeSel = $("#type");
const detail = $("#detail"), detailBody = $("#detail-body"), lightbox = $("#lightbox");

let all = [];

// --- persistence: owned cards & price cache ---
const OWNED_KEY = "pokedex-owned-v1";
const PRICE_KEY = "pokedex-prices-v1";
const PRICE_TTL = 24 * 60 * 60 * 1000;
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
let owned = store.get(OWNED_KEY, {});
const prices = store.get(PRICE_KEY, {});
const money = {
  EUR: new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }),
  USD: new Intl.NumberFormat("nl-NL", { style: "currency", currency: "USD" }),
};
const saveOwned = () => store.set(OWNED_KEY, owned);
let savePricesTimer;
const savePrices = () => { clearTimeout(savePricesTimer); savePricesTimer = setTimeout(() => store.set(PRICE_KEY, prices), 500); };

// Cardmarket trend price (EUR) first; fall back to TCGplayer market price (USD).
function extractPrice(pricing) {
  const cm = pricing?.cardmarket;
  const eur = cm && [cm.trend, cm.avg30, cm["trend-holo"], cm["avg30-holo"], cm.avg, cm.low].find((v) => typeof v === "number" && v > 0);
  if (eur) return { v: eur, u: "EUR", src: "Cardmarket-trendprijs" };
  for (const o of Object.values(pricing?.tcgplayer ?? {})) {
    const usd = o && typeof o === "object" ? (o.marketPrice ?? o.midPrice) : null;
    if (typeof usd === "number" && usd > 0) return { v: usd, u: "USD", src: "TCGplayer-marktprijs" };
  }
  return { v: null };
}

const priceQueue = [];
let priceActive = 0;
function fetchPrice(id) {
  const cached = prices[id];
  if (cached && Date.now() - cached.t < PRICE_TTL) return Promise.resolve(cached);
  return new Promise((resolve) => { priceQueue.push({ id, resolve }); pumpPrices(); });
}
function pumpPrices() {
  while (priceActive < 6 && priceQueue.length) {
    const { id, resolve } = priceQueue.shift();
    priceActive++;
    getJSON(`${TCGDEX}/cards/${encodeURIComponent(id)}`)
      .then((card) => { prices[id] = { ...extractPrice(card.pricing), t: Date.now() }; savePrices(); resolve(prices[id]); })
      .catch(() => resolve(null))
      .finally(() => { priceActive--; pumpPrices(); });
  }
}
const cancelPrices = () => priceQueue.splice(0).forEach((q) => q.resolve(null));

function priceLabel(p) {
  if (!p) return `<span class="muted">prijs…</span>`;
  if (p.v == null) return `<span class="muted">geen prijs</span>`;
  return `<span title="${p.src ?? ""}">${money[p.u].format(p.v)}</span>`;
}
function updatePriceEls(id) {
  document.querySelectorAll(`[data-price-for="${CSS.escape(id)}"]`).forEach((el) => (el.innerHTML = priceLabel(prices[id])));
}
function sumPrices(ids) {
  const totals = { EUR: 0, USD: 0 };
  let missing = 0;
  for (const id of ids) {
    const p = prices[id];
    if (p?.v != null) totals[p.u] += p.v; else missing++;
  }
  const parts = [];
  if (totals.EUR || !totals.USD) parts.push(money.EUR.format(totals.EUR));
  if (totals.USD) parts.push(money.USD.format(totals.USD));
  return { text: missing === ids.length ? "onbekend" : parts.join(" + "), missing };
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pad = (n) => "#" + String(n).padStart(4, "0");
const idFromUrl = (u) => Number(u.split("/").filter(Boolean).pop());
const prettyName = (n) => n.replace(/-/g, " ");
const typeBadges = (types) => types.map((t) => `<span class="type" data-type="${t}">${TYPES[t] ?? t}</span>`).join("");
const getJSON = async (url, tries = 3) => {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
      if (r.status < 500 && r.status !== 429) throw Object.assign(new Error(`${r.status} ${url}`), { final: true });
      throw new Error(`${r.status} ${url}`);
    } catch (err) {
      if (err.final || i >= tries) throw err;
      await new Promise((res) => setTimeout(res, 400 * i));
    }
  }
};

async function loadIndex() {
  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) return JSON.parse(cached);

  const species = await getJSON(`${POKEAPI}/pokemon-species?limit=2000`);
  const mons = species.results
    .map((s) => ({ id: idFromUrl(s.url), name: s.name, types: [] }))
    .sort((a, b) => a.id - b.id);
  const byId = new Map(mons.map((m) => [m.id, m]));

  const typeData = await Promise.all(Object.keys(TYPES).map((t) => getJSON(`${POKEAPI}/type/${t}`)));
  for (const t of typeData) {
    for (const { pokemon, slot } of t.pokemon) {
      const m = byId.get(idFromUrl(pokemon.url));
      if (m) m.types[slot - 1] = t.name;
    }
  }
  mons.forEach((m) => (m.types = m.types.filter(Boolean)));
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(mons)); } catch {}
  return mons;
}

function render() {
  const q = search.value.trim().toLowerCase().replace(/^#0*/, "");
  const gen = genSel.value ? GENS[Number(genSel.value)] : null;
  const type = typeSel.value;
  const list = all.filter((m) =>
    (!q || m.name.includes(q) || String(m.id) === q) &&
    (!gen || (m.id >= gen[0] && m.id <= gen[1])) &&
    (!type || m.types.includes(type)));

  grid.innerHTML = list.map((m) => `
    <li><button class="mon" data-id="${m.id}" data-type="${m.types[0] ?? ""}">
      <span class="badge" data-badge="${m.id}" hidden></span>
      <img src="${ART(m.id)}" alt="" loading="lazy" width="200" height="200" onerror="this.onerror=null;this.src='${SPRITE(m.id)}'" />
      <div class="num">${pad(m.id)}</div>
      <div class="name">${esc(prettyName(m.name))}</div>
      <div class="types">${typeBadges(m.types)}</div>
    </button></li>`).join("");
  status.textContent = list.length ? `${list.length} Pokémon` : "Geen Pokémon gevonden.";
  refreshOwnedUI();
}

function refreshOwnedUI() {
  const list = Object.values(owned);
  $("#owned-count").textContent = list.length;
  const perMon = {};
  list.forEach((c) => (perMon[c.mon] = (perMon[c.mon] ?? 0) + 1));
  document.querySelectorAll("[data-badge]").forEach((b) => {
    const n = perMon[b.dataset.badge];
    b.hidden = !n;
    b.textContent = n ? `${n} 🃏` : "";
    b.title = n ? `${n} kaart(en) in bezit` : "";
  });
  if (cardState && $("#cards-status")) updateCardsStatus();
  if ($("#coll-summary")) updateCollectionSummary();
}

// --- detail ---
let detailToken = 0;

async function openDetail(id) {
  const token = ++detailToken;
  cancelPrices();
  cardState = null;
  const base = all.find((m) => m.id === id);
  if (!base) return;
  detailBody.innerHTML = `<div class="hero" data-type="${base.types[0]}"><img src="${ART(id)}" alt="" /><div><div class="num">${pad(id)}</div><h2 id="d-name">${esc(prettyName(base.name))}</h2><p>Laden…</p></div></div>`;
  if (!detail.open) detail.showModal();
  detail.scrollTop = 0;

  const [mon, species] = await Promise.all([getJSON(`${POKEAPI}/pokemon/${id}`), getJSON(`${POKEAPI}/pokemon-species/${id}`)]);
  if (token !== detailToken) return;

  const name = species.names.find((n) => n.language.name === "en")?.name ?? prettyName(base.name);
  const genus = species.genera.find((g) => g.language.name === "en")?.genus ?? "";
  const flavor = species.flavor_text_entries.filter((f) => f.language.name === "en").pop()?.flavor_text.replace(/[\f\n\r]+/g, " ") ?? "";
  const prev = all.find((m) => m.id === id - 1), next = all.find((m) => m.id === id + 1);

  detailBody.innerHTML = `
    <div class="hero" data-type="${base.types[0]}">
      <img src="${ART(id)}" alt="${esc(name)}" />
      <div>
        <div class="num">${pad(id)} · ${esc(genus)}</div>
        <h2 id="d-name">${esc(name)}</h2>
        <div class="types" style="justify-content:flex-start">${typeBadges(base.types)}</div>
        <p>${esc(flavor)}</p>
        <div class="facts">
          <div><span>Lengte</span>${(mon.height / 10).toFixed(1)} m</div>
          <div><span>Gewicht</span>${(mon.weight / 10).toFixed(1)} kg</div>
          <div><span>Vaardigheden</span>${mon.abilities.map((a) => esc(prettyName(a.ability.name))).join(", ")}</div>
        </div>
        <div class="stats">${mon.stats.map((s) => `
          <span>${STAT_NAMES[s.stat.name] ?? s.stat.name}</span><b>${s.base_stat}</b>
          <div class="bar"><i style="width:${Math.min(100, (s.base_stat / 180) * 100)}%"></i></div>`).join("")}
        </div>
      </div>
    </div>
    <nav class="nav">
      ${prev ? `<a href="#/pokemon/${prev.id}">← ${esc(prettyName(prev.name))}</a>` : "<span></span>"}
      ${next ? `<a href="#/pokemon/${next.id}">${esc(prettyName(next.name))} →</a>` : "<span></span>"}
    </nav>
    <section class="cards-section">
      <div class="cards-head">
        <h3>Pokémon-kaarten</h3>
        <div class="cards-tools" id="cards-tools" hidden>
          <label><input type="checkbox" id="only-owned" /> Alleen mijn kaarten</label>
          <select id="card-sort" aria-label="Sorteren">
            <option value="default">Standaard volgorde</option>
            <option value="desc">Prijs: hoog → laag</option>
            <option value="asc">Prijs: laag → hoog</option>
          </select>
        </div>
      </div>
      <div id="cards-status" class="status">Kaarten zoeken…</div>
      <div class="cards" id="cards"></div>
    </section>`;

  loadCards(name, token, id);
}

let cardState = null;

async function loadCards(name, token, monId) {
  const normalize = (s) => s.toLowerCase().replace(/[’`]/g, "'");
  const escaped = normalize(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wordMatch = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`);
  const statusEl = $("#cards-status");

  let cards;
  try {
    const results = await getJSON(`${TCGDEX}/cards?name=${encodeURIComponent(name.replace(/[’']/g, "'"))}`);
    cards = results.filter((c) => c.image && wordMatch.test(normalize(c.name)));
  } catch {
    if (token === detailToken) {
      statusEl.innerHTML = `Kaarten konden niet geladen worden. <button class="more" id="retry-cards" type="button">Opnieuw proberen</button>`;
      $("#retry-cards").onclick = () => { statusEl.textContent = "Kaarten zoeken…"; loadCards(name, token, monId); };
    }
    return;
  }
  if (token !== detailToken) return;
  if (!cards.length) { statusEl.textContent = "Geen kaarten gevonden voor deze Pokémon."; return; }

  cardState = { cards, monId, token, shown: 0, list: cards };
  $("#cards-tools").hidden = false;
  $("#only-owned").onchange = renderCards;
  $("#card-sort").onchange = async () => {
    if ($("#card-sort").value !== "default") {
      let done = 0;
      statusEl.textContent = `Prijzen ophalen… 0/${cards.length}`;
      await Promise.all(cards.map((c) => fetchPrice(c.id).then(() => {
        if (token === detailToken) statusEl.textContent = `Prijzen ophalen… ${++done}/${cards.length}`;
      })));
      if (token !== detailToken) return;
    }
    renderCards();
  };
  renderCards();
}

function cardTile(c) {
  const isOwned = !!owned[c.id];
  const img = esc(c.image);
  return `
    <div class="tcg-item${isOwned ? " owned" : ""}">
      <button class="tcg" data-img="${img}/high.webp" title="${esc(c.name)} (${esc(c.id)})">
        <img src="${img}/low.webp" alt="${esc(c.name)} – ${esc(c.id)}" loading="lazy" />
      </button>
      <div class="tcg-meta">
        <span class="price" data-price-for="${esc(c.id)}">${priceLabel(prices[c.id])}</span>
        <label class="own"><input type="checkbox" data-own="${esc(c.id)}" data-name="${esc(c.name)}" data-image="${img}" data-mon="${c.mon}" ${isOwned ? "checked" : ""} /> Heb ik</label>
      </div>
    </div>`;
}

function loadPricesFor(list) {
  list.forEach((c) => fetchPrice(c.id).then((p) => {
    if (!p) return;
    updatePriceEls(c.id);
    if ($("#coll-summary")) updateCollectionSummary();
  }));
}

function renderCards() {
  const s = cardState;
  const sort = $("#card-sort").value;
  let list = $("#only-owned").checked ? s.cards.filter((c) => owned[c.id]) : s.cards;
  if (sort !== "default") {
    const val = (c) => prices[c.id]?.v ?? null;
    list = [...list].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va == null) return vb == null ? 0 : 1;
      if (vb == null) return -1;
      return sort === "desc" ? vb - va : va - vb;
    });
  }
  s.list = list;
  s.shown = 0;
  $("#cards").innerHTML = "";
  showMoreCards();
}

function showMoreCards() {
  const s = cardState;
  const slice = s.list.slice(s.shown, s.shown + CARDS_PER_PAGE).map((c) => ({ ...c, mon: s.monId }));
  $("#cards").insertAdjacentHTML("beforeend", slice.map(cardTile).join(""));
  loadPricesFor(slice);
  s.shown += slice.length;
  updateCardsStatus();
  $("#more")?.remove();
  if (s.shown < s.list.length) {
    $("#cards").insertAdjacentHTML("afterend", `<button id="more" class="more">Meer kaarten (${s.list.length - s.shown})</button>`);
    $("#more").onclick = showMoreCards;
  }
}

function updateCardsStatus() {
  const s = cardState;
  const mine = s.cards.filter((c) => owned[c.id]);
  let text = `${s.cards.length} kaarten · ${mine.length} in bezit`;
  if (mine.length) text += ` (waarde ${sumPrices(mine.map((c) => c.id)).text})`;
  if ($("#only-owned").checked && !mine.length) text += " — vink “Heb ik” aan bij je kaarten.";
  $("#cards-status").textContent = text;
}

// --- collection ---
function openCollection() {
  ++detailToken;
  cancelPrices();
  cardState = null;
  const items = Object.values(owned).sort((a, b) => a.mon - b.mon || a.id.localeCompare(b.id));
  detailBody.innerHTML = `
    <div class="collection-head">
      <h2 id="d-name">Mijn collectie</h2>
      <p id="coll-summary"></p>
      <div class="coll-actions">
        <button class="more" id="export" type="button">Exporteren</button>
        <label class="more">Importeren<input type="file" id="import" accept="application/json,.json" hidden /></label>
      </div>
      <p class="hint">Je collectie wordt in deze browser bewaard. Exporteer hem om een back-up te maken of hem op een ander apparaat te importeren.</p>
    </div>
    <section class="cards-section">
      <div class="cards" id="cards">${items.length ? items.map((c) => `
        <div class="coll-item"><a class="coll-mon" href="#/pokemon/${c.mon}">${pad(c.mon)} ${esc(prettyName(all.find((m) => m.id === c.mon)?.name ?? ""))}</a>${cardTile(c)}</div>`).join("")
        : `<p class="status">Je hebt nog geen kaarten afgevinkt. Open een Pokémon en vink “Heb ik” aan bij de kaarten die je hebt.</p>`}
      </div>
    </section>`;
  if (!detail.open) detail.showModal();
  detail.scrollTop = 0;
  updateCollectionSummary();
  loadPricesFor(items);

  $("#export").onclick = () => {
    const blob = new Blob([JSON.stringify(Object.values(owned), null, 2)], { type: "application/json" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "pokemon-collectie.json" });
    a.click();
    URL.revokeObjectURL(a.href);
  };
  $("#import").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const list = Array.isArray(data) ? data : Object.values(data);
      let added = 0;
      for (const c of list) {
        if (typeof c?.id !== "string" || typeof c.image !== "string" || !/^https:\/\//.test(c.image)) continue;
        if (!owned[c.id]) added++;
        owned[c.id] = { id: c.id, name: String(c.name ?? c.id), image: c.image, mon: Number(c.mon) || 0 };
      }
      saveOwned();
      refreshOwnedUI();
      openCollection();
      alert(`${added} nieuwe kaart(en) geïmporteerd.`);
    } catch {
      alert("Dit bestand kon niet worden geïmporteerd.");
    }
  };
}

function updateCollectionSummary() {
  const ids = Object.keys(owned);
  if (!ids.length) { $("#coll-summary").textContent = "Nog geen kaarten in je collectie."; return; }
  const { text, missing } = sumPrices(ids);
  $("#coll-summary").textContent = `${ids.length} kaarten · geschatte waarde ${text}` + (missing ? ` (${missing} zonder prijs)` : "");
}

// --- routing & events ---
function route() {
  const m = location.hash.match(/^#\/pokemon\/(\d+)/);
  if (m) openDetail(Number(m[1]));
  else if (location.hash === "#/collectie") openCollection();
  else if (detail.open) detail.close();
}

grid.addEventListener("click", (e) => {
  const btn = e.target.closest(".mon");
  if (btn) location.hash = `#/pokemon/${btn.dataset.id}`;
});
detail.addEventListener("click", (e) => {
  const card = e.target.closest(".tcg");
  if (card) {
    $("#lightbox-body").innerHTML = `<img src="${esc(card.dataset.img)}" alt="${esc(card.title)}" />`;
    lightbox.showModal();
  }
  if (e.target === detail || e.target.closest("[data-close]")) detail.close();
});
detail.addEventListener("change", (e) => {
  const cb = e.target.closest("[data-own]");
  if (!cb) return;
  const id = cb.dataset.own;
  if (cb.checked) owned[id] = { id, name: cb.dataset.name, image: cb.dataset.image, mon: Number(cb.dataset.mon) };
  else delete owned[id];
  saveOwned();
  document.querySelectorAll(`[data-own="${CSS.escape(id)}"]`).forEach((el) => {
    el.checked = cb.checked;
    el.closest(".tcg-item").classList.toggle("owned", cb.checked);
  });
  refreshOwnedUI();
});
detail.addEventListener("close", () => {
  cancelPrices();
  if (location.hash && location.hash !== "#/") history.pushState(null, "", "#/");
});
lightbox.addEventListener("click", () => lightbox.close());
window.addEventListener("hashchange", route);

let t;
search.addEventListener("input", () => { clearTimeout(t); t = setTimeout(render, 120); });
genSel.addEventListener("change", render);
typeSel.addEventListener("change", render);

GENS.forEach(([a, b, region], i) => genSel.add(new Option(`Gen ${i + 1} – ${region}`, i)));
Object.entries(TYPES).forEach(([k, v]) => typeSel.add(new Option(v, k)));
refreshOwnedUI();

try {
  all = await loadIndex();
  render();
  route();
} catch (err) {
  console.error(err);
  status.textContent = "Kon de Pokémon niet laden. Probeer het later opnieuw.";
}
