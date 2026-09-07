# 💪 Push Forge — Push-Up Fitness Tracker

A gamified push-up tracker that sends you **real push notifications** to remind
you to hit your daily push-up goal — even when the app is closed — plus
streaks, XP levels, achievements, confetti, and a 14-day history chart.

## Features

- **Real web push notifications** (via the Web Push API + VAPID), delivered by
  a server-side scheduler:
  - 🌅 A daily morning reminder ("time to hit your goal").
  - 🌙 An evening streak check-in that only fires if you haven't met today's
    goal yet.
  - Both times are configurable in-app.
- **Streaks** with a fire emoji, and a best-streak record.
- **XP & levels** — every rep earns XP, hitting your daily target earns a
  bonus, and you level up on an accelerating curve.
- **Achievements** — Century Club, Week Warrior, Early Bird, Thousand Club,
  and more, unlocked live with an in-app toast + confetti.
- **Animated progress ring**, XP bar, and a 14-day bar chart of your history.
- **Installable PWA** — "Add to Home Screen" for an app-like experience.
- Single-file JSON storage — no database to set up.

## Deploy it so you can install it on your phone

Push notifications require a real HTTPS URL (localhost only works on the
machine running it), so to use this on your phone you need to host it
somewhere. The repo includes a `render.yaml` for a one-click deploy on
[Render](https://render.com) (free tier works fine):

1. Go to https://dashboard.render.com/blueprints and click **New Blueprint
   Instance**, then pick this repo (`render.yaml` is auto-detected).
2. Render will ask for three environment variables — generate them first by
   running `npm run generate-vapid-keys` locally (or see below) and paste in
   `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`
   (e.g. `mailto:you@example.com`).
3. Click **Apply**. Render builds and starts the app and gives you a URL like
   `https://push-forge.onrender.com`.
4. Open that URL on your phone → **Add to Home Screen** (see below) → tap
   **Enable notifications**.

> Note: Render's free plan uses an ephemeral filesystem, so `data/db.json`
> (your logs/streak/XP) resets on redeploys or after the free instance spins
> down from inactivity. For persistent data, add a small [Render
> Disk](https://render.com/docs/disks) mounted at `/opt/render/project/src/data`,
> or swap `server/db.js` for a real database later.

Railway, Fly.io, or any other Node host work the same way — just set the same
three env vars and run `npm start`.

### Installing on your phone once it's deployed

- **Android (Chrome):** open the URL → menu (⋮) → **Add to Home screen /
  Install app**.
- **iPhone (Safari):** open the URL → Share icon → **Add to Home Screen**.
  Push notifications on iOS only work when launched from this home-screen
  icon (not from a normal Safari tab), and require iOS 16.4+.

## Getting started (local development)

```bash
npm install

# Generate a VAPID keypair (needed for push notifications) and paste the
# output into a .env file
npm run generate-vapid-keys
cp .env.example .env
# edit .env and paste in the generated VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY

npm start
```

Then open **http://localhost:3000**.

Click **"Enable notifications"** in the app to grant permission and subscribe.
Browsers require either `localhost` or HTTPS for push notifications to work —
`localhost` is fine for local development; for real device notifications
outside your machine, deploy behind HTTPS.

Use **"Send test"** to fire an immediate push and confirm everything's wired
up correctly.

## How the daily notifications work

The server (`server/scheduler.js`) runs two cron jobs, driven by the times you
set in the app's Settings panel:

1. **Morning reminder** — sent to every subscribed device with a randomized,
   upbeat message and your current streak.
2. **Evening check-in** — only sent if you haven't hit your daily target yet;
   it's silent on days you've already crushed your goal.

Because this uses the real Web Push API (not just an in-page `setTimeout`),
notifications arrive even if the browser tab or app isn't open, as long as
your device is online and the browser/OS allows background push (standard on
Chrome, Edge, Firefox; Safari/iOS requires the PWA to be installed to the home
screen).

## Project structure

```
server/
  index.js       Express app + API routes
  db.js          Tiny JSON-file datastore
  logic.js       Streaks, XP/levels, achievements, message copy
  push.js        Web Push (VAPID) sending
  scheduler.js   node-cron jobs for daily reminders
scripts/
  generate-vapid-keys.js
public/
  index.html / style.css / app.js   Frontend UI
  sw.js                             Service worker (push + click handling)
  manifest.json, icons/             PWA manifest & icons
data/
  db.json        Created automatically on first run (gitignored)
```

## Configuration

All configuration lives in `.env` (see `.env.example`):

| Variable | Description |
|---|---|
| `PORT` | Port the server listens on (default `3000`). |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Keypair used to sign push messages. Generate with `npm run generate-vapid-keys`. |
| `VAPID_SUBJECT` | A `mailto:` link identifying you, required by the Web Push spec. |

Daily target and reminder times are editable from the app itself (gear icon)
and are stored in `data/db.json`.
