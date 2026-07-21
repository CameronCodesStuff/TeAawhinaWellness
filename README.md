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

**2. Email worker (Mailjet)**
- Paste `worker/worker.js` into your Cloudflare worker (dashboard) — or `npx wrangler deploy`
- Add ONE secret: `MAILJET_SECRET_KEY` (Mailjet → Account → API Key Management → Secret Key)
- In Mailjet, validate `detlaffcameron@gmail.com` as a sender address
- Check `https://<worker-url>/health` — it tells you if anything's missing

**3. Deploy the site** — push to GitHub, enable Pages. Done.

## How bookings work

Client picks a slot → one Firestore batch writes the booking (status **pending**) **and** a `slots/{date_time}` doc. The slot doc ID is deterministic, so if two people race for the same time, the second write fails — no double bookings, even while pending. The worker then emails the client "booking received" and alerts every admin.

In the admin portal, **Approve** emails the client their confirmation; **Deny** frees the slot and emails the client to rebook. The approve/deny emails go through the worker's `/notify` endpoint, which verifies the caller's Firebase ID token belongs to an admin account before sending anything.

The **Users** tab lists every account (name, email, phone) — profiles are created when someone signs in and their phone is captured from their first booking.

To add another admin: add their email in `firestore.rules`, `firebase.js` (`ADMIN_EMAILS`), and the worker's `ADMIN_EMAILS` — all three.

## Security notes

- The Mailjet **Secret Key** only ever lives as a worker secret — never in git, never in the site.
- If you've ever pasted a secret key anywhere public, rotate it in the Mailjet console.
- The Firebase web config in `firebase.js` is safe to be public — security comes from `firestore.rules`.
- Admin access requires signing in as `detlaffcameron@gmail.com` with a verified email (Google sign-in counts), enforced in the rules, not just the UI.
