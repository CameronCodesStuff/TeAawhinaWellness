# Te Aawhina Wellness

Booking site for Feminine Energies Romiromi, Maketū. Static site (GitHub Pages) + Firebase + a Cloudflare Worker for Twilio SMS.

## What's in here

- `index.html / styles.css / script.js / firebase.js` — the public site with real bookings
- `admin.html / admin.js` — admin portal (only `detlaffcameron@gmail.com` can access)
- `firestore.rules` — Firestore security rules (deploy these!)
- `worker/` — Cloudflare Worker that sends the Twilio texts

## Setup (one time)

**1. Firebase Console** (project `teaawhinawellness-d2349`)
- Authentication → Sign-in method → enable **Email/Password** and **Google**
- Authentication → Settings → Authorized domains → add your GitHub Pages domain
- Firestore Database → create database → Rules tab → paste `firestore.rules` → Publish

**2. Twilio worker**
```
cd worker
npx wrangler secret put TWILIO_AUTH_TOKEN   # paste your Twilio auth token
npx wrangler deploy
```
- Edit `ALLOWED_ORIGINS` in `worker/wrangler.toml` to your live site URL first
- Copy the deployed worker URL into `SMS_ENDPOINT` in `firebase.js` (keep the `/send` path)

**3. Deploy the site** — push to GitHub, enable Pages. Done.

## How bookings work

Client picks a slot → one Firestore batch writes the booking **and** a `slots/{date_time}` doc. The slot doc ID is deterministic, so if two people race for the same time, the second write fails and they're asked to pick another slot. After the booking saves, the site pings the worker, which texts Te Aawhina (+64 27 521 2949) the booking details and texts the client a confirmation.

Cancelling from the admin portal frees the slot again.

## Security notes

- The Twilio **auth token** only ever lives as a Wrangler secret — never in git, never in the site.
- If you've ever pasted your auth token anywhere public, rotate it in the Twilio console.
- The Firebase web config in `firebase.js` is safe to be public — security comes from `firestore.rules`.
- Admin access requires signing in as `detlaffcameron@gmail.com` with a verified email (Google sign-in counts), enforced in the rules, not just the UI.
