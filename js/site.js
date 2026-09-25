/* Strike a Chord: project page behaviour.
 *
 * Everything is driven by data/results.json, which build_site.py writes. The lists below
 * are the only editorial choices on the page: which cases lead each section. They are
 * seeded with the examples the paper's own figures use, so the page and the paper show
 * the same things. Any name that is missing from the build is skipped silently and the
 * slot is filled from the measured ordering instead.
 */

const FEATURED = {
  // make_results_fig.py + the guide's flagship
  hero: ["008_R_rooster_r2", "029_Y_reach_r1", "038_V_bird_r1", "033_M_camel_r2",
         "023_W_bat_r2", "051_X_starfish_r1"],
  // make_compare_fig.py
  compare: ["055_L_boot_r2", "038_V_bird_r1", "082_X_jumpingjack_r1", "086_H_swing_r2",
            "010_Q_cat_r1", "029_Y_reach_r1"],
  // make_aniclipart_fig.py (uids are "<batch>__<case>")
  frozen: ["noshape__030_Y_student_raising", "noshape__093_S_snake_slithering",
           "noshape__055_M_mountain_range", "kinetic__015_H_ladder_wobbling"],
  // one caption run on two typefaces; named by the case stem, without the _r1/_r2
  typefaces: ["038_V_bird", "033_M_camel", "008_R_rooster", "051_X_starfish",
              "035_S_swan", "044_H_ladder"],
};

const PAGE = 24;          // gallery tiles revealed per click
const COMPARE_PAGE = 4;   // comparison pairs revealed per click

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

const esc = s => String(s).replace(/[&<>"]/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const prettyFont = f => (f || "").replace(/[-_](Regular|Light|Bold)$/i, "").replace(/([a-z])([A-Z])/g, "$1 $2");
const sentence = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

/* Lazy-load: a 400px GIF per tile adds up, so a clip only starts downloading once its
   tile is near the viewport. */
const lazy = new IntersectionObserver((entries, obs) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    const img = e.target;
    if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
    obs.unobserve(img);
  }
}, { rootMargin: "300px 0px" });

const img = (src, cls, alt) => {
  const n = el("img", cls);
  n.dataset.src = src;
  n.alt = alt || "";
  n.loading = "lazy";
  n.decoding = "async";
  lazy.observe(n);
  return n;
};

/* pick(names, pool, n): the named cases that exist, in order, topped up from the pool
   (which build_site.py has already sorted by measured margin) to n entries. */
function pick(names, pool, keyOf, n) {
  const byKey = new Map(pool.map(r => [keyOf(r), r]));
  const out = [];
  const seen = new Set();
  for (const nm of names) {
    const r = byKey.get(nm);
    if (r && !seen.has(nm)) { out.push(r); seen.add(nm); }
  }
  for (const r of pool) {
    if (out.length >= n) break;
    const k = keyOf(r);
    if (!seen.has(k)) { out.push(r); seen.add(k); }
  }
  return out.slice(0, n);
}

/* Ratios are capped for display. On the frozen-shape task the baseline sometimes produces
   near-zero motion, which sends the ratio into the dozens; a literal "92×" reads as a typo
   rather than as a measurement, so anything past the cap is shown as "10×+". */
const XCAP = 10;
const fmtx = v => v >= XCAP ? XCAP + "×+" : v.toFixed(1) + "×";

/* A per-case fact, phrased in whichever direction it actually points. `up` says whether a
   bigger number is the better one. Cases where we lose read as losses; the results carry
   the honest framing better than a uniformly flattering one would. */
function stat(ours, base, up, better, worse) {
  if (!(ours > 0) || !(base > 0)) return null;
  const r = up ? ours / base : base / ours;
  if (r >= 1.05) return `<b>${fmtx(r)}</b> ${better}`;
  if (r <= 0.95) return `<b>${fmtx(1 / r)}</b> ${worse}`;
  return null;                      // within 5% either way: not a difference worth a number
}

const SERVED = location.protocol === "http:" || location.protocol === "https:";

/* The paper button points at paper.pdf, which is dropped in by hand when there is a
   version fit to circulate. Until then, don't offer a link that 404s. Over file:// the
   probe is not allowed, so leave the button alone rather than mislabel a PDF that is
   sitting right there. */
if (SERVED) {
  fetch("paper.pdf", { method: "HEAD" })
    .then(r => { if (!r.ok) throw 0; })
    .catch(() => {
      const a = $("#paper-link");
      if (!a) return;
      a.setAttribute("aria-disabled", "true");
      a.textContent = "Paper (coming soon)";
    });
}

/* data/results.js assigns window.SITE_DATA with a plain <script> tag, which works whether
   the page is served or opened straight off disk. The fetch is only a fallback for a
   deployment that ships results.json without it. */
if (window.SITE_DATA) {
  build(window.SITE_DATA);
} else if (SERVED) {
  fetch("data/results.json")
    .then(r => r.ok ? r.json() : Promise.reject(new Error("results.json not found: run build_site.py")))
    .then(build)
    .catch(reportLoadFailure);
} else {
  reportLoadFailure(new Error("data/results.js not found: run build_site.py"));
}

/* Never write this into the hero strip: an error message wedged between the title and the
   teaser reads as a broken page even when every section on it is fine. */
function reportLoadFailure(err) {
  console.error(err);
  const host = $("#gallery") || $("#typeface-grid") || $("#compare-grid") || $("#frozen-grid");
  if (host) host.append(el("div", "empty", esc(err.message)));
}

/* Sections are added to index.html one at a time; a builder whose host element is not on
   the page yet is simply skipped. The markup for the sections not currently in index.html
   is parked in _sections_removed.html. */
function build(data) {
  const results = data.results || [];
  const frozen  = (data.frozen || []).filter(r => r.an);

  const run = (hostSel, fn, arg) => { if ($(hostSel)) fn(arg); };

  run("#hero-strip",    buildHero,      results);
  run("#gallery",       buildGallery,   results);
  run("#typeface-grid", buildTypefaces, results);
  run("#compare-grid",  buildCompare,   results.filter(r => r.dt));
  run("#frozen-grid",   buildFrozen,    frozen);
}

/* ---------- same caption, two typefaces ----------------------------------- */
/* Every concept was run twice, _r1 and _r2, on two typefaces drawn at random from twelve.
   Where both halves survived the build, the pair shows the parts table transferring. */
function buildTypefaces(results) {
  const host = $("#typeface-grid");
  const more = $("#typeface-more");

  const groups = new Map();
  for (const r of results) {
    const stem = r.case.replace(/_r\d+$/, "");
    if (!groups.has(stem)) groups.set(stem, []);
    groups.get(stem).push(r);
  }
  const pairs = [...groups.values()]
    .filter(g => g.length === 2 && g[0].font !== g[1].font)
    .sort((a, b) => (a[0].wins == null) - (b[0].wins == null)
                 || (b[0].wins || 0) + (b[1].wins || 0) - ((a[0].wins || 0) + (a[1].wins || 0)));

  if (!pairs.length) { host.append(el("div", "empty", "No typeface pairs built.")); more.remove(); return; }

  const ordered = pick(FEATURED.typefaces, pairs, g => g[0].case.replace(/_r\d+$/, ""), pairs.length);
  let shown = 0;

  const render = n => {
    for (const g of ordered.slice(shown, shown + n)) {
      const c = el("div", "compare");
      c.append(el("div", "prompt",
        `<span class="badge">${esc(g[0].letter)}</span><span>${esc(sentence(g[0].caption))}</span>`));
      const pair = el("div", "pair");
      for (const r of g) {
        const cell = el("div");
        cell.append(el("span", "tag", esc(prettyFont(r.font))));
        cell.append(img(`assets/results/${r.case}.gif`, null,
          `${r.letter} as ${r.concept}, set in ${prettyFont(r.font)}`));
        pair.append(cell);
      }
      c.append(pair);
      host.append(c);
    }
    shown = Math.min(shown + n, ordered.length);
    if (shown >= ordered.length) more.remove();
  };
  more.addEventListener("click", () => render(COMPARE_PAGE));
  render(COMPARE_PAGE);
}

/* ---------- hero strip ---------------------------------------------------- */
function buildHero(results) {
  const strip = $("#hero-strip");
  for (const r of pick(FEATURED.hero, results, x => x.case, 6)) {
    const fig = el("figure");
    fig.append(img(`assets/results/${r.case}.gif`, null, `${r.letter} animated as ${r.concept}`));
    fig.append(el("figcaption", null,
      `<b>${esc(r.letter)}</b> &nbsp;${esc(sentence(r.concept.replace(/_/g, " ")))}`));
    strip.append(fig);
  }
}

/* ---------- side-by-side against Dynamic Typography ----------------------- */
function buildCompare(pool) {
  const host = $("#compare-grid");
  const more = $("#compare-more");
  if (!pool.length) { host.append(el("div", "empty", "No paired comparisons built.")); more.remove(); return; }

  const ordered = pick(FEATURED.compare, pool, x => x.case, pool.length);
  let shown = 0;

  const render = n => {
    for (const r of ordered.slice(shown, shown + n)) host.append(comparePair(r));
    shown = Math.min(shown + n, ordered.length);
    if (shown >= ordered.length) more.remove();
  };
  more.addEventListener("click", () => render(COMPARE_PAGE));
  render(COMPARE_PAGE);
}

function comparePair(r) {
  const c = el("div", "compare");
  c.append(el("div", "prompt",
    `<span class="badge">${esc(r.letter)}</span><span>${esc(sentence(r.caption))}</span>`));

  const pair = el("div", "pair");
  for (const [cls, label, src] of [
    ["ours", "Ours", `assets/results/${r.case}.gif`],
    ["base", "Dynamic Typography", `assets/compare_dt/${r.case}.gif`],
  ]) {
    const cell = el("div");
    cell.append(el("span", `tag ${cls}`, label));
    cell.append(img(src, null, `${label}: ${r.letter}, ${r.caption}`));
    pair.append(cell);
  }
  c.append(pair);

  // per-case measured ratios; scale-free, so they are safe to read next to each other
  const bits = [
    stat(r.artic,   r.artic_base,   true,  "more deformation", "less deformation"),
    stat(r.stretch, r.stretch_base, false, "less stretch",     "more stretch"),
    stat(r.travel,  r.travel_base,  false, "less sliding",     "more sliding"),
    stat(r.jerk,    r.jerk_base,    false, "smoother",         "jerkier"),
  ].filter(Boolean);
  bits.push(esc(prettyFont(r.font)));
  c.append(el("div", "foot", bits.map(b => `<span>${b}</span>`).join("")));
  return c;
}

/* ---------- gallery ------------------------------------------------------- */
function buildGallery(results) {
  const host    = $("#gallery");
  const more    = $("#gallery-more");
  const count   = $("#count");
  const search  = $("#q");
  const fontSel = $("#font-filter");
  const lettersHost = $("#letters");

  const fonts = [...new Set(results.map(r => r.font).filter(Boolean))].sort();
  for (const f of fonts) {
    const o = el("option");
    o.value = f; o.textContent = prettyFont(f);
    fontSel.append(o);
  }

  const present = new Set(results.map(r => r.letter));
  const state = { letter: "", font: "", q: "", shown: 0 };

  for (const L of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    const b = el("button", null, L);
    b.type = "button";
    b.setAttribute("aria-pressed", "false");
    if (!present.has(L)) b.disabled = true;
    b.addEventListener("click", () => {
      state.letter = state.letter === L ? "" : L;
      $$("button", lettersHost).forEach(x =>
        x.setAttribute("aria-pressed", String(x.textContent === state.letter)));
      redraw();
    });
    lettersHost.append(b);
  }

  const matches = () => results.filter(r =>
    (!state.letter || r.letter === state.letter) &&
    (!state.font   || r.font === state.font) &&
    (!state.q      || (r.caption + " " + r.concept + " " + r.letter).toLowerCase().includes(state.q)));

  function redraw() {
    host.textContent = "";
    state.shown = 0;
    const list = matches();
    count.textContent = `${list.length} of ${results.length} animations`;
    if (!list.length) {
      host.append(el("div", "empty", "Nothing matches those filters."));
      more.hidden = true;
      return;
    }
    reveal(list, PAGE);
  }

  function reveal(list, n) {
    for (const r of list.slice(state.shown, state.shown + n)) host.append(tile(r));
    state.shown = Math.min(state.shown + n, list.length);
    more.hidden = state.shown >= list.length;
  }

  more.addEventListener("click", () => reveal(matches(), PAGE));
  fontSel.addEventListener("change", () => { state.font = fontSel.value; redraw(); });

  let t;
  search.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => { state.q = search.value.trim().toLowerCase(); redraw(); }, 140);
  });

  $("#glyph-toggle").addEventListener("change", e => {
    host.classList.toggle("glyphs-on", e.target.checked);
    $$(".tile", host).forEach(x => x.classList.toggle("show-glyph", e.target.checked));
    host.dataset.glyphs = e.target.checked ? "1" : "";
  });

  redraw();
}

function tile(r) {
  const t = el("div", "tile");
  if ($("#gallery").dataset.glyphs) t.classList.add("show-glyph");

  const stage = el("div", "stage");
  stage.append(img(`assets/results/${r.case}.gif`, null, `${r.letter} animated as ${r.concept}`));
  if (r.glyph) {
    stage.append(img(`assets/glyph/${r.case}.png`, "glyph", `the original letter ${r.letter}`));
    t.append(el("span", "hint", "the letter"));
  }
  t.append(stage);

  const body = el("div", "body");
  body.append(el("p", "cap",
    `<span class="badge">${esc(r.letter)}</span>${esc(sentence(r.caption))}`));
  body.append(el("p", "meta", esc(prettyFont(r.font))));
  t.append(body);
  return t;
}

/* ---------- frozen shape vs AniClipart ------------------------------------ */
function buildFrozen(pool) {
  const host = $("#frozen-grid");
  const more = $("#frozen-more");
  if (!pool.length) { host.append(el("div", "empty", "No frozen-shape pairs built.")); more.remove(); return; }

  const ordered = pick(FEATURED.frozen, pool, x => x.uid, pool.length);
  let shown = 0;

  const render = n => {
    for (const r of ordered.slice(shown, shown + n)) {
      const c = el("div", "compare");
      c.append(el("div", "prompt",
        `<span class="badge">${esc(r.letter)}</span><span>${esc(sentence(r.caption))}</span>`));
      const pair = el("div", "pair");
      for (const [cls, label, src] of [
        ["ours", "Ours, shape stage off", `assets/frozen/${r.uid}.gif`],
        ["base", "AniClipart", `assets/frozen_an/${r.uid}.gif`],
      ]) {
        const cell = el("div");
        cell.append(el("span", `tag ${cls}`, label));
        cell.append(img(src, null, `${label}: ${r.letter}, ${r.caption}`));
        pair.append(cell);
      }
      c.append(pair);

      /* When the rig fails to engage at all, the baseline's motion is near zero and every
         ratio against it blows past the cap, and two "10×+" readings say less than the plain
         fact does, so say the plain fact. */
      const degenerate = r.artic > 0 && r.artic_base > 0 && r.artic / r.artic_base >= XCAP;
      const bits = degenerate ? ["the baseline is close to static here"] : [
        stat(r.artic,  r.artic_base,  true,  "more deformation", "less deformation"),
        stat(r.travel, r.travel_base, false, "less sliding",     "more sliding"),
      ].filter(Boolean);
      bits.push(esc(prettyFont(r.font)));
      c.append(el("div", "foot", bits.map(b => `<span>${b}</span>`).join("")));
      host.append(c);
    }
    shown = Math.min(shown + n, ordered.length);
    if (shown >= ordered.length) more.remove();
  };
  more.addEventListener("click", () => render(COMPARE_PAGE));
  render(COMPARE_PAGE);
}

/* ---------- tab groups -----------------------------------------------------
 * Each nav.tabbar is its own group: its buttons show one of that group's sections and hide
 * the rest, independently of any other group (the results tabs and the Analysis tabs). The
 * choice is kept in the URL hash, so a link such as index.html#compare-dt opens straight to
 * that section. */
$$("nav.tabbar").forEach(function tabGroup(bar) {
  const tabs = $$(".tab", bar);
  if (!tabs.length) return;
  const panels = tabs.map(t => document.getElementById(t.getAttribute("aria-controls")));

  const show = (i, { scroll = false, hash = true } = {}) => {
    tabs.forEach((t, j) => {
      const on = i === j;
      t.setAttribute("aria-selected", on);
      t.tabIndex = on ? 0 : -1;
      panels[j].hidden = !on;
    });
    // some browsers refuse replaceState on file:// pages; the tab still switches without it
    if (hash && location.hash !== "#" + panels[i].id) {
      try { history.replaceState(null, "", "#" + panels[i].id); } catch (e) { /* keep going */ }
    }
    // when switching from deep inside a long grid, jump back to the top of the new section
    if (scroll && bar.getBoundingClientRect().top <= 0)
      window.scrollTo({ top: bar.offsetTop, behavior: "auto" });
  };

  tabs.forEach((t, i) => {
    t.id = "tab-" + panels[i].id;
    panels[i].setAttribute("aria-labelledby", t.id);
    t.addEventListener("click", () => show(i, { scroll: true }));
    t.addEventListener("keydown", e => {
      const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!d) return;
      const k = (i + d + tabs.length) % tabs.length;
      show(k, { scroll: true });
      tabs[k].focus();
    });
  });

  const fromHash = () => panels.findIndex(p => "#" + p.id === location.hash);
  const start = fromHash();
  show(start < 0 ? 0 : start, { hash: start >= 0 });
  if (start >= 0) bar.scrollIntoView();
  window.addEventListener("hashchange", () => {
    const k = fromHash();
    if (k >= 0) { show(k, { hash: false }); bar.scrollIntoView(); }
  });
});

/* ---------- paged result grids ---------------------------------------------
 * Each results grid shows a few examples at a time (6 word results, 4 baseline comparisons),
 * with a button on either side to flip to the previous or next set. Flipping wraps around,
 * and the counter underneath says which set is showing. Without JS every example stays visible. */
(function pagedGrids() {
  $$(".tab-panel .words, .tab-panel .cmp-grid").forEach(grid => {
    // the ablation cards are six panels wide, so they run as a carousel, one card at a time
    const PER_PAGE = grid.id === "cmp-ablation" ? 1 : grid.classList.contains("cmp-grid") ? 4 : 6;
    const items = [...grid.children];
    const pages = Math.ceil(items.length / PER_PAGE);
    if (pages <= 1) return;

    const pager = el("div", "pager");
    const prev  = el("button", "pager-btn prev", "&#8249;");
    const next  = el("button", "pager-btn next", "&#8250;");
    const count = el("div", "pager-count");
    prev.setAttribute("aria-label", "Previous examples");
    next.setAttribute("aria-label", "Next examples");
    count.setAttribute("aria-live", "polite");
    grid.before(pager);
    pager.append(prev, grid, next, count);

    let page = 0;
    const show = p => {
      page = (p + pages) % pages;
      items.forEach((it, i) => { it.hidden = Math.floor(i / PER_PAGE) !== page; });
      const a = page * PER_PAGE + 1, b = Math.min(items.length, a + PER_PAGE - 1);
      count.textContent = a === b ? `${a} of ${items.length}` : `${a}–${b} of ${items.length}`;
    };
    prev.addEventListener("click", () => show(page - 1));
    next.addEventListener("click", () => show(page + 1));
    show(0);
  });
})();

/* ---------- abstract toggle ------------------------------------------------
 * The abstract starts hidden. The button under the teaser opens and closes it; the Abstract
 * link at the top of the page always opens it and scrolls to it. */
(function abstractToggle() {
  const btn = $(".tab.reveal");
  const body = document.getElementById("abstract-body");
  if (!btn || !body) return;
  const set = open => { btn.setAttribute("aria-expanded", open); body.hidden = !open; };
  set(false);
  btn.addEventListener("click", () => set(body.hidden));
  $$('a[href="#abstract"]').forEach(a => a.addEventListener("click", e => {
    e.preventDefault();
    set(true);
    document.getElementById("abstract").scrollIntoView({ behavior: "smooth" });
  }));
})();
