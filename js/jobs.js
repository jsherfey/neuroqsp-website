/* ============================================================
   NeuroQSP — job board renderer
   Reads jobs.json (built from approved submissions by
   .github/workflows/publish-jobs.yml) and renders searchable,
   filterable listings. Expired posts are hidden client-side too,
   as a second line of defence against stale listings.
   ============================================================ */

const NEW_DAYS = 7;      // "New" badge window
const SOON_DAYS = 7;     // "Closing soon" badge window

const $ = (id) => document.getElementById(id);
let ALL = [];

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function paragraphs(text) {
  return esc(text).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
}
function fmt(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return isNaN(d) ? "" : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}
function daysBetween(a, b) { return Math.round((b - a) / 86400000); }
function today() { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }

function safeHref(url) {
  return /^https?:\/\//i.test(url || "") ? url : "";
}

function card(j) {
  const t = today();
  const posted = new Date(`${j.posted}T00:00:00Z`);
  const expires = new Date(`${j.expires}T00:00:00Z`);
  const isNew = daysBetween(posted, t) <= NEW_DAYS;
  const soon = daysBetween(t, expires) <= SOON_DAYS;
  const href = safeHref(j.applyUrl);
  const mail = j.applyEmail ? `mailto:${encodeURIComponent(j.applyEmail)}?subject=${encodeURIComponent(`Application: ${j.title} (via NeuroQSP)`)}` : "";
  const primary = href
    ? `<a class="btn btn--primary" href="${esc(href)}" target="_blank" rel="noopener nofollow">Apply now ↗</a>`
    : mail ? `<a class="btn btn--primary" href="${esc(mail)}">Apply by email ✉</a>` : "";
  const secondary = href && mail ? `<a class="btn btn--outline" href="${esc(mail)}">Or email ✉</a>` : "";
  const note = j.applyNote && j.applyNote.trim() !== (j.applyUrl || j.applyEmail || "").trim()
    ? `<div class="job-apply-note">${esc(j.applyNote)}</div>` : "";
  const long = (j.summary || "").length > 320;

  return `
    <article class="job-card" data-type="${esc(j.type)}" data-mode="${esc(j.mode)}"
             data-search="${esc(`${j.title} ${j.company} ${j.location} ${j.type} ${j.mode}`.toLowerCase())}">
      <div>
        <h3>${esc(j.title)}</h3>
        <p class="job-org">${esc(j.company)} · <span style="font-weight:500;color:var(--ink-soft)">${esc(j.location)}</span></p>
        <div class="job-meta">
          <span class="badge badge--type">${esc(j.type)}</span>
          <span class="badge badge--mode">${esc(j.mode)}</span>
          ${isNew ? `<span class="badge badge--new">New</span>` : ""}
          ${soon ? `<span class="badge badge--soon">Closing soon</span>` : ""}
        </div>
        <div class="job-summary ${long ? "collapsed" : ""}">${paragraphs(j.summary)}</div>
        ${long ? `<button class="job-more" type="button">Read more</button>` : ""}
      </div>
      <div class="job-side">
        ${primary}${secondary}
        ${note}
        <div class="job-dates">Posted ${fmt(j.posted)}<br>Closes ${fmt(j.expires)}</div>
      </div>
    </article>`;
}

function render() {
  const q = ($("q").value || "").trim().toLowerCase();
  const type = $("f-type").value, mode = $("f-mode").value;
  const shown = ALL.filter((j) =>
    (!type || j.type === type) && (!mode || j.mode === mode) &&
    (!q || `${j.title} ${j.company} ${j.location} ${j.type} ${j.mode}`.toLowerCase().includes(q)));

  const list = $("job-list");
  if (!ALL.length) {
    list.innerHTML = `<div class="job-empty">
      <h3>No open positions right now</h3>
      <p>Check back soon, or be the first to post. Listings are free and reviewed within a few days.</p>
      <a href="post-a-job.html" class="btn btn--primary mt-1">Post a job →</a></div>`;
  } else if (!shown.length) {
    list.innerHTML = `<div class="job-empty"><h3>No matches</h3><p>Try a different search or clear the filters.</p></div>`;
  } else {
    list.innerHTML = shown.map(card).join("");
  }
  $("job-count").textContent = ALL.length
    ? `${shown.length} of ${ALL.length} open position${ALL.length === 1 ? "" : "s"}`
    : "";

  list.querySelectorAll(".job-more").forEach((b) => b.addEventListener("click", () => {
    const s = b.previousElementSibling; s.classList.toggle("collapsed");
    b.textContent = s.classList.contains("collapsed") ? "Read more" : "Show less";
  }));
}

function fillFilters() {
  const add = (sel, values) => values.forEach((v) => { const o = document.createElement("option"); o.value = o.textContent = v; sel.appendChild(o); });
  add($("f-type"), [...new Set(ALL.map((j) => j.type))].sort());
  add($("f-mode"), [...new Set(ALL.map((j) => j.mode))].sort());
}

(async function init() {
  try {
    const res = await fetch(`jobs.json?t=${Date.now()}`, { cache: "no-cache" });
    const data = await res.json();
    const t = today();
    ALL = (data.jobs || []).filter((j) => new Date(`${j.expires}T00:00:00Z`) >= t);
  } catch { ALL = []; }

  $("job-status").hidden = true;
  $("job-list").hidden = false;
  if (ALL.length) { $("job-toolbar").hidden = false; fillFilters(); }
  ["q", "f-type", "f-mode"].forEach((id) => $(id).addEventListener("input", render));
  render();
})();
