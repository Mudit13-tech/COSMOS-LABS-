# Cosmos Lab

A faithful, no-build-step rebuild of the reference app captured on video:
a terminal-styled login screen and a phase-tracker dashboard where a plan
is split into 6 phases (Mercury -> Saturn), each with a day-by-day task
timeline, a 3D planet viewport with manual zoom, and a "Mission Briefing"
modal for logging notes/hours against each task.

**Scope, on purpose:** this build does **not** include a rocket-launch
landing page or an AI onboarding chat -- neither appeared in the reference
video, so they were intentionally left out rather than added back in.
The plan itself is a fixed seed (see the provenance note in
`js/plan-data.js`) rather than AI-generated, for the same reason.

## Stack

Plain HTML/CSS/JS (ES modules, no bundler required), three.js and the
Firebase JS SDK loaded straight from CDN, and two Firebase Cloud
Functions for the two pieces of logic that need to be server-trusted
(creating a user profile, resetting progress).

## What's real vs. placeholder

- **Real:** Firebase Auth (email/password + Google popup), Firestore
  persistence, guest/local-override mode, the full dashboard interaction
  model (phase browsing, day completion, streak calc, Mission Briefing
  modal with notes + logged hours, zoom control, reset/logout).
- **Placeholder:** planet textures are generated procedurally on a
  `<canvas>` at runtime (see `js/scene.js`) rather than using real
  photographic textures, since this environment has no network access to
  fetch texture assets. Swap in real JPGs under `/textures/planets/` and
  point `THREE.TextureLoader` at them whenever convenient -- nothing else
  needs to change.
- **Filled in, not transcribed:** only 5 days of plan content were
  legible in the reference video (Day 02, 07, 08, 39, and part of 43).
  Every other day's task title is a plausible placeholder that keeps the
  same "build an interactive canvas app" storyline -- see the comment at
  the top of `js/plan-data.js` for exactly which days are which.

## Setup

1. Create a Firebase project. Enable **Authentication** (Email/Password
   and Google providers) and **Firestore**.
2. Copy your web app config into `js/firebase-config.js` (replace every
   `"REPLACE_ME"` value) -- Firebase Console -> Project Settings ->
   General -> Your apps -> SDK setup and config.
3. Install Cloud Functions dependencies and deploy:
   ```
   cd functions && npm install && cd ..
   firebase deploy --only functions,firestore:rules
   ```
4. Serve the static files (any static server works, since there's no
   build step):
   ```
   npx serve .
   # or: firebase deploy --only hosting
   ```
5. Open `login.html`. Sign up, sign in with Google, or use
   `[ INITIATE LOCAL OVERRIDE ]` for a no-account guest session (progress
   is kept in `localStorage`/`sessionStorage` only and is not synced).

## File map

```
cosmos-lab/
|- login.html            Telemetry Terminal login screen
|- dashboard.html         Phase tracker dashboard
|- css/
|  |- tokens.css          Design tokens (colors, type, radii)
|  |- base.css            Reset + glass panel / corner-bracket utilities
|  |- login.css
|  |- dashboard.css
|- js/
|  |- firebase-config.js  Firebase client init (fill in your project keys)
|  |- store.js            Tiny pub/sub store factory
|  |- auth.js             Auth store + sign up/in, Google, guest mode
|  |- progress.js         Progress store (Firestore for real users, localStorage for guests)
|  |- plan-data.js        Seed plan: 6 phases / 43 days (see provenance note)
|  |- scene.js             three.js planet viewport (procedural textures, zoom, drift)
|  |- ui-toast.js          Toast/snackbar
|  |- ui-modal.js          Mission Briefing modal
|  |- login.js             Login page controller
|  |- dashboard.js         Dashboard page controller
|- functions/
|  |- index.js             createUserProfile, resetProgress (Admin SDK, callable)
|  |- package.json
|- firestore.rules
|- firebase.json
```
# COSMOS-LABS-
