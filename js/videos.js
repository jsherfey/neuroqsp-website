/* ============================================================
   NeuroQSP — automatic YouTube video loader
   ------------------------------------------------------------
   Pulls the latest uploads from the NeuroQSP channel and renders
   click-to-play cards. New videos appear automatically — no code
   changes needed when you publish.

   HOW IT STAYS AUTOMATIC (tried in priority order):
   1. videos.json — generated from the channel feed by
      scripts/update-videos.mjs (refreshed on a schedule via a
      GitHub Action). Same-origin, so it always loads. RECOMMENDED.
   2. YouTube Data API v3, if you set YT_API_KEY below.
   3. The channel's public RSS feed, fetched through a CORS proxy
      (best-effort; free proxies can be unreliable).
   4. A built-in fallback list (FALLBACK_VIDEOS) so the page is
      never empty even if 1–3 are unavailable.
   ============================================================ */

const CHANNEL_ID = "UCfe734Oyg5lS6pdTqsHgZ9w";      // @NeuroQSP
const YT_API_KEY = "";   // optional — paste a YouTube Data API v3 key for the most reliable results
const MAX_VIDEOS = 12;

// Public RSS feed (latest ~15 uploads). No key required.
const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

// CORS proxies tried in order (the RSS feed itself sends no CORS headers).
const PROXIES = [
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  (u) => `https://r.jina.ai/${u}`,
];

// Last-resort content so the page always shows something meaningful.
const FALLBACK_VIDEOS = [
  { id: "KAQXrwmS59E", title: "Hugo Geerts, PhD — 25 years of CNS QSP: past, present, and future", published: "2026-07-01" },
  { id: "8OiX-ZyQhEc", title: "NeuroQSP WG Meeting (May 18, 2026): Dr. Vignayanandam Muddapu", published: "2026-05-19" },
];

/* ---------- Fetch strategies ---------- */

async function fetchViaJson() {
  const res = await fetch(`videos.json?t=${Date.now()}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`videos.json HTTP ${res.status}`);
  const data = await res.json();
  const videos = Array.isArray(data) ? data : data.videos;
  if (!videos || !videos.length) throw new Error("videos.json empty");
  return videos.slice(0, MAX_VIDEOS);
}

async function fetchViaApi() {
  if (!YT_API_KEY) throw new Error("no api key");
  // 1) resolve the channel's uploads playlist
  const chURL = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${CHANNEL_ID}&key=${YT_API_KEY}`;
  const ch = await fetch(chURL).then((r) => r.json());
  const uploads = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error("no uploads playlist");
  // 2) list items in that playlist
  const plURL = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=${MAX_VIDEOS}&playlistId=${uploads}&key=${YT_API_KEY}`;
  const pl = await fetch(plURL).then((r) => r.json());
  return (pl.items || []).map((it) => ({
    id: it.snippet.resourceId.videoId,
    title: it.snippet.title,
    published: it.snippet.publishedAt,
  }));
}

async function fetchViaRss() {
  let lastErr;
  for (const proxy of PROXIES) {
    try {
      const res = await fetch(proxy(RSS_URL), { headers: { Accept: "application/xml,text/xml,*/*" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const videos = parseRss(text);
      if (videos.length) return videos;
      throw new Error("empty feed");
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("all proxies failed");
}

function parseRss(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "text/xml");
  const entries = Array.from(doc.getElementsByTagName("entry"));
  return entries.slice(0, MAX_VIDEOS).map((entry) => {
    const get = (tag) => entry.getElementsByTagName(tag)[0]?.textContent || "";
    // videoId lives in <yt:videoId>; getElementsByTagName is namespace-agnostic here
    const id = get("yt:videoId") || get("videoId");
    return { id, title: get("title"), published: get("published") };
  }).filter((v) => v.id);
}

/* ---------- Rendering ---------- */

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function playIcon() {
  return `<svg viewBox="0 0 68 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M66.5 7.7a8 8 0 0 0-5.6-5.7C56 .7 34 .7 34 .7s-22 0-26.9 1.3A8 8 0 0 0 1.5 7.7 84 84 0 0 0 .2 24a84 84 0 0 0 1.3 16.3 8 8 0 0 0 5.6 5.7C12 47.3 34 47.3 34 47.3s22 0 26.9-1.3a8 8 0 0 0 5.6-5.7A84 84 0 0 0 67.8 24a84 84 0 0 0-1.3-16.3z" fill="#f00"/>
    <path d="M27 34l18-10-18-10z" fill="#fff"/></svg>`;
}

function renderVideos(videos) {
  const grid = document.getElementById("video-grid");
  const status = document.getElementById("video-status");

  grid.innerHTML = videos.map((v) => `
    <article class="video-card">
      <div class="video-thumb" data-id="${escapeHtml(v.id)}" role="button" tabindex="0"
           aria-label="Play: ${escapeHtml(v.title)}">
        <img src="https://i.ytimg.com/vi/${escapeHtml(v.id)}/hqdefault.jpg" alt="" loading="lazy"
             onerror="this.src='https://i.ytimg.com/vi/${escapeHtml(v.id)}/mqdefault.jpg'">
        <span class="play">${playIcon()}</span>
      </div>
      <div class="video-body">
        <span class="video-date">${fmtDate(v.published)}</span>
        <h3>${escapeHtml(v.title)}</h3>
        <a href="https://www.youtube.com/watch?v=${escapeHtml(v.id)}" target="_blank" rel="noopener">Watch on YouTube →</a>
      </div>
    </article>`).join("");

  // click-to-load embeds (keeps the page fast; loads iframe only on demand)
  grid.querySelectorAll(".video-thumb").forEach((thumb) => {
    const load = () => {
      const id = thumb.getAttribute("data-id");
      thumb.innerHTML =
        `<iframe src="https://www.youtube.com/embed/${id}?autoplay=1&rel=0"
                 title="NeuroQSP video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                 allowfullscreen></iframe>`;
    };
    thumb.addEventListener("click", load);
    thumb.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); load(); } });
  });

  status.hidden = true;
  grid.hidden = false;
}

/* ---------- Boot ---------- */

(async function init() {
  const strategies = [fetchViaJson, fetchViaApi, fetchViaRss];
  let videos;
  for (const strategy of strategies) {
    try {
      videos = await strategy();
      if (videos && videos.length) break;
    } catch (e) {
      /* try the next source */
    }
  }
  if (!videos || !videos.length) videos = FALLBACK_VIDEOS;
  renderVideos(videos);
})();
