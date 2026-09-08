#!/usr/bin/env node
/* ============================================================
   build-jobs.mjs
   Turns approved job submissions (GitHub issues) into jobs.json,
   the file the public Jobs page renders.

   Usage:
     node scripts/build-jobs.mjs <issues.json> [--today YYYY-MM-DD]

   <issues.json> is the output of:
     gh issue list --label job-submission --label approved --state open \
       --json number,title,body,createdAt,url,labels

   Safety / quality rules enforced here (see README "Job board"):
   • Only issues carrying the `approved` label are ever published.
     (Default-deny — this is the spam gate.)
   • Issues labeled `spam` or `rejected` are never published.
   • Required fields must be present; otherwise the post is skipped
     and a warning is printed for the moderator.
   • "How to apply" must contain an https:// link or an email address.
     Anything else (javascript:, data:, ftp:, etc.) is rejected.
   • Every post expires: the given deadline, else 60 days after posting;
     never more than 90 days. Expired posts are dropped and their issue
     numbers are written to expired.json so the workflow can close them.
   ============================================================ */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_JOBS = join(ROOT, "jobs.json");
const OUT_EXPIRED = join(ROOT, "expired.json");

const DEFAULT_DAYS = 60;
const MAX_DAYS = 90;

/* ---------- CLI ---------- */
const args = process.argv.slice(2);
const inputPath = args.find((a) => !a.startsWith("--"));
const todayArg = args.includes("--today") ? args[args.indexOf("--today") + 1] : null;
if (!inputPath) {
  console.error("usage: node scripts/build-jobs.mjs <issues.json> [--today YYYY-MM-DD]");
  process.exit(2);
}
const TODAY = todayArg ? new Date(`${todayArg}T00:00:00Z`) : startOfUtcDay(new Date());

/* ---------- helpers ---------- */
function startOfUtcDay(d) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
function isoDate(d) { return d.toISOString().slice(0, 10); }
function addDays(d, n) { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; }
function parseIsoDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return isNaN(d) || isoDate(d) !== s ? null : d;
}

// GitHub Issue Forms render the body as "### <Label>\n\n<value>" sections.
function parseForm(body) {
  const fields = {};
  const re = /^###\s+(.+?)\s*$/gm;
  const heads = [...(body || "").matchAll(re)];
  heads.forEach((m, i) => {
    const start = m.index + m[0].length;
    const end = i + 1 < heads.length ? heads[i + 1].index : body.length;
    let value = body.slice(start, end).trim();
    if (value === "_No response_") value = "";
    fields[m[1].trim().toLowerCase()] = value;
  });
  return fields;
}

const URL_RE = /https?:\/\/[^\s<>)\]"']+/i;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function extractApply(text) {
  const url = (text.match(URL_RE) || [])[0] || "";
  const email = (text.match(EMAIL_RE) || [])[0] || "";
  // Only https/http links are allowed; strip a trailing period/comma.
  const cleanUrl = url.replace(/[.,]+$/, "");
  if (cleanUrl && !/^https?:\/\//i.test(cleanUrl)) return null;
  if (!cleanUrl && !email) return null;
  return { applyUrl: cleanUrl, applyEmail: email, applyNote: text.trim() };
}

function hasLabel(issue, name) {
  return (issue.labels || []).some((l) => (typeof l === "string" ? l : l.name)?.toLowerCase() === name);
}

/* ---------- main ---------- */
async function main() {
  const issues = JSON.parse(await readFile(inputPath, "utf8"));
  const jobs = [];
  const expired = [];
  const warnings = [];

  for (const issue of issues) {
    const n = issue.number;
    if (!hasLabel(issue, "approved")) { warnings.push(`#${n}: not approved — skipped`); continue; }
    if (hasLabel(issue, "spam") || hasLabel(issue, "rejected")) { warnings.push(`#${n}: labeled spam/rejected — skipped`); continue; }

    const f = parseForm(issue.body);
    const title = f["job title"] || issue.title.replace(/^\[job\]\s*/i, "").trim();
    const company = f["company or organization"];
    const location = f["location"];
    const type = f["position type"];
    const mode = f["work arrangement"];
    const summary = f["about the role"];
    const applyText = f["how to apply"];

    const missing = Object.entries({ title, company, location, type, mode, summary, applyText })
      .filter(([, v]) => !v).map(([k]) => k);
    if (missing.length) { warnings.push(`#${n}: missing ${missing.join(", ")} — skipped`); continue; }

    const apply = extractApply(applyText);
    if (!apply) { warnings.push(`#${n}: "How to apply" has no https:// link or email — skipped`); continue; }

    const posted = startOfUtcDay(new Date(issue.createdAt));
    const cap = addDays(posted, MAX_DAYS);
    const deadline = parseIsoDate(f["application deadline"]);
    let expires = deadline || addDays(posted, DEFAULT_DAYS);
    if (expires > cap) expires = cap;

    if (expires < TODAY) { expired.push(n); continue; }

    jobs.push({
      id: n,
      title, company, location, type, mode, summary,
      ...apply,
      posted: isoDate(posted),
      expires: isoDate(expires),
      url: issue.url,
    });
  }

  jobs.sort((a, b) => (a.posted < b.posted ? 1 : a.posted > b.posted ? -1 : b.id - a.id));

  // Only rewrite jobs.json when the listing set actually changed.
  const sig = (list) => JSON.stringify(list.map((j) => [j.id, j.title, j.company, j.expires, j.applyUrl, j.applyEmail, j.summary]));
  let existing = null;
  try { existing = JSON.parse(await readFile(OUT_JOBS, "utf8")); } catch {}
  if (!existing || sig(existing.jobs || []) !== sig(jobs)) {
    await writeFile(OUT_JOBS, JSON.stringify({ updated: new Date().toISOString(), jobs }, null, 2) + "\n");
    console.log(`Wrote ${jobs.length} job(s) to jobs.json`);
  } else {
    console.log(`No change — jobs.json already lists ${jobs.length} job(s).`);
  }
  await writeFile(OUT_EXPIRED, JSON.stringify(expired) + "\n");

  jobs.forEach((j) => console.log(`  • #${j.id} ${j.title} — ${j.company} (expires ${j.expires})`));
  if (expired.length) console.log(`Expired (to close): ${expired.map((n) => "#" + n).join(", ")}`);
  warnings.forEach((w) => console.log(`  ! ${w}`));
}

main().catch((err) => { console.error("build-jobs failed:", err.message); process.exit(1); });
