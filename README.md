# Shift Cover Finder — deployment guide

This is the real, deployable version of the prototype we built in Claude. Free to run
indefinitely on Supabase's and Vercel's free tiers. No Claude subscription involved.

You don't need to know how to code to do this — just follow the steps in order.

## What you're setting up
- **Supabase** — the database that stores requests, the "wants extra" list, and swap overrides.
- **Vercel** — hosts the actual website your trainees will open.
- **GitHub** — holds the code so Vercel can deploy it (free, just a place to store the files).

## Step 1 — Create the database (Supabase)
1. Go to https://supabase.com and sign up (free).
2. Click **New project**. Give it any name, set a database password (save it somewhere), pick a region close to Malta (e.g. Frankfurt).
3. Once it's created, go to the **SQL Editor** (left sidebar) → **New query**.
4. Open `supabase/schema.sql` from this project, copy all of it, paste it into the SQL editor, and click **Run**.
   This creates the three tables the app needs.
5. Go to **Project Settings → API**. You'll need two values from this page in Step 3:
   - **Project URL**
   - **anon public** key

## Step 2 — Put the code on GitHub
1. Go to https://github.com and sign up (free) if you don't have an account.
2. Click **New repository**, name it e.g. `shift-cover-finder`, keep it Private, click **Create**.
3. Upload every file in this project folder to that repository (GitHub's web upload button works fine — drag the whole folder in).

## Step 3 — Deploy it (Vercel)
1. Go to https://vercel.com and sign up (free) using your GitHub account — this lets Vercel see your repository.
2. Click **Add New → Project**, and select the `shift-cover-finder` repository.
3. Before clicking Deploy, open **Environment Variables** and add:
   - `VITE_SUPABASE_URL` → paste the Project URL from Step 1
   - `VITE_SUPABASE_ANON_KEY` → paste the anon public key from Step 1
4. Click **Deploy**. After a minute or two, Vercel gives you a live link (something like `shift-cover-finder.vercel.app`).

## Step 4 — Add your real staff and phone numbers
Open `src/App.jsx` in this project and find the `BST_TEAMS` and `HST_TEAMS` lists near the top.
Replace the placeholder names and `+3567...` numbers with the real ones, in the same format.
Save, and push the change to GitHub — Vercel automatically redeploys within a minute or two,
and the link stays the same.

## Step 5 — Share the link
Send the Vercel link to your trainees (WhatsApp, email, whatever's easiest). No login needed
for Supabase or Vercel on their end — they just open the link, pick their name once (remembered
after that), and use it.

## What this gives you that the Claude version didn't
- Genuinely free indefinitely — no Claude subscription tied to it.
- Real-time sync — if two people have it open, they each see the other's posts and swaps live.

## The one honest limitation, same as discussed
On Supabase's free tier, if the app sits completely untouched for about a week, the database
auto-pauses (not deleted — one click restores it). With real people using it regularly, this
won't come up. If you want that risk fully removed, Supabase's paid tier (~$25/month) adds
daily backups — optional, not required to run this.

## If something breaks
The most common issue is a typo in the environment variable values in Step 3, or forgetting to
run the SQL in Step 1. If the page loads but looks broken/blank, check the browser console
(right-click → Inspect → Console) for a red error message — it usually names exactly what's wrong.
