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
   `job-submission` label. You get a GitHub notification.
2. Open it, sanity-check it (real role? relevant? does the apply link work?).
   The **Contact email** field is for you only — it is never published.
3. Add the **`approved`** label. The Action runs immediately and the listing
   is live on the site about a minute later.
   - Not relevant / spam → add the **`spam`** or **`rejected`** label and close it.
     Repeat offenders can be blocked from the repo.
4. That's it. Edits by the poster are re-reviewed automatically (the Action
   re-runs on edit; the `approved` label stays unless you remove it).

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

### Anti-stale design

| Control | How |
|---|---|
| **Every listing expires** | Deadline if given, otherwise 60 days after posting; never more than 90 days. |
| **Automatic retirement** | The Action runs daily, drops expired posts from `jobs.json`, and closes their issues with a friendly comment explaining how to relist. |
| **Client-side guard** | `js/jobs.js` also hides anything past its expiry, so the page is correct even before the daily run. |
| **Filled roles vanish fast** | Posters close their own issue when hired; the Action triggers on close and removes the listing. |
| **Visible dates** | Each card shows "Posted" and "Closes" dates plus "New" / "Closing soon" badges. |

### Important: repo visibility

Issue Forms only accept submissions from people who can see the repository.
**If this repo is private, outsiders cannot post.** Either make the repo
public (the site is public anyway and contains no secrets), or keep it
private and create a small *public* companion repo (e.g. `neuroqsp-jobs`)
that holds only the issue template — then point `SUBMIT_URL` in
`post-a-job.html` at it and set `--repo` in the workflow's `gh issue list`
step accordingly (closing expired issues cross-repo then needs a
fine-grained PAT with Issues: write stored as a repo secret).

### Testing the build locally

```bash
gh issue list --label job-submission --label approved --state open \
  --json number,title,body,createdAt,url,labels > /tmp/issues.json
node scripts/build-jobs.mjs /tmp/issues.json            # writes jobs.json + expired.json
node scripts/build-jobs.mjs /tmp/issues.json --today 2027-01-01   # simulate a future date
```
