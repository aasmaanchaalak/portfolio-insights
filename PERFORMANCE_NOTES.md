# Page Load Performance — Notes

*Measured 30 Sep 2026, from India against the production database.*

**Short answer:** the live-price fetch **doesn't add to the load time you see**. It runs separately, after the page is already up. The screen shows uploaded prices first and switches to live ones 2–4 seconds later. The slowness comes from somewhere else, measured below.

---

## What happens when you open the app today

```
1. Download the JS bundle (the entire app: all pages, one 4,700-line page.tsx)
2. GET /api/auth/verify                         ← waits for this before anything else
3. In parallel, once logged in:
     /api/portfolio  /api/gridkey  /api/portfolio-history
     /api/team-members  /api/nifty-smallcap  /api/live-prices
     + the landing page's own calls (Pipeline: /api/pipeline/ideas, /api/team-members again)
4. "Loading portfolio data..." blocks the WHOLE app until portfolio + gridkey + history finish
```

---

## Where the time goes

### 1. The database is on the other side of the world
The database is Neon in **us-east-1 (Virginia)**, while `vercel.json` pins the API to **bom1 (Mumbai)**. Every query makes the round trip. Measured from India:

| What | Time |
|---|---|
| Opening a new DB connection | **2,279 ms** |
| Smallest possible query (`SELECT 1`) | 232 ms |
| Loading the Screener data (172 KB) | **994 ms** |
| Loading the GridKey data | 838 ms |

On Vercel, each API request can land on a fresh server instance, and then it pays that ~2-second connection cost again.

### 2. Each API call makes several database trips one after another
Take `/api/portfolio`:
- Check the session.
- Load the Screener data.
- Load remarks, assignments, themes and the rest (in parallel, one trip).
- Look up the user's role.

That's about 4 trips of ~230 ms each, plus ~1 second to download the Screener data, so roughly 2 seconds even with a warm connection. Every other endpoint also starts with the session check and role lookup.

### 3. The whole app waits for data most pages don't need
Desktop lands on Pipeline, which doesn't use portfolio data, but still shows the spinner until `/api/portfolio`, `/api/gridkey` and `/api/portfolio-history` all finish.

### 4. Repeat work
- GridKey data is read by both `/api/portfolio` and `/api/gridkey`.
- `/api/team-members` is called twice (once by `App`, once by `PipelinePage`).

### 5. Nothing is kept on the phone between visits
Every open downloads everything from scratch.

---

## How to fix it, biggest win first

1. **Put the database and the API in the same region.** This is the single biggest fix; every query drops from ~230 ms to ~2 ms. There are two ways:
   - Move the Neon database to **Singapore** (ap-southeast-1), about 60 ms from Mumbai, and keep the API in bom1. That's a one-time data migration.
   - Move the API to **iad1 (Virginia)** next to the database. It's a one-line change, but the NSE and BSE calls (bulk deals, Smallcap index, live prices) would then come from US servers, and NSE often blocks those. Test that first.

2. **Show the last data immediately.** Save the last portfolio response on the device, show it the moment the app opens, and refresh in the background. On the phone app it would open with data on screen instead of a spinner.

3. **Stop blocking the whole app.** Show the nav and the landing page right away, with a loading state only on the parts that need portfolio data. Pipeline would load without waiting for portfolio data.

4. **Cut the chains of database trips.**
   - Fetch the session and the user's role in one query.
   - In `/api/portfolio`, run the Screener-data query in parallel with the others.
   - Remove the duplicate GridKey and team-members calls.

   That saves about 0.5–0.7 s on every call.

5. **Keep live prices off the critical path.** Always answer from cache right away and refresh in the background. Optionally, a Vercel Cron job could prefill the cache every 10 minutes during market hours, so no user ever waits on Yahoo or BSE. Every-10-minutes crons need a paid Vercel plan.

6. **Smaller JS bundle.** Load heavy pages like Analysis charts, the PE Tracker and Admin only when opened. The bundle hasn't been measured, so this is likely a smaller win than the first five.

---

## Recommendation

Do **2, 3 and 4** first. They're code-only, low risk, and make the app feel instant. Then do **1 (Singapore)** as a separate step, since it's a database migration to schedule.
