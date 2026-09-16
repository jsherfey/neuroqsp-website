# NeuroQSP Working Group — website

A fast, static website for the NeuroQSP Working Group (an ISoP Special Interest
Group). No build step, no framework — just HTML, CSS, and a little JavaScript, so
it can be hosted anywhere.

## Pages

| File | Purpose |
|------|---------|
| `index.html` | Home — mission, what we do, applications, call to join |
| `about.html` | Mission, scope, goals, who should join, ISoP affiliation |
| `videos.html` | Seminar library — **auto-populated from YouTube** |
| `resources.html` | Toolkit / links hub (expand as the group grows) |
| `join.html` | Membership sign-up form |
| `css/styles.css` | Shared design system |
| `js/videos.js` | Loads and renders the videos |
| `videos.json` | Cached list of channel videos (auto-refreshed) |
| `scripts/update-videos.mjs` | Regenerates `videos.json` from the channel feed |
| `.github/workflows/update-videos.yml` | Refreshes `videos.json` on a schedule |

## Run locally

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy

Upload the folder to any static host — **GitHub Pages, Netlify, Cloudflare
Pages, Vercel, or your current provider**. There is nothing to compile.

- **GitHub Pages:** push to a repo, then Settings → Pages → deploy from `main`.
  The included GitHub Action keeps the video list current automatically.
- **Netlify / Cloudflare / Vercel:** drag-and-drop the folder or connect the repo.
  Leave the build command empty and the publish directory as the project root.

---

## The Videos page updates itself

`videos.html` shows the latest talks from the channel
(`@NeuroQSP`, id `UCfe734Oyg5lS6pdTqsHgZ9w`). It tries these sources in order:

1. **`videos.json`** (recommended) — a small file generated from the channel's
   public RSS feed by `scripts/update-videos.mjs`. Same-origin, so it always loads.
2. **YouTube Data API v3** — used if you set a key (see below).
3. **RSS via a public CORS proxy** — best-effort fallback.
4. **A built-in list** in `js/videos.js` — so the page is never empty.

### Keeping it fresh (automatic)

If you host on **GitHub**, the included workflow
(`.github/workflows/update-videos.yml`) runs daily, regenerates `videos.json`,
and commits any change — new talks appear on the site within a day with zero
effort. You can also trigger it anytime from the repo's **Actions** tab
("Update video list" → "Run workflow").

If you host elsewhere, just run this whenever you post a new video and re-upload:

```bash
node scripts/update-videos.mjs   # rewrites videos.json
```

### Optional: use a YouTube API key instead

For real-time results without the JSON file, create a
[YouTube Data API v3 key](https://console.cloud.google.com/apis/library/youtube.googleapis.com),
restrict it to your website's domain (HTTP referrer), and paste it into
`js/videos.js`:

```js
const YT_API_KEY = "YOUR_KEY_HERE";
```

---

## Wiring up the sign-up form

By default, `join.html` opens the visitor's email app addressed to
`neuroqsp@gmail.com` when they submit — so sign-up works immediately with no
backend. To collect submissions automatically instead (recommended), point the
form at a free form service:

1. Create a form at [Formspree](https://formspree.io) (or Getform, Google Apps
   Script, Netlify Forms, etc.) and copy its endpoint URL.
2. In `join.html`, set:
   ```js
   const FORM_ENDPOINT = "https://formspree.io/f/xxxxxxx";
   ```

Submissions will then arrive in your inbox / dashboard. If you'd rather embed a
**Google Form**, replace the `<form>` block with the form's iframe embed code.

---

## Customizing

- **Colors, spacing, fonts:** the CSS variables at the top of `css/styles.css`.
- **Text:** edit the HTML directly — it's plain and well-commented.
- **Channel:** change `CHANNEL_ID` in both `js/videos.js` and
  `scripts/update-videos.mjs` if the channel ever changes.
- **Contact email / links:** search for `neuroqsp@gmail.com` and the ISoP /
  YouTube URLs in the footers.

---

## Job board

`jobs.html` lists open positions; `post-a-job.html` explains how to submit one.
Employers submit through a **GitHub Issue Form**
(`.github/ISSUE_TEMPLATE/job-post.yml`), and a GitHub Action
(`.github/workflows/publish-jobs.yml`) compiles **approved** submissions into
`jobs.json`, which the page renders. Nothing is ever published without a
moderator's approval.

### Moderating (what the chair does)

1. A new submission arrives as an issue titled `[Job] …` with the
   `job-submission` label. Website-form submissions are authored by
   **@neuroqsp** (the relay); GitHub-form submissions by the poster. You get
   an email (see *Email notifications*) and a GitHub notification.
2. Open it, sanity-check it (real role? relevant? does the apply link work?).
   The **Contact email** field is for you only — it is never published.
3. Add the **`approved`** label. The Action runs immediately and the listing
   is live on the site about a minute later.
   - Not relevant / spam → add the **`spam`** or **`rejected`** label and close it.
     Repeat offenders can be blocked from the repo.
4. That's it. Edits by the poster are re-reviewed automatically (the Action
   re-runs on edit; the `approved` label stays unless you remove it).
5. **If an approved post doesn't appear**, it failed validation (most often:
   no `https://` link or email in *How to apply*). The Action comments on the
   issue with the exact reason and adds the **`needs-info`** label. Once the
   poster (or you) edits the submission to fix it, it publishes automatically
   and `needs-info` is removed. Filter for open `needs-info` issues to see
   everything stuck. For website-form posts the poster can't see GitHub, so
   the Action also **emails them** (you in Cc); paste their reply into the
   issue body and it republishes.

To force a rebuild at any time: **Actions → "Publish job board" → Run workflow.**

### Anti-spam design

| Control | How |
|---|---|
| **Default-deny moderation** | Only issues with the `approved` label are compiled. Unlabeled, `spam`, and `rejected` issues never reach `jobs.json`. |
| **Accountability** | Submitting requires a GitHub account; GitHub's own abuse controls apply, and you can block accounts. |
| **Verification channel** | A required, unpublished contact email lets you confirm the poster. |
| **Structured, validated fields** | Title, organization, location, type, arrangement, description, and apply info are all required; the build script skips anything incomplete and prints a warning. |
| **Link safety** | Apply links must be `https://` (or an email). `javascript:`, `data:`, and other schemes are rejected. All output is HTML-escaped; external links use `rel="noopener nofollow"`. |
| **Relevance policy** | Stated on `post-a-job.html#guidelines` so you can point to it when rejecting. |
| **Turnstile + honeypot** | Website-form submissions must pass Cloudflare's invisible CAPTCHA; a hidden field catches naive bots. |
| **Rate limit + dedupe** | 3 submissions per IP per hour; identical email+title blocked for 24 h. |
| **Origin lock** | The relay only accepts requests from neuroqsp.com. |

### Anti-stale design

| Control | How |
|---|---|
| **Every listing expires** | Deadline if given, otherwise 60 days after posting; never more than 90 days. |
| **Automatic retirement** | The Action runs daily, drops expired posts from `jobs.json`, and closes their issues with a friendly comment explaining how to relist. |
| **Client-side guard** | `js/jobs.js` also hides anything past its expiry, so the page is correct even before the daily run. |
| **Filled roles vanish fast** | Posters close their own issue when hired; the Action triggers on close and removes the listing. |
| **Visible dates** | Each card shows "Posted" and "Closes" dates plus "New" / "Closing soon" badges. |

### Email notifications

`.github/workflows/notify-moderator.yml` emails **neuroqsp@gmail.com** the
moment a job submission is filed, with the full details and a link to review
it. It sends through Gmail from that same account, which needs a one-time
setup (about two minutes):

1. Sign in to the **neuroqsp@gmail.com** Google account and make sure
   **2-Step Verification** is on (Google Account → Security). App Passwords
   require it.
2. Go to <https://myaccount.google.com/apppasswords>, create an app password
   named e.g. `NeuroQSP job board`, and copy the 16-character code.
3. In the repo: **Settings → Secrets and variables → Actions → New repository
   secret**. Name: `GMAIL_APP_PASSWORD`. Value: the code from step 2.
4. Test it: **Actions → "Notify moderator of new job posting" → Run workflow**
   (leave the issue number as is). An email should arrive within a minute.

Until the secret exists, the workflow fails with a clear error and no email is
sent; nothing else on the board is affected. To change the recipient, edit
`MODERATOR_EMAIL` at the top of the workflow (it must be the Gmail account the
app password belongs to).

### Login-free submissions (the relay)

`post-a-job.html` has an on-site form that needs no account. Because GitHub
Pages is static, the form posts to a tiny **Cloudflare Worker** (`relay/`)
which screens the submission and files the GitHub issue as the group's own
account, **@neuroqsp**. From there the normal pipeline takes over (label →
moderator email → `approved` → `jobs.json`). GitHub users can still use the
issue form directly; both paths produce identical issues.

What the Worker does on every submission, in order:

1. Rejects calls that don't come from `neuroqsp.com` (CORS origin allow-list).
2. Drops bot submissions that filled the hidden honeypot field (bots get a
   fake "success"; nothing is filed).
3. Verifies the **Cloudflare Turnstile** token (invisible CAPTCHA).
4. Validates every field with the same rules as the page and the build script
   (`scripts/lib/job-rules.mjs` — one source of truth).
5. Enforces **3 submissions per IP per hour** and blocks an identical
   email+title resubmission for 24 hours (Workers KV).
6. Creates the issue with the `job-submission` label; the
   `notify-moderator` workflow re-applies the label in case GitHub dropped it
   (the bot account has no push access).

**Files:** `relay/wrangler.toml` (config), `relay/src/index.js` (the Worker),
`relay/.dev.vars.example` (local secrets template). The page reads
`RELAY_URL` and `TURNSTILE_SITE_KEY` from the small config block at the top
of `post-a-job.html`.

#### One-time setup

1. **Cloudflare** (free account): `cd relay && npx wrangler login`.
2. **KV namespace:** `npx wrangler kv namespace create RATE` → paste the id
   into `relay/wrangler.toml`.
3. **Turnstile:** Cloudflare dashboard → Turnstile → *Add widget* → hostname
   `neuroqsp.com` → copy the **site key** into `post-a-job.html` and set the
   **secret**: `npx wrangler secret put TURNSTILE_SECRET`.
4. **GitHub token for @neuroqsp:** signed in as neuroqsp → Settings →
   Developer settings → Personal access tokens (classic) → scope
   **`public_repo` only** → expiry 1 year → `npx wrangler secret put GITHUB_TOKEN`.
   (Fine-grained tokens can't target a repo owned by another personal
   account, hence classic. `public_repo` on an account that owns nothing
   keeps the blast radius to "can open issues on public repos".)
   **Renewal:** the token expires one year after creation; when it does the
   form shows the email fallback and Worker logs show HTTP 401 from GitHub.
   Create a new token and run `wrangler secret put GITHUB_TOKEN` again.
5. **Deploy:** `npx wrangler deploy` → paste the printed URL (plus `/submit`)
   into `RELAY_URL` in `post-a-job.html`, commit, push.

#### Testing the relay locally

```bash
cd relay && cp .dev.vars.example .dev.vars   # Turnstile TEST secret + DRY_RUN=1
npx wrangler dev --var ALLOWED_ORIGINS:http://localhost:8000
# in another terminal, from the repo root:
python3 -m http.server 8000                   # then open http://localhost:8000/post-a-job.html
```
With the test site key `1x00000000000000000000AA` in the page, Turnstile
always passes; `DRY_RUN=1` skips GitHub and logs what would be filed.
Health check: `curl https://<worker-url>/health`.

#### Privacy note

Issues on a public repo are public, so the poster's contact email is visible
in the issue (as it always was for the GitHub form). It is never shown on the
website. If that becomes a concern, the cleanest fix is to file submissions in
a small **private** companion repo and have the publish workflow read from it.

### Testing the build locally

```bash
gh issue list --label job-submission --label approved --state open \
  --json number,title,body,createdAt,url,labels > /tmp/issues.json
node scripts/build-jobs.mjs /tmp/issues.json            # writes jobs.json + expired.json
node scripts/build-jobs.mjs /tmp/issues.json --today 2027-01-01   # simulate a future date
```
