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
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pad = (n) => "#" + String(n).padStart(4, "0");
const idFromUrl = (u) => Number(u.split("/").filter(Boolean).pop());
const prettyName = (n) => n.replace(/-/g, " ");
const typeBadges = (types) => types.map((t) => `<span class="type" data-type="${t}">${TYPES[t] ?? t}</span>`).join("");
const getJSON = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
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
      <img src="${ART(m.id)}" alt="" loading="lazy" width="200" height="200" onerror="this.onerror=null;this.src='${SPRITE(m.id)}'" />
      <div class="num">${pad(m.id)}</div>
      <div class="name">${esc(prettyName(m.name))}</div>
      <div class="types">${typeBadges(m.types)}</div>
    </button></li>`).join("");
  status.textContent = list.length ? `${list.length} Pokémon` : "Geen Pokémon gevonden.";
}

// --- detail ---
let detailToken = 0;

async function openDetail(id) {
  const token = ++detailToken;
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
      <h3>Pokémon-kaarten</h3>
      <div id="cards-status" class="status">Kaarten zoeken…</div>
      <div class="cards" id="cards"></div>
    </section>`;

  loadCards(name, token);
}

async function loadCards(name, token) {
  const normalize = (s) => s.toLowerCase().replace(/[’`]/g, "'");
  const target = normalize(name);
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wordMatch = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`);
  const statusEl = $("#cards-status"), cardsEl = $("#cards");

  let cards = [];
  try {
    const results = await getJSON(`${TCGDEX}/cards?name=${encodeURIComponent(name.replace(/[’']/g, "'"))}`);
    cards = results.filter((c) => c.image && wordMatch.test(normalize(c.name)));
  } catch {
    if (token === detailToken) statusEl.textContent = "Kaarten konden niet geladen worden.";
    return;
  }
  if (token !== detailToken) return;
  if (!cards.length) { statusEl.textContent = "Geen kaarten gevonden voor deze Pokémon."; return; }

  let shown = 0;
  const showMore = () => {
    const slice = cards.slice(shown, shown + CARDS_PER_PAGE);
    cardsEl.insertAdjacentHTML("beforeend", slice.map((c) => `
      <button class="tcg" data-img="${c.image}/high.webp" title="${esc(c.name)} (${esc(c.id)})">
        <img src="${c.image}/low.webp" alt="${esc(c.name)} – ${esc(c.id)}" loading="lazy" />
      </button>`).join(""));
    shown += slice.length;
    statusEl.textContent = `${cards.length} kaarten`;
    $("#more")?.remove();
    if (shown < cards.length) {
      cardsEl.insertAdjacentHTML("afterend", `<button id="more" class="more">Meer kaarten (${cards.length - shown})</button>`);
      $("#more").onclick = showMore;
    }
  };
  showMore();
}

// --- routing & events ---
function route() {
  const m = location.hash.match(/^#\/pokemon\/(\d+)/);
  if (m) openDetail(Number(m[1]));
  else if (detail.open) detail.close();
}

grid.addEventListener("click", (e) => {
  const btn = e.target.closest(".mon");
  if (btn) location.hash = `#/pokemon/${btn.dataset.id}`;
});
detail.addEventListener("click", (e) => {
  const card = e.target.closest(".tcg");
  if (card) {
    $("#lightbox-body").innerHTML = `<img src="${card.dataset.img}" alt="${esc(card.title)}" />`;
    lightbox.showModal();
  }
  if (e.target === detail || e.target.closest("[data-close]")) detail.close();
});
detail.addEventListener("close", () => { if (location.hash.startsWith("#/pokemon/")) history.pushState(null, "", "#/"); });
lightbox.addEventListener("click", () => lightbox.close());
window.addEventListener("hashchange", route);

let t;
search.addEventListener("input", () => { clearTimeout(t); t = setTimeout(render, 120); });
genSel.addEventListener("change", render);
typeSel.addEventListener("change", render);

GENS.forEach(([a, b, region], i) => genSel.add(new Option(`Gen ${i + 1} – ${region}`, i)));
Object.entries(TYPES).forEach(([k, v]) => typeSel.add(new Option(v, k)));

try {
  all = await loadIndex();
  render();
  route();
} catch (err) {
  console.error(err);
  status.textContent = "Kon de Pokémon niet laden. Probeer het later opnieuw.";
}
