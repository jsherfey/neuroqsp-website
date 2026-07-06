#!/usr/bin/env node
/* ============================================================
   update-videos.mjs
   Fetches the latest uploads from the NeuroQSP YouTube channel
   and writes them to videos.json, which the Videos page loads.

   Run manually:      node scripts/update-videos.mjs
   Run automatically: see .github/workflows/update-videos.yml
   (No API key required — this reads the public channel RSS feed
    server-side, where there is no CORS restriction.)
   ============================================================ */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const CHANNEL_ID = "UCfe734Oyg5lS6pdTqsHgZ9w"; // @NeuroQSP
const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "videos.json");

function decode(s) {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}

function parse(xml) {
  const entries = xml.split("<entry>").slice(1);
  return entries.map((e) => {
    const pick = (tag) => {
      const m = e.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
      return m ? decode(m[1].trim()) : "";
    };
    return { id: pick("yt:videoId"), title: pick("title"), published: pick("published") };
  }).filter((v) => v.id);
}

async function main() {
  const res = await fetch(RSS_URL, { headers: { "User-Agent": "NeuroQSP-site/1.0" } });
  if (!res.ok) throw new Error(`Feed fetch failed: HTTP ${res.status}`);
  const videos = parse(await res.text());
  if (!videos.length) throw new Error("No videos parsed from feed");

  const payload = { updated: new Date().toISOString(), channelId: CHANNEL_ID, videos };
  await writeFile(OUT, JSON.stringify(payload, null, 2) + "\n");
  console.log(`Wrote ${videos.length} videos to videos.json`);
  videos.forEach((v) => console.log(`  • ${v.title}`));
}

main().catch((err) => {
  console.error("update-videos failed:", err.message);
  process.exit(1);
});
