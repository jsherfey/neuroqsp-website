/* ============================================================
   NeuroQSP job-board relay (Cloudflare Worker)
   ------------------------------------------------------------
   POST /submit  { ...fields, confirmed, website, "cf-turnstile-response" }
   → screens the submission, then files a GitHub issue as the group's
     bot account so the existing moderation pipeline takes over.

   Spam controls, in order:
     1. Origin allow-list (only neuroqsp.com may call this)
     2. Honeypot field `website` (bots fill it; humans never see it)
     3. Cloudflare Turnstile verification
     4. Field validation — shared with the page and build script
     5. Per-IP rate limit (3/hour) and 24 h duplicate suppression (KV)
   The issue is created with the `job-submission` label; nothing is
   published until a moderator adds `approved`.
   ============================================================ */

import { validateSubmission, toIssueMarkdown } from "../../scripts/lib/job-rules.mjs";

const MAX_BODY_BYTES = 32 * 1024;
const RATE_LIMIT = 3;           // submissions …
const RATE_WINDOW = 60 * 60;    // … per IP per hour
const DUP_WINDOW = 24 * 60 * 60;
const TURNSTILE_VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const FALLBACK = "If this keeps happening, email your listing to neuroqsp@gmail.com and we'll post it for you.";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const cors = allowed.includes(origin) ? corsHeaders(origin) : null;

    if (url.pathname === "/health" && request.method === "GET")
      return json({ ok: true, service: "neuroqsp-jobs" }, 200, cors);

    if (request.method === "OPTIONS")
      return new Response(null, { status: cors ? 204 : 403, headers: cors || {} });

    if (request.method !== "POST" || url.pathname !== "/submit")
      return json({ error: "Not found" }, 404, cors);

    if (!cors) return json({ error: "Origin not allowed" }, 403);

    // ---- body ----
    const len = Number(request.headers.get("Content-Length") || 0);
    if (len > MAX_BODY_BYTES) return json({ error: "Submission too large." }, 413, cors);
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: "Submission too large." }, 413, cors);
    let data;
    try { data = JSON.parse(raw); } catch { return json({ error: "Malformed request." }, 400, cors); }
    if (!data || typeof data !== "object") return json({ error: "Malformed request." }, 400, cors);

    // ---- honeypot: pretend success, file nothing ----
    if (data.website) return json({ ok: true, number: 0, url: "" }, 200, cors);

    // ---- Turnstile ----
    const token = String(data["cf-turnstile-response"] || "");
    if (!token) return json({ error: "Please complete the verification check and try again." }, 400, cors);
    const ip = request.headers.get("CF-Connecting-IP") || "";
    const ts = await verifyTurnstile(env.TURNSTILE_SECRET, token, ip);
    if (!ts.success) return json({ error: "Verification failed. Please reload the page and try again." }, 400, cors);

    // ---- validation (same rules as the page and the build script) ----
    const v = validateSubmission(data);
    if (!v.ok) return json({ error: "Please fix the highlighted fields.", errors: v.errors }, 400, cors);
    const f = v.fields;

    // ---- rate limit + duplicate suppression ----
    const ipKey = `ip:${await sha256(ip || "unknown")}`;
    const dupKey = `dup:${await sha256(`${f.contact.toLowerCase()}|${f.title.toLowerCase()}`)}`;
    const [count, dup] = await Promise.all([env.RATE.get(ipKey), env.RATE.get(dupKey)]);
    if (Number(count || 0) >= RATE_LIMIT)
      return json({ error: `Too many submissions from your network in the last hour. Please try again later. ${FALLBACK}` }, 429, cors);
    if (dup)
      return json({ error: "This looks identical to a posting submitted in the last 24 hours. It's already in the review queue." }, 429, cors);

    // ---- file the issue ----
    const country = request.cf && request.cf.country ? request.cf.country : "unknown";
    const body = toIssueMarkdown(f, { via: `${env.VIA_LABEL || "website form"} · ${country}` });
    const title = `[Job] ${f.title}`;

    let number = 0, htmlUrl = "";
    if (env.DRY_RUN === "1") {
      console.log("DRY_RUN — would create issue:", title);
    } else {
      const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "neuroqsp-jobs-relay",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title, body, labels: ["job-submission"] }),
      });
      if (res.status !== 201) {
        console.error("GitHub issue creation failed:", res.status, (await res.text()).slice(0, 500));
        return json({ error: `We couldn't file your posting right now. ${FALLBACK}` }, 502, cors);
      }
      const issue = await res.json();
      number = issue.number; htmlUrl = issue.html_url;
    }

    await Promise.all([
      env.RATE.put(ipKey, String(Number(count || 0) + 1), { expirationTtl: RATE_WINDOW }),
      env.RATE.put(dupKey, "1", { expirationTtl: DUP_WINDOW }),
    ]);

    return json({ ok: true, number, url: htmlUrl }, 200, cors);
  },
};

/* ---------- helpers ---------- */

async function verifyTurnstile(secret, token, ip) {
  if (!secret) return { success: false };
  const form = new URLSearchParams({ secret, response: token });
  if (ip) form.set("remoteip", ip);
  try {
    const r = await fetch(TURNSTILE_VERIFY, { method: "POST", body: form });
    return await r.json();
  } catch { return { success: false }; }
}

async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(obj, status = 200, extra = null) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...(extra || {}) },
  });
}
